// Generates evals/fixtures/feeds/batch-3-events.json (the certificate's fixture proof feed, TSK-16.1) and
// batch-3-events.keys.json (its ledger key document, public members only). Run once and commit both:
//
//   pnpm exec tsx src/lib/certificate/__fixtures__/make-feed.ts
//
// A temporary ledger (its own libSQL file, ledger key and admin keys in a fresh temp directory, never
// ./data) gets three Verified pickings on three plots, an organic attestation, a batch and a custody
// transfer, all through the real writers (world.ts); the feed is then built by the real feed builder.
// The private keys are thrown away with the directory.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const OUT = join(ROOT, 'evals/fixtures/feeds');

const dir = await mkdtemp(join(tmpdir(), 'udgam-cert-feed-'));
// Before any module reads env (env.ts parses on first access): everything lands in the temp dir.
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'silent';
process.env.REMOTE_SENSING_PROVIDER = 'fixture';
delete process.env.DATABASE_URL;
delete process.env.LEDGER_KEY_PATH;

try {
  const { closeDb, getDbReady } = await import('../../db/client');
  const { runMigrations } = await import('../../db/migrate');
  const { buildFeed } = await import('../../ledger/feed');
  const { publishedKeys } = await import('../../ledger/keys');
  const { seedCertificateWorld } = await import('./world');
  const db = await getDbReady();
  try {
    await runMigrations(db, join(ROOT, 'src/lib/db/migrations'));
    const w = await seedCertificateWorld(db, { events: 3, plots: 3, attestation: true, transfer: true });
    const feed = await buildFeed(db, w.batchId);
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, 'batch-3-events.json'), `${JSON.stringify(feed, null, 2)}\n`);
    await writeFile(join(OUT, 'batch-3-events.keys.json'), `${JSON.stringify(await publishedKeys(), null, 2)}\n`);
    console.log(`wrote ${w.batchId} (${feed.entries.length} entries, ${feed.checkpoints.length} checkpoint(s)) to evals/fixtures/feeds/`);
  } finally {
    closeDb();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
