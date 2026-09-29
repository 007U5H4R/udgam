import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { batchEvents, batches, custodyTransfers, farmers, harvestEvents, organisations, plots } from '../db/schema';
import type { Crop } from './eligible';
import { custodyChain, type CustodyLink } from './read';

// The buyer's batches (technical-plan TSK-14.6, TC-060, EVAL-080): only batches whose LATEST custody
// transfer is to the buyer's organisation, taken from the session. Another buyer's batch, an open
// batch and an unknown id all read as null. Farmers appear only by producer ID (EV16).

export type BuyerBatch = {
  batchId: string;
  crop: Crop;
  quantityKg: number;
  integrityScore: number;
  plotCount: number;
  shortHash: string;
  fromOrgName: string;
  transferredAt: string;
};

export type BuyerPlot = { plotId: string; producerId: string; pickings: number; cherryKg: number };
export type BuyerBatchDetail = BuyerBatch & { plots: BuyerPlot[]; custody: CustodyLink[] };

/** Custody rows that are the latest transfer of their batch. */
const isLatest = sql`${custodyTransfers.anchorSeq} = (SELECT MAX(c2.anchor_seq) FROM ${custodyTransfers} c2 WHERE c2.batch_id = ${custodyTransfers.batchId})`;
const plotCount = sql<number>`(SELECT COUNT(DISTINCT ${harvestEvents.plotId}) FROM ${batchEvents} JOIN ${harvestEvents} ON ${harvestEvents.id} = ${batchEvents.eventId} WHERE ${batchEvents.batchId} = ${batches.id})`;

function heldBy(db: Db, buyerOrgId: string, extra?: SQL) {
  return db
    .select({
      batchId: batches.id,
      crop: batches.crop,
      quantityKg: batches.quantityKg,
      integrityScore: batches.integrityScore,
      plotCount,
      shortHash: batches.shortHash,
      fromOrgName: organisations.name,
      transferredAt: custodyTransfers.transferredAt,
    })
    .from(custodyTransfers)
    .innerJoin(batches, eq(batches.id, custodyTransfers.batchId))
    .innerJoin(organisations, eq(organisations.id, custodyTransfers.fromOrg))
    .where(and(eq(custodyTransfers.toOrg, buyerOrgId), isLatest, extra));
}

const toBatch = (r: Omit<BuyerBatch, 'integrityScore'> & { integrityScore: number | null }): BuyerBatch => ({
  ...r,
  integrityScore: r.integrityScore ?? 0,
  plotCount: Number(r.plotCount),
});

/** Batches transferred to `buyerOrgId` (and not passed on), most recently transferred first. */
export async function listBuyerBatches(db: Db, buyerOrgId: string): Promise<BuyerBatch[]> {
  const rows = await heldBy(db, buyerOrgId).orderBy(desc(custodyTransfers.transferredAt), asc(batches.id));
  return rows.map(toBatch);
}

/** One batch held by `buyerOrgId` with its plots and custody chain, or null. */
export async function getBuyerBatch(db: Db, buyerOrgId: string, batchId: string): Promise<BuyerBatchDetail | null> {
  const [row] = await heldBy(db, buyerOrgId, eq(batches.id, batchId)).limit(1);
  if (!row) return null;
  const plotRows = await db
    .select({
      plotId: plots.id,
      producerId: farmers.producerId,
      pickings: sql<number>`COUNT(*)`,
      cherryKg: sql<number>`SUM(${harvestEvents.cherryKg})`,
    })
    .from(batchEvents)
    .innerJoin(harvestEvents, eq(harvestEvents.id, batchEvents.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(eq(batchEvents.batchId, batchId))
    .groupBy(plots.id, farmers.producerId)
    .orderBy(asc(farmers.producerId), asc(plots.id));
  return {
    ...toBatch(row),
    plots: plotRows.map((p) => ({ ...p, pickings: Number(p.pickings), cherryKg: Number(p.cherryKg) })),
    custody: await custodyChain(db, batchId),
  };
}
