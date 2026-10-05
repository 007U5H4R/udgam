import { describe, expect, it } from 'vitest';
import { SEED } from './data';
import { historyTimes, SEASON_JUST_STARTED } from './timeline';

// TASK-21 fix round 1 (review minor 3): Y01's eight pickings must fall in the coffee season of the seed's
// clock (from 1 Oct 00:00 IST, TP6), and before it, at ANY clock, so the staged yield attack meets their
// season total. The clocks and the season starts below are fixed literals (IST = UTC+05:30).

const SEASON_2026 = '2026-09-30T18:30:00.000Z'; // 1 Oct 2026 00:00 IST
const SEASON_2025 = '2025-09-30T18:30:00.000Z'; // 1 Oct 2025 00:00 IST
/** The most a seeded picking's receipt trails its capture (run.ts: 40 s + 4 × 7 s). */
const MAX_RECEIPT_MS = 68_000;

const y01 = (times: string[]) => times.filter((_, i) => SEED.history[i]!.plot === 'Y01');

function expectInSeason(nowIso: string, seasonStart: string) {
  const now = new Date(nowIso);
  const times = historyTimes(now);
  expect(times).toHaveLength(30);
  const ys = y01(times);
  expect(ys).toHaveLength(8);
  for (const t of ys) {
    expect(Date.parse(t), `${t} on or after the season start`).toBeGreaterThanOrEqual(Date.parse(seasonStart));
    expect(Date.parse(t) + MAX_RECEIPT_MS, `${t} received before now`).toBeLessThan(now.getTime());
  }
  // one phone's captures move forward in time, more than 30 s apart
  for (let i = 1; i < times.length; i++) expect(Date.parse(times[i]!) - Date.parse(times[i - 1]!)).toBeGreaterThan(30_000);
  return ys;
}

describe('historyTimes: Y01 inside [season start, now) at any clock (review minor 3)', () => {
  it('1 Oct 00:30 IST: the run is squeezed into the season’s first half hour', () => {
    const ys = expectInSeason('2026-09-30T19:00:00.000Z', SEASON_2026);
    expect(ys[0]).toBe('2026-09-30T18:33:01.000Z');
    expect(ys.at(-1)).toBe('2026-09-30T18:52:30.000Z');
  });

  it('1 Oct 01:37 IST (where the old layout threw): all eight in the new season', () => {
    const ys = expectInSeason('2026-09-30T20:07:00.000Z', SEASON_2026);
    expect(ys[0]).toBe('2026-09-30T18:39:45.000Z');
    expect(ys.at(-1)).toBe('2026-09-30T19:42:45.000Z');
  });

  it('mid-season: the usual layout, 150 min apart, the last 90 min before now', () => {
    const ys = expectInSeason('2027-01-15T06:30:00.000Z', SEASON_2026);
    expect(ys[0]).toBe('2027-01-14T11:30:00.000Z');
    expect(ys.at(-1)).toBe('2027-01-15T05:00:00.000Z');
  });

  it('30 Sep 23:59 IST: all eight in the season about to end (the README says to re-seed after it turns)', () => {
    const ys = expectInSeason('2026-09-30T18:29:00.000Z', SEASON_2025);
    expect(ys.at(-1)).toBe('2026-09-30T16:59:00.000Z');
  });

  it('in the season’s first 10 minutes it refuses, naming when to run it', () => {
    expect(() => historyTimes(new Date('2026-09-30T18:35:00.000Z'))).toThrow(SEASON_JUST_STARTED);
    expect(SEASON_JUST_STARTED).toBe('the coffee season began at 00:00 IST; run the seed after 00:10 IST, so Y01’s pickings fit in the new season');
  });
});
