import { evidence } from '../evidence';
import type { Check } from '../registry';

/** gps_accuracy (§6.3): ok under 30 m; flag from 30 m to under 100 m; fail at 100 m or worse. */
export const gpsAccuracy: Check = {
  id: 'gps_accuracy',
  kind: 'local',
  async run(sub, _ctx, config) {
    const id = 'gps_accuracy' as const;
    const { accuracyM } = sub.payload.gps;
    const { okBelowM, flagBelowM } = config.gpsAccuracy;
    const status = accuracyM < okBelowM ? 'ok' : accuracyM < flagBelowM ? 'flag' : 'fail';
    return { id, status, hardFail: false, evidence: evidence.gps_accuracy[status]({ accuracyM }) };
  },
};
