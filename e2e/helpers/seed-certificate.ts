// Seeds one certificate-ready batch for the certificate e2e specs (TKT-16) into DATA_DIR's database, through
// the real writers (src/lib/certificate/__fixtures__/world.ts): its own FPO, farmers and plots, a phone,
// Verified pickings, an organic attestation, a signed batch and (by default) a custody transfer. Every
// run makes new IDs, so parallel workers never share a batch. Prints one JSON line: IDs only, never key
// material.
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-certificate.ts
//          [--events 3] [--plots 3] [--no-transfer] [--no-attestation] [--sentinel]
// --sentinel plants the TSK-16.9 sentinels: every farmer is "Zzsentinel Farmer" with identifier
// "ID-SENTINEL-9999", and the FPO's office phone is 9999988888 (EVAL-084).
import { closeDb, getDbReady } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { seedCertificateWorld } from '../../src/lib/certificate/__fixtures__/world';
import { SENTINELS, type SeededCertificate } from './certificate';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const has = (name: string) => process.argv.includes(name);

const db = await getDbReady();
try {
  await runMigrations(db);
  const sentinel = has('--sentinel');
  const w = await seedCertificateWorld(db, {
    events: arg('--events', 3),
    plots: arg('--plots', 3),
    attestation: !has('--no-attestation'),
    transfer: !has('--no-transfer'),
    ...(sentinel ? { farmer: () => ({ name: SENTINELS.name, identifier: SENTINELS.identifier }), officePhone: SENTINELS.phone } : {}),
  });
  const out: SeededCertificate = { batchId: w.batchId, shortHash: w.shortHash, producerIds: w.producerIds, plotIds: w.plotIds, eventIds: w.eventIds, totalKg: w.totalKg };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
