// Seeds batch-ready pickings for e2e/batches.spec.ts (TKT-14) into DATA_DIR's database. Every run makes
// its OWN FPO ("E2E FPO …") with an admin who can sign in (a random per-run TEST password), a farmer
// with an arabica and a robusta plot, a phone, three Verified arabica pickings (40 + 42.5 + 46 =
// 128.5 kg) and one Verified robusta picking — so parallel workers never fill the demo FPO's plot,
// phone or batch lists. With `--transfer-to <orgId>` the three arabica pickings are also made into a
// batch by that admin and transferred to that buyer (e.g. ORG-BUYER-A, seeded by seed-accounts.ts).
// With `--attest <issuer>` the arabica plot also gets an organic certificate on record from that issuer
// (QA-P5-2, TC-058 on the batch detail pages).
// Prints one JSON line: IDs and the test-only password, never key material.
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-batches.ts [--transfer-to ORG-BUYER-A] [--attest ISSUER]
import { randomBytes } from 'node:crypto';
import { attachAttestation } from '../../src/lib/attestations/attach';
import { createBatch } from '../../src/lib/batches/create';
import { transferBatch } from '../../src/lib/custody/transfer';
import { closeDb, getDbReady } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { newId } from '../../src/lib/ids';
import { seedCapture, seedFpo } from '../../tests/helpers/batch-fixtures';

export type SeededBatches = {
  orgName: string;
  adminEmail: string;
  /** TEST-ONLY random password for this run's admin. Never used outside .e2e-data. */
  testOnlyAdminPassword: string;
  arabica: string[];
  robusta: string;
  producerIds: string[];
  batch: { batchId: string; shortHash: string } | null;
};

const flag = process.argv.indexOf('--transfer-to');
const transferTo = flag > 0 ? process.argv[flag + 1] : undefined;
const attestFlag = process.argv.indexOf('--attest');
const attestIssuer = attestFlag > 0 ? process.argv[attestFlag + 1] : undefined;

const db = await getDbReady();
try {
  await runMigrations(db);
  const password = randomBytes(18).toString('base64url');
  const world = await seedFpo(db, { orgName: `E2E FPO ${newId('')}`, adminPassword: password });
  const arabica: string[] = [];
  for (const [kg, score] of [
    [40, 91.5],
    [42.5, 84],
    [46, 97],
  ] as const) {
    arabica.push((await seedCapture(db, world, { crop: 'arabica', kg, score })).eventId);
  }
  const robusta = (await seedCapture(db, world, { crop: 'robusta', kg: 30, score: 88 })).eventId;
  if (attestIssuer) {
    const file = new TextEncoder().encode(`%PDF-1.7\ne2e certificate ${newId('')}\n%%EOF\n`);
    await attachAttestation(db, { orgId: world.orgId, plotId: world.plots.arabica.plotId, file, issuer: attestIssuer, validFrom: '2026-01-01', validTo: '2036-01-01' });
  }
  let batch: SeededBatches['batch'] = null;
  if (transferTo) {
    const b = await createBatch(db, { orgId: world.orgId, adminId: world.adminId, crop: 'arabica', eventIds: arabica });
    await transferBatch(db, { orgId: world.orgId, adminId: world.adminId, batchId: b.batchId, toOrgId: transferTo });
    batch = { batchId: b.batchId, shortHash: b.shortHash };
  }
  const out: SeededBatches = {
    orgName: world.orgName,
    adminEmail: world.adminEmail,
    testOnlyAdminPassword: password,
    arabica,
    robusta,
    producerIds: [world.plots.arabica.producerId, world.plots.robusta.producerId],
    batch,
  };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
