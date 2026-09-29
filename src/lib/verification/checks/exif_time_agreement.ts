import { evidence } from '../evidence';
import type { Check } from '../registry';
import type { CheckStatus } from '../types';

const gapMin = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

/**
 * exif_time_agreement (§6.3, TP4 — resolves GAP-1). Two gaps, in minutes: the latest photo's EXIF time
 * against the phone's capturedAt, and capturedAt against the server's receipt time. ok when EXIF–client
 * ≤ 10 min and client–server ≤ 24 h; flag when either is over, or no photo has an EXIF time; fail when
 * either gap is over 7 days. The worse gap decides; the sentence reports both.
 */
export const exifTimeAgreement: Check = {
  id: 'exif_time_agreement',
  kind: 'local',
  async run(sub, _ctx, config) {
    const id = 'exif_time_agreement' as const;
    const { maxExifClientMin, maxClientServerMin, failAfterMin } = config.exifTime;
    const { capturedAt } = sub.payload;

    const times = sub.media.flatMap((m) => (m.exif.takenAt ? [Date.parse(m.exif.takenAt)] : [])).filter(Number.isFinite);
    const exifClientMin = times.length > 0 ? gapMin(new Date(Math.max(...times)).toISOString(), capturedAt) : null;
    const clientServerMin = gapMin(capturedAt, sub.serverReceivedAt);

    let status: Exclude<CheckStatus, 'unavailable'>;
    if (clientServerMin > failAfterMin || (exifClientMin !== null && exifClientMin > failAfterMin)) status = 'fail';
    else if (exifClientMin === null || exifClientMin > maxExifClientMin || clientServerMin > maxClientServerMin) status = 'flag';
    else status = 'ok';

    return { id, status, hardFail: false, evidence: evidence.exif_time_agreement[status]({ exifClientMin, clientServerMin }) };
  },
};
