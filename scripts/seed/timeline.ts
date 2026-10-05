import { coffeeSeasonOf } from '../../src/lib/yield/season';
import { SEED } from './data';

// When the seed's honest pickings were captured (TSK-20.2; TASK-21 fix round 1, review minor 3), as a pure
// function of the seed's clock so it is tested at fixed clocks, never the wall clock.
//
// Y01's run is the history's tail, and it must sit inside the coffee season of `now` (from 1 Oct 00:00
// IST, TP6: bucketed by server receipt), with every receipt before `now`: the staged yield attack, submitted
// later in the same season, meets Y01's season total, and Y01's last picking flags at 1.76x as the data set
// expects. Usually the run ends 90 minutes before `now`, its pickings 150 minutes apart. Early in a season
// there is less room, so the run is squeezed in: it ends a quarter of the season's elapsed time before
// `now` (at most 90 min), starts a tenth of it after the season start (at most 10 min), and its spacing
// shrinks to fit, in whole seconds. In the season's first 10 minutes there is not room enough for eight
// pickings at least ~55 s apart (each receipt before the next capture), so the seed refuses and says when
// to run it (SEASON_JUST_STARTED), rather than placing pickings in the previous season or in the future.
// The other pickings go back from Y01's first, three hours apart, so one phone's moves between plots stay
// plausible; they may fall in the previous season, which only lowers their own plots' totals.

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

/** The usual layout: Y01's last picking this long before the seed, its pickings this far apart. */
const TAIL = 90 * MIN;
const SPACING = 150 * MIN;
/** Early in a season: the most lead after the season start, and the least room the seed needs. */
const LEAD = 10 * MIN;
const MIN_ELAPSED = 10 * MIN;

export const SEASON_JUST_STARTED = 'the coffee season began at 00:00 IST; run the seed after 00:10 IST, so Y01’s pickings fit in the new season';

const floorSec = (ms: number): number => Math.floor(ms / SEC) * SEC;

/** Each honest picking's capture time (ISO), oldest first, for a seed run at `now`. */
export function historyTimes(now: Date): string[] {
  const n = SEED.history.length;
  const yCount = SEED.history.filter((h) => h.plot === 'Y01').length;
  const seasonStart = Date.parse(coffeeSeasonOf(now.toISOString()).start);
  const elapsed = now.getTime() - seasonStart;
  if (elapsed < MIN_ELAPSED) throw new Error(SEASON_JUST_STARTED);

  const last = now.getTime() - Math.min(TAIL, floorSec(elapsed / 4));
  const earliest = seasonStart + Math.min(LEAD, floorSec(elapsed / 10));
  const ySpacing = Math.min(SPACING, floorSec((last - earliest) / Math.max(1, yCount - 1)));

  const times: number[] = new Array<number>(n);
  for (let k = 0; k < yCount; k++) times[n - yCount + k] = last - (yCount - 1 - k) * ySpacing;
  const yStart = times[n - yCount]!;
  for (let k = n - yCount - 1, step = 1; k >= 0; k--, step++) times[k] = yStart - step * 3 * HOUR;
  return times.map((t) => new Date(t).toISOString());
}
