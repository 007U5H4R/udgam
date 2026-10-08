import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { harvestEvents, media } from '../db/schema';
import type { CaptureBudget } from './budget-defaults';

// Per-agent daily storage budget (SEC-003, TKT-28). Rate limits count requests, not bytes: an enrolled
// phone could commit 30 captures × 30 MB every 10 minutes, kept for ever. So each agent may have at most
// `maxCaptures` ACCEPTED captures and `maxBytes` of their photo bytes per day. Only accepted captures store
// photos (a boundary rejection stores none); the verdict does not matter.
//
// Counted from what was stored (accepted harvest_events of the agent, joined to their media rows), so
// the budget needs no counter of its own and cannot drift from the disk. The route checks it before the
// body is read: the capture that crosses a cap still lands, so one agent can go over by at most the
// captures it has in flight (MAX_CAPTURES_PER_AGENT × MAX_BODY_BYTES = 2 × 30 MB).
//
// Defaults (env CAPTURE_DAILY_MAX_CAPTURES / CAPTURE_DAILY_MAX_BYTES), sized from EV9's placeholder of 3
// photos × 4 MB per capture: 100 captures and 100 × 12 MiB = 1.2 GiB per agent per day. The pilot plan is
// 3,000 captures a season for the whole FPO (Discovery-PRD cost assumptions: ~25 a day, ~1.2 MB each at 400 KB photos),
// so an honest agent stays far below both caps; the worst a stolen phone can store is 1.2 GiB a day,
// against ~130 GB a day without a budget.

export { DEFAULT_CAPTURE_BUDGET, type CaptureBudget } from './budget-defaults';
export type CaptureUsage = { captures: number; bytes: number };

export function budgetFromEnv(e: { CAPTURE_DAILY_MAX_CAPTURES: number; CAPTURE_DAILY_MAX_BYTES: number }): CaptureBudget {
  return { maxCaptures: e.CAPTURE_DAILY_MAX_CAPTURES, maxBytes: e.CAPTURE_DAILY_MAX_BYTES };
}

/** India Standard Time, UTC+05:30 all year (no daylight saving): the pilot's calendar day. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** The India calendar day holding `now`, as ISO-8601 UTC instants [start, end) (server_received_at's format). */
export function budgetDay(now: Date): { start: string; end: string } {
  const start = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

/**
 * The one query behind agentUsageToday: this agent's accepted events received in the India day, with
 * their media rows (LEFT JOIN, so a capture without photos still counts). It reads through
 * harvest_events_agent_day_idx (agent_id, boundary_status, server_received_at), migration 0036.
 */
export function usageQuery(db: Db, agentId: string, now: Date) {
  const { start, end } = budgetDay(now);
  return db
    .select({
      captures: sql<number>`count(DISTINCT ${harvestEvents.id})`,
      bytes: sql<number>`coalesce(sum(${media.size}), 0)`,
    })
    .from(harvestEvents)
    .leftJoin(media, eq(media.eventId, harvestEvents.id))
    .where(and(eq(harvestEvents.agentId, agentId), eq(harvestEvents.boundaryStatus, 'accepted'), gte(harvestEvents.serverReceivedAt, start), lt(harvestEvents.serverReceivedAt, end)));
}

/** This agent's accepted captures received today (India day) and the bytes of their photos. */
export async function agentUsageToday(db: Db, agentId: string, now: Date): Promise<CaptureUsage> {
  const [row] = await usageQuery(db, agentId, now);
  return { captures: Number(row?.captures ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/**
 * Null while the agent may capture; otherwise the cap that is used up and the whole seconds until the
 * next India midnight (at least 1), for Retry-After.
 */
export function overBudget(usage: CaptureUsage, budget: CaptureBudget, now: Date): { which: 'captures' | 'bytes'; retryAfterSec: number } | null {
  const which = usage.captures >= budget.maxCaptures ? 'captures' : usage.bytes >= budget.maxBytes ? 'bytes' : null;
  if (!which) return null;
  const end = Date.parse(budgetDay(now).end);
  return { which, retryAfterSec: Math.max(1, Math.ceil((end - now.getTime()) / 1000)) };
}
