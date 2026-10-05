import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { farmerLines, refusalCopy, type FarmerLine } from '../../i18n/farmer-evidence';
import { t, type Lang } from '../../i18n';
import { CONFIG } from '../../verification/config';
import { score } from '../../verification/score';
import type { CheckResult, Verdict, VerifyResult } from '../../verification/types';
import type { Db } from '../client';
import { farmers, harvestEvents, plots, verificationRuns } from '../schema';
import { istMonth } from '../../format';

// The Pickings tab (final/index.html #s8, TSK-11.4): every picking this agent sent, grouped by IST month
// (newest first), each with its verdict and, for Needs a check and Not accepted, the reason in the
// farmer's words (and for Not accepted, what to do). Boundary refusals of this agent's phone are listed
// too, as Not accepted with the refusal's reason. The organisation always comes from the session.

export type PickingItem = {
  eventId: string;
  receivedAt: string;
  /** null for a refusal whose payload could not be read. */
  cherryKg: number | null;
  plotName: string;
  verdict: Verdict;
  /** Needs a check / Not accepted: the reason, in plain words. */
  reason?: FarmerLine;
  /** Not accepted: what the farmer can do. */
  whatToDo?: string;
};

export type PickingMonth = { month: string; items: PickingItem[] };

/** "Plot n": each plot's place among its farmer's plots, oldest first (the schema holds no plot names). */
export async function plotOrdinals(db: Db, farmerIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (farmerIds.length === 0) return out;
  const rows = await db
    .select({ id: plots.id, farmerId: plots.farmerId })
    .from(plots)
    .where(inArray(plots.farmerId, farmerIds))
    .orderBy(asc(plots.createdAt), asc(plots.id));
  const count = new Map<string, number>();
  for (const r of rows) {
    const n = (count.get(r.farmerId) ?? 0) + 1;
    count.set(r.farmerId, n);
    out.set(r.id, n);
  }
  return out;
}

/** The latest verification run of each event, as the farmer copy layer reads it (only that run is read). */
export async function latestRuns(db: Db, eventIds: string[]): Promise<Map<string, VerifyResult>> {
  const out = new Map<string, VerifyResult>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: verificationRuns.eventId, verdict: verificationRuns.verdict, score: verificationRuns.score, checks: verificationRuns.checks })
    .from(verificationRuns)
    .where(
      and(
        inArray(verificationRuns.eventId, eventIds),
        eq(verificationRuns.runNo, sql<number>`(SELECT MAX(v2.run_no) FROM verification_runs v2 WHERE v2.event_id = ${verificationRuns.eventId})`),
      ),
    );
  for (const r of rows) {
    const checks = JSON.parse(r.checks) as CheckResult[];
    // Runs store no cap reasons; they are scored again from the stored checks (score() is pure, cfg-1 fixed).
    out.set(r.eventId, { verdict: r.verdict, score: r.score, checks, unavailableProviders: [], capReasons: score(checks, CONFIG).capReasons, config: { version: '', hash: '' } });
  }
  return out;
}

/** The reason (and, for Not accepted, what to do) of one picking, in `lang`. */
export function pickingReason(
  e: { verdict: Verdict; boundaryReason: string | null; run: VerifyResult | undefined; plotName: string },
  lang: Lang,
): Pick<PickingItem, 'reason' | 'whatToDo'> {
  if (e.boundaryReason !== null) {
    const c = refusalCopy(e.boundaryReason, lang);
    return { reason: { icon: 'seal', text: c.happened }, whatToDo: c.todo };
  }
  if (e.verdict === 'Verified' || !e.run) return {};
  const lines = farmerLines({ ...e.run, verdict: e.verdict }, lang, { plot: e.plotName });
  const reason = lines.find((l) => !l.next);
  if (e.verdict === 'Needs Review') return reason ? { reason } : {};
  const todo = lines.find((l) => l.next);
  return { ...(reason ? { reason } : {}), ...(todo ? { whatToDo: todo.text } : {}) };
}

/**
 * How many pickings the tab lists, newest first: a season's worth for one agent, and it keeps the
 * follow-up inArray queries far below SQLite's bound-parameter limit (TASK-12 fix round 1).
 */
export const PICKINGS_LIMIT = 200;

export async function listPickings(db: Db, agentId: string, orgId: string, lang: Lang = 'en', o: { limit?: number } = {}): Promise<PickingMonth[]> {
  const rows = await db
    .select({
      eventId: harvestEvents.id,
      receivedAt: harvestEvents.serverReceivedAt,
      cherryKg: harvestEvents.cherryKg,
      plotId: harvestEvents.plotId,
      boundaryStatus: harvestEvents.boundaryStatus,
      boundaryReason: harvestEvents.boundaryReason,
      finalVerdict: harvestEvents.finalVerdict,
      anchorSeq: harvestEvents.anchorSeq,
      farmerId: farmers.id,
      farmerOrg: farmers.orgId,
    })
    .from(harvestEvents)
    .leftJoin(plots, eq(plots.id, harvestEvents.plotId))
    .leftJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(
      and(
        eq(harvestEvents.agentId, agentId),
        // an accepted picking is on a plot of this organisation; a refusal may name any plot, or none
        or(and(eq(harvestEvents.boundaryStatus, 'accepted'), eq(farmers.orgId, orgId)), eq(harvestEvents.boundaryStatus, 'rejected')),
      ),
    )
    .orderBy(desc(harvestEvents.serverReceivedAt), desc(harvestEvents.anchorSeq))
    .limit(o.limit ?? PICKINGS_LIMIT);

  const ownFarmers = [...new Set(rows.filter((r) => r.farmerOrg === orgId && r.farmerId !== null).map((r) => r.farmerId!))];
  const [ordinal, runs] = await Promise.all([
    plotOrdinals(db, ownFarmers),
    latestRuns(
      db,
      rows.filter((r) => r.boundaryStatus === 'accepted').map((r) => r.eventId),
    ),
  ]);

  const months: PickingMonth[] = [];
  for (const r of rows) {
    // Another organisation's plot is never named: a refusal for it reads "the plot".
    const n = r.plotId !== null && r.farmerOrg === orgId ? ordinal.get(r.plotId) : undefined;
    const plotName = n !== undefined ? t('home.plotName', { n }, lang) : t('fe.plot.default', {}, lang);
    const run = runs.get(r.eventId);
    const verdict: Verdict = r.boundaryStatus === 'rejected' ? 'Rejected' : (r.finalVerdict ?? run?.verdict ?? 'Needs Review');
    const item: PickingItem = {
      eventId: r.eventId,
      receivedAt: r.receivedAt,
      cherryKg: r.cherryKg,
      plotName,
      verdict,
      ...pickingReason({ verdict, boundaryReason: r.boundaryStatus === 'rejected' ? (r.boundaryReason ?? 'other') : null, run, plotName }, lang),
    };
    const month = istMonth(r.receivedAt);
    const last = months.at(-1);
    if (last?.month === month) last.items.push(item);
    else months.push({ month, items: [item] });
  }
  return months;
}

