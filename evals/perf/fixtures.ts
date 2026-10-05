import { resolve } from 'node:path';

// The S4 fixture (EVAL-071, TSK-16.10): the EVAL-058 shape — a transferred batch of 50 Verified events over
// 5 plots with an organic attestation — built through the real lib writers (src/lib/certificate/
// __fixtures__/world.ts) into the DATA_DIR of the server under test, so that server serves its certificate.
// (A batch in a separate temporary DATA_DIR would be invisible to the target server.) Returns the
// certificate path. Run it in its own process: it sets DATA_DIR before anything reads the environment.

export type S4Batch = { batchId: string; shortHash: string; path: string; events: number };

export async function seedS4Batch(dataDir: string, events = 50, plots = 5): Promise<S4Batch> {
  process.env.DATA_DIR = resolve(dataDir);
  process.env.LOG_LEVEL ??= 'silent';
  delete process.env.DATABASE_URL;
  delete process.env.LEDGER_KEY_PATH;
  const { closeDb, getDbReady } = await import('../../src/lib/db/client');
  const { runMigrations } = await import('../../src/lib/db/migrate');
  const { seedCertificateWorld } = await import('../../src/lib/certificate/__fixtures__/world');
  const db = await getDbReady();
  try {
    await runMigrations(db);
    const w = await seedCertificateWorld(db, { events, plots, attestation: true, transfer: true });
    return { batchId: w.batchId, shortHash: w.shortHash, path: `/verify/${w.batchId}?h=${w.shortHash}`, events };
  } finally {
    closeDb();
  }
}
