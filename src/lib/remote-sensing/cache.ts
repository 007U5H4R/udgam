import { and, eq } from 'drizzle-orm';
import { writeTx, type Db } from '../db/client';
import { remoteSensingCache } from '../db/schema';
import { log as defaultLog } from '../log';
import { CONFIG } from '../verification/config';
import type { NdviHistory, NdviWindow, PlotGeom, ProviderName, RemoteSensingProvider, RsSource } from './types';

// The remote-sensing cache wrapper (technical-plan §7, §4.1, TSK-07.2, N1). A hit makes no provider
// call. Key: (plot, provider, kind, month bucket, geometry hash) — forest loss `static`, NDVI history
// the month it ends at (the registration month), the harvest window the capture month (the month of
// its IST centre date). An edited polygon has a new geometry hash, so it misses (EVAL-044).
// Only answers are stored; a timeout, HTTP error or malformed body is never cached, so the next call
// (an admin re-run) asks again. Nor is an answer that says the sky was not clear enough — a harvest
// window with no clear observation, or a history with fewer clear months than ndvi_cultivation needs —
// so "Check again" and the capture re-run (TKT-12) can see clear passes that arrive later.
// An answer from another source (fixture vs live) is never served; a hit carries the source it was
// stored with, so fixture answers stay labelled demo data (CF-11). The answer is returned without
// waiting for the write: the write goes through writeTx in the background (a held write lock must not
// turn a provider answer into a 10 s timeout), and a failed write is logged. An unreadable row is a
// miss, and the new answer overwrites it.

type Kind = (typeof remoteSensingCache.$inferSelect)['kind'];
type Stored<T> = { source: RsSource; result: Omit<T, 'source'> };

export type CacheOptions = {
  now?: () => Date;
  log?: Pick<typeof defaultLog, 'warn'>;
};

/** A cached provider; `settled()` resolves once every cache write started so far has finished. */
export type CachedProvider = RemoteSensingProvider & { settled(): Promise<void> };

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : 'unknown');

/** A window answer with no clear observation is weather, not a result: not cached. */
const clearWindow = (w: NdviWindow) => w.mean !== null && w.clearObservations > 0;
/** A history with too few clear months cannot be judged yet: not cached. */
const enoughClearMonths = (h: NdviHistory) => h.months.filter((m) => m.mean !== null).length >= CONFIG.ndviCultivation.minClearMonths;

export function withCache(provider: RemoteSensingProvider, db: Db, opts: CacheOptions = {}): CachedProvider {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? defaultLog;
  const writes = new Set<Promise<void>>();

  function store(plot: PlotGeom, providerName: ProviderName, kind: Kind, monthBucket: string, response: string): void {
    const fetchedAt = now().toISOString();
    const write: Promise<void> = writeTx(db, (tx) =>
      tx
        .insert(remoteSensingCache)
        .values({ plotId: plot.id, provider: providerName, kind, monthBucket, geometryHash: plot.geometryHash, response, fetchedAt })
        .onConflictDoUpdate({
          target: [remoteSensingCache.plotId, remoteSensingCache.provider, remoteSensingCache.kind, remoteSensingCache.monthBucket, remoteSensingCache.geometryHash],
          set: { response, fetchedAt },
        }),
    )
      .then(
        () => undefined,
        // The answer is still good; only the saving failed. The next call asks the provider again.
        (err: unknown) => log.warn({ plotId: plot.id, kind, errClass: errClass(err) }, 'remote_sensing.cache_write_failed'),
      )
      .finally(() => writes.delete(write));
    writes.add(write);
  }

  async function cached<T extends { source: RsSource }>(
    plot: PlotGeom,
    providerName: ProviderName,
    kind: Kind,
    monthBucket: string,
    call: () => Promise<T>,
    cacheable: (t: T) => boolean = () => true,
  ): Promise<T> {
    const key = and(
      eq(remoteSensingCache.plotId, plot.id),
      eq(remoteSensingCache.provider, providerName),
      eq(remoteSensingCache.kind, kind),
      eq(remoteSensingCache.monthBucket, monthBucket),
      eq(remoteSensingCache.geometryHash, plot.geometryHash),
    );
    const [row] = await db.select({ response: remoteSensingCache.response }).from(remoteSensingCache).where(key).limit(1);
    if (row) {
      try {
        const stored = JSON.parse(row.response) as Stored<T>;
        if (typeof stored?.result !== 'object' || stored.result === null) throw new TypeError('cache row has no result');
        if (stored.source === provider.name) return { ...stored.result, source: stored.source } as T;
      } catch (err) {
        log.warn({ plotId: plot.id, kind, errClass: errClass(err) }, 'remote_sensing.cache_unreadable'); // a miss; overwritten below
      }
    }
    const result = await call(); // a rejection propagates and nothing is stored
    if (cacheable(result)) {
      const rest: Partial<T> = { ...result };
      delete rest.source; // stored once, beside the result
      store(plot, providerName, kind, monthBucket, JSON.stringify({ source: provider.name, result: rest }));
    }
    return result;
  }

  return {
    name: provider.name,
    forestLoss: (plot, o) => cached(plot, 'gfw', 'loss', 'static', () => provider.forestLoss(plot, o)),
    ndviHistory: (plot, endMonth, o) => cached(plot, 'sentinel-hub', 'ndvi_history', endMonth, () => provider.ndviHistory(plot, endMonth, o), enoughClearMonths),
    ndviWindow: (plot, centreDate, days, o) =>
      cached(plot, 'sentinel-hub', 'ndvi_window', centreDate.slice(0, 7), () => provider.ndviWindow(plot, centreDate, days, o), clearWindow),
    async settled() {
      while (writes.size > 0) await Promise.all([...writes]);
    },
  };
}
