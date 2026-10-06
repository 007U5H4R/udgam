import { describe, expect, it } from 'vitest';
import { budgetDay, budgetFromEnv, DEFAULT_CAPTURE_BUDGET, overBudget } from './budget';

// SEC-003 (TKT-28): each agent's accepted captures and photo bytes per day are capped. The day is the
// pilot's calendar day, Asia/Kolkata (UTC+05:30, no daylight saving), whatever the server's TZ.

describe('budgetDay', () => {
  it('is the India calendar day: 00:00 IST is 18:30 UTC the day before', () => {
    expect(budgetDay(new Date('2026-10-06T10:00:00Z'))).toEqual({ start: '2026-10-05T18:30:00.000Z', end: '2026-10-06T18:30:00.000Z' });
    expect(budgetDay(new Date('2026-10-06T18:29:59.999Z')).end).toBe('2026-10-06T18:30:00.000Z');
    expect(budgetDay(new Date('2026-10-06T18:30:00.000Z'))).toEqual({ start: '2026-10-06T18:30:00.000Z', end: '2026-10-07T18:30:00.000Z' });
  });
});

describe('defaults (sized from EV9: 3 photos × 4 MB placeholder)', () => {
  it('100 captures and 100 × 3 × 4 MiB a day per agent', () => {
    expect(DEFAULT_CAPTURE_BUDGET).toEqual({ maxCaptures: 100, maxBytes: 100 * 3 * 4 * 1024 * 1024 });
    expect(budgetFromEnv({ CAPTURE_DAILY_MAX_CAPTURES: 100, CAPTURE_DAILY_MAX_BYTES: 1_258_291_200 })).toEqual(DEFAULT_CAPTURE_BUDGET);
  });
});

describe('overBudget', () => {
  const budget = { maxCaptures: 3, maxBytes: 1000 };
  const now = new Date('2026-10-06T18:29:00Z'); // one minute before IST midnight

  it('is null while both counts are under their caps', () => {
    expect(overBudget({ captures: 2, bytes: 999 }, budget, now)).toBeNull();
  });

  it('names the cap that is used up and waits until the next India midnight', () => {
    expect(overBudget({ captures: 3, bytes: 0 }, budget, now)).toEqual({ which: 'captures', retryAfterSec: 60 });
    expect(overBudget({ captures: 0, bytes: 1000 }, budget, now)).toEqual({ which: 'bytes', retryAfterSec: 60 });
    expect(overBudget({ captures: 9, bytes: 9999 }, budget, new Date('2026-10-06T18:29:59.900Z'))).toEqual({ which: 'captures', retryAfterSec: 1 });
  });
});
