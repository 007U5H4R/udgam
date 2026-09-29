import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { max } from 'drizzle-orm';
import { createDb } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { ledgerCheckpoints } from '../../src/lib/db/schema';
import { maybeCheckpoint } from '../../src/lib/ledger/checkpoint';
import { closureSeqs } from '../../src/lib/ledger/closure';
import { buildFeed } from '../../src/lib/ledger/feed';
import { setOnAppended } from '../../src/lib/ledger/hashchain';
import { loadLedgerKey, publishedKeys, type PublishedKey } from '../../src/lib/ledger/keys';
import type { ProofFeedV1 } from '../../src/lib/ledger/proof';
import { seedBatchWorld } from '../../tests/helpers/batch-world';

// The harness proof fixture (technical-plan TSK-18.6): a temporary ledger (its own libSQL file and a
// throwaway ledger key in a fresh temp directory, never ./data) holding a transferred batch of 50
// events over 5 plots and 2 devices, built through the real lib writers and ledger appends
// (tests/helpers/batch-world.ts): one admin override, one attestation, one plot edit, one custody
// transfer and a revoked device. The automatic checkpoint seals entry 100; the entries after it are
// sealed by the on-demand checkpoint that building the feed creates (S7, EVAL-065).

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export type ProofFixtureOptions = { events?: number; plots?: number };

export type ProofFixture = {
  /** The temporary directory: the ledger file, the key, and room for feed files. */
  dir: string;
  batchId: string;
  feed: ProofFeedV1;
  /** The key document as served at /.well-known/udgam-ledger-key. */
  keyDocument: { keys: PublishedKey[] };
  /** Seqs of the batch's provenance closure (evaluation-plan §4.6). */
  closure: number[];
  /** Closure entries that no checkpoint sealed before the feed was built. */
  uncheckpointedBeforeFeed: number;
  close(): Promise<void>;
};

export async function buildProofFixture(opts: ProofFixtureOptions = {}): Promise<ProofFixture> {
  const dir = await mkdtemp(join(tmpdir(), 'udgam-proof-fixture-'));
  const { db, client, ready } = createDb(`file:${join(dir, 'ledger.db')}`);
  const keyPath = join(dir, 'keys', 'ledger.jwk');
  let previousHook: Parameters<typeof setOnAppended>[0] | null = null;
  let closed = false;
  // Restores the hook that was installed before this fixture (not blindly maybeCheckpoint), then
  // closes the database and always removes the temp directory. Safe to call twice.
  const close = async () => {
    if (closed) return;
    closed = true;
    if (previousHook !== null) setOnAppended(previousHook);
    try {
      client.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  try {
    await ready;
    await runMigrations(db, join(ROOT, 'src/lib/db/migrations'));
    const key = await loadLedgerKey(keyPath);
    previousHook = setOnAppended((tx, seq) => maybeCheckpoint(tx, seq, { key })) ?? undefined;

    const w = await seedBatchWorld(db, {
      events: opts.events ?? 50,
      plots: opts.plots ?? 5,
      devices: 2,
      override: true,
      attestation: true,
      editPlot: true,
      transfer: true,
      revokeDevice: true,
    });
    const closure = await closureSeqs(db, w.batchId);
    const [sealed] = await db.select({ toSeq: max(ledgerCheckpoints.toSeq) }).from(ledgerCheckpoints);
    const uncheckpointedBeforeFeed = closure.filter((s) => s > (sealed?.toSeq ?? 0)).length;
    const feed = await buildFeed(db, w.batchId, { key });
    const keyDocument = await publishedKeys(keyPath);
    return { dir, batchId: w.batchId, feed, keyDocument, closure, uncheckpointedBeforeFeed, close };
  } catch (e) {
    await close();
    throw e;
  }
}
