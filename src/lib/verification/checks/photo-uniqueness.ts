import { evidence } from '../evidence';
import type { Check } from '../registry';

/** photo_uniqueness (§6.3): hard fail when any photo's hash was seen on an accepted event ("k of n"). */
export const photoUniqueness: Check = {
  id: 'photo_uniqueness',
  kind: 'local',
  async run(sub, ctx) {
    const id = 'photo_uniqueness' as const;
    const n = sub.media.length;
    const k = sub.media.filter((m) => ctx.seenMediaHashes.has(m.sha256)).length;
    return k === 0
      ? { id, status: 'ok', hardFail: false, evidence: evidence.photo_uniqueness.ok({ n }) }
      : { id, status: 'fail', hardFail: true, evidence: evidence.photo_uniqueness.fail({ k, n }) };
  },
};
