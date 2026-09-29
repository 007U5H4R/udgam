import { and, eq, gte, isNull, lt, ne, or, sum } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { harvestEvents } from '../db/schema';

// The coffee season (technical-plan §6.6, TP6 — resolves GAP-3): the Indian coffee year, 1 Oct – 30 Sep,
// bucketed by SERVER receipt time in IST (client time is attacker-controlled). Fixed-offset arithmetic
// only; the host time zone never enters (tests run under TZ=UTC and TZ=America/Los_Angeles).

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export type CoffeeSeason = {
  /** Inclusive, ISO-8601 UTC: 1 Oct 00:00 IST. */
  start: string;
  /** Exclusive, ISO-8601 UTC: the next 1 Oct 00:00 IST. */
  end: string;
  /** `YYYY-YY`, e.g. `2026-27`. */
  label: string;
};

/** 1 Oct 00:00 IST of `year`, as a UTC instant. */
const oct1Ist = (year: number): string => new Date(Date.UTC(year, 9, 1) - IST_OFFSET_MS).toISOString();

export function coffeeSeasonOf(serverReceivedAtIso: string): CoffeeSeason {
  const t = Date.parse(serverReceivedAtIso);
  if (!Number.isFinite(t)) throw new RangeError(`not an ISO instant: ${serverReceivedAtIso}`);
  const ist = new Date(t + IST_OFFSET_MS); // read with getUTC*: the wall clock in IST
  const year = ist.getUTCMonth() >= 9 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return { start: oct1Ist(year), end: oct1Ist(year + 1), label: `${year}-${String((year + 1) % 100).padStart(2, '0')}` };
}

/**
 * Σ cherry_kg of this plot's events received in the season that passed the boundary and were not
 * Rejected (TP6). The capture being verified is not yet stored, so this is the total BEFORE it.
 */
export async function seasonCherryKgBefore(handle: Db | Tx, plotId: string, season: Pick<CoffeeSeason, 'start' | 'end'>): Promise<number> {
  const [row] = await handle
    .select({ kg: sum(harvestEvents.cherryKg) })
    .from(harvestEvents)
    .where(
      and(
        eq(harvestEvents.plotId, plotId),
        eq(harvestEvents.boundaryStatus, 'accepted'),
        or(isNull(harvestEvents.finalVerdict), ne(harvestEvents.finalVerdict, 'Rejected')),
        gte(harvestEvents.serverReceivedAt, season.start),
        lt(harvestEvents.serverReceivedAt, season.end),
      ),
    );
  return Number(row?.kg ?? 0);
}
