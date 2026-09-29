import { log as defaultLog } from '../log';
import { CONFIG } from '../verification/config';
import { NDVI_EVALSCRIPT } from './sentinel-evalscript';
import { ProviderError, type CallOptions, type NdviHistory, type NdviWindow, type PlotGeom } from './types';

// Copernicus Data Space Sentinel Hub NDVI adapter (technical-plan §7, TSK-07.5, TC-031). An OAuth
// client-credentials token (cached until exp − 60 s: the token endpoint is rate-limited), then one
// Statistical API request: monthly (P1M) means over 12 months for the cultivation history, or 10-day
// (P10D) means over ±30 days for the harvest window. Pixels under cloud, cloud shadow, cirrus or snow
// are masked by the evalscript. Fully masked intervals report noDataCount == sampleCount and a NaN mean
// (a number or the string "NaN"), or are missing from `data[]`: both count as not clear. Every failure
// is a ProviderError; the client secret and the token never reach a log line or an error message.

export const CDSE_TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
export const CDSE_STATS_URL = 'https://sh.dataspace.copernicus.eu/statistics/v1';
const CRS_4326 = 'http://www.opengis.net/def/crs/EPSG/0/4326';
const TOKEN_MARGIN_MS = 60_000;
const DAY_MS = 86_400_000;

export type SentinelOptions = {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  statsUrl?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  log?: Pick<typeof defaultLog, 'warn'>;
  /** The shared token request's own deadline (default cfg-1 providers.timeoutMs). */
  tokenTimeoutMs?: number;
};

type Stats = { mean?: unknown; sampleCount?: unknown; noDataCount?: unknown };
type Interval = { interval?: { from?: unknown }; outputs?: { ndvi?: { bands?: { B0?: { stats?: Stats } } } }; error?: unknown };
type Parsed = { from: string; mean: number | null; clear: number; clearFraction: number };

const isAbort = (err: unknown) => err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

