import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finishAnswered, type Photo } from '../../client/capture-client';
import { deleteOutbox } from '../../client/capture-store';
import { saveEnrolment } from '../../client/device-key';
import type { GpsWatch } from '../../client/gps';
import { initialFlow, reduce, type FlowAction, type FlowState } from './record-flow';
import { sendPicking, settleAction, type HeldCopy } from './send-picking';

// Quality MAJOR 3 at the screen (TASK-11 fix round 1): a store failure after the server answered still
// shows the answer, never "Couldn't send"; "Try again" re-sends the held copy byte for byte; a 429 or a
// busy 503 reaches the saved screen with its wait.

vi.mock('../../client/capture-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../client/capture-store')>();
  return { ...actual, deleteOutbox: vi.fn(actual.deleteOutbox) };
});

const nd = (...lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const VERDICT = { t: 'verdict', eventId: 'HE-9', verdict: 'Verified', score: 100, checks: [], capReasons: [] };
const gps: GpsWatch = { best: () => ({ lat: 12.42, lng: 75.74, accuracyM: 8, at: Date.now() }), waitForFresh: async () => null, onChange: () => () => undefined, stop: () => undefined, state: () => 'ok' };
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const photo: Photo = { file: new Blob([bytes], { type: 'image/jpeg' }), sha256: 'a'.repeat(64), size: bytes.length, mime: 'image/jpeg' };
const draft = { plotId: 'PL-1', cherryKg: 42.5, photos: [photo], gps };

/** The flow on the checking screen, as it is while a send runs. */
function checking(): FlowState {
  const f = new File([bytes], 'b.jpg', { type: 'image/jpeg' });
  const acts: FlowAction[] = [
    { type: 'take', slot: 0, file: f },
    { type: 'use', slot: 0, file: f, sha256: 'a'.repeat(64), size: bytes.length, mime: 'image/jpeg' },
    { type: 'continue' },
    { type: 'key', k: '4' },
    { type: 'send' },
  ];
  return acts.reduce(reduce, initialFlow('PL-1'));
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.mocked(deleteOutbox).mockClear();
  await finishAnswered();
  const pair = (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  await saveEnrolment(pair, { deviceId: 'DV-SCREEN01', nextSeq: 1, lastEventHash: 'genesis' });
});

describe('sendPicking + settleAction', () => {
  it('deleteOutbox throws after a Verified answer: the screen shows the verdict, not "Couldn\'t send", and nothing is held for a re-send', async () => {
    vi.mocked(deleteOutbox).mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
    const held: HeldCopy = { current: null };
    const r = await sendPicking(held, draft, { fetchImpl: async () => new Response(nd(VERDICT), { status: 200 }) });
    const s = reduce(checking(), settleAction(r));
    expect(s.step).toBe('verdict');
    expect(s.result?.eventId).toBe('HE-9');
    expect(s.error).toBeUndefined();
    expect(held.current).toBeNull();
  });

  it('a lost connection keeps the saved copy; Try again sends those same bytes, then clears it on the verdict', async () => {
    const held: HeldCopy = { current: null };
    const forms: FormData[] = [];
    const lost = await sendPicking(held, draft, {
      fetchImpl: async (_u, init) => {
        forms.push(init!.body as FormData);
        throw new TypeError('Failed to fetch');
      },
    });
    expect(reduce(checking(), settleAction(lost))).toMatchObject({ step: 'saved', error: { kind: 'offline' } });
    const saved = held.current;
    expect(saved).not.toBeNull();
    await sendPicking(held, draft, { fetchImpl: async (_u, init) => (forms.push(init!.body as FormData), new Response(nd(VERDICT), { status: 200 })) });
    expect(forms[1]!.get('payload')).toBe(forms[0]!.get('payload'));
    expect(forms[1]!.get('signature')).toBe(forms[0]!.get('signature'));
    expect(new Uint8Array(await (forms[1]!.get('photo0') as Blob).arrayBuffer())).toEqual(bytes);
    expect(held.current).toBeNull();
  });

  it('429 → the saved screen with reason rate_limited and the wait; a busy 503 → saved with its wait', async () => {
    const held: HeldCopy = { current: null };
    const limited = await sendPicking(held, draft, {
      fetchImpl: async () => new Response(nd({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: 120 }), { status: 429, headers: { 'Retry-After': '120' } }),
    });
    expect(reduce(checking(), settleAction(limited))).toMatchObject({ step: 'saved', error: { kind: 'server', reason: 'rate_limited', retryAfterSec: 120 } });
    expect(held.current).not.toBeNull();
    const busy = await sendPicking({ current: null }, draft, { fetchImpl: async () => new Response(nd({ t: 'error', retryable: true }), { status: 503, headers: { 'Retry-After': '5' } }) });
    expect(settleAction(busy)).toEqual({ type: 'fail', kind: 'server', retryAfterSec: 5 });
  });

  it('an app refusal → Not accepted, and the copy is let go; unauthenticated → saved, kept', async () => {
    const held: HeldCopy = { current: null };
    const r = await sendPicking(held, draft, { fetchImpl: async () => new Response(nd({ t: 'rejected', reason: 'plot_not_assigned', status: 403 }), { status: 403 }) });
    expect(reduce(checking(), settleAction(r))).toMatchObject({ step: 'verdict', error: { kind: 'rejected', reason: 'plot_not_assigned' } });
    expect(held.current).toBeNull();
    const auth = await sendPicking(held, draft, { fetchImpl: async () => Response.json({ error: 'unauthenticated' }, { status: 401 }) });
    expect(settleAction(auth)).toEqual({ type: 'fail', kind: 'server', reason: 'unauthenticated' });
    expect(held.current).not.toBeNull();
  });

  it('not ready: no device → Not accepted (unknown_device); no GPS fix → saved (no_fix)', () => {
    expect(settleAction({ kind: 'not_ready', reason: 'no_device' })).toEqual({ type: 'fail', kind: 'rejected', reason: 'unknown_device' });
    expect(settleAction({ kind: 'not_ready', reason: 'no_fix' })).toEqual({ type: 'fail', kind: 'server', reason: 'no_fix' });
  });
});
