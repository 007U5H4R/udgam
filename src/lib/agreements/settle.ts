import { and, eq, inArray } from 'drizzle-orm';
import type { Hex } from 'viem';
import { getUserPublicKey } from '../auth/signing-keys';
import { writeTx, type Db, type Tx } from '../db/client';
import { agreements, harvestEvents, qualityAttestations, settlements } from '../db/schema';
import { newId } from '../ids';
import { batchCreatedEntry } from '../ledger/closure';
import { batchIdHash } from './attestor-keys';
import { formatKg1, kgToGrams } from './format';
import { gradeDisplay, isGrade, type Grade } from './grades';
import { AgreementError, anchorSigned, deliveredBatchIds, fpoAgreement, type ServiceOptions } from './service';
import { escrowFromEnv } from './env-chain';

// The settlement service — the oracle (technical-plan TSK-25.6). SERVER-ONLY.
//
// settleBatch reads every condition from verified, anchored data, never from the client: delivered kg
// and the member events from the batch's anchored batch_created payload, each member's final verdict
// from harvest_events, and the buyer's signed grade from quality_attestations. It sends them to
// ContractFarming.settle (outside any DB transaction), waits for the receipt, and records the outcome
// the CONTRACT decided — with each condition not met named as value vs threshold — as a settlement
// row plus its signed anchor, in one writeTx. A release also closes the agreement (status settled).
// Trust, stated plainly: delivered kg and "all Verified" are this server's attestation; the grade is
// signed by the server on behalf of the buyer's account; the contract does the arithmetic.

export type Condition = 'quantity' | 'grade' | 'all_verified';
export type ConditionResult = { condition: Condition; met: boolean; value: string; threshold: string; text: string };
export type Reason = { condition: Condition; text: string };

export const REASON_BITS: Record<Condition, number> = { quantity: 1, grade: 2, all_verified: 4 };

export type SettlementFacts = {
  deliveredKg: number;
  pickings: number;
  verifiedPickings: number;
  grade: Grade | null;
  attestationId: string | null;
};

/** The three conditions as value vs threshold (Design.md §28.7; reasons follow TSK-25.6's wording). */
export function judge(f: SettlementFacts, a: { agreedKg: number; minGrade: number }): ConditionResult[] {
  const delivered = Math.round(f.deliveredKg * 10) / 10;
  const short = Math.round((a.agreedKg - delivered) * 10) / 10;
  const min = gradeDisplay(a.minGrade as Grade);
  return [
    {
      condition: 'quantity',
      met: delivered >= a.agreedKg,
      value: `${formatKg1(delivered)} kg`,
      threshold: `${formatKg1(a.agreedKg)} kg`,
      text: `Delivered ${formatKg1(delivered)} kg of ${formatKg1(a.agreedKg)} kg agreed`,
    },
    {
      condition: 'grade',
      met: f.grade !== null && f.grade >= a.minGrade,
      value: f.grade === null ? 'not graded' : gradeDisplay(f.grade),
      threshold: min,
      text: f.grade === null ? `Not graded yet; minimum ${min}` : `Graded ${gradeDisplay(f.grade)}; minimum ${min}`,
    },
    {
      condition: 'all_verified',
      met: f.pickings > 0 && f.verifiedPickings === f.pickings,
      value: `${f.verifiedPickings} of ${f.pickings}`,
      threshold: 'all Verified',
      text: `${f.verifiedPickings} of ${f.pickings} pickings Verified`,
    },
  ].map((c) => (c.condition === 'quantity' && !c.met ? { ...c, text: `${c.text} (${formatKg1(short)} kg short)` } : c)) as ConditionResult[];
}

