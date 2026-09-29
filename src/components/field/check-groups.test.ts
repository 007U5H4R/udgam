import { describe, expect, it } from 'vitest';
import { CHECK_IDS, type CheckId, type CheckStatus } from '../../lib/verification/types';
import { CHECK_GROUPS, groupProgress } from './check-groups';

// TSK-10.1: the checking screen shows the mockup's six farmer-facing groups (index.html line 831),
// never the twelve raw check IDs. Each group ticks only when all of its checks have streamed.

describe('CHECK_GROUPS', () => {
  it('lists the six groups in the mockup order', () => {
    expect(CHECK_GROUPS.map((g) => g.key)).toEqual(['seal', 'inside', 'photos', 'forest', 'satellite', 'harvest']);
  });

  it('puts every CheckId in exactly one group', () => {
    const all = CHECK_GROUPS.flatMap((g) => g.checks);
    expect([...all].sort()).toEqual([...CHECK_IDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('maps the checks exactly as the TKT-10 plan says', () => {
    const byKey = Object.fromEntries(CHECK_GROUPS.map((g) => [g.key, g.checks]));
    expect(byKey).toEqual({
      seal: ['signature_valid', 'chain_continuity'],
      inside: ['geofence', 'gps_accuracy', 'exif_gps_agreement', 'movement_plausibility'],
      photos: ['photo_uniqueness', 'exif_time_agreement'],
      forest: ['deforestation_overlap', 'ndvi_cultivation'],
      satellite: ['ndvi_harvest_window'],
      harvest: ['yield_plausibility'],
    });
  });
});

describe('groupProgress', () => {
  const state = (done: Map<CheckId, CheckStatus>, key: string, complete = false) =>
    groupProgress(done, complete).find((g) => g.key === key)!.state;

  it('starts with every group pending', () => {
    expect(groupProgress(new Map()).map((g) => g.state)).toEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  });

  it('marks inside done only after all four of its checks arrive', () => {
    const done = new Map<CheckId, CheckStatus>();
    for (const id of ['geofence', 'gps_accuracy', 'exif_gps_agreement'] as const) {
      done.set(id, 'ok');
      expect(state(done, 'inside')).toBe('pending');
    }
    done.set('movement_plausibility', 'fail');
    expect(state(done, 'inside')).toBe('done');
  });

  it('counts a check as finished whatever its status (a flag or an unavailable check has still run)', () => {
    const done = new Map<CheckId, CheckStatus>([['ndvi_harvest_window', 'unavailable']]);
    expect(state(done, 'satellite')).toBe('done');
    expect(state(done, 'harvest')).toBe('pending');
  });

  it('marks every group done once the verdict has arrived (the server has finished all of its checks)', () => {
    expect(groupProgress(new Map(), true).every((g) => g.state === 'done')).toBe(true);
  });
});
