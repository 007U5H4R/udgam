import type { Env } from '../config/env';
import type { Db } from '../db/client';
import { geometryHash } from '../geo/area';
import type { PlotPolygon } from '../geo/types';
import { CONFIG } from '../verification/config';
import { withCache } from './cache';
import { createFixtureProvider, loadFixtureSet, type FixtureProvider, type FixtureSet } from './fixture';
import { createGfwProvider } from './gfw';
import { createSentinelProvider } from './sentinel';
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
 * AbortSignal.timeout(), so a test clock can drive it in tests (TC-032).
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
    let answer: Promise<T>;
    try {
      answer = call({ signal: ctl.signal });
    } catch (err) {
      answer = Promise.reject(err); // an adapter that throws synchronously still settles here, timer cleared
    }
    return Promise.race([answer, expired]).finally(() => {
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
/** What the app's provider choice reads: the provider and keys, plus whether the fixture fallback may apply. */
export type AppRsEnv = RsEnv & Pick<Env, 'NODE_ENV' | 'E2E' | 'DEMO_MODE'>;

/**
 * May the fixture provider answer a plot it has no profile for (fail closed, EXE12)? Only for the
 * Playwright server (E2E=1), a demo (DEMO_MODE=1) or outside production. Otherwise an unknown plot is an
 * error, and its checks are unavailable (Needs Review) rather than passing on made-up satellite data.
 */
export function fixtureFallbackAllowed(e: Pick<Env, 'NODE_ENV' | 'E2E' | 'DEMO_MODE'>): boolean {
  return e.E2E === '1' || e.DEMO_MODE === '1' || e.NODE_ENV !== 'production';
}

let fixtureSet: Promise<FixtureSet> | undefined;
const fixtures = new Map<boolean, FixtureProvider>();

/** The committed fixture set, read once; a failed read is not remembered, so the next call retries. */
function appFixtureSet(): Promise<FixtureSet> {
  fixtureSet ??= loadFixtureSet().catch((err: unknown) => {
    fixtureSet = undefined;
    throw err;
  });
  return fixtureSet;
}

/**
 * The app's fixture provider: the committed fixture set (dataset plots by ID and geometry hash, plus
 * the extra fixture geometries). Where fixtureFallbackAllowed, any other plot gets the P01 profile — an
 * honest perennial plot with no loss — so a demo or e2e plot drawn by hand verifies; its evidence says
 * "(demo data)" (CF-11). Fixture mode is visible as `fixture` in /api/health, and env.ts refuses it in
 * production outside E2E (EXE12).
 */
async function appFixture(withFallback: boolean): Promise<FixtureProvider> {
  const set = await appFixtureSet();
  let fx = fixtures.get(withFallback);
  if (!fx) {
    fx = createFixtureProvider({ ...set, ...(withFallback ? { fallback: set.profiles.P01 } : {}) });
    fixtures.set(withFallback, fx);
  }
  return fx;
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

/** The live provider: GFW for forest loss, Copernicus Sentinel Hub for NDVI, plus their health probes. */
export type LiveProvider = RemoteSensingProvider & { probe(): Promise<{ gfw: 'ok' | 'error'; sentinelHub: 'ok' | 'error' }> };

const PROBE_TIMEOUT_MS = 5_000;

/** Resolve within `ms` or report an error: a probe must never hold /api/health. */
async function probeOk(run: (o: CallOptions) => Promise<void>, ms: number): Promise<'ok' | 'error'> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    await Promise.race([
      run({ signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('probe timed out')), { once: true })),
    ]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** technical-plan §7: the live adapters from env keys. Names missing variables, never values. */
export function createLiveProvider(e: RsEnv, opts: { fetch?: typeof globalThis.fetch } = {}): LiveProvider {
  const missing = (['GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET'] as const).filter((k) => !e[k]);
  if (missing.length > 0) throw new Error(`REMOTE_SENSING_PROVIDER=live needs ${missing.join(', ')}`);
  const gfw = createGfwProvider({ apiKey: e.GFW_API_KEY!, origin: e.PUBLIC_BASE_URL, fetch: opts.fetch });
  const sentinel = createSentinelProvider({ clientId: e.CDSE_CLIENT_ID!, clientSecret: e.CDSE_CLIENT_SECRET!, fetch: opts.fetch });
  return {
    name: 'live',
    forestLoss: (plot, o) => gfw.forestLoss(plot, o),
    ndviHistory: (plot, endMonth, o) => sentinel.ndviHistory(plot, endMonth, o),
    ndviWindow: (plot, centreDate, days, o) => sentinel.ndviWindow(plot, centreDate, days, o),
    async probe() {
      const [g, s] = await Promise.all([probeOk((o) => gfw.probe(o), PROBE_TIMEOUT_MS), probeOk((o) => sentinel.probe(o), PROBE_TIMEOUT_MS)]);
      return { gfw: g, sentinelHub: s };
    },
  };
}

let liveProvider: LiveProvider | undefined;
const appLive = (e: RsEnv): LiveProvider => (liveProvider ??= createLiveProvider(e));


export type ProviderHealth = { gfw: 'ok' | 'error' | 'fixture'; sentinelHub: 'ok' | 'error' | 'fixture' };

/**
 * The /api/health provider block (§15): `fixture` in fixture mode; in live mode a probe (a GFW dataset
 * GET and a CDSE token fetch) run at most once per `ttlMs` (60 s), its answer reused in between.
 */
export function createProviderHealth(probe: () => Promise<{ gfw: 'ok' | 'error'; sentinelHub: 'ok' | 'error' }>, opts: { now?: () => number; ttlMs?: number } = {}) {
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 60_000;
  let last: { at: number; value: Promise<ProviderHealth> } | undefined;
  return (): Promise<ProviderHealth> => {
    if (!last || now() - last.at >= ttlMs) last = { at: now(), value: probe() };
    return last.value;
  };
}

let appHealth: (() => Promise<ProviderHealth>) | undefined;

/** The app's provider health: fixture, or the cached 60 s live probe. Never throws for a provider fault. */
export function providerHealth(e: RsEnv): Promise<ProviderHealth> {
  if (e.REMOTE_SENSING_PROVIDER === 'fixture') return Promise.resolve({ gfw: 'fixture', sentinelHub: 'fixture' });
  appHealth ??= createProviderHealth(() => appLive(e).probe());
  return appHealth();
}

/** technical-plan TSK-07.2: the provider REMOTE_SENSING_PROVIDER names (`fixture` | `live`). */
export function getRemoteSensing(e: AppRsEnv): RemoteSensingProvider {
  if (e.REMOTE_SENSING_PROVIDER === 'fixture') {
    const withFallback = fixtureFallbackAllowed(e);
    return deferred('fixture', () => appFixture(withFallback));
  }
  return appLive(e);
}

/** What the capture pipeline and plot registration use: provider → 8 s timeouts → cache. */
export function appRemoteSensing(db: Db, e: AppRsEnv, opts: { now?: () => Date } = {}): RemoteSensingProvider {
  return withCache(withTimeouts(getRemoteSensing(e)), db, opts);
}

/** Geometry hashes by polygon object: the three satellite checks of one verify share one hash. */
const hashes = new WeakMap<PlotPolygon, Promise<string>>();

/** The PlotGeom of a plot row: its geometry hash is the cache key. */
export async function plotGeom(plot: { id: string; polygon: PlotPolygon; areaHa: number }): Promise<PlotGeom> {
  let hash = hashes.get(plot.polygon);
  if (!hash) {
    hash = geometryHash(plot.polygon);
    hashes.set(plot.polygon, hash);
  }
  return { id: plot.id, polygon: plot.polygon, areaHa: plot.areaHa, geometryHash: await hash };
}