/** 'YYYY-MM' → the first instant of that month (UTC), `add` months later. */
function monthStart(month: string, add = 0): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new TypeError(`month must be YYYY-MM, got ${month}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + add, 1));
}
const ym = (d: Date) => d.toISOString().slice(0, 7);

/** One interval's NDVI statistics: clear pixels, clear fraction and mean (null when nothing was clear). */
function parseInterval(x: Interval): Parsed {
  const from = x?.interval?.from;
  if (typeof from !== 'string') throw new ProviderError('sentinel-hub', 'malformed');
  const s = x.outputs?.ndvi?.bands?.B0?.stats;
  if (x.error !== undefined || !s) return { from, mean: null, clear: 0, clearFraction: 0 }; // a failed interval is not clear
  const sampleCount = s.sampleCount;
  const noDataCount = s.noDataCount;
  if (typeof sampleCount !== 'number' || typeof noDataCount !== 'number' || !Number.isInteger(sampleCount) || !Number.isInteger(noDataCount) || sampleCount < 0 || noDataCount < 0 || noDataCount > sampleCount) {
    throw new ProviderError('sentinel-hub', 'malformed');
  }
  const clear = sampleCount - noDataCount;
  const rawMean = s.mean;
  const nan = rawMean === 'NaN' || (typeof rawMean === 'number' && Number.isNaN(rawMean)) || rawMean === null || rawMean === undefined;
  if (clear === 0 || nan) return { from, mean: null, clear: 0, clearFraction: 0 };
  if (typeof rawMean !== 'number' || rawMean < -1 || rawMean > 1) throw new ProviderError('sentinel-hub', 'malformed');
  return { from, mean: rawMean, clear, clearFraction: clear / sampleCount };
}

/** Release an unread response body, so the connection is not held until garbage collection. */
async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

/** `p`, or a timeout ProviderError as soon as `signal` aborts (the shared work itself carries on). */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new ProviderError('sentinel-hub', 'timeout'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ProviderError('sentinel-hub', 'timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function createSentinelProvider(o: SentinelOptions) {
  const tokenUrl = o.tokenUrl ?? CDSE_TOKEN_URL;
  const statsUrl = o.statsUrl ?? CDSE_STATS_URL;
  const doFetch = o.fetch ?? globalThis.fetch;
  const now = o.now ?? (() => new Date());
  const log = o.log ?? defaultLog;
  const tokenTimeoutMs = o.tokenTimeoutMs ?? CONFIG.providers.timeoutMs;
  let token: { value: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function send(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await doFetch(url, init);
    } catch (err) {
      if (isAbort(err) || init.signal?.aborted) throw new ProviderError('sentinel-hub', 'timeout');
      log.warn({ provider: 'sentinel-hub', what, errClass: errClass(err) }, 'remote_sensing.request_failed');
      throw new ProviderError('sentinel-hub', 0);
    }
  }

  async function json(res: Response, signal: AbortSignal | undefined): Promise<unknown> {
    try {
      return await res.json();
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw new ProviderError('sentinel-hub', 'timeout');
      throw new ProviderError('sentinel-hub', 'malformed');
    }
  }

  async function fetchToken(signal: AbortSignal | undefined): Promise<string> {
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: o.clientId, client_secret: o.clientSecret });
    const res = await send(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal }, 'token');
    if (!res.ok) {
      log.warn({ provider: 'sentinel-hub', what: 'token', status: res.status }, 'remote_sensing.http_error');
      await discard(res);
      throw new ProviderError('sentinel-hub', res.status);
    }
    const t = (await json(res, signal)) as { access_token?: unknown; expires_in?: unknown };
    if (typeof t?.access_token !== 'string' || t.access_token.length === 0 || typeof t.expires_in !== 'number' || !(t.expires_in > 0)) {
      throw new ProviderError('sentinel-hub', 'malformed');
    }
    token = { value: t.access_token, expiresAt: now().getTime() + t.expires_in * 1000 };
    return t.access_token;
  }

  /**
   * The one shared token request. It is bounded by its own timeout, never by a caller's signal: one
   * caller giving up (its 8 s timeout, the 10 s cap, a 5 s health probe) must not fail the others.
   */
  function sharedToken(): Promise<string> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), tokenTimeoutMs);
    return fetchToken(ctl.signal).finally(() => {
      clearTimeout(timer);
      pending = undefined;
    });
  }

  /** A token valid for at least another 60 s; concurrent callers share one token request, each bounded by its own signal. */
  async function accessToken(signal: AbortSignal | undefined, force = false): Promise<string> {
    if (!force && token && now().getTime() < token.expiresAt - TOKEN_MARGIN_MS) return token.value;
    if (force) token = undefined;
    pending ??= sharedToken();
    return untilAborted(pending, signal);
  }

  async function statistics(plot: PlotGeom, from: Date, to: Date, of: 'P1M' | 'P10D', signal: AbortSignal | undefined): Promise<Parsed[]> {
    const request = JSON.stringify({
      input: {
        bounds: { geometry: plot.polygon, properties: { crs: CRS_4326 } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }],
      },
      aggregation: {
        timeRange: { from: from.toISOString(), to: to.toISOString() },
        aggregationInterval: { of, lastIntervalBehavior: 'SHORTEN' },
        evalscript: NDVI_EVALSCRIPT,
        resx: 0.0001,
        resy: 0.0001,
      },
    });
    const call = async (bearer: string) =>
      send(statsUrl, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: request, signal }, 'statistics');
    let res = await call(await accessToken(signal));
    if (res.status === 401) {
      await discard(res);
      res = await call(await accessToken(signal, true)); // the token was revoked early: refresh once
    }
    if (!res.ok) {
      log.warn({ provider: 'sentinel-hub', what: 'statistics', status: res.status }, 'remote_sensing.http_error');
      await discard(res);
      throw new ProviderError('sentinel-hub', res.status);
    }
    const body = (await json(res, signal)) as { data?: unknown };
    if (typeof body !== 'object' || body === null || !Array.isArray(body.data)) throw new ProviderError('sentinel-hub', 'malformed');
    return (body.data as Interval[]).map(parseInterval);
  }

  return {
    /** The 12 calendar months ending at `endMonth`, monthly means; a missing month is not clear. */
    async ndviHistory(plot: PlotGeom, endMonth: string, opts?: CallOptions): Promise<NdviHistory> {
      const from = monthStart(endMonth, -11);
      const intervals = await statistics(plot, from, monthStart(endMonth, 1), 'P1M', opts?.signal);
      const months = Array.from({ length: 12 }, (_, i) => {
        const month = ym(monthStart(ym(from), i));
        const hit = intervals.find((x) => x.from.slice(0, 7) === month);
        return { month, mean: hit?.mean ?? null, clearFraction: hit?.clearFraction ?? 0 };
      });
      return { months, source: 'live' };
    },

    /** ±`days` around `centreDate` in 10-day intervals: the clear-pixel-weighted mean of the clear ones. */
    async ndviWindow(plot: PlotGeom, centreDate: string, days: number, opts?: CallOptions): Promise<NdviWindow> {
      const centre = Date.parse(`${centreDate}T00:00:00.000Z`);
      if (Number.isNaN(centre)) throw new TypeError(`centreDate must be YYYY-MM-DD, got ${centreDate}`);
      const from = new Date(centre - days * DAY_MS);
      const to = new Date(centre + (days + 1) * DAY_MS);
      const clear = (await statistics(plot, from, to, 'P10D', opts?.signal)).filter((x) => x.mean !== null && x.clear > 0);
      const pixels = clear.reduce((s, x) => s + x.clear, 0);
      if (pixels === 0) return { mean: null, clearObservations: 0, source: 'live' };
      return { mean: clear.reduce((s, x) => s + x.mean! * x.clear, 0) / pixels, clearObservations: clear.length, source: 'live' };
    },

    /** Health probe (§15): a fresh token can be obtained with these credentials (revoked ones show at once; /api/health caches the probe 60 s). */
    async probe(opts?: CallOptions): Promise<void> {
      await accessToken(opts?.signal, true);
    },
  };
}

export type SentinelProvider = ReturnType<typeof createSentinelProvider>;
