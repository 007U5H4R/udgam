import { haversineM } from '../../geo/distance';
import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * movement_plausibility (§6.3): the speed implied by this phone's previous accepted entry, from the
 * client timestamps (what the agent claims; the server-time gap is exif_time_agreement's). ok with no
 * previous entry or under 120 km/h; fail at 120 km/h or more, and when the capture time did not move
 * forward (an unbounded implied speed is not plausible).
 */
export const movementPlausibility: Check = {
  id: 'movement_plausibility',
  kind: 'local',
  async run(sub, ctx, config) {
    const id = 'movement_plausibility' as const;
    const prev = ctx.previousEvent;
    if (!prev) return { id, status: 'ok', hardFail: false, evidence: evidence.movement_plausibility.ok({ first: true }) };

    const distanceM = haversineM({ lat: prev.lat, lng: prev.lng }, { lat: sub.payload.gps.lat, lng: sub.payload.gps.lng });
    const minutes = (Date.parse(sub.payload.capturedAt) - Date.parse(prev.capturedAt)) / 60_000;
    if (!(minutes > 0)) {
      return { id, status: 'fail', hardFail: false, evidence: evidence.movement_plausibility.fail({ timeDidNotAdvance: true, distanceM, minutes }) };
    }
    const speedKmh = distanceM / 1000 / (minutes / 60);
    const facts = { speedKmh, distanceM, minutes };
    return speedKmh < config.movement.maxKmh
      ? { id, status: 'ok', hardFail: false, evidence: evidence.movement_plausibility.ok(facts) }
      : { id, status: 'fail', hardFail: false, evidence: evidence.movement_plausibility.fail(facts) };
  },
};