/** The facts of a batch for an agreement, from anchored data only. */
export async function settlementFacts(db: Db | Tx, agreementId: string, batchId: string): Promise<SettlementFacts> {
  const entry = await batchCreatedEntry(db, batchId);
  if (!entry) throw new AgreementError('not_delivered');
  const p = JSON.parse(entry.payload) as { quantityKg?: unknown; events?: { eventId?: unknown }[] };
  const eventIds = (p.events ?? []).map((e) => e?.eventId).filter((x): x is string => typeof x === 'string');
  const deliveredKg = typeof p.quantityKg === 'number' ? p.quantityKg : 0;
  const verdicts = eventIds.length ? await db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(inArray(harvestEvents.id, eventIds)) : [];
  const verifiedPickings = verdicts.filter((r) => r.v === 'Verified').length;
  const [qa] = await db
    .select({ id: qualityAttestations.id, grade: qualityAttestations.grade })
    .from(qualityAttestations)
    .where(and(eq(qualityAttestations.agreementId, agreementId), eq(qualityAttestations.batchId, batchId)));
  return { deliveredKg, pickings: eventIds.length, verifiedPickings, grade: qa && isGrade(qa.grade) ? qa.grade : null, attestationId: qa?.id ?? null };
}

export type SettleInput = { fpoOrg: string; userId: string; agreementId: string; batchId: string };
export type SettleResult = { settlementId: string; outcome: 'released' | 'not_released'; reasons: Reason[]; txHash: Hex; blockNumber: number };

export async function settleBatch(db: Db, input: SettleInput, o: ServiceOptions = {}): Promise<SettleResult> {
  const a = await fpoAgreement(db, input.fpoOrg, input.agreementId);
  if (a.status !== 'funded') throw new AgreementError('wrong_state');
  if (!(await deliveredBatchIds(db, a)).includes(input.batchId)) throw new AgreementError('not_delivered');
  const facts = await settlementFacts(db, a.id, input.batchId);
  if (facts.grade === null || facts.attestationId === null) throw new AgreementError('no_grade');
  const [qa] = await db.select({ sig: qualityAttestations.eip712Sig }).from(qualityAttestations).where(eq(qualityAttestations.id, facts.attestationId));
  await getUserPublicKey(input.userId);

  const allVerified = facts.pickings > 0 && facts.verifiedPickings === facts.pickings;
  const c = await (o.chain ?? escrowFromEnv)();
  const out = await c.settle({
    id: a.chainIdHex as Hex,
    batchIdHash: batchIdHash(input.batchId),
    deliveredGrams: kgToGrams(Math.round(facts.deliveredKg * 10) / 10),
    allVerified,
    grade: facts.grade,
    gradeSig: qa!.sig as Hex,
  });
  // The contract decided; name each condition its bitmask says was not met, value vs threshold.
  const results = judge(facts, a);
  const reasons: Reason[] = out.released ? [] : results.filter((r) => (out.reasons & REASON_BITS[r.condition]) !== 0).map((r) => ({ condition: r.condition, text: r.text }));
  const outcome = out.released ? 'released' : 'not_released';
  const settlementId = newId('ST-', 12);
  const ts = (o.now ?? (() => new Date()))().toISOString();

  await writeTx(db, async (t) => {
    const statement = {
      v: 1,
      settlementId,
      agreementId: a.id,
      batchId: input.batchId,
      attestationId: facts.attestationId,
      deliveredKg: facts.deliveredKg,
      pickings: facts.pickings,
      verifiedPickings: facts.verifiedPickings,
      allVerified,
      grade: facts.grade,
      outcome,
      reasons,
      chain: { chainId: c.chainId, contract: c.escrow, txHash: out.txHash, blockNumber: out.blockNumber },
      signedBy: input.userId,
      ts,
    };
    const anchor = await anchorSigned(t, 'settlement', input.userId, statement);
    await t.insert(settlements).values({
      id: settlementId,
      agreementId: a.id,
      batchId: input.batchId,
      attestationId: facts.attestationId!,
      deliveredKg: facts.deliveredKg,
      pickings: facts.pickings,
      verifiedPickings: facts.verifiedPickings,
      allVerified,
      grade: facts.grade!,
      outcome,
      reasons: JSON.stringify(reasons),
      txHash: out.txHash,
      blockNumber: out.blockNumber,
      settledBy: input.userId,
      createdAt: ts,
      anchorSeq: anchor.seq,
    });
    if (out.released) {
      await t.update(agreements).set({ status: 'settled', closedAt: ts, closedTxHash: out.txHash, closedAnchorSeq: anchor.seq }).where(eq(agreements.id, a.id));
    }
  });
  return { settlementId, outcome, reasons, txHash: out.txHash, blockNumber: out.blockNumber };
}
