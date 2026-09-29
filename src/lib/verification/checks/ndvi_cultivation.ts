import { plotGeom } from '../../remote-sensing';
import { ProviderError, type NdviHistory } from '../../remote-sensing/types';
import type { VerifyConfig } from '../config';
import { evidence, istMonth, providerReason } from '../evidence';
import type { Check, CheckOutcome } from '../registry';

// ndvi_cultivation (technical-plan §6.3, TP11): is the plot a year-round canopy? Over the 12 monthly
// NDVI means (Sentinel-2, clouds masked): ≥ 6 clear months, lowest month ≥ 0.50 and seasonal swing
// (highest − lowest) ≤ 0.35 → ok; otherwise fail. Fewer than 6 clear months, or a provider failure →
// unavailable (S6). The history ends at the plot's registration month (its cache bucket, F2); a plot
// without registration checks uses the capture month (IST).

const id = 'ndvi_cultivation' as const;

/** Round away float noise (0.85 − 0.5 = 0.35000000000000003) before comparing with a 2-dp threshold. */
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const validNdvi = (x: number) => Number.isFinite(x) && x >= -1 && x <= 1;

export function ndviHistoryOutcome(history: NdviHistory, config: VerifyConfig): CheckOutcome {
  const c = config.ndviCultivation;
  if (!Array.isArray(history.months) || history.months.some((m) => m.mean !== null && !validNdvi(m.mean))) return sentinelDown('malformed response');
  const clear = history.months.flatMap((m) => (m.mean === null ? [] : [m.mean]));
  if (clear.length < c.minClearMonths) {
    return { id, status: 'unavailable', hardFail: false, evidence: evidence.ndvi_cultivation.unavailable({ reason: 'few_clear_months', clearMonths: clear.length }) };
  }
  const f = { min: Math.min(...clear), max: Math.max(...clear), clearMonths: clear.length };
  const ok = f.min >= c.canopyMin && r6(f.max - f.min) <= c.maxSeasonalSwing;
  return ok
    ? { id, status: 'ok', hardFail: false, evidence: evidence.ndvi_cultivation.ok(f) }
    : { id, status: 'fail', hardFail: false, evidence: evidence.ndvi_cultivation.fail(f) };
}

function sentinelDown(detail: string): CheckOutcome {
  return { id, status: 'unavailable', hardFail: false, evidence: evidence.ndvi_cultivation.unavailable({ reason: 'provider', detail }), provider: 'sentinel-hub' };
}
export { sentinelDown as ndviHistoryDown };

export const ndviCultivation: Check = {
  id,
  kind: 'remote',
  provider: 'sentinel-hub',
  async run(sub, ctx, config, opts) {
    const endMonth = ctx.plot.historyEndMonth ?? istMonth(sub.serverReceivedAt);
    try {
      return ndviHistoryOutcome(await ctx.remoteSensing.ndviHistory(await plotGeom(ctx.plot), endMonth, { signal: opts?.signal }), config);
    } catch (err) {
      if (err instanceof ProviderError) return sentinelDown(providerReason(err));
      throw err;
    }
  },
};
