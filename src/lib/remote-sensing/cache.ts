import { and, eq } from 'drizzle-orm';
import { writeTx, type Db } from '../db/client';
import { remoteSensingCache } from '../db/schema';
import { log as defaultLog } from '../log';
import type { PlotGeom, ProviderName, RemoteSensingProvider } from './types';

// The remote-sensing cache wrapper (technical-plan §7, §4.1, TSK-07.2, N1). A hit makes no provider
// call. Key: (plot, provider, kind, month bucket, geometry hash) — forest loss `static`, NDVI history
// the month it ends at (the registration month), the harvest window the capture month (the month of
// its IST centre date). An edited polygon has a new geometry hash, so it misses (EVAL-044).
// Only answers are stored; a timeout, HTTP error or malformed body is never cached, so the next call
// (an admin re-run) asks again. An answer from another source (fixture vs live) is never served.

type Kind = (typeof remoteSensingCache.$inferSelect)['kind'];
type Stored<T> = { source: RemoteSensingProvider['name']; result: T };

export type CacheOptions = {
  now?: () => Date;
  log?: Pick<typeof defaultLog, 'warn'>;
};

export function withCache(provider: RemoteSensingProvider, db: Db, opts: CacheOptions = {}): RemoteSensingProvider {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? defaultLog;

  async function cached<T>(plot: PlotGeom, providerName: ProviderName, kind: Kind, monthBucket: string, call: () => Promise<T>): Promise<T> {
    const key = and(
      eq(remoteSensingCache.plotId, plot.id),
      eq(remoteSensingCache.provider, providerName),
      eq(remoteSensingCache.kind, kind),
      eq(remoteSensingCache.monthBucket, monthBucket),
      eq(remoteSensingCache.geometryHash, plot.geometryHash),
    );
    const [row] = await db.select({ response: remoteSensingCache.response }).from(remoteSensingCache).where(key).limit(1);
    if (row) {
      const stored = JSON.parse(row.response) as Stored<T>;
      if (stored.source === provider.name) return stored.result;
    }
    const result = await call(); // a rejection propagates and nothing is stored
    const response = JSON.stringify({ source: provider.name, result } satisfies Stored<T>);
    const fetchedAt = now().toISOString();
    try {
      await writeTx(db, (tx) =>
        tx
          .insert(remoteSensingCache)
          .values({ plotId: plot.id, provider: providerName, kind, monthBucket, geometryHash: plot.geometryHash, response, fetchedAt })
          .onConflictDoUpdate({
            target: [remoteSensingCache.plotId, remoteSensingCache.provider, remoteSensingCache.kind, remoteSensingCache.monthBucket, remoteSensingCache.geometryHash],
            set: { response, fetchedAt },
          }),
      );
    } catch (err) {
      // The answer is still good; only the saving failed. The next call asks the provider again.
      log.warn({ plotId: plot.id, kind, errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'remote_sensing.cache_write_failed');
    }
    return result;
  }

  return {
    name: provider.name,
    forestLoss: (plot, o) => cached(plot, 'gfw', 'loss', 'static', () => provider.forestLoss(plot, o)),
    ndviHistory: (plot, endMonth, o) => cached(plot, 'sentinel-hub', 'ndvi_history', endMonth, () => provider.ndviHistory(plot, endMonth, o)),
    ndviWindow: (plot, centreDate, days, o) =>
      cached(plot, 'sentinel-hub', 'ndvi_window', centreDate.slice(0, 7), () => provider.ndviWindow(plot, centreDate, days, o)),
  };
}
