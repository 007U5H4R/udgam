import { and, eq, sql } from 'drizzle-orm';
import { farmerLines, refusalCopy, type FarmerLine } from '../../i18n/farmer-evidence';
import { t, type Lang } from '../../i18n';
import type { CheckId, CheckStatus, Verdict } from '../../verification/types';
import type { Db } from '../client';
import { farmers, harvestEvents, media, plots } from '../schema';
import { latestRuns, plotOrdinals } from './pickings';

// One picking of this agent (TSK-11.5): its photos (served by the thumbnail route to their owner), the
// kg, when the server received it, the plot, the verdict, up to three lines in the farmer's words, and
// each check's state for "See all checks". Another agent's picking, or one outside this organisation,
// is not found (404, never 403: technical-plan §10).

export type PickingDetail = {
  eventId: string;
  receivedAt: string;
  cherryKg: number | null;
  plotName: string;
  verdict: Verdict;
  /** Media ids in payload order (the thumbnail route is /api/media/<id>/thumb). */
  photos: string[];
  /** At most three lines: Verified → what was checked; otherwise why, and what happens next or what to do. */
  lines: FarmerLine[];
  /** Each check of the latest run; empty for a boundary refusal (no checks ran). */
  checks: { id: CheckId; status: CheckStatus }[];
};

export async function getPickingDetail(db: Db, agentId: string, orgId: string, eventId: string, lang: Lang = 'en'): Promise<PickingDetail | null> {
  const [e] = await db
    .select({
      eventId: harvestEvents.id,
      receivedAt: harvestEvents.serverReceivedAt,
      cherryKg: harvestEvents.cherryKg,
      plotId: harvestEvents.plotId,
      boundaryStatus: harvestEvents.boundaryStatus,
      boundaryReason: harvestEvents.boundaryReason,
      finalVerdict: harvestEvents.finalVerdict,
      farmerId: farmers.id,
      farmerOrg: farmers.orgId,
    })
    .from(harvestEvents)
    .leftJoin(plots, eq(plots.id, harvestEvents.plotId))
    .leftJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(harvestEvents.id, eventId), eq(harvestEvents.agentId, agentId)));
  if (!e) return null;
  const own = e.farmerOrg === orgId;
  if (e.boundaryStatus === 'accepted' && !own) return null;

  const [ordinal, runs, photos] = await Promise.all([
    own && e.farmerId ? plotOrdinals(db, [e.farmerId]) : new Map<string, number>(),
    e.boundaryStatus === 'accepted' ? latestRuns(db, [e.eventId]) : new Map<string, never>(),
    db.select({ id: media.id }).from(media).where(eq(media.eventId, e.eventId)).orderBy(sql`rowid`), // inserted in payload order
  ]);
  const n = e.plotId !== null ? ordinal.get(e.plotId) : undefined;
  const plotName = n !== undefined ? t('home.plotName', { n }, lang) : t('fe.plot.default', {}, lang);
  const run = runs.get(e.eventId);

  let verdict: Verdict;
  let lines: FarmerLine[];
  if (e.boundaryStatus === 'rejected') {
    verdict = 'Rejected';
    const c = refusalCopy(e.boundaryReason ?? 'other', lang);
    lines = [
      { icon: 'seal', text: c.happened },
      { icon: 'check', text: c.todo, next: true },
    ];
  } else {
    verdict = e.finalVerdict ?? run?.verdict ?? 'Needs Review';
    lines = run ? farmerLines({ ...run, verdict }, lang, { plot: plotName }).slice(0, 3) : [];
  }
  return {
    eventId: e.eventId,
    receivedAt: e.receivedAt,
    cherryKg: e.cherryKg,
    plotName,
    verdict,
    photos: photos.map((p) => p.id),
    lines,
    checks: run ? run.checks.map((c) => ({ id: c.id, status: c.status })) : [],
  };
}
