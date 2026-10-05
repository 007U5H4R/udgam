import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { batchEvents, batches, custodyTransfers, organisations, processingSteps, user } from '../db/schema';
import type { Process } from './config';

// Reads for the processor surface (TKT-26, TSK-26.5, Design.md §28.1 screen 6). Every read takes the
// processor org from the session and filters by it in SQL: a batch this processor was never handed is
// null exactly like an unknown one (EVAL-080, CF-10). A processor sees only what it needs to process and
// hand on: the batch, crop, kg, pickings count, who handed it over, its own step and its own hand-on.

export type ProcessorStep = {
  process: Process;
  inputKg: number;
  outputKg: number;
  ratio: number;
  band: [number, number];
  status: 'ok' | 'flag';
  evidence: string;
  configVersion: string;
  recordedAt: string;
};

export type ProcessorBatch = {
  batchId: string;
  crop: 'arabica' | 'robusta';
  quantityKg: number;
  pickings: number;
  /** The organisation that handed the batch to this processor (the FPO). */
  fromOrgName: string;
  receivedAt: string;
  /** True while this processor is the batch's current holder. */
  held: boolean;
  step: ProcessorStep | null;
  /** Set once this processor handed it on. */
  handedOn: { toOrgName: string; at: string; byName: string } | null;
};

const pickings = sql<number>`(SELECT COUNT(*) FROM ${batchEvents} WHERE ${batchEvents.batchId} = ${batches.id})`;
const latestTo = sql<string>`(SELECT c2.to_org FROM ${custodyTransfers} c2 WHERE c2.batch_id = ${batches.id} ORDER BY c2.anchor_seq DESC LIMIT 1)`;

async function received(db: Db, orgId: string, batchId?: string) {
  return db
    .select({
      batchId: batches.id,
      crop: batches.crop,
      quantityKg: batches.quantityKg,
      pickings,
      fromOrgName: organisations.name,
      receivedAt: custodyTransfers.transferredAt,
      anchorSeq: custodyTransfers.anchorSeq,
      latestTo,
    })
    .from(custodyTransfers)
    .innerJoin(batches, eq(batches.id, custodyTransfers.batchId))
    .innerJoin(organisations, eq(organisations.id, custodyTransfers.fromOrg))
    .where(and(eq(custodyTransfers.toOrg, orgId), batchId === undefined ? undefined : eq(batches.id, batchId)))
    .orderBy(desc(custodyTransfers.transferredAt), asc(batches.id));
}

async function stepsOf(db: Db, orgId: string, batchIds: string[]): Promise<Map<string, ProcessorStep>> {
  if (batchIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(processingSteps)
    .where(and(eq(processingSteps.processorOrg, orgId), inArray(processingSteps.batchId, batchIds)));
  return new Map(
    rows.map((r) => [
      r.batchId,
      {
        process: r.process,
        inputKg: r.inputKg,
        outputKg: r.outputKg,
        ratio: r.ratio,
        band: [r.bandMin, r.bandMax],
        status: r.status,
        evidence: r.evidence,
        configVersion: r.configVersion,
        recordedAt: r.recordedAt,
      },
    ]),
  );
}

async function handOnsOf(db: Db, orgId: string, batchIds: string[]): Promise<Map<string, ProcessorBatch['handedOn']>> {
  if (batchIds.length === 0) return new Map();
  const rows = await db
    .select({ batchId: custodyTransfers.batchId, toOrgName: organisations.name, at: custodyTransfers.transferredAt, byName: user.name })
    .from(custodyTransfers)
    .innerJoin(organisations, eq(organisations.id, custodyTransfers.toOrg))
    .innerJoin(user, eq(user.id, custodyTransfers.adminId))
    .where(and(eq(custodyTransfers.fromOrg, orgId), inArray(custodyTransfers.batchId, batchIds)));
  return new Map(rows.map((r) => [r.batchId, { toOrgName: r.toOrgName, at: r.at, byName: r.byName }]));
}

async function assemble(db: Db, orgId: string, rows: Awaited<ReturnType<typeof received>>): Promise<ProcessorBatch[]> {
  // A batch is received once per processor (the custody rules allow no second hop to it).
  const unique = [...new Map(rows.map((r) => [r.batchId, r])).values()];
  const ids = unique.map((r) => r.batchId);
  const [steps, handOns] = await Promise.all([stepsOf(db, orgId, ids), handOnsOf(db, orgId, ids)]);
  return unique.map((r) => ({
    batchId: r.batchId,
    crop: r.crop,
    quantityKg: r.quantityKg,
    pickings: Number(r.pickings),
    fromOrgName: r.fromOrgName,
    receivedAt: r.receivedAt,
    held: r.latestTo === orgId,
    step: steps.get(r.batchId) ?? null,
    handedOn: handOns.get(r.batchId) ?? null,
  }));
}

/** Every batch handed to this processor, most recently received first (held and handed on). */
export async function listProcessorBatches(db: Db, orgId: string): Promise<ProcessorBatch[]> {
  return assemble(db, orgId, await received(db, orgId));
}

/** One batch handed to this processor, or null (unknown, or never handed to it). */
export async function getProcessorBatch(db: Db, orgId: string, batchId: string): Promise<ProcessorBatch | null> {
  const [b] = await assemble(db, orgId, await received(db, orgId, batchId));
  return b ?? null;
}

/** Buyer organisations a processor can hand a batch on to, by name. */
export async function listBuyers(db: Db): Promise<{ id: string; name: string }[]> {
  return db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(eq(organisations.type, 'buyer')).orderBy(asc(organisations.name), asc(organisations.id));
}

/** The processor organisation's name and the signed-in person's name (the shell and the eyebrow). */
export async function processorHeader(db: Db, orgId: string, userId: string): Promise<{ orgName: string | null; userName: string | null }> {
  const [[org], [me]] = await Promise.all([
    db.select({ name: organisations.name }).from(organisations).where(eq(organisations.id, orgId)),
    db.select({ name: user.name }).from(user).where(eq(user.id, userId)),
  ]);
  return { orgName: org?.name ?? null, userName: me?.name ?? null };
}
