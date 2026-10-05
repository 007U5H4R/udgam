import { and, eq, exists, notExists, sql } from 'drizzle-orm';
import type { Hex } from 'viem';
import { getUserPublicKey, signAsUser } from '../auth/signing-keys';
import { jcs } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { agreements, batches, custodyTransfers, organisations, qualityAttestations, settlements } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import type { LedgerKind } from '../ledger/types';
import { agreementChainId, batchIdHash, orgAddress, recoverGradeSigner, signGrade, type GradeDomain, type GradeMessage } from './attestor-keys';
import { ChainError, type ChainTx, type EscrowChain, type OnChainStatus } from './chain';
import { escrowFromEnv } from './env-chain';
import { deadlineIso, kgToGrams } from './format';
import type { NewAgreementValues } from './form';
import { isGrade, type Grade } from './grades';

// Agreements: create, fund, take back after the deadline, grade a delivered batch (technical-plan
// TSK-25.6/25.7, F17). SERVER-ONLY. Each action makes its chain call first, OUTSIDE any DB transaction,
// waits for the receipt, then records the fact in one writeTx: the statement is signed by the server on
// behalf of the acting user (TP15: kid, publicJwk, signature over jcs(statement)), anchored, and its row
// written. Org scope always comes from the caller's session; another organisation's agreement is
// indistinguishable from an unknown one (not_found, EVAL-080). Inputs from the client are never trusted:
// terms are re-checked by the caller (form.ts), and every settlement condition is read from the DB.

export type AgreementErrorCode =
  | 'not_found'
  | 'not_fpo'
  | 'wrong_state'
  | 'deadline_not_passed'
  | 'deadline_passed'
  | 'not_delivered'
  | 'already_graded'
  | 'bad_signature'
  | 'no_grade'
  | 'invalid_grade';

/** A refusal before anything moved or was recorded. */
export class AgreementError extends Error {
  constructor(readonly code: AgreementErrorCode) {
    super(code);
    this.name = 'AgreementError';
  }
}

export type ChainSource = () => Promise<EscrowChain>;
export type ServiceOptions = { chain?: ChainSource; now?: () => Date };

const chainOf = (o: ServiceOptions) => (o.chain ?? escrowFromEnv)();
const nowOf = (o: ServiceOptions) => (o.now ?? (() => new Date()))();

export type AgreementRow = typeof agreements.$inferSelect;

/** Sign `statement` on behalf of `userId`, anchor it as `kind`, and return the anchor (inside `tx`). */
export async function anchorSigned(tx: Tx, kind: LedgerKind, userId: string, statement: Record<string, unknown>) {
  const { kid, publicJwk, signature } = await signAsUser(userId, jcs(statement));
  return append(tx, kind, { ...statement, kid, publicJwk, signature });
}

/**
 * Send a buyer's step (fund, refund). If the chain turns it away because the agreement is already in
 * the step's target state — a concurrent double submit got there first — the step is done: send once
 * more, which recovers the earlier transaction from its event (chain.ts), and record that one.
 */
async function idempotentStep(c: EscrowChain, id: Hex, target: OnChainStatus, send: () => Promise<ChainTx>): Promise<ChainTx> {
  try {
    return await send();
  } catch (e) {
    if (e instanceof ChainError && e.kind === 'turned_away' && (await c.status(id)) === target) return send();
    throw e;
  }
}

const chainFacts = (c: EscrowChain, tx: ChainTx) => ({ chainId: c.chainId, contract: c.escrow, txHash: tx.txHash, blockNumber: tx.blockNumber });

/** The buyer's agreement, or AgreementError('not_found') (another org's id included). */
export async function buyerAgreement(db: Db | Tx, buyerOrg: string, id: string): Promise<AgreementRow> {
  const [a] = await db.select().from(agreements).where(and(eq(agreements.id, id), eq(agreements.buyerOrg, buyerOrg)));
  if (!a) throw new AgreementError('not_found');
  return a;
}

/** The FPO's agreement, or AgreementError('not_found'). */
export async function fpoAgreement(db: Db | Tx, fpoOrg: string, id: string): Promise<AgreementRow> {
  const [a] = await db.select().from(agreements).where(and(eq(agreements.id, id), eq(agreements.fpoOrg, fpoOrg)));
  if (!a) throw new AgreementError('not_found');
  return a;
}

/**
 * Batches delivered under an agreement: the FPO's batches of the agreed crop that have been handed to
 * the agreement's buyer, and not already paid out under another agreement.
 */
