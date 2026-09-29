import { ProviderError, type CallOptions, type PlotGeom, type ProviderName, type RemoteSensingProvider } from './types';

// The fixture remote-sensing adapter (technical-plan §7): the default provider, offline and keyless.
// It answers from per-plot profiles (evals/fixtures/remote-sensing/<plotId>.json, generated from the
// dataset by evals/harness/fixtures.ts). Fault injection comes only from the constructor option — the
// harness passes a case's `provider_fault` mutations — never from env.

/** What the fixture provider answers for one plot. */
export type RsProfile = {
  plotId: string;
  forestLoss: { lossPct: number; lossHa: number; yearsFrom: number; dataYear: number; lossAdjacentOutside: boolean };
  /** One entry per calendar month (1–12). A month with no clear observation has mean null. */
  ndviHistory: {
    profile: 'perennial_canopy' | 'annual_crop' | 'cleared_then_planted';
    byCalendarMonth: { month: number; mean: number | null; clearFraction: number }[];
  };
  ndviWindow: { profile: 'living_canopy' | 'bare' | 'cloud_blocked'; mean: number | null; clearObservations: number };
};

export type FaultMode = 'timeout' | 'http_500' | 'malformed';
export type ProviderFault = { provider: ProviderName; mode: FaultMode; cacheEmpty?: boolean };

export type FixtureProviderOptions = { profiles: Record<string, RsProfile>; faults?: ProviderFault[] };

/** 'YYYY-MM' of the month `back` months before `endMonth`. */
function monthBefore(endMonth: string, back: number): { key: string; calendarMonth: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(endMonth);
  if (!m) throw new TypeError(`endMonth must be YYYY-MM, got ${endMonth}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) - back;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { key: `${year}-${String(month).padStart(2, '0')}`, calendarMonth: month };
}

export class FixtureProvider implements RemoteSensingProvider {
  readonly name = 'fixture' as const;
  readonly faults: readonly ProviderFault[];
  private readonly profiles: Record<string, RsProfile>;

  constructor(opts: FixtureProviderOptions) {
    this.profiles = opts.profiles;
    this.faults = opts.faults ?? [];
  }

  private profile(plotId: string): RsProfile {
    const p = this.profiles[plotId];
    if (!p) throw new Error(`no remote-sensing fixture profile for plot ${plotId}`);
    return p;
  }

  /** Apply an injected fault for `provider`, if any: reject, or (timeout) wait for the caller's signal. */
  private async answer<T>(provider: ProviderName, opts: CallOptions | undefined, body: () => T): Promise<T> {
    const fault = this.faults.find((f) => f.provider === provider);
    if (fault?.mode === 'http_500') throw new ProviderError(provider, 500);
    if (fault?.mode === 'malformed') throw new ProviderError(provider, 'malformed');
    if (fault?.mode === 'timeout') {
      // Never answers on its own; honours the caller's AbortSignal (TKT-07's 8 s AbortSignal.timeout).
      return new Promise<T>((_, reject) => {
        const signal = opts?.signal;
        if (!signal) return;
        if (signal.aborted) return reject(new ProviderError(provider, 'timeout'));
        signal.addEventListener('abort', () => reject(new ProviderError(provider, 'timeout')), { once: true });
      });
    }
    return body();
  }

  forestLoss(plot: PlotGeom, opts?: CallOptions) {
    return this.answer('gfw', opts, () => {
      const { lossHa, lossPct, yearsFrom, dataYear } = this.profile(plot.id).forestLoss;
      return { lossHa, lossPct, yearsFrom, dataYear };
    });
  }

  ndviHistory(plot: PlotGeom, endMonth: string, opts?: CallOptions) {
    return this.answer('sentinel-hub', opts, () => {
      const byMonth = this.profile(plot.id).ndviHistory.byCalendarMonth;
      const months = Array.from({ length: 12 }, (_, i) => {
        const { key, calendarMonth } = monthBefore(endMonth, 11 - i);
        const m = byMonth.find((x) => x.month === calendarMonth);
        return { month: key, mean: m?.mean ?? null, clearFraction: m?.clearFraction ?? 0 };
      });
      return { months };
    });
  }

  ndviWindow(plot: PlotGeom, _centreDate: string, _days: number, opts?: CallOptions) {
    return this.answer('sentinel-hub', opts, () => {
      const { mean, clearObservations } = this.profile(plot.id).ndviWindow;
      return { mean, clearObservations };
    });
  }
}
