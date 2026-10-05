import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type Capture, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from '../batches/create';
import { transferBatch } from '../custody/transfer';
import { writeTx } from '../db/client';
import { agreements, harvestEvents, settlements, user } from '../db/schema';
import { newId } from '../ids';
import { overrideRun } from '../review/override';
import { agreementChainId } from './attestor-keys';
import { ChainError } from './chain';
import { AgreementError, createAgreement, fundAgreement, gradeBatch } from './service';
import { settleBatch } from './settle';
import { createFakeChain, type FakeChain } from './testing/fake-chain';

// Review fixes (TASK-26 fix round 1) through the settlement service against an in-memory chain:
// a release whose DB record failed is recovered from the chain and recorded once, with nothing new
// sent; one delivered batch pays out once across agreements, also when settled concurrently.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-settle-int-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let buyerOrg: string;
let buyerUser: string;
let batchId: string;
let chain: FakeChain;
let caps: Capture[];
const o = () => ({ chain: async () => chain });

beforeEach(async () => {
  t = await tempDb();
  chain = createFakeChain();
  w = await seedFpo(t.db);
  buyerOrg = await seedBuyer(t.db);
  buyerUser = newId('USR-');
  await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@b.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
  caps = [await seedCapture(t.db, w, { kg: 256 }), await seedCapture(t.db, w, { kg: 256 })];
  ({ batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) }));
  await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
}, 40_000);
afterEach(async () => {
  await t.cleanup();
});

/** A 500 kg, minimum Very good · 80, ₹50,000.00 agreement, funded, with the batch graded Excellent · 90. */
async function fundedAndGraded(): Promise<string> {
  const { agreementId } = await createAgreement(
    t.db,
    { buyerOrg, userId: buyerUser, values: { fpoOrg: w.orgId, crop: 'arabica', agreedKg: 500, minGrade: 80, amountPaise: 5_000_000, deadlineDate: '2099-12-31' } },
    o(),
  );
  await fundAgreement(t.db, { buyerOrg, userId: buyerUser, agreementId }, o());
  await gradeBatch(t.db, { buyerOrg, userId: buyerUser, agreementId, batchId, grade: 90 }, o());
  return agreementId;
}

const settle = (agreementId: string) => settleBatch(t.db, { fpoOrg: w.orgId, userId: w.adminId, agreementId, batchId }, o());
const released = () => t.db.$count(settlements, and(eq(settlements.batchId, batchId), eq(settlements.outcome, 'released')));
const statusOf = async (id: string) => (await t.db.select({ s: agreements.status }).from(agreements).where(eq(agreements.id, id)))[0]!.s;
const failure = (e: unknown) => (e instanceof AgreementError ? e.code : e instanceof ChainError ? `${e.kind}:${e.reason}` : 'db');

