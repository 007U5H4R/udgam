import type { PlotPolygon } from '../geo/types';

// The remote-sensing provider contract (technical-plan §7). The fixture adapter is the default; the
// live adapters (GFW, Copernicus Sentinel Hub), the cache and the per-call timeout wrap the same interface.

/**
 * The plot a provider is asked about. `geometryHash` is SHA-256 of the canonical polygon
 * (geo/area.ts geometryHash): the cache key, so an edited polygon misses (EVAL-044).
 */
export type PlotGeom = { id: string; polygon: PlotPolygon; areaHa: number; geometryHash: string };

/**
 * Per-call options. `signal` carries the caller's deadline: the 8 s per-call timeout (withTimeouts) and
 * the verifier's 10 s remote-phase cap. An aborted call rejects with a `timeout` ProviderError.
 */
export type CallOptions = { signal?: AbortSignal };

/**
 * Where an answer came from (CF-11, EXE12): `fixture` answers are demo data, and every evidence sentence
 * derived from one says so; `live` answers come from GFW / Copernicus Sentinel Hub.
 */
export type RsSource = 'fixture' | 'live';

/** `datasetVersion`: the GFW dataset version that answered (the live adapter pins the resolved one). */
export type ForestLoss = { lossHa: number; lossPct: number; yearsFrom: number; dataYear: number; datasetVersion?: string; source: RsSource };
export type NdviHistory = { months: { month: string; mean: number | null; clearFraction: number }[]; source: RsSource };
export type NdviWindow = { mean: number | null; clearObservations: number; source: RsSource };

export interface RemoteSensingProvider {
  name: RsSource;
  forestLoss(plot: PlotGeom, opts?: CallOptions): Promise<ForestLoss>;
  /** The 12 calendar months ending at `endMonth` (YYYY-MM). */
  ndviHistory(plot: PlotGeom, endMonth: string, opts?: CallOptions): Promise<NdviHistory>;
  /** NDVI over [centreDate − days, centreDate + days]; `centreDate` is an IST calendar date (YYYY-MM-DD). */
  ndviWindow(plot: PlotGeom, centreDate: string, days: number, opts?: CallOptions): Promise<NdviWindow>;
}

export type ProviderName = 'gfw' | 'sentinel-hub';
export type ProviderErrorKind = 'timeout' | 'http' | 'malformed';

/**
 * A provider call that failed: timed out, answered non-2xx (`status`), or answered a body that could
 * not be parsed. The checks turn it into `unavailable` with the provider named (S6), never a rejection.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;

  constructor(
    readonly provider: ProviderName,
    detail: number | 'timeout' | 'malformed',
  ) {
    const kind: ProviderErrorKind = typeof detail === 'number' ? 'http' : detail;
    super(typeof detail === 'number' ? `${provider} answered HTTP ${detail}` : `${provider} ${detail === 'timeout' ? 'timed out' : 'answered a malformed body'}`);
    this.name = 'ProviderError';
    this.kind = kind;
    if (typeof detail === 'number') this.status = detail;
  }
}
