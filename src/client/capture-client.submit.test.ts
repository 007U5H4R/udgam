import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../lib/crypto';
import { finishAnswered, sendOutboxItem, submitCapture, type OutboxSend, type Photo } from './capture-client';
import { advanceDevice, deleteOutbox, loadSigner } from './capture-store';
import { openUdgam } from './db';
import { saveEnrolment } from './device-key';
import type { Fix, GpsWatch } from './gps';

// TSK-10.9 / TC-047 (spec MAJOR 3) and quality MAJOR 3: Submit uses the fix the watch already holds and
// waits for a fresh one only when it is stale; the signed copy is in the outbox before the upload
// starts; the chain head moves on only on a verdict; a failing local store after the server answered
// never turns the answer into "Couldn't send" and never leads to a second signature for the same seq;
// "Try again" re-sends the identical saved bytes.

vi.mock('./capture-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./capture-store')>();
  return { ...actual, advanceDevice: vi.fn(actual.advanceDevice), deleteOutbox: vi.fn(actual.deleteOutbox) };
});

const DEVICE = 'DV-TESTSUB1';
const nd = (...lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const verdictBody = (eventId = 'HE-1') => nd({ t: 'check', id: 'geofence', status: 'ok' }, { t: 'verdict', eventId, verdict: 'Verified', score: 100, checks: [], capReasons: [] });
const photo = (): Photo => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  return { file: new Blob([bytes], { type: 'image/jpeg' }), sha256: 'a'.repeat(64), size: bytes.length, mime: 'image/jpeg' };
};

function fakeGps(held: Fix | null, fresh: Fix | null = null) {
  const waitForFresh = vi.fn<(maxMs?: number) => Promise<Fix | null>>(async () => fresh);
  const gps: GpsWatch = { best: () => held, waitForFresh, onChange: () => () => undefined, stop: () => undefined, state: () => 'ok' };
  return { gps, waitForFresh };
}
const fixAgo = (ms: number, lat = 12.42): Fix => ({ lat, lng: 75.74, accuracyM: 8, at: Date.now() - ms });

async function outboxCount(): Promise<number> {
  const db = await openUdgam();
  try {
    return await db.count('outbox');
  } finally {
    db.close();
  }
}

type Sent = { payload: string; signature: string; photo: Uint8Array };
async function readForm(init?: RequestInit): Promise<Sent> {
  const fd = init!.body as FormData;
  return { payload: fd.get('payload') as string, signature: fd.get('signature') as string, photo: new Uint8Array(await (fd.get('photo0') as Blob).arrayBuffer()) };
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); // a fresh phone per test
  vi.mocked(advanceDevice).mockClear();
  vi.mocked(deleteOutbox).mockClear();
  await finishAnswered(); // nothing left over from an earlier test
  const pair = (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  await saveEnrolment(pair, { deviceId: DEVICE, nextSeq: 1, lastEventHash: 'genesis' });
});

describe('submitCapture: the GPS fix (TC-047)', () => {
  it('a fix held for 3 s is used as it is: waitForFresh is NOT called, and the payload carries that fix', async () => {
    const held = fixAgo(3_000);
    const { gps, waitForFresh } = fakeGps(held);
    let sent: Sent | undefined;
    await submitCapture({ plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps }, { fetchImpl: async (_u, init) => ((sent = await readForm(init)), new Response(verdictBody(), { status: 200 })) });
    expect(waitForFresh).not.toHaveBeenCalled();
    expect(JSON.parse(sent!.payload).gps).toEqual({ lat: 12.42, lng: 75.74, accuracyM: 8 });
  });

  it('a fix 15 s old: waitForFresh(10 s) is called exactly once, and the fresh fix is signed', async () => {
    const { gps, waitForFresh } = fakeGps(fixAgo(15_000), fixAgo(0, 12.43));
    let sent: Sent | undefined;
    await submitCapture({ plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps }, { fetchImpl: async (_u, init) => ((sent = await readForm(init)), new Response(verdictBody(), { status: 200 })) });
    expect(waitForFresh).toHaveBeenCalledTimes(1);
    expect(waitForFresh).toHaveBeenCalledWith(10_000);
    expect(JSON.parse(sent!.payload).gps).toEqual({ lat: 12.43, lng: 75.74, accuracyM: 8 });
  });
});

