import { log as defaultLog } from '../log';
import { CONFIG } from '../verification/config';
import { ProviderError, type CallOptions, type ForestLoss, type PlotGeom } from './types';

// Global Forest Watch tree-cover-loss adapter (technical-plan §7, TSK-07.4, TC-030). One Data API SQL
// query per plot geometry: hectares of UMD tree-cover loss inside the polygon since 2021 at canopy
// density ≥ 10 % (the EUDR forest definition, cfg-1 deforestation.canopyDensityPct; TP11). The
// dataset version is pinned (cfg-1 gfwDatasetVersion, v1.13); asked for `latest`, the 307 redirect is
// followed and the version it resolved to is recorded with the answer. Every failure is a
// ProviderError (timeout / http / malformed) — the check turns it into `unavailable`, never a
// rejection (S6). The API key goes only into the request header: never into a log line or an error.
// Redirects are followed by hand (SEC-100): fetch keeps a custom header such as `x-api-key` across a
// cross-origin hop (only `authorization` is dropped), so a hop is taken only when its Location is on
// the base URL's own origin, at most MAX_REDIRECTS times; any other 3xx is a ProviderError(status).

export const GFW_BASE_URL = 'https://data-api.globalforestwatch.org';
/** UMD tree-cover loss v1.13 runs through 2025 (§7). */
export const GFW_LAST_DATA_YEAR = 2025;

export type GfwOptions = {
  apiKey: string;
  baseUrl?: string;
  /** Default: cfg-1 deforestation.gfwDatasetVersion (pinned). `latest` follows GFW's redirect. */
  datasetVersion?: string;
  /** Sent as the `origin` header (GFW keys may be domain-restricted). */
  origin: string;
  fetch?: typeof globalThis.fetch;
  log?: Pick<typeof defaultLog, 'warn'>;
  canopyDensityPct?: number;
  lossFromYear?: number;
};

/** The query, exactly (TSK-07.4). */
export function gfwSql(lossFromYear: number, canopyDensityPct: number): string {
  return [
    'SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha FROM results',
    `WHERE umd_tree_cover_loss__year >= ${lossFromYear} AND umd_tree_cover_density_2000__threshold >= ${canopyDensityPct}`,
    'GROUP BY umd_tree_cover_loss__year',
  ].join('\n');
}

type GfwRow = { umd_tree_cover_loss__year: unknown; area__ha: unknown };

/** Same-origin hops followed before giving up (`latest` → pinned version needs one). */
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const isAbort = (err: unknown) => err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

export function createGfwProvider(o: GfwOptions) {
  const baseUrl = (o.baseUrl ?? GFW_BASE_URL).replace(/\/+$/, '');
  const version = o.datasetVersion ?? CONFIG.deforestation.gfwDatasetVersion;
  const doFetch = o.fetch ?? globalThis.fetch;
  const log = o.log ?? defaultLog;
  const lossFromYear = o.lossFromYear ?? CONFIG.deforestation.lossFromYear;
  const sql = gfwSql(lossFromYear, o.canopyDensityPct ?? CONFIG.deforestation.canopyDensityPct);

  const baseOrigin = new URL(baseUrl).origin;
  const release = (res: Response) => res.body?.cancel().catch(() => undefined); // free the connection now, not at garbage collection

  async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, redirect: 'manual' });
    } catch (err) {
      if (isAbort(err) || init.signal?.aborted) throw new ProviderError('gfw', 'timeout');
      log.warn({ provider: 'gfw', errClass: errClass(err) }, 'remote_sensing.request_failed');
      throw new ProviderError('gfw', 0); // no response at all (DNS, TLS, reset)
    }
  }

  /** The next hop of a 3xx, or null when it must not be taken (no usable Location, or off-origin). */
  function nextHop(res: Response, from: string): URL | null {
    const location = res.headers.get('location');
    if (!location) return null;
    let next: URL;
    try {
      next = new URL(location, from);
    } catch {
      return null;
    }
    return next.origin === baseOrigin ? next : null;
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    let current = url;
    let req = init;
    for (let hop = 0; ; hop++) {
      const res = await fetchOnce(current, req);
      if (!REDIRECT_STATUSES.has(res.status)) {
        if (!res.ok) {
          log.warn({ provider: 'gfw', status: res.status }, 'remote_sensing.http_error');
          await release(res);
          throw new ProviderError('gfw', res.status);
        }
        return res;
      }
      await release(res);
      const next = hop < MAX_REDIRECTS ? nextHop(res, current) : null;
      if (!next) {
        // Never the Location itself: its query string may carry anything (SEC-100).
        log.warn({ provider: 'gfw', status: res.status, hop }, 'remote_sensing.redirect_refused');
        throw new ProviderError('gfw', res.status);
      }
      // Fetch's method rewrite: 303 (and 301/302 after a POST) continue as a GET without a body.
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && req.method === 'POST')) {
        req = { ...req, method: 'GET', body: undefined };
      }
      current = next.href;
    }
  }

  const headers = () => ({ 'x-api-key': o.apiKey, 'content-type': 'application/json', origin: o.origin });

  return {
    async forestLoss(plot: PlotGeom, opts?: CallOptions): Promise<ForestLoss> {
      const res = await send(`${baseUrl}/dataset/umd_tree_cover_loss/${version}/query/json`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ sql, geometry: plot.polygon }),
        signal: opts?.signal,
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch (err) {
        if (isAbort(err) || opts?.signal?.aborted) throw new ProviderError('gfw', 'timeout');
        throw new ProviderError('gfw', 'malformed');
      }
      const b = body as { status?: unknown; data?: unknown };
      if (typeof body !== 'object' || body === null || b.status !== 'success' || !Array.isArray(b.data)) throw new ProviderError('gfw', 'malformed');
      let lossHa = 0;
      let maxYear = 0;
      for (const row of b.data as GfwRow[]) {
        const year = row?.umd_tree_cover_loss__year;
        const ha = row?.area__ha;
        if (typeof year !== 'number' || !Number.isInteger(year) || typeof ha !== 'number' || !Number.isFinite(ha) || ha < 0) {
          throw new ProviderError('gfw', 'malformed');
        }
        lossHa += ha;
        maxYear = Math.max(maxYear, year);
      }
      const resolved = /\/umd_tree_cover_loss\/(v[0-9][0-9.]*)\//.exec(res.url)?.[1] ?? version;
      return {
        lossHa,
        lossPct: (lossHa / plot.areaHa) * 100,
        yearsFrom: lossFromYear,
        dataYear: Math.max(maxYear, GFW_LAST_DATA_YEAR),
        datasetVersion: resolved,
        source: 'live',
      };
    },

    /** Health probe (§15): the dataset's metadata answers 2xx with this key. */
    async probe(opts?: CallOptions): Promise<void> {
      await send(`${baseUrl}/dataset/umd_tree_cover_loss`, { method: 'GET', headers: headers(), signal: opts?.signal });
    },
  };
}

export type GfwProvider = ReturnType<typeof createGfwProvider>;
