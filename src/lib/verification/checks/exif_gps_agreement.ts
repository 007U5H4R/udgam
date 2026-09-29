import { haversineM } from '../../geo/distance';
import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * exif_gps_agreement (§6.3): each photo's EXIF GPS against the phone's GPS. The worst photo decides:
 * ok when every photo with GPS is ≤ 50 m away, fail when any is further. Photos without EXIF GPS are
 * ignored; when none has it (mobile browsers strip it) the check flags, never fails (review focus 8).
 */
export const exifGpsAgreement: Check = {
  id: 'exif_gps_agreement',
  kind: 'local',
  async run(sub, _ctx, config) {
    const id = 'exif_gps_agreement' as const;
    const phone = { lat: sub.payload.gps.lat, lng: sub.payload.gps.lng };
    const distances = sub.media.flatMap((m) => (m.exif.gps ? [haversineM(phone, m.exif.gps)] : []));
    if (distances.length === 0) return { id, status: 'flag', hardFail: false, evidence: evidence.exif_gps_agreement.flag() };
    const distanceM = Math.max(...distances);
    const status = distanceM <= config.exifGps.maxDistanceM ? 'ok' : 'fail';
    return { id, status, hardFail: false, evidence: evidence.exif_gps_agreement[status]({ distanceM }) };
  },
};
