import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../lib/crypto';
import { pendingItems, sendPending } from './capture-client';
import { listOutbox, loadSigner, markAnswered, putOutbox } from './capture-store';
import { getOrCreateKeyPair, saveEnrolment } from './device-key';

// TASK-12 fix round 1 (spec MAJOR 2, TC-050, CF-02/CF-14): a copy the server already answered (flagged
// `answered` on the stored record because the phone's bookkeeping failed after the answer) is never
// sent again by the queue. sendPending finishes it first with finishAnswered(): the verdict's chain-head
// move is applied and the copy deleted; only the unanswered copy is POSTed.

const DEVICE = 'DV-QUEUE01';
const nd = (...lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const verdict = (eventId: string) => nd({ t: 'verdict', eventId, verdict: 'Verified', score: 100, checks: [], capReasons: [] });
const payload = (seq: number, kg: number) => JSON.stringify({ cherryKg: kg, deviceId: DEVICE, plotId: 'PL-1', seq, v: 1 });

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); // a fresh phone per test
  await saveEnrolment(await getOrCreateKeyPair(), { deviceId: DEVICE, nextSeq: 7, lastEventHash: 'genesis' });
});

describe('sendPending never re-sends an answered copy (TC-050)', () => {
  it('skips the answered copy, finishes it via finishAnswered (chain head 7 → 8, copy deleted) and sends only the other', async () => {
    const answered = await putOutbox({ payload: payload(7, 42.5), signature: 'sig-a', files: [new Blob(['a'])] });
    const open = await putOutbox({ payload: payload(8, 38), signature: 'sig-b', files: [new Blob(['b'])] });
    const h7 = await sha256Hex(payload(7, 42.5));
    await markAnswered(answered, { deviceId: DEVICE, seq: 7, payloadHash: h7 });

    expect((await pendingItems()).map((i) => i.id)).toEqual([open]);

    const sent: string[] = [];
    const results = await sendPending({
      fetchImpl: async (_url, init) => {
        sent.push((init!.body as FormData).get('payload') as string);
        return new Response(verdict('HE-8'), { status: 200 });
      },
    });

    expect(sent).toEqual([payload(8, 38)]);
    expect(results.map((r) => r.id)).toEqual([open]);
    expect(await listOutbox()).toEqual([]);
    // the answered copy's owed move (7 → 8, its hash) was applied; the sent one (seq 8) then moved it on
    expect(await loadSigner()).toMatchObject({ nextSeq: 9 });
  });

  it('with only an answered copy saved, nothing is POSTed and the copy is finished', async () => {
    const answered = await putOutbox({ payload: payload(7, 42.5), signature: 'sig-a', files: [new Blob(['a'])] });
    const h7 = await sha256Hex(payload(7, 42.5));
    await markAnswered(answered, { deviceId: DEVICE, seq: 7, payloadHash: h7 });
    let calls = 0;
    const results = await sendPending({
      fetchImpl: async () => {
        calls += 1;
        return new Response(verdict('HE-7'), { status: 200 });
      },
    });
    expect(calls).toBe(0);
    expect(results).toEqual([]);
    expect(await listOutbox()).toEqual([]);
    expect(await loadSigner()).toMatchObject({ nextSeq: 8, lastEventHash: h7 });
  });
});
