import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { remoteSensingCache } from '../db/schema';
import { withCache } from './cache';
import { withTimeouts } from './index';
import { ProviderError, type PlotGeom, type RemoteSensingProvider } from './types';

// TSK-07.2 · TC-033 (cache avoids repeat calls) and TC-032 timing half (8 s per-call timeout, fake
// timers). The cache key is (plot, provider, kind, month bucket, geometry hash): forest loss `static`,
// NDVI history the month asked for (the registration month), the harvest window the capture month.

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const SQUARE: PlotGeom['polygon'] = {
  type: 'Polygon',
  coordinates: [
    [
      [75.74, 12.42],
      [75.741, 12.42],
      [75.741, 12.421],
      [75.74, 12.421],
      [75.74, 12.42],
    ],
  ],
};
const plot = (geometryHash = 'a'.repeat(64)): PlotGeom => ({ id: 'PL-CACHE001', polygon: SQUARE, areaHa: 1.2, geometryHash });

/** A counting provider; `fail` makes every call reject with an HTTP 500. */
function counting(opts: { fail?: boolean } = {}) {
  const calls = { forestLoss: 0, ndviHistory: 0, ndviWindow: 0 };
  const provider: RemoteSensingProvider = {
    name: 'fixture',
    async forestLoss() {
      calls.forestLoss++;
      if (opts.fail) throw new ProviderError('gfw', 500);
      return { lossHa: 0.036, lossPct: 3, yearsFrom: 2021, dataYear: 2025 };
    },
    async ndviHistory(_p, endMonth) {
      calls.ndviHistory++;
      if (opts.fail) throw new ProviderError('sentinel-hub', 500);
      return { months: [{ month: endMonth, mean: 0.7, clearFraction: 0.9 }] };
    },
    async ndviWindow() {
      calls.ndviWindow++;
      if (opts.fail) throw new ProviderError('sentinel-hub', 'malformed');
      return { mean: 0.71, clearObservations: 4 };
    },
  };
  return { provider, calls };
}

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  vi.useRealTimers();
  await t.cleanup();
});

const NOW = () => new Date('2026-12-08T05:30:00.000Z');

