// Seeds batch-ready pickings into DATA_DIR's database for e2e/batches.spec.ts (TKT-14): in the demo FPO
// (Hosahalli, seeded by scripts/seed-accounts.ts first) a farmer with an arabica and a robusta plot, a
// phone, three Verified arabica pickings (40 + 42.5 + 46 = 128.5 kg) and one Verified robusta picking.
// With `--transfer-to <orgId>` the three arabica pickings are also made into a batch by the demo admin
// and transferred to that buyer. Prints one JSON line of IDs (never key material).
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-batches.ts [--transfer-to ORG-BUYER-A]
import { DEMO_ACCOUNTS, DEMO_ORGS } from '../../scripts/seed-accounts';
import { createBatch } from '../../src/lib/batches/create';
import { transferBatch } from '../../src/lib/custody/transfer';
import { closeDb, getDbReady } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { seedCapture, seedFpo } from '../../tests/helpers/batch-fixtures';

export type SeededBatches = {
  arabica: string[];
  robusta: string;
  producerIds: string[];
  batch: { batchId: string; shortHash: string } | null;
};

const flag = process.argv.indexOf('--transfer-to');
const transferTo = flag > 0 ? process.argv[flag + 1] : undefined;

const db = await getDbReady();
try {
  await runMigrations(db);
  const orgId = DEMO_ORGS.fpoA.id;
  const adminId = DEMO_ACCOUNTS.adminA.id;
  const world = await seedFpo(db, { orgId, adminId });
  const arabica: string[] = [];
  for (const [kg, score] of [
    [40, 91.5],
    [42.5, 84],
    [46, 97],
  ] as const) {
    arabica.push((await seedCapture(db, world, { crop: 'arabica', kg, score })).eventId);
  }
  const robusta = (await seedCapture(db, world, { crop: 'robusta', kg: 30, score: 88 })).eventId;
  let batch: SeededBatches['batch'] = null;
  if (transferTo) {
    const b = await createBatch(db, { orgId, adminId, crop: 'arabica', eventIds: arabica });
    await transferBatch(db, { orgId, adminId, batchId: b.batchId, toOrgId: transferTo });
    batch = { batchId: b.batchId, shortHash: b.shortHash };
  }
  const out: SeededBatches = { arabica, robusta, producerIds: [world.plots.arabica.producerId, world.plots.robusta.producerId], batch };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