describe('settle recovery (review MAJOR 1)', () => {
  it('records a release the chain made but the DB missed, exactly once, sending nothing new', async () => {
    const id = await fundedAndGraded();
    // the first writeTx after the chain call fails (as if the process died after the receipt)
    await t.client.execute(`CREATE TEMP TRIGGER fail_settlement BEFORE INSERT ON settlements BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    const first = await settle(id).then(
      () => 'ok',
      (e: unknown) => failure(e),
    );
    expect(first).toBe('db');
    expect(chain.sends.settle).toBe(1);
    expect(await chain.status(agreementChainId(id))).toBe('settled');
    expect(await released()).toBe(0);
    expect(await statusOf(id)).toBe('funded');
    await t.client.execute('DROP TRIGGER fail_settlement');

    const retry = await settle(id);
    const paid = chain.events.filter((e) => e.name === 'Settled');
    expect(paid).toHaveLength(1);
    expect(retry).toMatchObject({ outcome: 'released', reasons: [], txHash: paid[0]!.tx.txHash, blockNumber: paid[0]!.tx.blockNumber });
    expect(chain.sends.settle).toBe(1);
    expect(await released()).toBe(1);
    expect(await statusOf(id)).toBe('settled');
    // and once recorded, another settle is a stale request
    expect(await settle(id).catch((e: unknown) => failure(e))).toBe('wrong_state');
    expect(chain.sends.settle).toBe(1);
  });

  // TKT-25 quality review r2 minor 1 (follow-up 2): a recovered release is recorded with the facts that were
  // SENT to the chain (read back from its settle call), never with facts re-read at retry time.
  async function lostRelease(id: string) {
    await t.client.execute(`CREATE TEMP TRIGGER fail_settlement BEFORE INSERT ON settlements BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    expect(await settle(id).catch((e: unknown) => failure(e))).toBe('db');
    expect(await chain.status(agreementChainId(id))).toBe('settled');
    await t.client.execute('DROP TRIGGER fail_settlement');
  }
  const recorded = async (id: string) => {
    const [row] = await t.db.select().from(settlements).where(eq(settlements.agreementId, id));
    const entry = (await t.client.execute({ sql: `SELECT payload FROM ledger_entries WHERE seq = ?`, args: [row!.anchorSeq] })).rows[0]!;
    return { row: row!, statement: JSON.parse(String(entry.payload)) as Record<string, unknown> };
  };

  it('an admin override between the lost write and the retry cannot change the recorded release (refused: batched verdicts are frozen)', async () => {
    const id = await fundedAndGraded();
    await lostRelease(id);
    await expect(
      overrideRun(t.db, { orgId: w.orgId, adminId: w.adminId, runId: caps[0]!.runId, newVerdict: 'Rejected', reason: 'Scale photo does not match the weight' }),
    ).rejects.toThrow();
    await settle(id);
    const { row, statement } = await recorded(id);
    expect(row).toMatchObject({ outcome: 'released', allVerified: true, pickings: 2, verifiedPickings: 2, grade: 90, deliveredKg: 512 });
    expect(statement).toMatchObject({ outcome: 'released', allVerified: true, pickings: 2, verifiedPickings: 2, grade: 90, deliveredKg: 512, reasons: [] });
  });

  it('even if a verdict changed after the release was sent, the recovered release records what was sent (no self-contradiction)', async () => {
    const id = await fundedAndGraded();
    await lostRelease(id);
    // A writer that bypasses the frozen-verdict guard (simulated: the guard is dropped in this temp database).
    await t.client.execute('DROP TRIGGER harvest_events_batched_frozen');
    await writeTx(t.db, (tx) => tx.update(harvestEvents).set({ finalVerdict: 'Needs Review' }).where(eq(harvestEvents.id, caps[0]!.eventId)).then(() => undefined));
    const retry = await settle(id);
    expect(retry.outcome).toBe('released');
    expect(chain.sends.settle).toBe(1);
    const { row, statement } = await recorded(id);
    expect(row).toMatchObject({ outcome: 'released', allVerified: true, pickings: 2, verifiedPickings: 2, grade: 90 });
    expect(statement).toMatchObject({ outcome: 'released', allVerified: true, pickings: 2, verifiedPickings: 2, grade: 90 });
  });

  it('a concurrent double settle of one agreement records one release and both requests see it', async () => {
    const id = await fundedAndGraded();
    const [a, b] = await Promise.all([settle(id), settle(id)]);
    expect(a.outcome).toBe('released');
    expect(b.settlementId).toBe(a.settlementId);
    expect(await released()).toBe(1);
    expect(chain.events.filter((e) => e.name === 'Settled')).toHaveLength(1);
  });
});

describe('one batch, one payout (review MAJOR 2)', () => {
  it('settling two agreements on one batch concurrently gives exactly one release', async () => {
    const a = await fundedAndGraded();
    const b = await fundedAndGraded();
    const outs = await Promise.allSettled([settle(a), settle(b)]);
    const ok = outs.filter((r) => r.status === 'fulfilled');
    const refused = outs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect((ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof settle>>>).value.outcome).toBe('released');
    expect(refused.map((r) => failure(r.reason))).toEqual(['turned_away:BatchAlreadyReleased']);
    expect(await released()).toBe(1);
    expect(chain.events.filter((e) => e.name === 'Settled')).toHaveLength(1);
    expect([await statusOf(a), await statusOf(b)].sort()).toEqual(['funded', 'settled']);
  });

  it('after a release, the batch is no longer offered under another agreement', async () => {
    const a = await fundedAndGraded();
    const b = await fundedAndGraded();
    await settle(a);
    expect(await settle(b).catch((e: unknown) => failure(e))).toBe('not_delivered');
    expect(chain.sends.settle).toBe(1);
  });
});

describe('T3: the agreement card on a delivered batch (spec review minor 7)', () => {
  it('appears once the batch is delivered under an agreement, waiting for the grade, then follows it', async () => {
    const { agreementForBatch } = await import('./read');
    const { agreementId } = await createAgreement(
      t.db,
      { buyerOrg, userId: buyerUser, values: { fpoOrg: w.orgId, crop: 'arabica', agreedKg: 500, minGrade: 80, amountPaise: 5_000_000, deadlineDate: '2099-12-31' } },
      o(),
    );
    expect(await agreementForBatch(t.db, w.orgId, batchId)).toMatchObject({ agreementId, status: 'Buyer hasn’t funded it yet' });
    await fundAgreement(t.db, { buyerOrg, userId: buyerUser, agreementId }, o());
    expect(await agreementForBatch(t.db, w.orgId, batchId)).toMatchObject({ agreementId, status: 'Waiting for the grade' });
    await gradeBatch(t.db, { buyerOrg, userId: buyerUser, agreementId, batchId, grade: 90 }, o());
    expect(await agreementForBatch(t.db, w.orgId, batchId)).toMatchObject({ agreementId, status: 'Ready to settle' });
    await settle(agreementId);
    expect((await agreementForBatch(t.db, w.orgId, batchId))?.status).toMatch(/^Payment released · \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    // another FPO sees nothing for this batch
    expect(await agreementForBatch(t.db, 'ORG-OTHER', batchId)).toBeNull();
  });
});
