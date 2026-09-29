import type { PlotPolygon } from '../geo/types';

// The remote-sensing provider contract (technical-plan §7). TKT-02 needs only the interface, for
// VerifyContext; TKT-07 owns the rest of this folder (fixture and live adapters, cache, timeouts).

export type PlotGeom = { id: string; polygon: PlotPolygon; areaHa: number };

/** Per-call options. `signal` carries the caller's timeout (TKT-07 wraps every call in AbortSignal.timeout). */
export type CallOptions = { signal?: AbortSignal };

export interface RemoteSensingProvider {
  name: 'fixture' | 'live';
  forestLoss(plot: PlotGeom, opts?: CallOptions): Promise<{ lossHa: number; lossPct: number; yearsFrom: number; dataYear: number }>;
  ndviHistory(plot: PlotGeom, endMonth: string, opts?: CallOptions): Promise<{ months: { month: string; mean: number | null; clearFraction: number }[] }>;
  ndviWindow(plot: PlotGeom, centreDate: string, days: number, opts?: CallOptions): Promise<{ mean: number | null; clearObservations: number }>;
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
