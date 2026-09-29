import { geofenceStatus } from '../../geo/geofence';
import { evidence } from '../evidence';
import type { Check } from '../registry';

/** geofence (§6.3): ok inside; flag outside within min(accuracy, 25 m); fail beyond. Never a hard fail. */
export const geofence: Check = {
  id: 'geofence',
  kind: 'local',
  async run(sub, ctx, config) {
    const id = 'geofence' as const;
    const { lat, lng, accuracyM } = sub.payload.gps;
    const g = geofenceStatus({ lat, lng }, ctx.plot.polygon, accuracyM, config.geofence.maxBufferM);
    const facts = { distanceM: g.distanceM, bufferM: g.bufferM };
    return { id, status: g.status, hardFail: false, evidence: evidence.geofence[g.status](facts) };
  },
};
