import { plotGeom } from '../../remote-sensing';
import { ProviderError, type NdviWindow } from '../../remote-sensing/types';
import type { VerifyConfig } from '../config';
import { evidence, istDate, providerReason, sourced } from '../evidence';
import type { Check, CheckOutcome } from '../registry';

// ndvi_harvest_window (technical-plan §6.3, TP11): living canopy around the picking? Mean NDVI of the
// clear observations within ±30 days of the receipt date (IST; the server's clock, not the phone's):
// ≥ 0.45 → ok; 0.30–0.45 → flag; < 0.30 → fail. No clear observation (cloud) → unavailable with the
// cloud sentence; a provider failure → unavailable naming Sentinel Hub (S6).

const id = 'ndvi_harvest_window' as const;

/** The status for a harvest-window answer; a fixture answer's sentence is labelled demo data (CF-11). */
export function ndviWindowOutcome(w: NdviWindow, config: VerifyConfig): CheckOutcome {
  return sourced(windowOutcome(w, config), w.source);
}

function windowOutcome(w: NdviWindow, config: VerifyConfig): CheckOutcome {
  const c = config.ndviHarvestWindow;
  if (w.mean === null || w.clearObservations === 0) {
    // The provider answered: the sky was not clear. Not a provider failure, so no provider is named.
    return { id, status: 'unavailable', hardFail: false, evidence: evidence.ndvi_harvest_window.unavailable({ reason: 'cloud' }) };
  }
  if (!Number.isFinite(w.mean) || w.mean < -1 || w.mean > 1) return sentinelDown('malformed response');
  const f = { ndvi: w.mean };
  if (w.mean >= c.okMin) return { id, status: 'ok', hardFail: false, evidence: evidence.ndvi_harvest_window.ok(f) };
  if (w.mean >= c.failBelow) return { id, status: 'flag', hardFail: false, evidence: evidence.ndvi_harvest_window.flag(f) };
  return { id, status: 'fail', hardFail: false, evidence: evidence.ndvi_harvest_window.fail(f) };
}

function sentinelDown(detail: string): CheckOutcome {
  return { id, status: 'unavailable', hardFail: false, evidence: evidence.ndvi_harvest_window.unavailable({ reason: 'provider', detail }), provider: 'sentinel-hub' };
}

export const ndviHarvestWindow: Check = {
  id,
  kind: 'remote',
  provider: 'sentinel-hub',
  async run(sub, ctx, config, opts) {
    const centreDate = istDate(sub.serverReceivedAt);
    try {
      const w = await ctx.remoteSensing.ndviWindow(await plotGeom(ctx.plot), centreDate, config.ndviHarvestWindow.windowDays, { signal: opts?.signal });
      return ndviWindowOutcome(w, config);
    } catch (err) {
      if (err instanceof ProviderError) return sentinelDown(providerReason(err));
      throw err;
    }
  },
};
