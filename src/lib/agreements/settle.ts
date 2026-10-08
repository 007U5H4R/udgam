import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Hex } from 'viem';
import { getUserPublicKey } from '../auth/signing-keys';
import { writeTx, type Db, type Tx } from '../db/client';
import { agreements, harvestEvents, ledgerEntries, qualityAttestations, settlements } from '../db/schema';
import { newId } from '../ids';
import { batchIdHash } from './attestor-keys';
import { formatKg1, kgToGrams } from './format';
import { gradeDisplay, isGrade, type Grade } from './grades';
import { AgreementError, anchorSigned, deliveredBatchIds, fpoAgreement, type ServiceOptions } from './service';
import { ChainError, type EscrowChain, type SettleArgs, type SettleOutcome } from './chain';
import { escrowFromEnv } from './env-chain';

// The settlement service — the oracle (technical-plan TSK-25.6). SERVER-ONLY.
//
// settleBatch reads every condition from verified, anchored data, never from the client: delivered kg
// and the member events from the batch's anchored batch_created payload, each member's final verdict
// from harvest_events, and the buyer's signed grade from quality_attestations. It sends them to
// ContractFarming.settle (outside any DB transaction), waits for the receipt, and records the outcome
// the CONTRACT decided — each condition not met named by its code, with the observed values (never the
// agreed terms: the settlement is in the batch's public proof feed) — as a settlement row plus its
// signed anchor, in one writeTx. The caller gets each reason as value vs threshold for its private screen. A release also closes the agreement (status settled).
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
  /** The buyer's EIP-712 grade signature (with the grade), or null. */
  gradeSig: string | null;
};

/** The three conditions as value vs threshold (Design.md §28.7; reasons follow TSK-25.6's wording). */
export function judge(f: Pick<SettlementFacts, 'deliveredKg' | 'pickings' | 'verifiedPickings' | 'grade'>, a: { agreedKg: number; minGrade: number }): ConditionResult[] {
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
  return (await settlementFactsFor(db, [{ agreementId, batchId }])).get(factsKey(agreementId, batchId))!;
}

/** The key of one (agreement, batch) pair in settlementFactsFor's map. */
export const factsKey = (agreementId: string, batchId: string): string => `${agreementId} ${batchId}`;

// The JSON path is a literal (never a bound parameter) so SQLite can match migration 0003's expression index.
const payloadBatchId = sql<string>`json_extract(${ledgerEntries.payload}, '$.batchId')`;

/**
 * settlementFacts for many (agreement, batch) pairs in three statements, whatever their number (the list
 * pages, Stage 9 CR-204): the batches' batch_created entries, their members' final verdicts, and the
 * pairs' grades. Keyed by factsKey. Throws not_delivered when a batch has no batch_created entry.
 */
export async function settlementFactsFor(db: Db | Tx, pairs: readonly { agreementId: string; batchId: string }[]): Promise<Map<string, SettlementFacts>> {
  const out = new Map<string, SettlementFacts>();
  if (pairs.length === 0) return out;
  const batchIds = [...new Set(pairs.map((p) => p.batchId))];
  const agreementIds = [...new Set(pairs.map((p) => p.agreementId))];

  // The first batch_created entry of each batch (as batchCreatedEntry: a reused id would keep its first).
  const entries = await db
    .select({ batchId: payloadBatchId, payload: ledgerEntries.payload })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.kind, 'batch_created'), inArray(payloadBatchId, batchIds)))
    .orderBy(asc(ledgerEntries.seq));
  const created = new Map<string, { deliveredKg: number; eventIds: string[] }>();
  for (const e of entries) {
    if (created.has(e.batchId)) continue;
    const p = JSON.parse(e.payload) as { quantityKg?: unknown; events?: { eventId?: unknown }[] };
    created.set(e.batchId, {
      deliveredKg: typeof p.quantityKg === 'number' ? p.quantityKg : 0,
      eventIds: (p.events ?? []).map((x) => x?.eventId).filter((x): x is string => typeof x === 'string'),
    });
  }
  if (batchIds.some((id) => !created.has(id))) throw new AgreementError('not_delivered');

  const eventIds = [...new Set([...created.values()].flatMap((c) => c.eventIds))];
  const verdicts = eventIds.length ? await db.select({ id: harvestEvents.id, v: harvestEvents.finalVerdict }).from(harvestEvents).where(inArray(harvestEvents.id, eventIds)) : [];
  const verified = new Set(verdicts.filter((r) => r.v === 'Verified').map((r) => r.id));

  const grades = await db
    .select({ agreementId: qualityAttestations.agreementId, batchId: qualityAttestations.batchId, id: qualityAttestations.id, grade: qualityAttestations.grade, sig: qualityAttestations.eip712Sig })
    .from(qualityAttestations)
    .where(and(inArray(qualityAttestations.agreementId, agreementIds), inArray(qualityAttestations.batchId, batchIds)));
  const gradeOf = new Map<string, (typeof grades)[number]>();
  for (const g of grades) if (!gradeOf.has(factsKey(g.agreementId, g.batchId))) gradeOf.set(factsKey(g.agreementId, g.batchId), g);

  for (const { agreementId, batchId } of pairs) {
    const c = created.get(batchId)!;
    const qa = gradeOf.get(factsKey(agreementId, batchId));
    const graded = qa && isGrade(qa.grade) ? qa : null;
    out.set(factsKey(agreementId, batchId), {
      deliveredKg: c.deliveredKg,
      pickings: c.eventIds.length,
      verifiedPickings: new Set(c.eventIds.filter((id) => verified.has(id))).size,
      grade: graded ? (graded.grade as Grade) : null,
      attestationId: graded?.id ?? null,
      gradeSig: graded?.sig ?? null,
    });
  }
  return out;
}

