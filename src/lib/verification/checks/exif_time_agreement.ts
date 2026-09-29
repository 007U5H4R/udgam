import { evidence } from '../evidence';
import type { Check } from '../registry';
import type { CheckStatus } from '../types';

type Judged = Exclude<CheckStatus, 'unavailable'>;

const gapMin = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;
const RANK: Record<Judged, number> = { ok: 0, flag: 1, fail: 2 };
const worse = (a: Judged, b: Judged): Judged => (RANK[a] >= RANK[b] ? a : b);
const judge = (gap: number, okMax: number, failOver: number): Judged => (gap > failOver ? 'fail' : gap > okMax ? 'flag' : 'ok');

/**
 * exif_time_agreement (§6.3, TP4 amended by EXE10 — resolves GAP-1). Two gaps, in minutes:
 * - EXIF–client: each photo's EXIF time against the phone's capturedAt, judged by the worst photo (the
 *   largest gap; photos without an EXIF time are ignored while another has one). ok ≤ 10 min; flag up to
 *   and including 24 h, or when no photo has an EXIF time; fail over 24 h.
 * - client–server: capturedAt against the server's receipt time. ok ≤ 24 h; flag up to 7 days; fail over
 *   7 days (an honest outbox retry can arrive days later).
 * The worse of the two decides; never a hard fail. The sentence reports both gaps and names the limit crossed.
 */
export const exifTimeAgreement: Check = {
  id: 'exif_time_agreement',
  kind: 'local',
  async run(sub, _ctx, config) {
    const id = 'exif_time_agreement' as const;
    const { maxExifClientMin, exifFailAfterMin, maxClientServerMin, clientServerFailAfterMin } = config.exifTime;
    const { capturedAt } = sub.payload;

    const gaps = sub.media.flatMap((m) => (m.exif.takenAt ? [gapMin(m.exif.takenAt, capturedAt)] : [])).filter(Number.isFinite);
    const exifClientMin = gaps.length > 0 ? Math.max(...gaps) : null;
    const clientServerMin = gapMin(capturedAt, sub.serverReceivedAt);

    const exifStatus = exifClientMin === null ? 'flag' : judge(exifClientMin, maxExifClientMin, exifFailAfterMin);
    const status = worse(exifStatus, judge(clientServerMin, maxClientServerMin, clientServerFailAfterMin));

    return { id, status, hardFail: false, evidence: evidence.exif_time_agreement[status]({ exifClientMin, clientServerMin }) };
  },
};
