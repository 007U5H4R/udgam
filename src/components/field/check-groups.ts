import type { CheckId, CheckStatus } from '../../lib/verification/types';

// The checking screen's six farmer-facing groups (final/index.html line 831, TSK-10.1): what the
// farmer sees tick, never the twelve raw check IDs. A group is done when all of its checks have
// streamed (any status: a flagged or unavailable check has still finished).

export type GroupKey = 'seal' | 'inside' | 'photos' | 'forest' | 'satellite' | 'harvest';

export const CHECK_GROUPS: readonly { key: GroupKey; checks: readonly CheckId[] }[] = [
  { key: 'seal', checks: ['signature_valid', 'chain_continuity'] },
  { key: 'inside', checks: ['geofence', 'gps_accuracy', 'exif_gps_agreement', 'movement_plausibility'] },
  { key: 'photos', checks: ['photo_uniqueness', 'exif_time_agreement'] },
  { key: 'forest', checks: ['deforestation_overlap', 'ndvi_cultivation'] },
  { key: 'satellite', checks: ['ndvi_harvest_window'] },
  { key: 'harvest', checks: ['yield_plausibility'] },
];

export type GroupState = { key: GroupKey; state: 'pending' | 'done' };

/**
 * Each group's state from the checks streamed so far. `complete` (the verdict line has arrived) marks
 * every group done: the server has finished all of its checks, including any group none of whose
 * checks is registered yet.
 */
export function groupProgress(done: ReadonlyMap<CheckId, CheckStatus>, complete = false): GroupState[] {
  return CHECK_GROUPS.map((g) => ({ key: g.key, state: complete || g.checks.every((id) => done.has(id)) ? 'done' : 'pending' }));
}
