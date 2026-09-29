import { describe, expect, it } from 'vitest';
import { checksWith } from '../../../tests/helpers/review-world';
import { CONFIG } from '../verification/config';
import { score } from '../verification/score';
import type { CheckResult } from '../verification/types';
import { capReasonSentence, checksSummary, headlineOf, istClock, istDay, sortedChecks, waited, whyLine } from './copy';

// The admin review's words (TKT-12): cap reasons as plain sentences (TSK-12.3), the queue headline
// (TSK-12.1), the checks summary and order (admin.html), and IST dates by offset (technical-plan §1).

const run = (checks: CheckResult[]) => {
  const s = score(checks, CONFIG);
  return { verdict: s.verdict, score: s.score, checks, capReasons: s.capReasons };
};

describe('cap reasons as plain sentences', () => {
  it('anyUnavailable on a satellite check → "A satellite check could not run, so a person must look"', () => {
    const r = run(checksWith({ ndvi_harvest_window: { status: 'unavailable' } }));
    expect(r.capReasons).toEqual(['anyUnavailable']);
    expect(capReasonSentence('anyUnavailable', r.checks)).toBe('A satellite check could not run, so a person must look');
  });

  it('names a local check that could not run, a failed check and each flag cap', () => {
    const r = run(checksWith({ yield_plausibility: { status: 'unavailable' }, geofence: { status: 'fail' }, deforestation_overlap: { status: 'flag' } }));
    expect(r.capReasons).toEqual(['anyFail', 'flag:deforestation_overlap', 'anyUnavailable']);
    expect(r.capReasons.map((c) => capReasonSentence(c, r.checks))).toEqual([
      'A check failed (“Inside the plot”), so a person must look',
      'Some tree cover was lost inside the plot since 2021, so a person must look',
      'A check could not run (“Harvest size”), so a person must look',
    ]);
    expect(capReasonSentence('flag:yield_plausibility', r.checks)).toBe('The season’s harvest is high for this plot, so a person must look');
  });

  it('the why line: cap reasons, a score under 80 with no cap, and a hard fail that cannot be overruled', () => {
    expect(whyLine(run(checksWith({ ndvi_harvest_window: { status: 'unavailable' } })))).toEqual({
      lead: 'Why a person needs to look:',
      text: 'A satellite check could not run, so a person must look.',
    });
    expect(whyLine(run(checksWith({ chain_continuity: { status: 'flag' }, gps_accuracy: { status: 'flag' }, exif_gps_agreement: { status: 'flag' }, exif_time_agreement: { status: 'flag' }, geofence: { status: 'flag' } }))).text).toMatch(
      /^No single check forces this one\. The score is under 80/,
    );
    const hard = whyLine(run(checksWith({ photo_uniqueness: { status: 'fail', hardFail: true } })));
    expect(hard).toEqual({ lead: 'Why it was not accepted:', text: '“Photos are new” failed. This rule always means Not accepted and can’t be overruled.' });
  });
});

describe('queue headline', () => {
  it('is the first cap reason in admin words, or the hard fail, or the score', () => {
    expect(headlineOf(run(checksWith({ ndvi_harvest_window: { status: 'unavailable' } })))).toEqual({ headline: 'Satellite picture cloudy', icon: 'cloud' });
    expect(headlineOf(run(checksWith({ yield_plausibility: { status: 'flag' }, geofence: { status: 'fail' } })))).toEqual({ headline: 'Taken outside the plot', icon: 'location' });
    expect(headlineOf(run(checksWith({ yield_plausibility: { status: 'flag' } })))).toEqual({ headline: 'Harvest high for this plot', icon: 'trend' });
    expect(headlineOf(run(checksWith({ photo_uniqueness: { status: 'fail', hardFail: true } })))).toEqual({ headline: 'Photo already used', icon: 'camera' });
    expect(headlineOf({ verdict: 'Needs Review', score: 75, checks: checksWith({ chain_continuity: { status: 'flag' } }), capReasons: [] })).toEqual({
      headline: 'Score 75, under 80',
      icon: 'inbox',
    });
  });
});

describe('checks summary and order (admin.html)', () => {
  it('counts each state and sorts worst first, registry order within a state', () => {
    const checks = checksWith({ ndvi_harvest_window: { status: 'unavailable' }, gps_accuracy: { status: 'flag' }, exif_gps_agreement: { status: 'flag' }, photo_uniqueness: { status: 'fail', hardFail: true } });
    expect(checksSummary(checks)).toBe("8 passed · 2 flagged · 1 couldn't run · 1 failed (1 can't be overruled)");
    expect(sortedChecks(checks).map((c) => c.id).slice(0, 5)).toEqual(['photo_uniqueness', 'ndvi_harvest_window', 'gps_accuracy', 'exif_gps_agreement', 'signature_valid']);
  });
});

describe('IST times by offset, never the host zone', () => {
  it('formats the day, the clock and the wait', () => {
    expect(istDay('2026-09-24T02:12:00.000Z')).toBe('Thu 24 Sep');
    expect(istDay('2026-09-24T19:00:00.000Z')).toBe('Fri 25 Sep'); // 00:30 IST the next day
    expect(istClock('2026-09-24T02:12:00.000Z')).toBe('7:42 am');
    expect(istClock('2026-09-24T10:50:00.000Z')).toBe('4:20 pm');
    const now = new Date('2026-09-28T02:12:00.000Z');
    expect(waited('2026-09-24T02:12:00.000Z', now)).toBe('4 days');
    expect(waited('2026-09-27T01:00:00.000Z', now)).toBe('1 day');
    expect(waited('2026-09-27T21:00:00.000Z', now)).toBe('5 h');
    expect(waited('2026-09-28T02:00:00.000Z', now)).toBe('under an hour');
  });
});