export type SettleInput = { fpoOrg: string; userId: string; agreementId: string; batchId: string };
export type SettleResult = { settlementId: string; outcome: 'released' | 'not_released'; reasons: Reason[]; txHash: Hex; blockNumber: number };

/**
 * The contract's decision for one batch. If the agreement is already settled on chain for THIS batch
 * (a release whose DB record was lost: the process died after the receipt, or the writeTx failed, or a
 * concurrent request is recording it), the earlier release is recovered from its Settled event and
 * nothing new is sent; the caller records it once.
 */
async function decideOnChain(c: EscrowChain, args: SettleArgs): Promise<SettleOutcome> {
  const recover = async (): Promise<SettleOutcome | null> => {
    if ((await c.status(args.id)) !== 'settled') return null;
    const tx = await c.settledTx(args.id, args.batchIdHash);
    return tx ? { txHash: tx.txHash, blockNumber: tx.blockNumber, released: true, reasons: 0, sent: tx.sent } : null;
  };
  const earlier = await recover();
  if (earlier) return earlier;
  try {
    return await c.settle(args);
  } catch (e) {
    if (e instanceof ChainError && e.kind === 'turned_away') {
      const raced = await recover();
      if (raced) return raced;
    }
    throw e;
  }
}

/**
 * A `not_released` judgement already recorded for this agreement and batch on the SAME facts (Stage 9
 * CR-203). The judgement path moves no money, so the chain never refuses a repeat: without this, two
 * overlapping or repeated requests would each anchor an identical settlement into the batch's public
 * proof feed. Batched verdicts are frozen and a batch is graded once, so the facts cannot change; they are
 * compared anyway, so a judgement on different facts is still recorded.
 */
async function judgedBefore(db: Db | Tx, agreementId: string, batchId: string, f: { attestationId: string; deliveredKg: number; pickings: number; verifiedPickings: number; grade: number }) {
  const [row] = await db
    .select({ id: settlements.id, reasons: settlements.reasons, txHash: settlements.txHash, blockNumber: settlements.blockNumber })
    .from(settlements)
    .where(
      and(
        eq(settlements.agreementId, agreementId),
        eq(settlements.batchId, batchId),
        eq(settlements.outcome, 'not_released'),
        eq(settlements.attestationId, f.attestationId),
        eq(settlements.deliveredKg, f.deliveredKg),
        eq(settlements.pickings, f.pickings),
        eq(settlements.verifiedPickings, f.verifiedPickings),
        eq(settlements.grade, f.grade),
      ),
    )
    .orderBy(asc(settlements.createdAt), asc(settlements.id))
    .limit(1);
  return row ?? null;
}

