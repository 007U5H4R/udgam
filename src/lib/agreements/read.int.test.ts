import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from '../batches/create';
import { transferBatch } from '../custody/transfer';
import { writeTx } from '../db/client';
import { user } from '../db/schema';
import { newId } from '../ids';
import { getAgreementView, listBuyerAgreements, listFpoAgreements } from './read';
import { createAgreement, fundAgreement, gradeBatch } from './service';
import { settleBatch } from './settle';
import { createFakeChain, type FakeChain } from './testing/fake-chain';

// Stage 9 CR-204: the agreement list pages read a page of agreements in a fixed number of statements,
// however many agreements and delivered batches it holds (no per-agreement or per-batch queries).

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-read-int-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let buyerOrg: string;
let buyerUser: string;
let chain: FakeChain;
const batchIds: string[] = [];
const o = () => ({ chain: async () => chain });

/** One 512 kg arabica batch (two 256 kg pickings), handed to the buyer. */
async function deliveredBatch(): Promise<string> {
  const caps = [await seedCapture(t.db, w, { kg: 256 }), await seedCapture(t.db, w, { kg: 256 })];
  const { batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
  await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
  return batchId;
}

const terms = (agreedKg: number) => ({ fpoOrg: '', crop: 'arabica' as const, agreedKg, minGrade: 80 as const, amountPaise: 5_000_000, deadlineDate: '2099-12-31' });
async function funded(agreedKg: number): Promise<string> {
  const { agreementId } = await createAgreement(t.db, { buyerOrg, userId: buyerUser, values: { ...terms(agreedKg), fpoOrg: w.orgId } }, o());
  await fundAgreement(t.db, { buyerOrg, userId: buyerUser, agreementId }, o());
  return agreementId;
}

/** How many SQL statements `fn` sends to the database. */
async function statements<T>(fn: () => Promise<T>): Promise<{ n: number; value: T }> {
  const spy = vi.spyOn(t.client, 'execute');
  try {
    const value = await fn();
    return { n: spy.mock.calls.length, value };
  } finally {
    spy.mockRestore();
  }
}

beforeEach(async () => {
  t = await tempDb();
  chain = createFakeChain();
  w = await seedFpo(t.db);
  buyerOrg = await seedBuyer(t.db);
  buyerUser = newId('USR-');
  await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@b.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
  batchIds.length = 0;
  batchIds.push(await deliveredBatch());
}, 60_000);
afterEach(async () => {
  await t.cleanup();
});

describe('agreement list reads are batched (Stage 9 CR-204)', () => {
  it('a page costs the same number of statements for 1 agreement × 1 batch as for 3 agreements × 3 batches', async () => {
    const first = await funded(500);
    const small = await statements(() => listBuyerAgreements(t.db, buyerOrg));
    expect(small.value.map((v) => v.row.id)).toEqual([first]);
    expect(small.value[0]!.delivered.map((b) => b.batchId)).toEqual(batchIds);

    batchIds.push(await deliveredBatch(), await deliveredBatch());
    const second = await funded(600);
    await funded(400);
    // a graded and judged batch on the second agreement: settlements and grades are read too
    await gradeBatch(t.db, { buyerOrg, userId: buyerUser, agreementId: second, batchId: batchIds[0]!, grade: 90 }, o());
    await settleBatch(t.db, { fpoOrg: w.orgId, userId: w.adminId, agreementId: second, batchId: batchIds[0]! }, o());

    const big = await statements(() => listBuyerAgreements(t.db, buyerOrg));
    expect(big.value).toHaveLength(3);
    expect(big.value.map((v) => v.delivered.length)).toEqual([3, 3, 3]);
    expect(big.n).toBe(small.n);
    expect(big.n).toBeLessThanOrEqual(9);
    expect((await statements(() => listFpoAgreements(t.db, w.orgId))).n).toBe(small.n);
  });

  it('each agreement on the page carries its own facts, grade, delivery time and settlements', async () => {
    batchIds.push(await deliveredBatch());
    const judged = await funded(600);
    const open = await funded(500);
    await gradeBatch(t.db, { buyerOrg, userId: buyerUser, agreementId: judged, batchId: batchIds[1]!, grade: 90 }, o());
    const out = await settleBatch(t.db, { fpoOrg: w.orgId, userId: w.adminId, agreementId: judged, batchId: batchIds[1]! }, o());
    expect(out.outcome).toBe('not_released');

    const page = await listFpoAgreements(t.db, w.orgId);
    const byId = new Map(page.map((v) => [v.row.id, v]));
    const j = byId.get(judged)!;
    const op = byId.get(open)!;
    expect(j.delivered.map((b) => [b.batchId, b.deliveredKg, b.pickings, b.verifiedPickings, b.grade])).toEqual([
      [batchIds[0], 512, 2, 2, null],
      [batchIds[1], 512, 2, 2, 90],
    ]);
    expect(op.delivered.map((b) => [b.batchId, b.grade])).toEqual([
      [batchIds[0], null],
      [batchIds[1], null],
    ]);
    expect(j.delivered.every((b) => b.deliveredAt !== '' && b.shortHash !== '')).toBe(true);
    expect(j.settlements.map((s) => [s.id, s.batchId, s.outcome, s.reasons.map((r) => r.condition)])).toEqual([[out.settlementId, batchIds[1], 'not_released', ['quantity']]]);
    expect(op.settlements).toEqual([]);
    expect(j.delivered[1]!.conditions.map((c) => [c.condition, c.met])).toEqual([
      ['quantity', false],
      ['grade', true],
      ['all_verified', true],
    ]);
    // the detail page's single-agreement read agrees with the list
    expect(await getAgreementView(t.db, 'fpo', w.orgId, judged)).toEqual(j);
  });
});