describe('submitCapture: the outbox and the chain head (TSK-10.9)', () => {
  it('the signed copy is in the outbox BEFORE fetch runs, with the exact payload that is sent', async () => {
    const { gps } = fakeGps(fixAgo(1_000));
    let during: { count: number; stored: string } | undefined;
    await submitCapture(
      { plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps },
      {
        fetchImpl: async (_u, init) => {
          const db = await openUdgam();
          const all = (await db.getAll('outbox')) as { payload: string }[];
          db.close();
          during = { count: all.length, stored: all[0]!.payload };
          expect((await readForm(init)).payload).toBe(during.stored);
          return new Response(verdictBody(), { status: 200 });
        },
      },
    );
    expect(during!.count).toBe(1);
  });

  it('verdict → outbox empty, next seq 2 and the head is the payload hash; an idempotent re-send does not advance twice', async () => {
    const { gps } = fakeGps(fixAgo(1_000));
    let payload = '';
    const r = await submitCapture({ plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps }, { fetchImpl: async (_u, init) => ((payload = (await readForm(init)).payload), new Response(verdictBody(), { status: 200 })) });
    expect(r.kind).toBe('verdict');
    expect(await outboxCount()).toBe(0);
    expect(await loadSigner()).toMatchObject({ nextSeq: 2, lastEventHash: await sha256Hex(payload) });
    await sendOutboxItem(r.item!, { fetchImpl: async () => new Response(nd({ t: 'verdict', eventId: 'HE-1', verdict: 'Verified', score: 100, checks: [], idempotent: true }), { status: 200 }) });
    expect((await loadSigner())!.nextSeq).toBe(2);
  });

  it('app refusal → outbox empty, seq unchanged; retryable and non-app 4xx → outbox kept, seq unchanged', async () => {
    const { gps } = fakeGps(fixAgo(1_000));
    const draft = { plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps };
    await submitCapture(draft, { fetchImpl: async () => new Response(nd({ t: 'rejected', reason: 'plot_not_assigned', status: 403 }), { status: 403 }) });
    expect([await outboxCount(), (await loadSigner())!.nextSeq]).toEqual([0, 1]);
    await submitCapture(draft, { fetchImpl: async () => new Response(nd({ t: 'error', retryable: true }), { status: 503 }) });
    expect([await outboxCount(), (await loadSigner())!.nextSeq]).toEqual([1, 1]);
    await submitCapture(draft, { fetchImpl: async () => new Response('<html>Request Time-out</html>', { status: 408 }) });
    expect([await outboxCount(), (await loadSigner())!.nextSeq]).toEqual([2, 1]);
    await submitCapture(draft, { fetchImpl: async () => new Response('<html>proxy</html>', { status: 400 }) });
    expect([await outboxCount(), (await loadSigner())!.nextSeq]).toEqual([3, 1]);
    expect(advanceDevice).not.toHaveBeenCalled();
  });
});

describe('submitCapture: a local store failure after the server answered (quality MAJOR 3)', () => {
  it('deleteOutbox throws after a Verified answer: the verdict is returned; the copy is flagged and removed at the next start', async () => {
    vi.mocked(deleteOutbox).mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
    const { gps } = fakeGps(fixAgo(1_000));
    const r = await submitCapture({ plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps }, { fetchImpl: async () => new Response(verdictBody(), { status: 200 }) });
    expect(r).toMatchObject({ kind: 'verdict', verdict: { eventId: 'HE-1', verdict: 'Verified' } });
    expect(await outboxCount()).toBe(1);
    await finishAnswered();
    expect(await outboxCount()).toBe(0);
    expect((await loadSigner())!.nextSeq).toBe(2);
  });

  it('advanceDevice throws: the verdict is returned, and the next capture still signs seq 2 after the first payload', async () => {
    vi.mocked(advanceDevice).mockRejectedValueOnce(new DOMException('gone', 'InvalidStateError'));
    const { gps } = fakeGps(fixAgo(1_000));
    const draft = { plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps };
    const sent: Sent[] = [];
    const fetchImpl = async (_u: string, init?: RequestInit) => (sent.push(await readForm(init)), new Response(verdictBody(`HE-${sent.length}`), { status: 200 }));
    const first = await submitCapture(draft, { fetchImpl });
    expect(first.kind).toBe('verdict');
    const second = await submitCapture(draft, { fetchImpl });
    expect(second.kind).toBe('verdict');
    const [a, b] = sent.map((s) => JSON.parse(s.payload) as { seq: number; prevEventHash: string });
    expect(a).toMatchObject({ seq: 1, prevEventHash: 'genesis' });
    expect(b).toMatchObject({ seq: 2, prevEventHash: await sha256Hex(sent[0]!.payload) });
    expect(await outboxCount()).toBe(0);
  });

  it('an onSaved callback that throws is logged by error class only and the send still completes (TKT-10 nit)', async () => {
    const { gps } = fakeGps(fixAgo(1_000));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const r = await submitCapture(
        { plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps },
        {
          onSaved: () => {
            throw new RangeError('screen state gone');
          },
          fetchImpl: async () => new Response(verdictBody(), { status: 200 }),
        },
      );
      expect(r.kind).toBe('verdict');
      expect(errors).toHaveBeenCalledWith('capture.on_saved_failed', { errClass: 'RangeError' });
      expect(JSON.stringify(errors.mock.calls)).not.toContain('screen state gone');
    } finally {
      errors.mockRestore();
    }
  });

  it('Try again after a lost connection re-sends byte-identical bytes (same payload, signature and photo), never a new signature', async () => {
    const { gps } = fakeGps(fixAgo(1_000));
    const attempts: Sent[] = [];
    let saved: OutboxSend | undefined;
    const r = await submitCapture(
      { plotId: 'PL-1', cherryKg: 42.5, photos: [photo()], gps },
      {
        onSaved: (i) => (saved = i),
        fetchImpl: async (_u, init) => {
          attempts.push(await readForm(init));
          throw new TypeError('network changed');
        },
      },
    );
    expect(r.kind).toBe('retryable');
    expect(saved).toBeDefined();
    expect(r.item).toBe(saved);
    await sendOutboxItem(saved!, { fetchImpl: async (_u, init) => (attempts.push(await readForm(init)), new Response(verdictBody(), { status: 200 })) });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.payload).toBe(attempts[0]!.payload);
    expect(attempts[1]!.signature).toBe(attempts[0]!.signature);
    expect(attempts[1]!.photo).toEqual(attempts[0]!.photo);
    expect(await sha256Hex(attempts[1]!.payload)).toBe(await sha256Hex(attempts[0]!.payload));
  });
});
