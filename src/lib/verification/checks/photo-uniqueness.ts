import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * photo_uniqueness (§6.3, TC-042): hard fail when any photo's hash was seen on an accepted event ("k of n").
 * Global: any agent, any plot, whatever that event's final verdict (a photo used on an event Rejected by a
 * check was still used). Hashes only on boundary-rejected events are not seen, so an honest retake after a
 * refusal passes. An identical-payload retry never reaches this check (idempotent replay, TP7).
 * Counts distinct photos (CR-001): one photo filling several slots is one photo, so the evidence never
 * claims more photos than the capture carries ("1 of 1", not "3 of 3"). The outcome is unchanged.
 */
export const photoUniqueness: Check = {
  id: 'photo_uniqueness',
  kind: 'local',
  async run(sub, ctx) {
    const id = 'photo_uniqueness' as const;
    const distinct = [...new Set(sub.media.map((m) => m.sha256))];
    const n = distinct.length;
    const k = distinct.filter((h) => ctx.seenMediaHashes.has(h)).length;
    return k === 0
      ? { id, status: 'ok', hardFail: false, evidence: evidence.photo_uniqueness.ok({ n }) }
      : { id, status: 'fail', hardFail: true, evidence: evidence.photo_uniqueness.fail({ k, n }) };
  },
};
