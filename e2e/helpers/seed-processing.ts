// Seeds a batch for e2e/m2-processing.spec.ts (TKT-26) into DATA_DIR's database: its OWN FPO ("E2E FPO …")
// with an admin who can sign in (a random per-run TEST password) and an open batch of two Verified
// arabica pickings (40 + 42.5 = 82.5 kg). With `--to-processor <orgId>` the batch is also handed to that
// processor organisation (e.g. ORG-PROC-C03, seeded by scripts/seed-accounts.ts). Prints one JSON line:
// IDs and the test-only password, never key material.
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-processing.ts [--to-processor ORG-PROC-C03]
import { randomBytes } from 'node:crypto';
import { createBatch } from '../../src/lib/batches/create';
import { transferBatch } from '../../src/lib/custody/transfer';
import { closeDb, getDbReady } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { newId } from '../../src/lib/ids';
import { seedCapture, seedFpo } from '../../tests/helpers/batch-fixtures';

export type SeededProcessing = {
  orgName: string;
  adminEmail: string;
  /** TEST-ONLY random password for this run's admin. Never used outside .e2e-data. */
  testOnlyAdminPassword: string;
  batchId: string;
  shortHash: string;
};

const flag = process.argv.indexOf('--to-processor');
const toProcessor = flag > 0 ? process.argv[flag + 1] : undefined;

const db = await getDbReady();
try {
  await runMigrations(db);
  const password = randomBytes(18).toString('base64url');
  const world = await seedFpo(db, { orgName: `E2E FPO ${newId('')}`, adminPassword: password });
  const events: string[] = [];
  for (const kg of [40, 42.5]) events.push((await seedCapture(db, world, { crop: 'arabica', kg, score: 91 })).eventId);
  const b = await createBatch(db, { orgId: world.orgId, adminId: world.adminId, crop: 'arabica', eventIds: events });
  if (toProcessor) await transferBatch(db, { orgId: world.orgId, adminId: world.adminId, batchId: b.batchId, toOrgId: toProcessor });
  const out: SeededProcessing = { orgName: world.orgName, adminEmail: world.adminEmail, testOnlyAdminPassword: password, batchId: b.batchId, shortHash: b.shortHash };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
