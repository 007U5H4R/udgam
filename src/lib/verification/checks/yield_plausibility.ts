import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * yield_plausibility (§6.3, §6.6, TP6): the plot's SEASON total including this capture, converted from
 * cherry to clean coffee once, per hectare, as a multiple of the crop's reference upper bound:
 * s = ((seasonCherryKgBefore + cherryKg) × cherryToCleanRatio ÷ areaHa) ÷ maxKgHa.
 * ok at s ≤ 1.5, flag at 1.5 < s ≤ 2, hard fail at s > 2 (cfg-1.yield), compared unrounded; evidence
 * rounds to two decimals. No reference row → unavailable. Earlier captures are not re-scored when a later
 * one crosses a threshold (GAP-7, a declared limitation).
 */
export const yieldPlausibility: Check = {
  id: 'yield_plausibility',
  kind: 'local',
  async run(sub, ctx, config) {
    const id = 'yield_plausibility' as const;
    const ref = ctx.yieldReference;
    if (!ref) return { id, status: 'unavailable', hardFail: false, evidence: evidence.yield_plausibility.unavailable({ crop: ctx.plot.crop }) };
    const { areaHa } = ctx.plot;
    if (!(areaHa > 0) || !(ref.maxKgHa > 0)) throw new RangeError('plot area and reference bound must be positive');

    const seasonKg = ctx.seasonCherryKgBefore + sub.payload.cherryKg;
    const ratio = (seasonKg * ref.cherryToCleanRatio) / areaHa / ref.maxKgHa;
    if (ratio > config.yield.hardFailAboveU) return { id, status: 'fail', hardFail: true, evidence: evidence.yield_plausibility.fail({ ratio }) };
    if (ratio > config.yield.flagAboveU) return { id, status: 'flag', hardFail: false, evidence: evidence.yield_plausibility.flag({ ratio }) };
    return { id, status: 'ok', hardFail: false, evidence: evidence.yield_plausibility.ok({ ratio }) };
  },
};
