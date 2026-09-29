import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { batchEvents, farmers, harvestEvents, plots, verificationRuns } from '../db/schema';

// Pickings that can go into a batch (technical-plan TSK-14.3): accepted at the boundary, final verdict
// Verified, on one of the org's plots, and in no batch yet. The database enforces the same rules on
// insert (migration *_batch_invariants.sql); this is the courtesy check and the builder's list.

export const CROPS = ['arabica', 'robusta'] as const;
export type Crop = (typeof CROPS)[number];
export const isCrop = (v: unknown): v is Crop => typeof v === 'string' && (CROPS as readonly string[]).includes(v);

export type EligibleEvent = {
  eventId: string;
  /** The plot's id (plots carry no separate display name). */
  plotName: string;
  /** The farmer's public producer ID (EV16): never the name. */
  producerId: string;
  crop: Crop;
  cherryKg: number;
  /** Score of the run that set the final verdict (the event's latest run), 0–100. */
  score: number;
  receivedAt: string;
};

/** An eligible event with its capture hash (what batch_created lists). */
export type EligibleRow = EligibleEvent & { payloadHash: string };

/** The score of the event's latest verification run (the run that set its final verdict). */
const latestScore = sql<number>`(SELECT ${verificationRuns.score} FROM ${verificationRuns} WHERE ${verificationRuns.eventId} = ${harvestEvents.id} ORDER BY ${verificationRuns.runNo} DESC LIMIT 1)`;

/** Eligible rows of `orgId`, optionally only of `crop` and/or only among `eventIds`. Newest first. */
export async function eligibleRows(db: Db | Tx, orgId: string, o: { crop?: Crop; eventIds?: string[] } = {}): Promise<EligibleRow[]> {
  if (o.eventIds && o.eventIds.length === 0) return [];
  const where: SQL[] = [
    eq(farmers.orgId, orgId),
    eq(harvestEvents.boundaryStatus, 'accepted'),
    eq(harvestEvents.finalVerdict, 'Verified'),
    isNotNull(harvestEvents.cherryKg),
    isNull(batchEvents.eventId),
  ];
  if (o.crop) where.push(eq(plots.crop, o.crop));
  if (o.eventIds) where.push(inArray(harvestEvents.id, o.eventIds));
  const rows = await db
    .select({
      eventId: harvestEvents.id,
      plotName: plots.id,
      producerId: farmers.producerId,
      crop: plots.crop,
      cherryKg: harvestEvents.cherryKg,
      score: latestScore,
      receivedAt: harvestEvents.serverReceivedAt,
      payloadHash: harvestEvents.payloadHash,
    })
    .from(harvestEvents)
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .leftJoin(batchEvents, eq(batchEvents.eventId, harvestEvents.id))
    .where(and(...where))
    .orderBy(desc(harvestEvents.serverReceivedAt), asc(harvestEvents.id));
  return rows.map((r) => ({ ...r, cherryKg: r.cherryKg!, score: Number(r.score) }));
}

/** The builder's list: the org's pickings that can go into a batch (optionally of one crop), newest first. */
export async function listEligibleEvents(db: Db, orgId: string, crop?: Crop): Promise<EligibleEvent[]> {
  const rows = await eligibleRows(db, orgId, { crop });
  return rows.map(({ eventId, plotName, producerId, crop: c, cherryKg, score, receivedAt }) => ({ eventId, plotName, producerId, crop: c, cherryKg, score, receivedAt }));
}