export async function settleBatch(db: Db, input: SettleInput, o: ServiceOptions = {}): Promise<SettleResult> {
  const a = await fpoAgreement(db, input.fpoOrg, input.agreementId);
  if (a.status !== 'funded') throw new AgreementError('wrong_state');
  if (!(await deliveredBatchIds(db, a)).includes(input.batchId)) throw new AgreementError('not_delivered');
  const facts = await settlementFacts(db, a.id, input.batchId);
  const { grade, attestationId, gradeSig } = facts;
  if (grade === null || attestationId === null || gradeSig === null) throw new AgreementError('no_grade');
  await getUserPublicKey(input.userId);

  // Nothing new to judge: answer with the recorded judgement and send nothing (CR-203).
  const sameFacts = { attestationId, deliveredKg: facts.deliveredKg, pickings: facts.pickings, verifiedPickings: facts.verifiedPickings, grade };
  const asResult = (row: NonNullable<Awaited<ReturnType<typeof judgedBefore>>>): SettleResult => {
    const codes = JSON.parse(row.reasons) as Condition[];
    const reasons = judge(facts, a)
      .filter((r) => codes.includes(r.condition))
      .map((r) => ({ condition: r.condition, text: r.text }));
    return { settlementId: row.id, outcome: 'not_released', reasons, txHash: row.txHash as Hex, blockNumber: row.blockNumber };
  };
  const before = await judgedBefore(db, a.id, input.batchId, sameFacts);
  if (before) return asResult(before);

  const sendingAllVerified = facts.pickings > 0 && facts.verifiedPickings === facts.pickings;
  const c = await (o.chain ?? escrowFromEnv)();
  const out = await decideOnChain(c, {
    id: a.chainIdHex as Hex,
    batchIdHash: batchIdHash(input.batchId),
    deliveredGrams: kgToGrams(Math.round(facts.deliveredKg * 10) / 10),
    allVerified: sendingAllVerified,
    grade,
    gradeSig: gradeSig as Hex,
  });
  // A recovered release (`sent` set) is recorded with the facts that were SENT to the chain, read back from
  // its settle call, never with facts re-read now: a verdict changed since must not make the signed
  // statement say `released` with `allVerified: false` (TKT-25 quality review r2). The contract released,
  // so what was sent met all three conditions; that also holds when the calldata could not be read.
  const recovered = out.sent !== undefined;
  const allVerified = recovered ? (out.sent?.allVerified ?? true) : sendingAllVerified;
  const verifiedPickings = recovered && allVerified ? facts.pickings : facts.verifiedPickings;
  // The contract decided; name each condition its bitmask says was not met, value vs threshold.
  const results = judge({ ...facts, verifiedPickings }, a);
  const reasons: Reason[] = out.released ? [] : results.filter((r) => (out.reasons & REASON_BITS[r.condition]) !== 0).map((r) => ({ condition: r.condition, text: r.text }));
  // Anchored and stored: condition codes only. The texts name the agreed kg and the minimum grade, which
  // are private terms (Design.md §28.4); the screens rebuild them from the agreement row (read.ts).
  const codes: Condition[] = reasons.map((r) => r.condition);
  const outcome = out.released ? 'released' : 'not_released';
  const ts = (o.now ?? (() => new Date()))().toISOString();

  const recordedAs = await writeTx(db, async (t): Promise<SettleResult | string> => {
    // Exactly once: a concurrent request may already have recorded this same chain decision.
    const [done] = await t.select({ id: settlements.id }).from(settlements).where(and(eq(settlements.agreementId, a.id), eq(settlements.txHash, out.txHash)));
    if (done) return done.id;
    // ...or, for a judgement that did not release, the same judgement from another transaction (CR-203).
    // writeTx is BEGIN IMMEDIATE, so this re-read is serialised with every other writer of the file.
    if (!out.released) {
      const raced = await judgedBefore(t, a.id, input.batchId, sameFacts);
      if (raced) return asResult(raced);
    }
    const [cur] = await t.select({ status: agreements.status }).from(agreements).where(eq(agreements.id, a.id));
    if (cur?.status !== 'funded') throw new AgreementError('wrong_state');
    const id = newId('ST-', 12);
    const statement = {
      v: 1,
      settlementId: id,
      agreementId: a.id,
      batchId: input.batchId,
      attestationId,
      deliveredKg: facts.deliveredKg,
      pickings: facts.pickings,
      verifiedPickings,
      allVerified,
      grade,
      outcome,
      reasons: codes,
      chain: { chainId: c.chainId, contract: c.escrow, txHash: out.txHash, blockNumber: out.blockNumber },
      signedBy: input.userId,
      ts,
    };
    const anchor = await anchorSigned(t, 'settlement', input.userId, statement);
    await t.insert(settlements).values({
      id,
      agreementId: a.id,
      batchId: input.batchId,
      attestationId,
      deliveredKg: facts.deliveredKg,
      pickings: facts.pickings,
      verifiedPickings,
      allVerified,
      grade,
      outcome,
      reasons: JSON.stringify(codes),
      txHash: out.txHash,
      blockNumber: out.blockNumber,
      settledBy: input.userId,
      createdAt: ts,
      anchorSeq: anchor.seq,
    });
    if (out.released) {
      await t.update(agreements).set({ status: 'settled', closedAt: ts, closedTxHash: out.txHash, closedAnchorSeq: anchor.seq }).where(eq(agreements.id, a.id));
    }
    return id;
  });
  if (typeof recordedAs !== 'string') return recordedAs;
  return { settlementId: recordedAs, outcome, reasons, txHash: out.txHash, blockNumber: out.blockNumber };
}
