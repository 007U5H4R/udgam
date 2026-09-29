import { describe, expect, it } from 'vitest';
import { coffeeSeasonOf } from './season';

// TC-038 (window part), TSK-09.2, TP6: the Indian coffee year, 1 Oct – 30 Sep, bucketed by SERVER receipt
// time in IST (UTC+05:30) with fixed-offset arithmetic. `pnpm test:tz` re-runs it under
// America/Los_Angeles and Asia/Kolkata; the expected values are literals, so every run must agree.

describe('coffeeSeasonOf (TC-038 window)', () => {
  it('30 Sep 23:59:59.999 IST is still the old season', () => {
    expect(coffeeSeasonOf('2026-09-30T18:29:59.999Z')).toEqual({
      label: '2025-26',
      start: '2025-09-30T18:30:00.000Z',
      end: '2026-09-30T18:30:00.000Z',
    });
  });

  it('1 Oct 00:00 IST starts the new season', () => {
    expect(coffeeSeasonOf('2026-09-30T18:30:00.000Z')).toEqual({
      label: '2026-27',
      start: '2026-09-30T18:30:00.000Z',
      end: '2027-09-30T18:30:00.000Z',
    });
  });

  it('the harness receipt time (8 Dec 2026) and a January picking fall in 2026-27; the turn of the century label stays two-digit', () => {
    expect(coffeeSeasonOf('2026-12-08T05:30:00.000Z').label).toBe('2026-27');
    expect(coffeeSeasonOf('2027-01-15T00:00:00.000Z').label).toBe('2026-27');
    expect(coffeeSeasonOf('2099-12-01T00:00:00.000Z').label).toBe('2099-00');
  });

  it('does not depend on the host time zone', () => {
    expect(coffeeSeasonOf('2026-09-30T20:00:00.000Z').label).toBe('2026-27'); // 1 Oct 01:30 IST, still 30 Sep in Los Angeles
    expect(coffeeSeasonOf('2026-09-30T17:00:00.000Z').label).toBe('2025-26'); // 30 Sep 22:30 IST
  });

  it('refuses a time that is not an ISO instant', () => {
    expect(() => coffeeSeasonOf('not a date')).toThrow(RangeError);
  });
});
