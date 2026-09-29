// The GPS watch of the record flow (technical-plan §9, TP13, TSK-10.4). Browser only, but takes the
// Geolocation object and the clock as parameters so it is unit-tested in Node. It starts when the flow
// opens and keeps the most accurate fix of the last 60 s, so Submit uses a fix it already holds (it
// waits up to 10 s only when that fix is older than 10 s). A weak fix never blocks capture
// (Design.md §18): the verifier scores it.

export type Fix = { lat: number; lng: number; accuracyM: number; at: number };
export type GpsState = 'finding' | 'ok' | 'weak' | 'denied';

export type GpsWatch = {
  best(): Fix | null;
  waitForFresh(maxMs?: number, maxAgeMs?: number): Promise<Fix | null>;
  onChange(cb: () => void): () => void;
  stop(): void;
  state(): GpsState;
};

const KEEP_MS = 60_000;
const WEAK_M = 100;
const PERMISSION_DENIED = 1;

export function startGpsWatch(geo: Geolocation | undefined = globalThis.navigator?.geolocation, now: () => number = Date.now): GpsWatch {
  let fixes: Fix[] = [];
  let denied = !geo;
  const listeners = new Set<() => void>();
  const waiters = new Set<() => void>(); // each re-reads the held fixes when woken
  const changed = () => {
    for (const cb of [...listeners]) cb();
  };

  /** The most accurate fix taken at or after `since` (on a tie the newer one), or null. */
  function bestSince(since: number): Fix | null {
    const recent = fixes.filter((f) => f.at >= since);
    return recent.length === 0 ? null : recent.reduce((a, b) => (b.accuracyM <= a.accuracyM ? b : a));
  }
  const best = (): Fix | null => (fixes.length === 0 ? null : bestSince(fixes.at(-1)!.at - KEEP_MS));

  const id = geo?.watchPosition(
    (p) => {
      const fix: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: now() };
      fixes = [...fixes.filter((f) => f.at >= fix.at - KEEP_MS), fix];
      denied = false;
      for (const w of [...waiters]) w();
      changed();
    },
    (e) => {
      if (e.code === PERMISSION_DENIED) {
        denied = true;
        changed();
      }
    },
    { enableHighAccuracy: true, maximumAge: 0 },
  );

  return {
    best,
    state() {
      if (denied) return 'denied';
      const b = best();
      if (!b) return 'finding';
      return b.accuracyM >= WEAK_M ? 'weak' : 'ok';
    },
    waitForFresh(maxMs = 10_000, maxAgeMs = 10_000) {
      const fresh = () => bestSince(now() - maxAgeMs);
      const held = fresh();
      if (held) return Promise.resolve(held);
      return new Promise<Fix | null>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve(fresh() ?? best());
        };
        const timer = setTimeout(done, maxMs);
        waiters.add(done);
      });
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    stop() {
      if (id !== undefined) geo?.clearWatch(id);
      listeners.clear();
      for (const w of [...waiters]) w();
    },
  };
}
