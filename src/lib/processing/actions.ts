import { and, desc, eq } from 'drizzle-orm';
import { getUserPublicKey, signAsUser } from '../auth/signing-keys';
import { jcs } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { batches, custodyTransfers, organisations, processingSteps } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import { MB_CONFIG, MB_CONFIG_HASH, type Process } from './config';
import { checkMassBalance, type MassBalanceResult } from './mass-balance';

// The processor's two actions (technical-plan TSK-26.4, TKT-26, F18). Server-only library; the guarded
// Server Actions in src/app/(processor) call these with the org and user from the session, never from
// input (EVAL-080). Each runs in ONE write transaction (writeTx):
//  - recordProcessingStep: holder check → checkMassBalance → sign (TP15, on behalf of the processor's
//    account) → anchor as `processing_step` → insert the processing_steps row. A flagged step is recorded
//    like any other: nothing is refused (TSK-26.2).
//  - handOnBatch: the processor hands the batch on to a buyer, signed and anchored as `custody_transfer`
//    (the FPO → processor → buyer hop, TSK-26.3).
// The database enforces the same rules (migration *_guards_processing.sql); these checks give the
// person words for them.

export type ProcessingErrorCode =
  /** Unknown batch, or one this processor never received (indistinguishable, EVAL-080). */
  | 'not_found'
  /** This processor received it but has handed it on: it is no longer theirs to change. */
  | 'not_held'
  /** This processor already recorded its step for the batch. */
  | 'already_recorded'
  /** Hand-on before a step was recorded. */
  | 'no_step'
  /** Hand-on to an organisation that is not a buyer. */
  | 'not_buyer';

/** A refusal the processor can act on (nothing was written). */
export class ProcessingError extends Error {
  constructor(readonly code: ProcessingErrorCode) {
    super(code);
    this.name = 'ProcessingError';
  }
}

type Reader = Db | Tx;

/** The latest custody row of a batch (its current holder), or undefined while the FPO holds it. */
async function latestCustody(db: Reader, batchId: string) {
  const [row] = await db
    .select({ toOrg: custodyTransfers.toOrg })
    .from(custodyTransfers)
    .where(eq(custodyTransfers.batchId, batchId))
    .orderBy(desc(custodyTransfers.anchorSeq))
    .limit(1);
  return row;
}

/** Whether `orgId` was ever handed `batchId`. */
async function everReceived(db: Reader, orgId: string, batchId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: custodyTransfers.id })
    .from(custodyTransfers)
    .where(and(eq(custodyTransfers.batchId, batchId), eq(custodyTransfers.toOrg, orgId)))
    .limit(1);
  return !!row;
}

/** The batch's crop when `orgId` holds it now; otherwise the refusal. */
async function heldBatch(tx: Tx, orgId: string, batchId: string): Promise<{ crop: 'arabica' | 'robusta' }> {
  if (!(await everReceived(tx, orgId, batchId))) throw new ProcessingError('not_found');
  if ((await latestCustody(tx, batchId))?.toOrg !== orgId) throw new ProcessingError('not_held');
  const [batch] = await tx.select({ crop: batches.crop }).from(batches).where(eq(batches.id, batchId));
  if (!batch) throw new ProcessingError('not_found');
  return batch;
}

export type RecordStepInput = { orgId: string; userId: string; batchId: string; process: Process; inputKg: number; outputKg: number };
export type RecordedStep = MassBalanceResult & { stepId: string; anchorSeq: number; recordedAt: string; process: Process; inputKg: number; outputKg: number };

/** Record the processor's step for a batch it holds, with its mass balance, signed and anchored. */
export async function recordProcessingStep(db: Db, input: RecordStepInput, now: () => Date = () => new Date()): Promise<RecordedStep> {
  const { orgId, userId, batchId, process, inputKg, outputKg } = input;
  await getUserPublicKey(userId); // load (or create) the key before taking the write lock

  return writeTx(db, async (tx) => {
    const { crop } = await heldBatch(tx, orgId, batchId);
    const [org] = await tx.select({ name: organisations.name, type: organisations.type }).from(organisations).where(eq(organisations.id, orgId));
    if (org?.type !== 'processor') throw new ProcessingError('not_found');
    const [prior] = await tx
      .select({ id: processingSteps.id })
      .from(processingSteps)
      .where(and(eq(processingSteps.batchId, batchId), eq(processingSteps.processorOrg, orgId)));
    if (prior) throw new ProcessingError('already_recorded');

    const mb = checkMassBalance({ process, crop, inputKg, outputKg });
    const ts = now().toISOString();
    const stepId = newId('PS-');
    const statement = {
      v: 1,
      stepId,
      batchId,
      processorOrg: orgId,
      processorName: org.name,
      userId,
      process,
      crop,
      inputKg,
      outputKg,
      ratio: mb.ratio,
      band: [mb.band[0], mb.band[1]],
      status: mb.status,
      evidence: mb.evidence,
      configVersion: MB_CONFIG.version,
      configHash: MB_CONFIG_HASH,
      ts,
    };
    const { kid, publicJwk, signature } = await signAsUser(userId, jcs(statement));
    const anchor = await append(tx, 'processing_step', { ...statement, kid, publicJwk, signature });
    await tx.insert(processingSteps).values({
      id: stepId,
      batchId,
      processorOrg: orgId,
      userId,
      process,
      inputKg,
      outputKg,
      ratio: mb.ratio,
      bandMin: mb.band[0],
      bandMax: mb.band[1],
      status: mb.status,
      evidence: mb.evidence,
      configVersion: MB_CONFIG.version,
      recordedAt: ts,
      signature,
      keyId: kid,
      anchorSeq: anchor.seq,
    });
    return { ...mb, stepId, anchorSeq: anchor.seq, recordedAt: ts, process, inputKg, outputKg };
  });
}

export type HandOnInput = { orgId: string; userId: string; batchId: string; toOrgId: string };

/** Hand a batch this processor holds, with its step recorded, on to a buyer organisation. */
export async function handOnBatch(db: Db, input: HandOnInput, now: () => Date = () => new Date()): Promise<{ transferId: string; anchorSeq: number; transferredAt: string }> {
  const { orgId, userId, batchId, toOrgId } = input;
  await getUserPublicKey(userId);

  return writeTx(db, async (tx) => {
    await heldBatch(tx, orgId, batchId);
    const [step] = await tx
      .select({ id: processingSteps.id })
      .from(processingSteps)
      .where(and(eq(processingSteps.batchId, batchId), eq(processingSteps.processorOrg, orgId)));
    if (!step) throw new ProcessingError('no_step');
    const [to] = await tx.select({ type: organisations.type }).from(organisations).where(eq(organisations.id, toOrgId));
    if (to?.type !== 'buyer') throw new ProcessingError('not_buyer');

    const ts = now().toISOString();
    // The custody statement keeps its M-001 shape; `adminId` names the signing account (docs/proof-feed.md §9.1).
    const statement = { v: 1, batchId, fromOrg: orgId, toOrg: toOrgId, ts, adminId: userId };
    const { kid, publicJwk, signature } = await signAsUser(userId, jcs(statement));
    const anchor = await append(tx, 'custody_transfer', { ...statement, kid, publicJwk, signature });
    const transferId = newId('CT-');
    await tx.insert(custodyTransfers).values({
      id: transferId,
      batchId,
      fromOrg: orgId,
      toOrg: toOrgId,
      adminId: userId,
      transferredAt: ts,
      signature,
      keyId: kid,
      anchorSeq: anchor.seq,
    });
    return { transferId, anchorSeq: anchor.seq, transferredAt: ts };
  });
}
