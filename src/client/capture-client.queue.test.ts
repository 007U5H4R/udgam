import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceDevice, answeredItems, deleteOutbox, listOutbox, markAnswered, type OutboxItem } from './capture-store';
import { finishAnswered, pendingItems, sendOutboxItem, sendPending, type OutboxSend } from './capture-client';

// TASK-12 fix round 1 (spec MAJOR 2; quality minor 2): the queue's rules with the store mocked so its
// failures can be forced.
//   - A copy whose server answer is owed only in memory (the delete AND the `answered` flag both failed)
//     is filtered from the pending list too, so it is never sent again.

vi.mock('./capture-store', () => ({
  bumpAttempt: vi.fn(async () => undefined),
  deleteOutbox: vi.fn(async () => undefined),
  advanceDevice: vi.fn(async () => undefined),
  markAnswered: vi.fn(async () => undefined),
  answeredItems: vi.fn(async () => []),
  listOutbox: vi.fn(async () => []),
  loadSigner: vi.fn(async () => null),
  putOutbox: vi.fn(async () => 'OB-1'),
}));

const nd = (...lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const verdictBody = nd({ t: 'verdict', eventId: 'HE-1', verdict: 'Verified', score: 100, checks: [], capReasons: [] });
const stored = (id: string, seq: number): OutboxItem => ({
  id,
  payload: JSON.stringify({ deviceId: 'DV-1', seq, v: 1 }),
  signature: `sig-${id}`,
  files: [new Blob([id])],
  plotId: 'PL-1',
  cherryKg: 10 + seq,
  photoCount: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  attempts: 1,
  order: seq,
});
const asSend = (i: OutboxItem): OutboxSend => ({ id: i.id, payload: i.payload, signature: i.signature, files: i.files, deviceId: 'DV-1', seq: Number(JSON.parse(i.payload).seq) });
const sentPayload = (init?: RequestInit) => (init!.body as FormData).get('payload') as string;

beforeEach(() => {
  vi.mocked(deleteOutbox).mockReset().mockResolvedValue(undefined);
  vi.mocked(advanceDevice).mockReset().mockResolvedValue(undefined);
  vi.mocked(markAnswered).mockReset().mockResolvedValue(undefined);
  vi.mocked(answeredItems).mockReset().mockResolvedValue([]);
  vi.mocked(listOutbox).mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.spyOn(console, 'error').mockRestore();
});

describe('an answer owed only in memory (quality minor 2)', () => {
  it('when deleteOutbox and markAnswered both fail, the answered copy leaves the pending list and is never POSTed again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = stored('OB-MEM-A', 7);
    const b = stored('OB-MEM-B', 8);
    vi.mocked(listOutbox).mockResolvedValue([a, b]); // neither carries `answered` on the stored record
    vi.mocked(deleteOutbox).mockRejectedValue(new Error('QuotaExceededError'));
    vi.mocked(markAnswered).mockRejectedValue(new Error('QuotaExceededError'));

    const first = await sendOutboxItem(asSend(a), { fetchImpl: async () => new Response(verdictBody, { status: 200 }) });
    expect(first.kind).toBe('verdict');

    expect((await pendingItems()).map((i) => i.id)).toEqual(['OB-MEM-B']);

    const sent: string[] = [];
    await sendPending({
      fetchImpl: async (_u, init) => {
        sent.push(sentPayload(init));
        return new Response('<html>Bad gateway</html>', { status: 502 });
      },
    });
    expect(sent).toEqual([b.payload]);

    // once the store takes writes again, the owed bookkeeping is finished: the copy is deleted
    vi.mocked(deleteOutbox).mockReset().mockResolvedValue(undefined);
    await finishAnswered();
    expect(vi.mocked(deleteOutbox).mock.calls).toEqual([['OB-MEM-A']]);
  });
});
