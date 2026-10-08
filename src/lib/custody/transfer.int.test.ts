import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { getUserPublicKey } from '../auth/signing-keys';
import { createBatch, type CreatedBatch } from '../batches/create';
import { jcs, jwkThumbprint, verify } from '../crypto';
import { batches, custodyTransfers, ledgerEntries } from '../db/schema';
import { buildFeed } from '../ledger/feed';
import { publishedKeys } from '../ledger/keys';
import { payloadStatement, verifyFeed } from '../ledger/proof';
import { CustodyError, transferBatch } from './transfer';

// TSK-14.4 (TC-060, TC-059 lock part, EVAL-077): a custody transfer is signed on behalf of the admin,
// anchored, and locks the batch.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-transfer-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
let b: CreatedBatch;
let buyer: string;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
  const caps = [await seedCapture(t.db, w, { kg: 40, score: 91 }), await seedCapture(t.db, w, { kg: 42.5, score: 86 })];
  b = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
  buyer = await seedBuyer(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CustodyError);
  expect((err as CustodyError).code).toBe(code);
}

const counts = async () => ({ ledger: await t.db.$count(ledgerEntries), custody: await t.db.$count(custodyTransfers) });

describe('transferBatch (TC-060)', () => {
  it('records a custody row whose signature verifies against the admin key, anchors custody_transfer and locks the batch', async () => {
    const out = await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyer }, () => new Date('2026-10-02T06:00:00.000Z'));
    expect(out.transferId).toMatch(/^CT-/);

    const [row] = await t.db.select().from(custodyTransfers).where(eq(custodyTransfers.id, out.transferId));
    expect(row).toMatchObject({ batchId: b.batchId, fromOrg: w.orgId, toOrg: buyer, adminId: w.adminId, anchorSeq: out.anchorSeq, transferredAt: '2026-10-02T06:00:00.000Z' });
    const admin = await getUserPublicKey(w.adminId);
    expect(row!.keyId).toBe(admin.kid);
    const statement = jcs({ v: 1, batchId: b.batchId, fromOrg: w.orgId, toOrg: buyer, ts: '2026-10-02T06:00:00.000Z', adminId: w.adminId });
    expect(await verify(admin.publicJwk, statement, row!.signature)).toBe(true);

    const [entry] = await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, out.anchorSeq));
    expect(entry!.kind).toBe('custody_transfer');
    const payload = JSON.parse(entry!.payload) as Record<string, unknown>;
    expect(payload).toEqual({
      v: 1,
      batchId: b.batchId,
      fromOrg: w.orgId,
      toOrg: buyer,
      ts: '2026-10-02T06:00:00.000Z',
      adminId: w.adminId,
      kid: admin.kid,
      publicJwk: admin.publicJwk,
      signature: row!.signature,
    });
    expect(await jwkThumbprint(payload.publicJwk as JsonWebKey)).toBe(payload.kid);
    expect(await verify(admin.publicJwk, payloadStatement(payload), payload.signature as string)).toBe(true);

    const [batch] = await t.db.select().from(batches).where(eq(batches.id, b.batchId));
    expect(batch).toMatchObject({ status: 'transferred', quantityKg: 82.5, integrityScore: 86 });
    // locked: the database refuses any further change
    await expect(t.client.execute({ sql: `UPDATE batches SET status = 'open' WHERE id = ?`, args: [b.batchId] })).rejects.toThrow(/locked after transfer/);
  });

  it('the proof feed after the transfer verifies, custody chain included', async () => {
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyer });
    const feed = await buildFeed(t.db, b.batchId);
    expect(feed.entries.filter((e) => e.kind === 'custody_transfer')).toHaveLength(1);
    expect(await verifyFeed(feed, (await publishedKeys()).keys)).toMatchObject({ ok: true });
  }, 30_000);

  it('a second transfer → not_open, with nothing written', async () => {
    await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyer });
    const before = await counts();
    await expectCode(transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: await seedBuyer(t.db) }), 'not_open');
    expect(await counts()).toEqual(before);
  });

  it('to a processor organisation (M-002, T4): recorded, anchored and the batch locks, as for a buyer', async () => {
    const processor = await seedBuyer(t.db, 'processor');
    const out = await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: processor });
    const [row] = await t.db.select().from(custodyTransfers).where(eq(custodyTransfers.id, out.transferId));
    expect(row).toMatchObject({ fromOrg: w.orgId, toOrg: processor, anchorSeq: out.anchorSeq });
    const [batch] = await t.db.select({ status: batches.status }).from(batches).where(eq(batches.id, b.batchId));
    expect(batch!.status).toBe('transferred');
  });

  it('to an FPO or an unknown organisation → not_buyer, with nothing written', async () => {
    const before = await counts();
    await expectCode(transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: await seedBuyer(t.db, 'fpo') }), 'not_buyer');
    await expectCode(transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: 'ORG-NOPE' }), 'not_buyer');
    await expectCode(transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: w.orgId }), 'not_buyer');
    expect(await counts()).toEqual(before);
  });

  it("another organisation's batch or an unknown batch → not_found", async () => {
    const other = await seedFpo(t.db);
    const before = await counts();
    await expectCode(transferBatch(t.db, { orgId: other.orgId, adminId: other.adminId, batchId: b.batchId, toOrgId: buyer }), 'not_found');
    await expectCode(transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: 'B-NOPE0000', toOrgId: buyer }), 'not_found');
    expect(await counts()).toEqual(before);
  });

  it('two concurrent transfers: exactly one wins, the other is not_open', async () => {
    const other = await seedBuyer(t.db);
    const results = await Promise.allSettled([
      transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: buyer }),
      transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId: b.batchId, toOrgId: other }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as CustodyError).code).toBe('not_open');
    expect(await t.db.$count(custodyTransfers)).toBe(1);
  });
});
