import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFeed } from '../../../evals/scorers/independent-verifier/src';
import { seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { checksWith, seedReviewCapture } from '../../../tests/helpers/review-world';
import { getUserPublicKey } from '../auth/signing-keys';
import { createBatch } from '../batches/create';
import { jcs, jwkThumbprint, verify } from '../crypto';
import { adminOverrides, harvestEvents, ledgerEntries } from '../db/schema';
import { buildFeed } from '../ledger/feed';
import { publishedKeys } from '../ledger/keys';
import { payloadStatement, verifyFeed } from '../ledger/proof';
import { ReviewError } from './errors';
import { overrideRun } from './override';
import { listReviewQueue } from './queue';

// TSK-12.5 · TC-055 · TC-056 · EVAL-075 · EVAL-076: an override needs a public-safe reason, is signed on
// behalf of the admin, anchored as admin_override and recorded in one transaction; a hard-failed run can
// never be overridden (service 409 and the database trigger); a run is decided once. The anchored
// payload is checkable from a proof feed alone, by the app's verifier and the clean-room checker.

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-override-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LEDGER_KEY_PATH', join(dataDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let a: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  a = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: 'Satellite view blocked by cloud for ±30 days (demo data)' } });
const hardFailed = checksWith({ photo_uniqueness: { status: 'fail', hardFail: true, evidence: '1 of 3 photos seen before' } });
const REASON = 'Scale photo checked by the office in person';

async function expectRefusal(p: Promise<unknown>, code: string, status: number) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ReviewError);
  expect(err).toMatchObject({ code, status });
}
const counts = async () => ({ overrides: await t.db.$count(adminOverrides), ledger: await t.db.$count(ledgerEntries) });

describe('overrideRun (TC-055, EVAL-075)', () => {
  it('signs, anchors and records the decision in one transaction; the trigger sets the final verdict', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const r = await overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: `  ${REASON}  ` });
    expect(r.reason).toBe(REASON); // trimmed

    const [row] = await t.db.select().from(adminOverrides).where(eq(adminOverrides.id, r.overrideId));
    expect(row).toMatchObject({ runId: c.runId, adminId: a.adminId, newVerdict: 'Verified', reason: REASON, anchorSeq: r.anchorSeq });
    const [entry] = await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, r.anchorSeq));
    expect(entry!.kind).toBe('admin_override');
    const payload = JSON.parse(entry!.payload) as Record<string, unknown> & { publicJwk: JsonWebKey; kid: string; signature: string };
    expect(Object.keys(payload).sort()).toEqual(['adminId', 'eventId', 'kid', 'newVerdict', 'publicJwk', 'reason', 'runId', 'signature', 'ts', 'v']);
    expect(payload).toMatchObject({ v: 1, runId: c.runId, eventId: c.eventId, newVerdict: 'Verified', reason: REASON, adminId: a.adminId, ts: row!.createdAt });
    expect(Object.keys(payload.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(payload.kid).toBe(await jwkThumbprint(payload.publicJwk));
    expect(payload.kid).toBe(row!.keyId);
    expect(payload.signature).toBe(row!.signature);
    expect(payload.kid).toBe((await getUserPublicKey(a.adminId)).kid);

    const statement = { v: 1, runId: c.runId, eventId: c.eventId, newVerdict: 'Verified', reason: REASON, adminId: a.adminId, ts: row!.createdAt };
    expect(payloadStatement(payload)).toBe(jcs(statement));
    expect(await verify(payload.publicJwk, jcs(statement), payload.signature)).toBe(true);
    expect(await verify(payload.publicJwk, jcs({ ...statement, reason: 'Something else entirely' }), payload.signature)).toBe(false);

    const [e] = await t.db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(eq(harvestEvents.id, c.eventId));
    expect(e!.v).toBe('Verified');
    expect((await listReviewQueue(t.db, a.orgId)).waiting).toEqual([]);
  });

  it('an admin may also mark a picking Not accepted', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    await overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Rejected', reason: 'Photos show a different estate' });
    const [e] = await t.db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(eq(harvestEvents.id, c.eventId));
    expect(e!.v).toBe('Rejected');
  });

  it('refuses a reason under 10 characters or with a phone number (it is public), writing nothing', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const before = await counts();
    const go = (reason: string) => overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason });
    await expectRefusal(go('   too short  '), 'reason_too_short', 400);
    await expectRefusal(go('ok'), 'reason_too_short', 400);
    for (const r of ['Farmer confirmed on 9845012345', 'Call +91 98450 12345 for details', 'Spoke to him at +91-9845012345', 'Account 1234567890 checked', 'Farmer on 98450-12345 confirmed']) {
      await expectRefusal(go(r), 'reason_has_phone', 400);
    }
    expect(await counts()).toEqual(before);
  });

  it('refuses another organisation’s run as unknown (404)', async () => {
    const b = await seedFpo(t.db);
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    await expectRefusal(overrideRun(t.db, { orgId: b.orgId, adminId: b.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON }), 'not_found', 404);
  });

  it('a second override of the same run → 409 already_decided', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    await overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON });
    const before = await counts();
    await expectRefusal(overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Rejected', reason: 'Changed my mind after all' }), 'already_decided', 409);
    expect(await counts()).toEqual(before);
  });
});

describe('a hard-failed rejection cannot be overridden anywhere (TC-056, EVAL-076, CF-06)', () => {
  it('the service answers 409 hard_fail_final and anchors nothing; a raw SQL insert aborts on the trigger', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: hardFailed });
    const before = await counts();
    await expectRefusal(overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON }), 'hard_fail_final', 409);
    expect(await counts()).toEqual(before);

    await expect(
      t.client.execute({
        sql: `INSERT INTO admin_overrides (id, run_id, admin_id, new_verdict, reason, signature, key_id, created_at, anchor_seq) VALUES ('AO-RAW', ?, ?, 'Verified', ?, 'sig', 'kid', ?, 1)`,
        args: [c.runId, a.adminId, REASON, new Date().toISOString()],
      }),
    ).rejects.toThrow('hard-failed run cannot be overridden');
    const [e] = await t.db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(eq(harvestEvents.id, c.eventId));
    expect(e!.v).toBe('Rejected');
  });
});

describe('an override in a proof feed verifies (docs/proof-feed.md §9.2)', () => {
  it('the app verifier and the clean-room checker both verify a batch whose member was overridden', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy, kg: 40 });
    await overrideRun(t.db, { orgId: a.orgId, adminId: a.adminId, runId: c.runId, newVerdict: 'Verified', reason: REASON });
    const batch = await createBatch(t.db, { orgId: a.orgId, adminId: a.adminId, crop: 'arabica', eventIds: [c.eventId] });

    const feed = await buildFeed(t.db, batch.batchId);
    const override = feed.entries.find((e) => e.kind === 'admin_override');
    expect(override?.payload).toMatchObject({ runId: c.runId, eventId: c.eventId, reason: REASON });
    const keys = await publishedKeys();
    expect(await verifyFeed(feed, keys.keys)).toMatchObject({ ok: true });
    const clean = await checkFeed(JSON.parse(JSON.stringify(feed)), keys);
    expect(clean).toMatchObject({ ok: true, verified: feed.entries.length, total: feed.entries.length });
  });
});