export async function deliveredBatchIds(db: Db | Tx, a: Pick<AgreementRow, 'id' | 'fpoOrg' | 'buyerOrg' | 'crop'>): Promise<string[]> {
  const rows = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        eq(batches.orgId, a.fpoOrg),
        eq(batches.crop, a.crop),
        exists(db.select({ one: sql`1` }).from(custodyTransfers).where(and(eq(custodyTransfers.batchId, batches.id), eq(custodyTransfers.toOrg, a.buyerOrg)))),
        notExists(
          db
            .select({ one: sql`1` })
            .from(settlements)
            .where(and(eq(settlements.batchId, batches.id), eq(settlements.outcome, 'released'), sql`${settlements.agreementId} <> ${a.id}`)),
        ),
      ),
    )
    .orderBy(batches.createdAt);
  return rows.map((r) => r.id);
}

// ── create ───────────────────────────────────────────────────────────────────────────────────────

export type CreateInput = { buyerOrg: string; userId: string; values: NewAgreementValues };

export async function createAgreement(db: Db, input: CreateInput, o: ServiceOptions = {}): Promise<{ agreementId: string }> {
  const { buyerOrg, userId, values: v } = input;
  const [fpo] = await db.select({ type: organisations.type }).from(organisations).where(eq(organisations.id, v.fpoOrg));
  if (fpo?.type !== 'fpo') throw new AgreementError('not_fpo');
  await getUserPublicKey(userId);
  const agreementId = newId('AG-');
  const chainIdHex = agreementChainId(agreementId);
  const deadline = deadlineIso(v.deadlineDate);
  const c = await chainOf(o);
  await c.ensureBuyer(buyerOrg, BigInt(v.amountPaise));
  const tx = await c.createAgreement({
    id: chainIdHex,
    buyerOrg,
    fpoPayee: await orgAddress(v.fpoOrg),
    agreedGrams: kgToGrams(v.agreedKg),
    minGrade: v.minGrade,
    amountPaise: BigInt(v.amountPaise),
    deadline: BigInt(Math.floor(Date.parse(deadline) / 1000)),
  });
  const ts = nowOf(o).toISOString();
  await writeTx(db, async (t) => {
    const statement = {
      v: 1,
      agreementId,
      chainAgreementId: chainIdHex,
      buyerOrg,
      fpoOrg: v.fpoOrg,
      crop: v.crop,
      agreedKg: v.agreedKg,
      minGrade: v.minGrade,
      amountPaise: v.amountPaise,
      deadline,
      chain: chainFacts(c, tx),
      signedBy: userId,
      ts,
    };
    const anchor = await anchorSigned(t, 'agreement_created', userId, statement);
    await t.insert(agreements).values({
      id: agreementId,
      chainIdHex,
      buyerOrg,
      fpoOrg: v.fpoOrg,
      crop: v.crop,
      agreedKg: v.agreedKg,
      minGrade: v.minGrade,
      amountPaise: v.amountPaise,
      deadline,
      createdBy: userId,
      createdAt: ts,
      createdTxHash: tx.txHash,
      anchorSeq: anchor.seq,
    });
  });
  return { agreementId };
}

// ── fund ─────────────────────────────────────────────────────────────────────────────────────────

export type BuyerAction = { buyerOrg: string; userId: string; agreementId: string };

export async function fundAgreement(db: Db, input: BuyerAction, o: ServiceOptions = {}): Promise<void> {
  const a = await buyerAgreement(db, input.buyerOrg, input.agreementId);
  if (a.status !== 'created') throw new AgreementError('wrong_state');
  if (nowOf(o).getTime() > Date.parse(a.deadline)) throw new AgreementError('deadline_passed');
  await getUserPublicKey(input.userId);
  const c = await chainOf(o);
  await c.ensureBuyer(input.buyerOrg, BigInt(a.amountPaise));
  const tx = await idempotentStep(c, a.chainIdHex as Hex, 'funded', () => c.fund(input.buyerOrg, a.chainIdHex as Hex, BigInt(a.amountPaise)));
  const ts = nowOf(o).toISOString();
  await writeTx(db, async (t) => {
    const cur = await buyerAgreement(t, input.buyerOrg, a.id);
    if (cur.status === 'funded' && cur.fundedTxHash === tx.txHash) return; // a concurrent request recorded it
    if (cur.status !== 'created') throw new AgreementError('wrong_state');
    const anchor = await anchorSigned(t, 'agreement_funded', input.userId, { v: 1, agreementId: a.id, amountPaise: a.amountPaise, chain: chainFacts(c, tx), signedBy: input.userId, ts });
    await t.update(agreements).set({ status: 'funded', fundedAt: ts, fundedTxHash: tx.txHash, fundedAnchorSeq: anchor.seq }).where(eq(agreements.id, a.id));
  });
}

