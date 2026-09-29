import { exifGpsAgreement } from './checks/exif_gps_agreement';
import { exifTimeAgreement } from './checks/exif_time_agreement';
import { geofence } from './checks/geofence';
import { gpsAccuracy } from './checks/gps_accuracy';
import { movementPlausibility } from './checks/movement_plausibility';
import { photoUniqueness } from './checks/photo-uniqueness';
import { signatureValid } from './checks/signature-valid';
import type { VerifyConfig } from './config';
import type { CheckId, CheckResult, Provider, Submission, VerifyContext } from './types';

/** What a check returns; runCheck adds weight and score from the config. */
export type CheckOutcome = Omit<CheckResult, 'weight' | 'score'>;

export type Check = {
  id: CheckId;
  kind: 'local' | 'remote';
  provider?: Provider;
  run(sub: Submission, ctx: VerifyContext, config: VerifyConfig): Promise<CheckOutcome>;
};

/**
 * The check registry, in technical-plan §6.3 order. Checks not built yet are absent (the harness
 * reports their cases `not_yet_implemented`, TKT-03); TKT-07/08/09 add the other nine.
 */
export const REGISTRY: readonly Check[] = [
  signatureValid,
  photoUniqueness,
  geofence,
  gpsAccuracy,
  exifGpsAgreement,
  exifTimeAgreement,
  movementPlausibility,
];
