import { chainContinuity } from './checks/chain_continuity';
import { deforestationOverlap } from './checks/deforestation_overlap';
import { exifGpsAgreement } from './checks/exif_gps_agreement';
import { exifTimeAgreement } from './checks/exif_time_agreement';
import { geofence } from './checks/geofence';
import { gpsAccuracy } from './checks/gps_accuracy';
import { movementPlausibility } from './checks/movement_plausibility';
import { ndviCultivation } from './checks/ndvi_cultivation';
import { ndviHarvestWindow } from './checks/ndvi_harvest_window';
import { photoUniqueness } from './checks/photo-uniqueness';
import { signatureValid } from './checks/signature-valid';
import { yieldPlausibility } from './checks/yield_plausibility';
import type { VerifyConfig } from './config';
import type { CheckId, CheckResult, Provider, Submission, VerifyContext } from './types';

/** What a check returns; runCheck adds weight and score from the config. */
export type CheckOutcome = Omit<CheckResult, 'weight' | 'score'>;

export type Check = {
  id: CheckId;
  kind: 'local' | 'remote';
  provider?: Provider;
  /** `opts.signal` (remote checks) aborts at the remote-phase cap; hand it to every provider call. */
  run(sub: Submission, ctx: VerifyContext, config: VerifyConfig, opts?: { signal?: AbortSignal }): Promise<CheckOutcome>;
};

/**
 * The check registry, in technical-plan §6.3 order. Checks not built yet are absent (the harness
 * reports their cases `not_yet_implemented`, TKT-03); TKT-07 added the three satellite checks
 * (remote, each naming its provider); TKT-09 added chain_continuity and yield_plausibility: all twelve.
 */
export const REGISTRY: readonly Check[] = [
  signatureValid,
  chainContinuity,
  photoUniqueness,
  geofence,
  gpsAccuracy,
  exifGpsAgreement,
  exifTimeAgreement,
  movementPlausibility,
  deforestationOverlap,
  ndviCultivation,
  ndviHarvestWindow,
  yieldPlausibility,
];