describe('withCache (TC-033)', () => {
  it('two ndviWindow calls for one plot in the same month make one underlying call; another month makes a second', async () => {
    const { provider, calls } = counting();
    const rs = withCache(provider, t.db, { now: NOW });
    expect(await rs.ndviWindow(plot(), '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4 });
    expect(await rs.ndviWindow(plot(), '2026-12-21', 30)).toEqual({ mean: 0.71, clearObservations: 4 });
    expect(calls.ndviWindow).toBe(1);
    await rs.ndviWindow(plot(), '2027-01-03', 30);
    expect(calls.ndviWindow).toBe(2);
  });

  it('forest loss is fetched once per geometry; an edited geometry (new hash) misses', async () => {
    const { provider, calls } = counting();
    const rs = withCache(provider, t.db, { now: NOW });
    await rs.forestLoss(plot());
    expect(await rs.forestLoss(plot())).toEqual({ lossHa: 0.036, lossPct: 3, yearsFrom: 2021, dataYear: 2025 });
    expect(calls.forestLoss).toBe(1);
    await rs.forestLoss(plot('b'.repeat(64)));
    expect(calls.forestLoss).toBe(2);
  });

  it('NDVI history is cached per month asked for', async () => {
    const { provider, calls } = counting();
    const rs = withCache(provider, t.db, { now: NOW });
    await rs.ndviHistory(plot(), '2026-12');
    await rs.ndviHistory(plot(), '2026-12');
    expect(calls.ndviHistory).toBe(1);
    await rs.ndviHistory(plot(), '2027-01');
    expect(calls.ndviHistory).toBe(2);
  });

  it('stores each answer with its key, source and fetched_at', async () => {
    const { provider } = counting();
    const rs = withCache(provider, t.db, { now: NOW });
    await rs.forestLoss(plot());
    await rs.ndviWindow(plot(), '2026-12-08', 30);
    const rows = await t.db.select().from(remoteSensingCache);
    expect(rows.map(({ response, ...k }) => ({ ...k, response: JSON.parse(response) as unknown })).sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      {
        plotId: 'PL-CACHE001',
        provider: 'gfw',
        kind: 'loss',
        monthBucket: 'static',
        geometryHash: 'a'.repeat(64),
        fetchedAt: '2026-12-08T05:30:00.000Z',
        response: { source: 'fixture', result: { lossHa: 0.036, lossPct: 3, yearsFrom: 2021, dataYear: 2025 } },
      },
      {
        plotId: 'PL-CACHE001',
        provider: 'sentinel-hub',
        kind: 'ndvi_window',
        monthBucket: '2026-12',
        geometryHash: 'a'.repeat(64),
        fetchedAt: '2026-12-08T05:30:00.000Z',
        response: { source: 'fixture', result: { mean: 0.71, clearObservations: 4 } },
      },
    ]);
  });

  it('errors are never cached: a failing call is retried next time', async () => {
    const failing = counting({ fail: true });
    const rs = withCache(failing.provider, t.db, { now: NOW });
    await expect(rs.forestLoss(plot())).rejects.toEqual(new ProviderError('gfw', 500));
    await expect(rs.forestLoss(plot())).rejects.toEqual(new ProviderError('gfw', 500));
    await expect(rs.ndviWindow(plot(), '2026-12-08', 30)).rejects.toMatchObject({ kind: 'malformed' });
    expect(failing.calls.forestLoss).toBe(2);
    expect(await t.db.select().from(remoteSensingCache)).toEqual([]);
  });

  it('an answer cached from another source (fixture vs live) is not served', async () => {
    const { provider, calls } = counting();
    await withCache(provider, t.db, { now: NOW }).forestLoss(plot());
    const live = counting();
    const liveProvider: RemoteSensingProvider = { ...live.provider, name: 'live' };
    await withCache(liveProvider, t.db, { now: NOW }).forestLoss(plot());
    expect([calls.forestLoss, live.calls.forestLoss]).toEqual([1, 1]);
  });

  it('keeps the provider name', () => {
    expect(withCache(counting().provider, t.db).name).toBe('fixture');
  });
});

describe('withTimeouts (TC-032 timing half)', () => {
  const never: RemoteSensingProvider = {
    name: 'live',
    forestLoss: () => new Promise(() => undefined),
    ndviHistory: () => new Promise(() => undefined),
    ndviWindow: () => new Promise(() => undefined),
  };

  it('a never-answering call rejects with kind timeout at 8000 ms, naming the provider', async () => {
    vi.useFakeTimers();
    const rs = withTimeouts(never, { timeoutMs: 8000 });
    let outcome: unknown = 'pending';
    const p = rs.ndviWindow(plot(), '2026-12-08', 30).catch((e: unknown) => (outcome = e));
    await vi.advanceTimersByTimeAsync(7999);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(outcome).toEqual(new ProviderError('sentinel-hub', 'timeout'));
    const q = rs.forestLoss(plot()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await q).toEqual(new ProviderError('gfw', 'timeout'));
  });

  it('hands the call a signal that aborts at the timeout', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const spy: RemoteSensingProvider = {
      ...never,
      forestLoss: (_p, o) => {
        seen = o?.signal;
        return new Promise(() => undefined);
      },
    };
    const p = withTimeouts(spy, { timeoutMs: 8000 }).forestLoss(plot()).catch(() => undefined);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8000);
    await p;
    expect(seen?.aborted).toBe(true);
  });

  it("the caller's own signal aborts the call early", async () => {
    const ctl = new AbortController();
    const p = withTimeouts(never, { timeoutMs: 8000 }).ndviHistory(plot(), '2026-12', { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toEqual(new ProviderError('sentinel-hub', 'timeout'));
  });

  it('a prompt answer passes through and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const { provider } = counting();
    expect(await withTimeouts(provider).ndviWindow(plot(), '2026-12-08', 30)).toEqual({ mean: 0.71, clearObservations: 4 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('defaults to cfg-1 providers.timeoutMs (8000)', async () => {
    vi.useFakeTimers();
    const p = withTimeouts(never).forestLoss(plot()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toMatchObject({ kind: 'timeout' });
  });
});
