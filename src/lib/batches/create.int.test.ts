import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { getUserPublicKey } from '../auth/signing-keys';
import { jwkThumbprint, verify } from '../crypto';
import { batchEvents, batches, ledgerEntries } from '../db/schema';
import { buildFeed } from '../ledger/feed';
import { publishedKeys } from '../ledger/keys';
import { payloadStatement, verifyFeed } from '../ledger/proof';
import { BatchError, createBatch } from './create';

// TSK-14.3 (TC-059 through the action, EVAL-077): a batch is built from Verified pickings of one crop,
// anchored with its members in a signed batch_created entry, and its feed verifies.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-create-batch-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const counts = async () => ({
  ledger: await t.db.$count(ledgerEntries),
  batches: await t.db.$count(batches),
  members: await t.db.$count(batchEvents),
});

async function expectCode(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BatchError);
  expect((err as BatchError).code).toBe(code);
}

describe('createBatch', () => {
  it('three Verified arabica pickings → one batch with Σ kg and the minimum score, anchored and signed', async () => {
    const caps = [await seedCapture(t.db, w, { kg: 40, score: 91.5 }), await seedCapture(t.db, w, { kg: 42.5, score: 84 }), await seedCapture(t.db, w, { kg: 46, score: 97 })];
    const now = () => new Date('2026-10-01T05:30:00.000Z');
    const out = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) }, now);

    expect(out.batchId).toMatch(/^B-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(out.quantityKg).toBe(128.5);
    expect(out.integrityScore).toBe(84);

    const [entry] = await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, out.anchorSeq));
    expect(entry!.kind).toBe('batch_created');
    expect(out.shortHash).toBe(entry!.entryHash.slice(0, 12));
    const payload = JSON.parse(entry!.payload) as Record<string, unknown>;
    const sorted = [...caps].sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
    expect(payload).toEqual({
      v: 1,
      batchId: out.batchId,
      orgId: w.orgId,
      crop: 'arabica',
      events: sorted.map((c) => ({ eventId: c.eventId, payloadHash: c.payloadHash })),
      quantityKg: 128.5,
      integrityScore: 84,
      adminId: w.adminId,
      ts: '2026-10-01T05:30:00.000Z',
      kid: expect.any(String),
      publicJwk: expect.any(Object),
      signature: expect.any(String),
    });
    // signed by the server on behalf of the admin (TP15): kid = RFC 7638 thumbprint of publicJwk
    const admin = await getUserPublicKey(w.adminId);
    expect(payload.kid).toBe(admin.kid);
    expect(payload.publicJwk).toEqual(admin.publicJwk);
    expect(await jwkThumbprint(payload.publicJwk as JsonWebKey)).toBe(payload.kid);
    expect(await verify(admin.publicJwk, payloadStatement(payload), payload.signature as string)).toBe(true);

    const [row] = await t.db.select().from(batches);
    expect(row).toMatchObject({ id: out.batchId, orgId: w.orgId, crop: 'arabica', status: 'open', quantityKg: 128.5, integrityScore: 84, shortHash: out.shortHash, anchorSeq: out.anchorSeq, createdAt: '2026-10-01T05:30:00.000Z' });
    expect((await t.db.select().from(batchEvents)).map((m) => m.eventId).sort()).toEqual(sorted.map((c) => c.eventId));
  });

  it("the batch's proof feed verifies, including the batch_created payload signature", async () => {
    const caps = [await seedCapture(t.db, w, { kg: 40 }), await seedCapture(t.db, w, { kg: 42.5 })];
    const out = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) });
    const feed = await buildFeed(t.db, out.batchId);
    expect(feed.shortHash).toBe(out.shortHash);
    expect(await verifyFeed(feed, (await publishedKeys()).keys)).toMatchObject({ ok: true });
  }, 30_000);

  it('a Needs Review picking → not_eligible, and nothing is persisted', async () => {
    const ok = await seedCapture(t.db, w, { kg: 40 });
    const review = await seedCapture(t.db, w, { kg: 30, verdict: 'Needs Review', score: 70 });
    const before = await counts();
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [ok.eventId, review.eventId] }), 'not_eligible');
    expect(await counts()).toEqual(before);
  });

  it('mixed crops → mixed_crop, and nothing is persisted', async () => {
    const a = await seedCapture(t.db, w, { crop: 'arabica', kg: 40 });
    const r = await seedCapture(t.db, w, { crop: 'robusta', kg: 30 });
    const before = await counts();
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId, r.eventId] }), 'mixed_crop');
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [r.eventId] }), 'mixed_crop');
    expect(await counts()).toEqual(before);
  });

  it("another organisation's picking, an unknown id or an already batched picking → not_eligible", async () => {
    const other = await seedFpo(t.db);
    const theirs = await seedCapture(t.db, other, { kg: 40 });
    const mine = await seedCapture(t.db, w, { kg: 40 });
    const before = await counts();
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [theirs.eventId] }), 'not_eligible');
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [mine.eventId, 'HE-NOPE'] }), 'not_eligible');
    expect(await counts()).toEqual(before);

    await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [mine.eventId] });
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [mine.eventId] }), 'not_eligible');
  });

  it('no pickings → empty; a repeated id counts once', async () => {
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [] }), 'empty');
    const a = await seedCapture(t.db, w, { kg: 40 });
    const out = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId, a.eventId] });
    expect(out.quantityKg).toBe(40);
  });

  it('an over-long event id is refused (not dropped), with nothing persisted (fix round 1)', async () => {
    const a = await seedCapture(t.db, w, { kg: 40 });
    const before = await counts();
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId, 'HE-'.padEnd(65, 'X')] }), 'not_eligible');
    expect(await counts()).toEqual(before);
  });

  it('kilograms are summed exactly in half-kg units; a picking that is not a multiple of 0.5 kg cannot go in a batch (fix round 1)', async () => {
    // 0.5-kg steps are the capture rule (capture/payload.ts); a JS float sum of such values is exact
    const halves = [await seedCapture(t.db, w, { kg: 0.5 }), await seedCapture(t.db, w, { kg: 20.5 }), await seedCapture(t.db, w, { kg: 147 })];
    const out = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: halves.map((c) => c.eventId) });
    expect(out.quantityKg).toBe(168);
    // written outside the capture boundary: 73.8 + 33.1 + 61.2 sums differently in JS and SQLite
    const odd = [await seedCapture(t.db, w, { kg: 73.8 }), await seedCapture(t.db, w, { kg: 33.1 }), await seedCapture(t.db, w, { kg: 61.2 })];
    const before = await counts();
    await expectCode(createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: odd.map((c) => c.eventId) }), 'not_eligible');
    expect(await counts()).toEqual(before);
  });

  it('concurrent batches over the same picking: exactly one wins, the other is not_eligible', async () => {
    const a = await seedCapture(t.db, w, { kg: 40 });
    const results = await Promise.allSettled([
      createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] }),
      createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [a.eventId] }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((lost.reason as BatchError).code).toBe('not_eligible');
    expect(await t.db.$count(batches)).toBe(1);
  });
});