// ── take the money back (refund) ─────────────────────────────────────────────────────────────────

export async function refundAgreement(db: Db, input: BuyerAction, o: ServiceOptions = {}): Promise<void> {
  const a = await buyerAgreement(db, input.buyerOrg, input.agreementId);
  if (a.status !== 'funded') throw new AgreementError('wrong_state');
  if (nowOf(o).getTime() <= Date.parse(a.deadline)) throw new AgreementError('deadline_not_passed');
  await getUserPublicKey(input.userId);
  const c = await chainOf(o);
  const tx = await idempotentStep(c, a.chainIdHex as Hex, 'refunded', () => c.refund(input.buyerOrg, a.chainIdHex as Hex));
  const ts = nowOf(o).toISOString();
  await writeTx(db, async (t) => {
    const cur = await buyerAgreement(t, input.buyerOrg, a.id);
    if (cur.status === 'refunded' && cur.closedTxHash === tx.txHash) return; // a concurrent request recorded it
    if (cur.status !== 'funded') throw new AgreementError('wrong_state');
    const anchor = await anchorSigned(t, 'agreement_refunded', input.userId, { v: 1, agreementId: a.id, amountPaise: a.amountPaise, chain: chainFacts(c, tx), signedBy: input.userId, ts });
    await t.update(agreements).set({ status: 'refunded', closedAt: ts, closedTxHash: tx.txHash, closedAnchorSeq: anchor.seq }).where(eq(agreements.id, a.id));
  });
}

// ── grade a delivered batch ──────────────────────────────────────────────────────────────────────

export type GradeInput = BuyerAction & { batchId: string; grade: Grade };
export type GradeSigner = (orgId: string, m: GradeMessage, domain: GradeDomain) => Promise<Hex>;

/**
 * Sign the buyer organisation's EIP-712 grade and record it. The signature is checked against the
 * organisation's address BEFORE anything is anchored (EVAL-099): a grade that does not verify is
 * refused with bad_signature and nothing is written. `o.sign` exists for that test.
 */
export async function gradeBatch(db: Db, input: GradeInput, o: ServiceOptions & { sign?: GradeSigner } = {}): Promise<{ attestationId: string }> {
  if (!isGrade(input.grade)) throw new AgreementError('invalid_grade');
  const a = await buyerAgreement(db, input.buyerOrg, input.agreementId);
  if (a.status !== 'funded') throw new AgreementError('wrong_state');
  if (!(await deliveredBatchIds(db, a)).includes(input.batchId)) throw new AgreementError('not_delivered');
  const [existing] = await db.select({ id: qualityAttestations.id }).from(qualityAttestations).where(and(eq(qualityAttestations.agreementId, a.id), eq(qualityAttestations.batchId, input.batchId)));
  if (existing) throw new AgreementError('already_graded');
  await getUserPublicKey(input.userId);

  const c = await chainOf(o);
  const domain = c.gradeDomain();
  const message: GradeMessage = { agreementId: a.chainIdHex as Hex, batchIdHash: batchIdHash(input.batchId), grade: input.grade };
  const signature = await (o.sign ?? signGrade)(input.buyerOrg, message, domain);
  const signer = await orgAddress(input.buyerOrg);
  const recovered = await recoverGradeSigner(message, signature, domain).catch(() => null);
  if (recovered?.toLowerCase() !== signer.toLowerCase()) throw new AgreementError('bad_signature');

  const attestationId = newId('QA-', 12);
  const ts = nowOf(o).toISOString();
  await writeTx(db, async (t) => {
    const statement = {
      v: 1,
      attestationId,
      agreementId: a.id,
      batchId: input.batchId,
      grade: input.grade,
      eip712: { signer, signature, chainId: domain.chainId, contract: domain.contract, agreementId: message.agreementId, batchIdHash: message.batchIdHash },
      signedBy: input.userId,
      ts,
    };
    const anchor = await anchorSigned(t, 'quality_attestation', input.userId, statement);
    await t.insert(qualityAttestations).values({
      id: attestationId,
      agreementId: a.id,
      batchId: input.batchId,
      grade: input.grade,
      signerOrg: input.buyerOrg,
      signerAddress: signer,
      eip712Sig: signature,
      signedBy: input.userId,
      createdAt: ts,
      anchorSeq: anchor.seq,
    });
  });
  return { attestationId };
}
