import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { writeTx } from '../db/client';
import { agreements, ledgerEntries, user } from '../db/schema';
import { newId } from '../ids';
import type { Grade } from './grades';
import { createBatch } from '../batches/create';
import { transferBatch } from '../custody/transfer';
import { fundFromForm, gradeFromForm, settleFromForm } from './actions';
import { ChainError } from './chain';
import { AgreementError, createAgreement, fundAgreement, gradeBatch, refundAgreement } from './service';
import { createFakeChain, type FakeChain } from './testing/fake-chain';

// Review minors (TASK-26 fix round 1) through the agreement service against an in-memory chain: a
// concurrent double fund or refund finds the work done and reports success, recording it once; an
// invalid grade is refused as invalid_grade.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-agreements-service-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let buyerOrg: string;
let buyerUser: string;
let chain: FakeChain;
// the clock both the service and the chain read: before the deadline, then after it for a refund
let now = new Date('2026-10-05T06:00:00.000Z');
const o = () => ({ chain: async () => chain, now: () => now });

beforeEach(async () => {
  t = await tempDb();
  now = new Date('2026-10-05T06:00:00.000Z');
  chain = createFakeChain({ nowSeconds: () => BigInt(Math.floor(now.getTime() / 1000)) });
  w = await seedFpo(t.db);
  buyerOrg = await seedBuyer(t.db);
  buyerUser = newId('USR-');
  await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@b.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
}, 40_000);
afterEach(async () => {
  await t.cleanup();
});

async function created(): Promise<string> {
  const { agreementId } = await createAgreement(
    t.db,
    { buyerOrg, userId: buyerUser, values: { fpoOrg: w.orgId, crop: 'arabica', agreedKg: 500, minGrade: 80, amountPaise: 5_000_000, deadlineDate: '2026-12-31' } },
    o(),
  );
  return agreementId;
}
const action = (agreementId: string) => ({ buyerOrg, userId: buyerUser, agreementId });
const row = async (id: string) => (await t.db.select().from(agreements).where(eq(agreements.id, id)))[0]!;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof AgreementError ? e.code : String(e)),
  );

describe('double submits are idempotent (review minor 6)', () => {
  it('a concurrent double fund: both requests succeed, the money moves once and is recorded once', async () => {
    const id = await created();
    expect(await Promise.all([code(fundAgreement(t.db, action(id), o())), code(fundAgreement(t.db, action(id), o()))])).toEqual(['ok', 'ok']);
    const funded = chain.events.filter((e) => e.name === 'Funded');
    expect(funded).toHaveLength(1);
    expect(await row(id)).toMatchObject({ status: 'funded', fundedTxHash: funded[0]!.tx.txHash });
    expect(await t.db.$count(ledgerEntries, eq(ledgerEntries.kind, 'agreement_funded'))).toBe(1);
  });

  it('a concurrent double refund after the deadline: both succeed, refunded and recorded once', async () => {
    const id = await created();
    await fundAgreement(t.db, action(id), o());
    now = new Date('2027-01-02T06:00:00.000Z');
    expect(await Promise.all([code(refundAgreement(t.db, action(id), o())), code(refundAgreement(t.db, action(id), o()))])).toEqual(['ok', 'ok']);
    const refunded = chain.events.filter((e) => e.name === 'Refunded');
    expect(refunded).toHaveLength(1);
    expect(await row(id)).toMatchObject({ status: 'refunded', closedTxHash: refunded[0]!.tx.txHash });
    expect(await t.db.$count(ledgerEntries, eq(ledgerEntries.kind, 'agreement_refunded'))).toBe(1);
  });

  it('a fund that the chain turns away for another reason is still refused', async () => {
    const id = await created();
    now = new Date('2027-01-02T06:00:00.000Z'); // past the deadline: the service refuses before any send
    expect(await code(fundAgreement(t.db, action(id), o()))).toBe('deadline_passed');
    expect(chain.sends.fund).toBe(0);
  });
});

describe('grade codes (review nit)', () => {
  it('a grade off the five-label scale is invalid_grade, not wrong_state', async () => {
    const id = await created();
    expect(await code(gradeBatch(t.db, { ...action(id), batchId: 'B-ANY', grade: 85 as Grade }, o()))).toBe('invalid_grade');
  });
});

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('action outcomes (review minor 5, spec minors 1 and 6)', () => {
  it('a stale screen is "changed", not "the ledger didn’t answer": fund twice, grade twice', async () => {
    const id = await created();
    const me = { orgId: buyerOrg, userId: buyerUser };
    expect(await fundFromForm(t.db, me, form({ agreementId: id }), o())).toEqual({ ok: true, agreementId: id });
    expect(await fundFromForm(t.db, me, form({ agreementId: id }), o())).toEqual({ ok: false, state: { failure: 'changed' } });
    const caps = [await seedCapture(t.db, w, { kg: 256 }), await seedCapture(t.db, w, { kg: 256 })];
    const { batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
    expect(await gradeFromForm(t.db, me, form({ agreementId: id, batchId, grade: '90' }), o())).toEqual({ ok: true, agreementId: id });
    expect(await gradeFromForm(t.db, me, form({ agreementId: id, batchId, grade: '80' }), o())).toEqual({ ok: false, state: { failure: 'changed', values: { grade: '80' } } });
    expect(chain.sends.fund).toBe(1);
  });

  it('a settle the ledger turns away is "turned_away": nothing recorded, the agreement stays funded', async () => {
    const id = await created();
    await fundAgreement(t.db, action(id), o());
    const caps = [await seedCapture(t.db, w, { kg: 256 }), await seedCapture(t.db, w, { kg: 256 })];
    const { batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
    await gradeBatch(t.db, { ...action(id), batchId, grade: 90 }, o());
    chain.settle = async () => {
      throw new ChainError('turned_away', 'BadGradeSignature');
    };
    expect(await settleFromForm(t.db, { orgId: w.orgId, userId: w.adminId }, form({ agreementId: id, batchId }), o())).toEqual({ ok: false, state: { failure: 'turned_away' } });
    expect(await row(id)).toMatchObject({ status: 'funded', closedTxHash: null });
    expect(await t.db.$count(ledgerEntries, eq(ledgerEntries.kind, 'settlement'))).toBe(0);
  });
});
