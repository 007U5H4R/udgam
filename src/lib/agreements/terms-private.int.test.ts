// @vitest-environment node
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFeed } from '../../../evals/scorers/independent-verifier/src';
import { seedBuyer, seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { createBatch } from '../batches/create';
import { transferBatch } from '../custody/transfer';
import { writeTx } from '../db/client';
import { batches, ledgerEntries, user } from '../db/schema';
import { newId } from '../ids';
import { closureSeqs } from '../ledger/closure';
import { buildFeed } from '../ledger/feed';
import { publishedKeys } from '../ledger/keys';
import { verifyFeed } from '../ledger/proof';
import { createAgreement, fundAgreement, gradeBatch } from './service';
import { settleBatch } from './settle';
import { createFakeChain, type FakeChain } from './testing/fake-chain';

// Review MAJOR 3 (Design.md §28.4: commercial terms are private). An agreement with sentinel terms —
// 777.7 kg agreed, minimum Very good · 80, ₹4,242.00, deadline 17 Mar 2099 — is graded and judged
// not released on both quantity and grade. No payload in the batch's closure, and nothing the public
// route /api/verify/[batchId] answers, carries any of those terms; the settlement names its conditions
// by code with the observed values only. Both verifiers still accept the feed (S6-lib).

const AGREED_KG = 777.7;
const MIN_GRADE = 80;
const AMOUNT_PAISE = 424_200;
const DEADLINE_DATE = '2099-03-17';

let t: TempDb;
let w: FpoWorld;
let buyerOrg: string;
let buyerUser: string;
let batchId: string;
let chain: FakeChain;

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  chain = createFakeChain();
  w = await seedFpo(t.db);
  buyerOrg = await seedBuyer(t.db);
  buyerUser = newId('USR-');
  await writeTx(t.db, (tx) => tx.insert(user).values({ id: buyerUser, name: 'Buyer', email: `${buyerUser.toLowerCase()}@b.test`, role: 'buyer', orgId: buyerOrg }).then(() => undefined));
  const caps = [await seedCapture(t.db, w, { kg: 256 }), await seedCapture(t.db, w, { kg: 256 })];
  ({ batchId } = await createBatch(t.db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) }));
  await transferBatch(t.db, { orgId: w.orgId, adminId: w.adminId, batchId, toOrgId: buyerOrg });
}, 40_000);
afterEach(async () => {
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

/** Every key in a JSON value, and every primitive leaf with the key it sits under. */
function walk(v: unknown, key = '', out: { keys: string[]; leaves: { key: string; value: unknown }[] } = { keys: [], leaves: [] }) {
  if (Array.isArray(v)) for (const x of v) walk(x, key, out);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.keys.push(k);
      walk(x, k, out);
    }
  else out.leaves.push({ key, value: v });
  return out;
}

function expectNoTerms(payload: unknown, where: string) {
  const { keys, leaves } = walk(payload);
  for (const k of ['agreedKg', 'agreedGrams', 'minGrade', 'amountPaise', 'amount', 'deadline', 'terms']) expect(keys, where).not.toContain(k);
  for (const { key, value } of leaves) {
    if (typeof value === 'number') expect([AGREED_KG, AMOUNT_PAISE, AMOUNT_PAISE / 100], `${where}: ${key}`).not.toContain(value);
    if (typeof value === 'string') {
      for (const term of ['777.7', '4,242', DEADLINE_DATE, 'agreed', 'minimum', 'Very good']) expect(value, `${where}: ${key}`).not.toContain(term);
    }
  }
}

describe('agreement terms stay out of the public proof feed (review MAJOR 3)', () => {
  it('no closure payload and no /api/verify answer carries the agreed kg, minimum grade, price or deadline', async () => {
    const o = { chain: async () => chain };
    const { agreementId } = await createAgreement(
      t.db,
      { buyerOrg, userId: buyerUser, values: { fpoOrg: w.orgId, crop: 'arabica', agreedKg: AGREED_KG, minGrade: MIN_GRADE, amountPaise: AMOUNT_PAISE, deadlineDate: DEADLINE_DATE } },
      o,
    );
    await fundAgreement(t.db, { buyerOrg, userId: buyerUser, agreementId }, o);
    await gradeBatch(t.db, { buyerOrg, userId: buyerUser, agreementId, batchId, grade: 70 }, o);
    const out = await settleBatch(t.db, { fpoOrg: w.orgId, userId: w.adminId, agreementId, batchId }, o);
    // the caller (the private screen) still gets value vs threshold
    expect(out.outcome).toBe('not_released');
    expect(out.reasons).toEqual([
      { condition: 'quantity', text: 'Delivered 512.0 kg of 777.7 kg agreed (265.7 kg short)' },
      { condition: 'grade', text: 'Graded Good · 70; minimum Very good · 80' },
    ]);

    const seqs = await closureSeqs(t.db, batchId);
    const rows = (await t.db.select().from(ledgerEntries)).filter((r) => seqs.includes(r.seq));
    const settlement = rows.find((r) => r.kind === 'settlement');
    expect(JSON.parse(settlement!.payload)).toMatchObject({ outcome: 'not_released', reasons: ['quantity', 'grade'], deliveredKg: 512, grade: 70, allVerified: true });
    for (const r of rows) expectNoTerms(JSON.parse(r.payload), `${r.kind}#${r.seq}`);

    const [b] = await t.db.select({ h: batches.shortHash }).from(batches).where(eq(batches.id, batchId));
    const { GET } = await import('../../app/api/verify/[batchId]/route');
    const res = await GET(new Request(`http://localhost/api/verify/${batchId}?h=${b!.h}`), { params: Promise.resolve({ batchId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { kind: string; payload: unknown }[] };
    expect(body.entries.map((e) => e.kind)).toEqual(expect.arrayContaining(['quality_attestation', 'settlement']));
    expectNoTerms(body, 'api/verify');

    const feed = await buildFeed(t.db, batchId);
    const keys = await publishedKeys();
    expect(await verifyFeed(feed, keys.keys)).toMatchObject({ ok: true });
    expect(await checkFeed(JSON.parse(JSON.stringify(feed)), keys)).toMatchObject({ ok: true });
  });
});
