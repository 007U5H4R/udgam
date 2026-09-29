import { plotGeom } from '../../remote-sensing';
import { ProviderError } from '../../remote-sensing/types';
import type { VerifyConfig } from '../config';
import { evidence, providerReason } from '../evidence';
import type { Check, CheckOutcome } from '../registry';

// deforestation_overlap (technical-plan §6.3, S5, TP11): share of the plot's area with tree-cover loss
// since 2021 inside the polygon. 0 → ok; 0 < loss < 10 % → flag (a cap, EV7); ≥ 10 % → hard fail.
// A provider timeout, HTTP error or malformed answer → unavailable naming GFW (S6), never a rejection.
// The plot's registration result is read first: registration stores it in the cache under the same
// geometry hash (F2), so a capture on an unchanged plot makes no GFW call.

const id = 'deforestation_overlap' as const;

/** The status for a forest-loss answer; the comparison is on the unrounded percentage. */
export function forestLossOutcome(lossPct: number, config: VerifyConfig): CheckOutcome {
  if (!Number.isFinite(lossPct) || lossPct < 0 || lossPct > 100) return gfwDown('malformed response');
  const f = { lossPct };
  if (lossPct >= config.deforestation.hardFailAtPct) return { id, status: 'fail', hardFail: true, evidence: evidence.deforestation_overlap.fail(f) };
  if (lossPct > config.deforestation.flagAbovePct) return { id, status: 'flag', hardFail: false, evidence: evidence.deforestation_overlap.flag(f) };
  return { id, status: 'ok', hardFail: false, evidence: evidence.deforestation_overlap.ok(f) };
}

/** GFW did not answer usefully: unavailable, with the provider named for unavailableProviders. */
export function gfwDown(reason: string): CheckOutcome {
  return { id, status: 'unavailable', hardFail: false, evidence: evidence.deforestation_overlap.unavailable({ reason }), provider: 'gfw' };
}

export const deforestationOverlap: Check = {
  id,
  kind: 'remote',
  provider: 'gfw',
  async run(_sub, ctx, config, opts) {
    try {
      const r = await ctx.remoteSensing.forestLoss(await plotGeom(ctx.plot), { signal: opts?.signal });
      return forestLossOutcome(r.lossPct, config);
    } catch (err) {
      if (err instanceof ProviderError) return gfwDown(providerReason(err));
      throw err; // anything else is a bug: runCheck records "Check could not run: <ErrorClass>"
    }
  },
};
