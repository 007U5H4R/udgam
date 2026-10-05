import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceDevice, answeredItems, deleteOutbox, listOutbox, markAnswered, type OutboxItem } from './capture-store';
import { finishAnswered, pendingItems, sendOutboxItem, sendPending, type OutboxSend } from './capture-client';

// TASK-12 fix round 1 (spec MAJOR 2; quality minors 2, 3, 4 and nit 13): the queue's rules with the
// store mocked so its failures can be forced.
//   - A copy whose server answer is owed only in memory (the delete AND the `answered` flag both failed)
//     is filtered from the pending list too, so it is never sent again.
//   - Leaving out `keepOnRefusal` is safe: it defaults to the one policy (refusalKeepsOutbox), so a
//     refusal that signing in again can fix never deletes the copy.
//   - The queue stops at the first copy kept after a refusal, and the copies after it stay, in order.
//   - A second sendPending while one runs joins it; across tabs the queue runs under a Web Lock.

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
  vi.unstubAllGlobals();
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

describe('keepOnRefusal defaults to the one policy (quality minor 4)', () => {
  const forbidden = async () => Response.json({ error: 'forbidden' }, { status: 403 });
  it('sendOutboxItem without keepOnRefusal keeps the copy on forbidden', async () => {
    const r = await sendOutboxItem(asSend(stored('OB-DEF-1', 1)), { fetchImpl: forbidden });
    expect(r).toEqual({ kind: 'rejected', reason: 'forbidden' });
    expect(deleteOutbox).not.toHaveBeenCalled();
  });

  it('sendOutboxItem without keepOnRefusal still deletes on plot_not_assigned (retrying cannot help)', async () => {
    const r = await sendOutboxItem(asSend(stored('OB-DEF-2', 2)), { fetchImpl: async () => new Response(nd({ t: 'rejected', reason: 'plot_not_assigned', status: 403 }), { status: 403 }) });
    expect(r).toEqual({ kind: 'rejected', reason: 'plot_not_assigned' });
    expect(vi.mocked(deleteOutbox).mock.calls).toEqual([['OB-DEF-2']]);
  });
});

describe('the queue stops at a kept refusal (quality nit 13)', () => {
  it('forbidden on the oldest copy: 1 POST, nothing deleted, the copies after it kept in order', async () => {
    const items = [stored('OB-K-1', 1), stored('OB-K-2', 2), stored('OB-K-3', 3)];
    vi.mocked(listOutbox).mockResolvedValue(items);
    const sent: string[] = [];
    const results = await sendPending({
      fetchImpl: async (_u, init) => {
        sent.push(sentPayload(init));
        return Response.json({ error: 'forbidden' }, { status: 403 });
      },
    });
    expect(sent).toEqual([items[0]!.payload]);
    expect(results).toEqual([{ id: 'OB-K-1', result: { kind: 'rejected', reason: 'forbidden' } }]);
    expect(deleteOutbox).not.toHaveBeenCalled();
    expect((await pendingItems()).map((i) => i.id)).toEqual(['OB-K-1', 'OB-K-2', 'OB-K-3']);
  });

  it('a refusal that deletes (plot_not_assigned) does not stop it: the next copy is sent', async () => {
    const items = [stored('OB-D-1', 1), stored('OB-D-2', 2)];
    vi.mocked(listOutbox).mockResolvedValue(items);
    const bodies = [new Response(nd({ t: 'rejected', reason: 'plot_not_assigned', status: 403 }), { status: 403 }), new Response(verdictBody, { status: 200 })];
    const results = await sendPending({ fetchImpl: async () => bodies.shift()! });
    expect(results.map((r) => [r.id, r.result.kind])).toEqual([
      ['OB-D-1', 'rejected'],
      ['OB-D-2', 'verdict'],
    ]);
  });
});

describe('single flight (quality minor 3, nit 13)', () => {
  it('a second sendPending while one runs joins it: each copy is POSTed once and both callers get the same results', async () => {
    const items = [stored('OB-J-1', 1), stored('OB-J-2', 2)];
    vi.mocked(listOutbox).mockResolvedValue(items);
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(verdictBody, { status: 200 });
    };
    const one = sendPending({ fetchImpl });
    const two = sendPending({ fetchImpl });
    const [a, b] = await Promise.all([one, two]);
    expect(calls).toBe(2);
    expect(a.map((r) => r.id)).toEqual(['OB-J-1', 'OB-J-2']);
    expect(b).toEqual(a);
  });

  it('across tabs the queue runs under the Web Lock "udgam-outbox": nothing is POSTed while another tab holds it', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let tail: Promise<unknown> = held; // another tab holds the lock until `release`
    const request = vi.fn((name: string, cb: () => Promise<unknown>) => {
      const run = tail.then(cb);
      tail = run.catch(() => undefined);
      return run;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    vi.mocked(listOutbox).mockResolvedValue([stored('OB-L-1', 1)]);
    let calls = 0;
    const done = sendPending({
      fetchImpl: async () => {
        calls += 1;
        return new Response(verdictBody, { status: 200 });
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe('udgam-outbox');
    expect(calls).toBe(0);
    release();
    expect((await done).map((r) => r.id)).toEqual(['OB-L-1']);
    expect(calls).toBe(1);
  });

  it("a hung POST is cut off by the queue's timeout and releases the lock, so the next run proceeds (TASK-12 r2 #1)", async () => {
    let tail: Promise<unknown> = Promise.resolve();
    const request = vi.fn((_name: string, ...rest: unknown[]) => {
      const cb = rest.at(-1) as () => Promise<unknown>;
      const run = tail.then(cb);
      tail = run.catch(() => undefined);
      return run;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    vi.mocked(listOutbox).mockResolvedValue([stored('OB-H-1', 1)]);
    const seen: AbortSignal[] = [];
    const hung = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        seen.push(init!.signal!);
        init!.signal!.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
      });
    const first = await sendPending({ fetchImpl: hung, sendTimeoutMs: 50 });
    expect(first).toEqual([{ id: 'OB-H-1', result: { kind: 'retryable', cause: 'offline' } }]);
    expect(seen[0]!.aborted).toBe(true);
    // the lock is free again: another run (another tab) gets through and sends
    const second = await sendPending({ fetchImpl: async () => new Response(verdictBody, { status: 200 }) });
    expect(second.map((r) => r.result.kind)).toEqual(['verdict']);
  });

  it("the caller's signal also bounds the wait for the lock: a tab whose holder hangs can give up (TASK-12 r2 #1)", async () => {
    const options: unknown[] = [];
    const request = vi.fn((_name: string, opts: { signal?: AbortSignal }) => {
      options.push(opts);
      return new Promise((_resolve, reject) => opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctl = new AbortController();
    const done = sendPending({ signal: ctl.signal, fetchImpl: async () => new Response(verdictBody, { status: 200 }) });
    ctl.abort();
    expect(await done).toEqual([]);
    expect((options[0] as { signal: AbortSignal }).signal).toBe(ctl.signal);
    // an unexpected queue failure is logged by class, not swallowed (TASK-12 r2 nit 3)
    expect(errors).toHaveBeenCalledWith('capture.queue_failed', { errClass: 'AbortError' });
  });

  it('without Web Locks (older browsers) the queue still runs', async () => {
    vi.stubGlobal('navigator', {});
    vi.mocked(listOutbox).mockResolvedValue([stored('OB-N-1', 1)]);
    const results = await sendPending({ fetchImpl: async () => new Response(verdictBody, { status: 200 }) });
    expect(results.map((r) => r.id)).toEqual(['OB-N-1']);
  });
});
