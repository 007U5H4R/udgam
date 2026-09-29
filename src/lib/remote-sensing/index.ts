import type { Env } from '../config/env';
import type { Db } from '../db/client';
import { geometryHash } from '../geo/area';
import type { PlotPolygon } from '../geo/types';
import { CONFIG } from '../verification/config';
import { withCache } from './cache';
import { createFixtureProvider, loadFixtureSet, type FixtureProvider, type FixtureSet } from './fixture';
import { ProviderError, type CallOptions, type PlotGeom, type ProviderName, type RemoteSensingProvider } from './types';

// Remote sensing for the app (technical-plan §7, TSK-07.2): the provider chosen by
// REMOTE_SENSING_PROVIDER (fixture by default, keyless and offline), each call bounded by the 8 s
// timeout, and the per-plot cache in front. Nothing here reads a key except through `Env`.

export { withCache } from './cache';
export { ProviderError } from './types';
export type { PlotGeom, RemoteSensingProvider } from './types';

/**
 * Give every call its own deadline: an AbortSignal that fires after `timeoutMs` (cfg-1
 * providers.timeoutMs, 8000) or when the caller's own signal aborts, whichever is first. The call is
 * handed that signal (so a live fetch is cancelled) and rejects at the deadline with a `timeout`
 * ProviderError naming the provider, even if the adapter ignores the signal. A timer rather than
 * AbortSignal.timeout(), so fake timers can drive it in tests (TC-032).
 */
export function withTimeouts(provider: RemoteSensingProvider, opts: { timeoutMs?: number } = {}): RemoteSensingProvider {
  const timeoutMs = opts.timeoutMs ?? CONFIG.providers.timeoutMs;

  function timed<T>(name: ProviderName, outer: CallOptions | undefined, call: (o: CallOptions) => Promise<T>): Promise<T> {
    const ctl = new AbortController();
    const expired = new Promise<never>((_, reject) => {
      ctl.signal.addEventListener('abort', () => reject(new ProviderError(name, 'timeout')), { once: true });
    });
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onOuterAbort = () => ctl.abort();
    const outerSignal = outer?.signal;
    if (outerSignal?.aborted) ctl.abort();
    else outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
    return Promise.race([call({ signal: ctl.signal }), expired]).finally(() => {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    });
  }

  return {
    name: provider.name,
    forestLoss: (plot, o) => timed('gfw', o, (s) => provider.forestLoss(plot, s)),
    ndviHistory: (plot, endMonth, o) => timed('sentinel-hub', o, (s) => provider.ndviHistory(plot, endMonth, s)),
    ndviWindow: (plot, centreDate, days, o) => timed('sentinel-hub', o, (s) => provider.ndviWindow(plot, centreDate, days, s)),
  };
}

type RsEnv = Pick<Env, 'REMOTE_SENSING_PROVIDER' | 'GFW_API_KEY' | 'CDSE_CLIENT_ID' | 'CDSE_CLIENT_SECRET' | 'PUBLIC_BASE_URL'>;

let fixtureSet: Promise<FixtureSet> | undefined;
let fixture: FixtureProvider | undefined;

/**
 * The app's fixture provider: the committed fixture set (dataset plots by ID and geometry hash, plus
 * the extra fixture geometries), and for any other plot the P01 profile — an honest perennial plot with
 * no loss — so a demo or e2e plot drawn by hand verifies. Fixture mode is visible as `fixture` in
 * /api/health; production runs `live` (M-003).
 */
async function appFixture(): Promise<FixtureProvider> {
  fixtureSet ??= loadFixtureSet();
  const set = await fixtureSet;
  fixture ??= createFixtureProvider({ ...set, fallback: set.profiles.P01 });
  return fixture;
}

/** A provider whose calls wait for an async-built one (the fixture set is read from disk once). */
function deferred(name: RemoteSensingProvider['name'], get: () => Promise<RemoteSensingProvider>): RemoteSensingProvider {
  return {
    name,
    forestLoss: async (plot, o) => (await get()).forestLoss(plot, o),
    ndviHistory: async (plot, endMonth, o) => (await get()).ndviHistory(plot, endMonth, o),
    ndviWindow: async (plot, centreDate, days, o) => (await get()).ndviWindow(plot, centreDate, days, o),
  };
}

/** technical-plan TSK-07.2: the provider REMOTE_SENSING_PROVIDER names (`fixture` | `live`). */
export function getRemoteSensing(e: RsEnv): RemoteSensingProvider {
  if (e.REMOTE_SENSING_PROVIDER === 'fixture') return deferred('fixture', appFixture);
  throw new Error('REMOTE_SENSING_PROVIDER=live: the live adapters are not built yet');
}

/** What the capture pipeline and plot registration use: provider → 8 s timeouts → cache. */
export function appRemoteSensing(db: Db, e: RsEnv, opts: { now?: () => Date } = {}): RemoteSensingProvider {
  return withCache(withTimeouts(getRemoteSensing(e)), db, opts);
}

/** The PlotGeom of a plot row: its geometry hash is the cache key. */
export async function plotGeom(plot: { id: string; polygon: PlotPolygon; areaHa: number }): Promise<PlotGeom> {
  return { id: plot.id, polygon: plot.polygon, areaHa: plot.areaHa, geometryHash: await geometryHash(plot.polygon) };
}
