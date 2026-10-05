// Seeds agreements in every status for e2e/m2-agreements.spec.ts (TKT-25, TC-085, EVAL-105) into
// DATA_DIR's database. The e2e server has no chain, so this TEST-ONLY seed records each agreement step
// the way the services do (a statement signed on behalf of the acting user, anchored, then the row)
// with placeholder transaction hashes; the real chain path is covered by the evm tests (EVAL-093–099).
// Every run makes its own buyer organisation and one FPO per agreement (so each agreement has exactly
// its own delivered batch), each with a user who can sign in with a random per-run TEST password.
// Prints one JSON line: IDs, emails and the test-only password, never key material.
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-agreements.ts
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { agreementChainId } from '../../src/lib/agreements/attestor-keys';
import { deadlineIso, istToday } from '../../src/lib/agreements/format';
import { anchorSigned } from '../../src/lib/agreements/service';
import { createBatch } from '../../src/lib/batches/create';
import { transferBatch } from '../../src/lib/custody/transfer';
import { closeDb, getDbReady, writeTx, type Db } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { account, agreements, organisations, qualityAttestations, settlements, user } from '../../src/lib/db/schema';
import { newId } from '../../src/lib/ids';
import { seedCapture, seedFpo } from '../../tests/helpers/batch-fixtures';

export type SeededAgreement = { id: string; fpoName: string; adminEmail: string; batchId: string | null };
export type SeededAgreements = {
  buyerOrgName: string;
  buyerEmail: string;
  /** TEST-ONLY random password for every user of this run. Never used outside .e2e-data. */
  testOnlyPassword: string;
  created: SeededAgreement;
  refund: SeededAgreement;
  toGrade: SeededAgreement;
  waiting: SeededAgreement;
  ready: SeededAgreement;
  released: SeededAgreement;
  notReleased: SeededAgreement;
};

