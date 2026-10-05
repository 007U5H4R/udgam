import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLedger, stopLedger } from './index';

// TSK-24.6 boot hook (TASK-25 fix round 1, quality finding 10): with the EVM adapter, startLedger()
// anchors once at boot and then every interval, one loop per process however often it is called; a
// tick never overlaps a running one, and a failing tick is logged and the loop goes on. With the
// hash-chain adapter it does nothing.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stopLedger();
  vi.useRealTimers();
});

describe('startLedger', () => {
  it('evm: one tick at boot, then one per interval; a second start adds no second loop', async () => {
    const anchor = vi.fn(async () => undefined);
    startLedger(1_000, { adapter: 'evm', anchor });
    startLedger(1_000, { adapter: 'evm', anchor });
    await vi.advanceTimersByTimeAsync(0);
    expect(anchor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(anchor).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(anchor).toHaveBeenCalledTimes(5);
  });

  it('hashchain: no loop at all', async () => {
    const anchor = vi.fn(async () => undefined);
    startLedger(1_000, { adapter: 'hashchain', anchor });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(anchor).not.toHaveBeenCalled();
  });

  it('a tick still running when the interval fires is not overlapped', async () => {
    let release!: () => void;
    const anchor = vi.fn(() => new Promise<void>((r) => (release = r)));
    startLedger(1_000, { adapter: 'evm', anchor });
    await vi.advanceTimersByTimeAsync(0);
    expect(anchor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(anchor).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(anchor).toHaveBeenCalledTimes(2);
  });

  it('a failing tick is caught and the loop goes on', async () => {
    const anchor = vi.fn(async () => {
      throw new Error('rpc down');
    });
    startLedger(1_000, { adapter: 'evm', anchor });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(anchor).toHaveBeenCalledTimes(3);
  });

  it('after stopLedger a new loop can start', async () => {
    const a = vi.fn(async () => undefined);
    startLedger(1_000, { adapter: 'evm', anchor: a });
    stopLedger();
    const b = vi.fn(async () => undefined);
    startLedger(1_000, { adapter: 'evm', anchor: b });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(b).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenCalledTimes(1);
  });
});
