import { localMediaStore, type MediaStore } from '../../src/lib/media/store';

/**
 * A media store under `dir` whose `put` pauses after storing until `k` puts have arrived, so `k` capture
 * requests in flight each store their first photo (and so pass the boundary, the replay lookup and
 * verification) before any of them commits (TKT-09's concurrency tests).
 */
export function barrierStore(dir: string, k: number): MediaStore {
  const real = localMediaStore(dir);
  let arrived = 0;
  let release!: () => void;
  const allStored = new Promise<void>((r) => (release = r));
  return {
    ...real,
    put: async (...a) => {
      const stored = await real.put(...a);
      if (++arrived === k) release();
      await allStored;
      return stored;
    },
  };
}