const tx64 = () => `0x${randomBytes(32).toString('hex')}`;
const iso = (d: Date) => d.toISOString();
const shift = (days: number) => new Date(Date.now() + days * 86_400_000);
const dateIn = (days: number) => {
  const d = new Date(`${istToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Step = 'created' | 'funded' | 'graded' | 'released' | 'not_released';

async function seedOne(db: Db, buyer: { orgId: string; userId: string }, password: string, o: { step: Step; kgs: number[]; deliver: boolean; grade?: number; deadlineDays?: number; agreedKg?: number; minGrade?: number; amountPaise?: number }): Promise<SeededAgreement> {
  const fpoName = `E2E FPO ${newId('', 4)}`;
  const fpo = await seedFpo(db, { orgName: fpoName, adminPassword: password });
  const id = newId('AG-');
  const agreedKg = o.agreedKg ?? 600;
  const minGrade = o.minGrade ?? 70;
  const amountPaise = o.amountPaise ?? 15_000_000;
  const deadline = deadlineIso(dateIn(o.deadlineDays ?? 60));
  const createdAt = iso(shift(-20));
  await writeTx(db, async (t) => {
    const statement = { v: 1, agreementId: id, chainAgreementId: agreementChainId(id), buyerOrg: buyer.orgId, fpoOrg: fpo.orgId, crop: 'arabica', agreedKg, minGrade, amountPaise, deadline, chain: { chainId: 31337, txHash: tx64(), seeded: 'e2e' }, signedBy: buyer.userId, ts: createdAt };
    const a = await anchorSigned(t, 'agreement_created', buyer.userId, statement);
    await t.insert(agreements).values({ id, chainIdHex: agreementChainId(id), buyerOrg: buyer.orgId, fpoOrg: fpo.orgId, crop: 'arabica', agreedKg, minGrade, amountPaise, deadline, createdBy: buyer.userId, createdAt, createdTxHash: tx64(), anchorSeq: a.seq });
  });
  if (o.step === 'created') return { id, fpoName, adminEmail: fpo.adminEmail, batchId: null };
  const fundedAt = iso(shift(-19));
  await writeTx(db, async (t) => {
    const a = await anchorSigned(t, 'agreement_funded', buyer.userId, { v: 1, agreementId: id, amountPaise, chain: { chainId: 31337, txHash: tx64(), seeded: 'e2e' }, signedBy: buyer.userId, ts: fundedAt });
    await t.update(agreements).set({ status: 'funded', fundedAt, fundedTxHash: tx64(), fundedAnchorSeq: a.seq }).where(eq(agreements.id, id));
  });
  let batchId: string | null = null;
  if (o.deliver) {
    const caps = [];
    for (const kg of o.kgs) caps.push(await seedCapture(db, fpo, { kg }));
    batchId = (await createBatch(db, { orgId: fpo.orgId, adminId: fpo.adminId, crop: 'arabica', eventIds: caps.map((c) => c.eventId) })).batchId;
    await transferBatch(db, { orgId: fpo.orgId, adminId: fpo.adminId, batchId, toOrgId: buyer.orgId });
  }
  if (!batchId || o.step === 'funded') return { id, fpoName, adminEmail: fpo.adminEmail, batchId };
  const grade = o.grade ?? 80;
  const qaId = newId('QA-', 12);
  await writeTx(db, async (t) => {
    const a = await anchorSigned(t, 'quality_attestation', buyer.userId, { v: 1, attestationId: qaId, agreementId: id, batchId, grade, eip712: { seeded: 'e2e' }, signedBy: buyer.userId, ts: iso(shift(-2)) });
    await t.insert(qualityAttestations).values({ id: qaId, agreementId: id, batchId: batchId!, grade, signerOrg: buyer.orgId, signerAddress: `0x${'0'.repeat(40)}`, eip712Sig: tx64(), signedBy: buyer.userId, createdAt: iso(shift(-2)), anchorSeq: a.seq });
  });
  if (o.step === 'graded') return { id, fpoName, adminEmail: fpo.adminEmail, batchId };
  const deliveredKg = o.kgs.reduce((n, k) => n + k, 0);
  const pickings = o.kgs.length;
  const verified = pickings;
  const released = o.step === 'released';
  // condition codes only, as settle.ts anchors them: the terms stay out of the public feed (Design.md §28.4)
  const reasons = released ? [] : [...(deliveredKg < agreedKg ? ['quantity'] : []), ...(grade < minGrade ? ['grade'] : []), ...(verified < pickings ? ['all_verified'] : [])];
  const stId = newId('ST-', 12);
  const at = iso(shift(-1));
  const txHash = tx64();
  await writeTx(db, async (t) => {
    const a = await anchorSigned(t, 'settlement', fpo.adminId, { v: 1, settlementId: stId, agreementId: id, batchId, outcome: released ? 'released' : 'not_released', reasons, chain: { chainId: 31337, txHash, seeded: 'e2e' }, signedBy: fpo.adminId, ts: at });
    await t.insert(settlements).values({ id: stId, agreementId: id, batchId: batchId!, attestationId: qaId, deliveredKg, pickings, verifiedPickings: verified, allVerified: verified === pickings, grade, outcome: released ? 'released' : 'not_released', reasons: JSON.stringify(reasons), txHash, blockNumber: 1284, settledBy: fpo.adminId, createdAt: at, anchorSeq: a.seq });
    if (released) await t.update(agreements).set({ status: 'settled', closedAt: at, closedTxHash: txHash, closedAnchorSeq: a.seq }).where(eq(agreements.id, id));
  });
  return { id, fpoName, adminEmail: fpo.adminEmail, batchId };
}

const db = await getDbReady();
try {
  await runMigrations(db);
  const password = randomBytes(18).toString('base64url');
  const buyerOrg = newId('ORG-');
  const buyerOrgName = `E2E Buyer ${newId('', 4)}`;
  const buyerUser = newId('USR-');
  const buyerEmail = `${buyerUser.toLowerCase()}@buyer.udgam.test`;
  const hash = await hashPassword(password);
  await writeTx(db, async (t) => {
    await t.insert(organisations).values({ id: buyerOrg, type: 'buyer', name: buyerOrgName });
    await t.insert(user).values({ id: buyerUser, name: 'E2E buyer', email: buyerEmail, emailVerified: true, role: 'buyer', orgId: buyerOrg });
    await t.insert(account).values({ id: `${buyerUser}-cred`, accountId: buyerUser, providerId: 'credential', userId: buyerUser, password: hash, updatedAt: new Date() });
  });
  const buyer = { orgId: buyerOrg, userId: buyerUser };
  const out: SeededAgreements = {
    buyerOrgName,
    buyerEmail,
    testOnlyPassword: password,
    created: await seedOne(db, buyer, password, { step: 'created', kgs: [], deliver: false, agreedKg: 1200, minGrade: 60, amountPaise: 24_000_000 }),
    refund: await seedOne(db, buyer, password, { step: 'funded', kgs: [], deliver: false, deadlineDays: -5, agreedKg: 400, amountPaise: 10_000_000 }),
    toGrade: await seedOne(db, buyer, password, { step: 'funded', kgs: [306, 306], deliver: true }),
    waiting: await seedOne(db, buyer, password, { step: 'funded', kgs: [], deliver: false }),
    ready: await seedOne(db, buyer, password, { step: 'graded', kgs: [306, 306], deliver: true, grade: 80 }),
    released: await seedOne(db, buyer, password, { step: 'released', kgs: [306, 306], deliver: true, grade: 80 }),
    notReleased: await seedOne(db, buyer, password, { step: 'not_released', kgs: [300, 298.5], deliver: true, grade: 80 }),
  };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
