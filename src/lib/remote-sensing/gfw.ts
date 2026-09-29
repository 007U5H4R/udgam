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

const isAbort = (err: unknown) => err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

export function createGfwProvider(o: GfwOptions) {
  const baseUrl = (o.baseUrl ?? GFW_BASE_URL).replace(/\/+$/, '');
  const version = o.datasetVersion ?? CONFIG.deforestation.gfwDatasetVersion;
  const doFetch = o.fetch ?? globalThis.fetch;
  const log = o.log ?? defaultLog;
  const lossFromYear = o.lossFromYear ?? CONFIG.deforestation.lossFromYear;
  const sql = gfwSql(lossFromYear, o.canopyDensityPct ?? CONFIG.deforestation.canopyDensityPct);

  async function send(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, redirect: 'follow' });
    } catch (err) {
      if (isAbort(err) || init.signal?.aborted) throw new ProviderError('gfw', 'timeout');
      log.warn({ provider: 'gfw', errClass: errClass(err) }, 'remote_sensing.request_failed');
      throw new ProviderError('gfw', 0); // no response at all (DNS, TLS, reset)
    }
    if (!res.ok) {
      log.warn({ provider: 'gfw', status: res.status }, 'remote_sensing.http_error');
      throw new ProviderError('gfw', res.status);
    }
    return res;
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
      };
    },

    /** Health probe (§15): the dataset's metadata answers 2xx with this key. */
    async probe(opts?: CallOptions): Promise<void> {
      await send(`${baseUrl}/dataset/umd_tree_cover_loss`, { method: 'GET', headers: headers(), signal: opts?.signal });
    },
  };
}

export type GfwProvider = ReturnType<typeof createGfwProvider>;
