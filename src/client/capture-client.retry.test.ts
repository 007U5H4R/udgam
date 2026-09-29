import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCapture, sendOutboxItem, type OutboxSend } from './capture-client';

// TASK-20 fix round 2 (N6): the capture route answers a busy server with 503 {t:"error", retryable:true}
// and Retry-After. The phone honours it: the next send of that outbox copy waits that long (at most 60 s).

vi.mock('./capture-store', () => ({
  countAttempt: vi.fn(async () => undefined),
  deleteOutbox: vi.fn(async () => undefined),
  advanceDevice: vi.fn(async () => undefined),
  loadSigner: vi.fn(async () => null),
  putOutbox: vi.fn(async () => 'OB-1'),
}));

const busy = (retryAfter?: string) => async () =>
  new Response(`${JSON.stringify({ t: 'error', retryable: true })}\n`, { status: 503, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter } });
const item = (id: string): OutboxSend => ({ id, payload: '{"v":1}', signature: 'sig', files: [new Blob(['a'])], deviceId: 'DV-1', seq: 1 });

describe('sendCapture: Retry-After on the busy 503', () => {
  it('is read, and capped at 60 s', async () => {
    expect(await sendCapture(item('x'), { fetchImpl: busy('5') })).toEqual({ kind: 'retryable', cause: 'server', retryAfterSec: 5 });
    expect(await sendCapture(item('x'), { fetchImpl: busy('600') })).toEqual({ kind: 'retryable', cause: 'server', retryAfterSec: 60 });
    expect(await sendCapture(item('x'), { fetchImpl: busy() })).toEqual({ kind: 'retryable', cause: 'server' });
    expect(await sendCapture(item('x'), { fetchImpl: busy('soon') })).toEqual({ kind: 'retryable', cause: 'server' });
    expect(await sendCapture(item('x'), { fetchImpl: busy('0') })).toEqual({ kind: 'retryable', cause: 'server' });
  });

  it('the 408 body-deadline answer is retryable (the outbox copy is kept)', async () => {
    const timeout = async () => new Response(`${JSON.stringify({ t: 'error', retryable: true })}\n`, { status: 408 });
    expect(await sendCapture(item('x'), { fetchImpl: timeout })).toEqual({ kind: 'retryable', cause: 'server' });
  });
});

describe('sendOutboxItem: the next send waits out Retry-After', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-14T04:00:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('after a busy answer with Retry-After 5, the retry is sent 5 s later, not before', async () => {
    const fetchImpl = vi.fn(busy('5'));
    expect(await sendOutboxItem(item('OB-A'), { fetchImpl })).toEqual({ kind: 'retryable', cause: 'server', retryAfterSec: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const retry = sendOutboxItem(item('OB-A'), { fetchImpl });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await retry;
  });

  it('a longer Retry-After is waited out for at most 60 s', async () => {
    await sendOutboxItem(item('OB-B'), { fetchImpl: busy('600') });
    const later = vi.fn(busy());
    const retry = sendOutboxItem(item('OB-B'), { fetchImpl: later });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(later).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(later).toHaveBeenCalledTimes(1);
    expect(await retry).toEqual({ kind: 'retryable', cause: 'server' });
  });

  it('a retry after the wait has passed goes at once; other outbox copies are never held up', async () => {
    await sendOutboxItem(item('OB-C'), { fetchImpl: busy('5') });
    const other = vi.fn(busy());
    await sendOutboxItem(item('OB-D'), { fetchImpl: other });
    expect(other).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    const later = vi.fn(busy());
    await sendOutboxItem(item('OB-C'), { fetchImpl: later });
    expect(later).toHaveBeenCalledTimes(1);
    // and with no Retry-After that time, the next one goes at once too
    const again = vi.fn(busy());
    await sendOutboxItem(item('OB-C'), { fetchImpl: again });
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('a send cancelled while it waits returns without sending', async () => {
    await sendOutboxItem(item('OB-E'), { fetchImpl: busy('30') });
    const ctrl = new AbortController();
    const fetchImpl = vi.fn(busy());
    const retry = sendOutboxItem(item('OB-E'), { fetchImpl, signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(1_000);
    ctrl.abort();
    expect(await retry).toEqual({ kind: 'retryable', cause: 'offline' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
