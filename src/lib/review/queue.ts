import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminOverrides, farmers, harvestEvents, plots, verificationRuns } from '../db/schema';
import { CONFIG } from '../verification/config';
import { score } from '../verification/score';
import type { CheckResult, Verdict } from '../verification/types';
import { headlineOf, type QueueIcon } from './copy';

// The admin review queue (technical-plan TSK-12.1, TC-054). Org-scoped: the organisation comes from the
// session, and a plot belongs to it through its farmer. Only each event's LATEST run counts (a window on
// run_no): an event re-run to Verified leaves the queue; one re-run to Needs Review again waits with its
// new run.

export type QueueItem = {
  runId: string;
  eventId: string;
  plotId: string;
  /** Plots have no names; the admin grammar shows the plot id beside the farm's producer id. */
  plotName: string;
  producerId: string;
  /** Server receipt time (ISO UTC). */
  receivedAt: string;
  cherryKg: number;
  score: number;
  verdict: Verdict;
  /** The first cap reason in admin words, or the hard fail that decided a final item. */
  headline: string;
  icon: QueueIcon;
};

export type ReviewQueue = {
  /** Needs Review, not overridden, oldest first. */
  waiting: QueueItem[];
  /** The latest hard-failed Rejected runs, newest first ("Not accepted by the checks — can't be changed"). */
  final: QueueItem[];
};

export const FINAL_LIMIT = 20;

/** Each event's latest run (the window on run_no). */
const latestRuns = (db: Db) =>
  db
    .select({
      id: verificationRuns.id,
      eventId: verificationRuns.eventId,
      verdict: verificationRuns.verdict,
      score: verificationRuns.score,
      checks: verificationRuns.checks,
      rank: sql<number>`row_number() over (partition by ${verificationRuns.eventId} order by ${verificationRuns.runNo} desc)`.as('rank'),
    })
    .from(verificationRuns)
    .as('latest');

const hasHardFail = (checks: unknown) =>
  sql`exists (select 1 from json_each(${checks}) c where json_extract(c.value, '$.hardFail') is 1)`;

function rows(db: Db, orgId: string) {
  const latest = latestRuns(db);
  const q = db
    .select({
      runId: latest.id,
      eventId: latest.eventId,
      verdict: latest.verdict,
      score: latest.score,
      checks: latest.checks,
      plotId: harvestEvents.plotId,
      producerId: farmers.producerId,
      receivedAt: harvestEvents.serverReceivedAt,
      cherryKg: harvestEvents.cherryKg,
    })
    .from(latest)
    .innerJoin(harvestEvents, eq(harvestEvents.id, latest.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .leftJoin(adminOverrides, eq(adminOverrides.runId, latest.id));
  const scope = and(eq(latest.rank, 1), eq(farmers.orgId, orgId), eq(harvestEvents.boundaryStatus, 'accepted'));
  return { q, latest, scope };
}

type Row = { runId: string; eventId: string; verdict: Verdict; score: number; checks: string; plotId: string | null; producerId: string; receivedAt: string; cherryKg: number | null };

function toItem(r: Row): QueueItem {
  const checks = JSON.parse(r.checks) as CheckResult[];
  const { capReasons } = score(checks, CONFIG);
  const { headline, icon } = headlineOf({ verdict: r.verdict, score: r.score, checks, capReasons });
  const plotId = r.plotId ?? '';
  return {
    runId: r.runId,
    eventId: r.eventId,
    plotId,
    plotName: plotId,
    producerId: r.producerId,
    receivedAt: r.receivedAt,
    cherryKg: r.cherryKg ?? 0,
    score: r.score,
    verdict: r.verdict,
    headline,
    icon,
  };
}

/** The organisation's review queue (TSK-12.1). */
export async function listReviewQueue(db: Db, orgId: string): Promise<ReviewQueue> {
  const w = rows(db, orgId);
  const waiting = await w.q
    .where(and(w.scope, eq(w.latest.verdict, 'Needs Review'), isNull(adminOverrides.id), eq(harvestEvents.finalVerdict, 'Needs Review')))
    .orderBy(asc(harvestEvents.serverReceivedAt), asc(w.latest.id));
  const f = rows(db, orgId);
  const final = await f.q
    .where(and(f.scope, eq(f.latest.verdict, 'Rejected'), hasHardFail(f.latest.checks)))
    .orderBy(desc(harvestEvents.serverReceivedAt), desc(f.latest.id))
    .limit(FINAL_LIMIT);
  return { waiting: waiting.map(toItem), final: final.map(toItem) };
}

/** How many pickings wait for a person (the rail's Review count). */
export async function countWaiting(db: Db, orgId: string): Promise<number> {
  return (await listReviewQueue(db, orgId)).waiting.length;
}
