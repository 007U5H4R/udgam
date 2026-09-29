import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { batchEvents, batches, custodyTransfers, farmers, harvestEvents, organisations, plots, verificationRuns } from '../db/schema';
import type { Crop } from './eligible';

// Batch reads for the admin screens (TSK-14.5) and the buyer screens (TSK-14.6). Every read takes the
// org from the caller's session and filters by it in SQL, so another organisation's batch is `null`
// exactly like an unknown one (EVAL-080, CF-10). Farmers appear only by producer ID (EV16).

export type BatchStatus = 'open' | 'transferred';

export type BatchSummary = {
  batchId: string;
  crop: Crop;
  status: BatchStatus;
  quantityKg: number;
  /** MIN score of the members' latest runs, 0–100. */
  integrityScore: number;
  pickings: number;
  shortHash: string;
  createdAt: string;
};

export type BatchMember = { eventId: string; plotName: string; producerId: string; cherryKg: number; score: number; receivedAt: string };
export type CustodyLink = { fromOrgId: string; fromOrgName: string; toOrgId: string; toOrgName: string; transferredAt: string; keyId: string };
export type BatchDetail = BatchSummary & { orgName: string; members: BatchMember[]; custody: CustodyLink[] };

const pickings = sql<number>`(SELECT COUNT(*) FROM ${batchEvents} WHERE ${batchEvents.batchId} = ${batches.id})`;

const summaryColumns = {
  batchId: batches.id,
  crop: batches.crop,
  status: batches.status,
  quantityKg: batches.quantityKg,
  integrityScore: batches.integrityScore,
  pickings,
  shortHash: batches.shortHash,
  createdAt: batches.createdAt,
};

type SummaryRow = Omit<BatchSummary, 'integrityScore'> & { integrityScore: number | null };
const toSummary = (r: SummaryRow): BatchSummary => ({ ...r, integrityScore: r.integrityScore ?? 0, pickings: Number(r.pickings) });

/** The org's batches, newest first. */
export async function listOrgBatches(db: Db, orgId: string): Promise<BatchSummary[]> {
  const rows = await db.select(summaryColumns).from(batches).where(eq(batches.orgId, orgId)).orderBy(desc(batches.createdAt), asc(batches.id));
  return rows.map(toSummary);
}

/**
 * The members of a batch, in eventId order (the order batch_created lists them).
 * UNSCOPED: call only after an org-scoped lookup of `batchId` (getOrgBatch, getBuyerBatch).
 */
export async function batchMembers(db: Db, batchId: string): Promise<BatchMember[]> {
  const score = sql<number>`(SELECT ${verificationRuns.score} FROM ${verificationRuns} WHERE ${verificationRuns.eventId} = ${harvestEvents.id} ORDER BY ${verificationRuns.runNo} DESC LIMIT 1)`;
  const rows = await db
    .select({
      eventId: harvestEvents.id,
      plotName: plots.id,
      producerId: farmers.producerId,
      cherryKg: harvestEvents.cherryKg,
      score,
      receivedAt: harvestEvents.serverReceivedAt,
    })
    .from(batchEvents)
    .innerJoin(harvestEvents, eq(harvestEvents.id, batchEvents.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(eq(batchEvents.batchId, batchId))
    .orderBy(asc(harvestEvents.id));
  return rows.map((r) => ({ ...r, cherryKg: r.cherryKg ?? 0, score: Number(r.score) }));
}

/**
 * The batch's custody chain, oldest first, with organisation names.
 * UNSCOPED: call only after an org-scoped lookup of `batchId` (getOrgBatch, getBuyerBatch).
 */
export async function custodyChain(db: Db, batchId: string): Promise<CustodyLink[]> {
  const rows = await db
    .select({
      fromOrgId: custodyTransfers.fromOrg,
      toOrgId: custodyTransfers.toOrg,
      transferredAt: custodyTransfers.transferredAt,
      keyId: custodyTransfers.keyId,
    })
    .from(custodyTransfers)
    .where(eq(custodyTransfers.batchId, batchId))
    .orderBy(asc(custodyTransfers.anchorSeq));
  const names = await orgNames(db, rows.flatMap((r) => [r.fromOrgId, r.toOrgId]));
  return rows.map((r) => ({ ...r, fromOrgName: names.get(r.fromOrgId) ?? r.fromOrgId, toOrgName: names.get(r.toOrgId) ?? r.toOrgId }));
}

/** Organisation display names by id. UNSCOPED: pass only ids the caller may already see. */
export async function orgNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(inArray(organisations.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** One of the org's batches with its members and custody chain, or null (unknown or another org's). */
export async function getOrgBatch(db: Db, orgId: string, batchId: string): Promise<BatchDetail | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.orgId, orgId)));
  if (!row) return null;
  const [members, custody, names] = await Promise.all([batchMembers(db, batchId), custodyChain(db, batchId), orgNames(db, [orgId])]);
  return { ...toSummary(row), orgName: names.get(orgId) ?? orgId, members, custody };
}

/** Buyer organisations an admin can transfer to, by name. */
export async function listBuyerOrgs(db: Db): Promise<{ id: string; name: string }[]> {
  return db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(eq(organisations.type, 'buyer')).orderBy(asc(organisations.name), asc(organisations.id));
}
