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
import { createEvmLedger, recordPending, type AnchorRunReport, type EvmLedger } from '../../src/lib/ledger/evm/adapter';
import { createRegistryClient, type RegistryClient } from '../../src/lib/ledger/evm/client';
import { deployRegistry } from '../../src/lib/ledger/evm/deploy';
import type { Deployment } from '../../src/lib/ledger/evm/deployment';
import { readOperatorKey } from '../../src/lib/ledger/evm/operator-key';
import type { ServedFeed } from '../../src/lib/ledger/feed';
import { loadLedgerKey, publishedKeys, type PublishedKey } from '../../src/lib/ledger/keys';
import { seedBatchWorld } from '../../tests/helpers/batch-world';

// The harness proof fixture (technical-plan TSK-18.6): a temporary ledger (its own libSQL file and a
// throwaway ledger key in a fresh temp directory, never ./data) holding a transferred batch of 50
// events over 5 plots and 2 devices, built through the real lib writers and ledger appends
// (tests/helpers/batch-world.ts): one admin override, one attestation, one plot edit, one custody
// transfer and a revoked device. The automatic checkpoint seals entry 100; the entries after it are
// sealed by the on-demand checkpoint that building the feed creates (S7, EVAL-065).
//
// With `evm` (pnpm eval --ledger=evm, TSK-24.8): a BatchRegistry is deployed for this ledger alone on the
// given chain, every append also writes its pending evm_anchors row in the same transaction (the EVM
// adapter), all entries are anchored after commit, and the feed carries the `evm` member per entry.

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export type ProofFixtureOptions = { events?: number; plots?: number; evm?: { rpcUrl: string } };

export type ProofFixture = {
  /** The temporary directory: the ledger file, the key, and room for feed files. */
  dir: string;
  batchId: string;
  feed: ServedFeed;
  /** The key document as served at /.well-known/udgam-ledger-key. */
  keyDocument: { keys: PublishedKey[] };
  /** Seqs of the batch's provenance closure (evaluation-plan §4.6). */
  closure: number[];
  /** Closure entries that no checkpoint sealed before the feed was built. */
  uncheckpointedBeforeFeed: number;
  /** With `evm`: the registry this ledger was anchored on, and the anchoring run before the feed. */
  evm?: { registry: RegistryClient; deployment: Deployment; anchorReport: AnchorRunReport };
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
    let evm: { registry: RegistryClient; deployment: Deployment; ledger: EvmLedger } | undefined;
    if (opts.evm) {
      const operatorKeyPath = join(dir, 'keys', 'evm-operator.key');
      const { deployment } = await deployRegistry({ rpcUrl: opts.evm.rpcUrl, deploymentPath: join(dir, 'evm', 'deployment.json'), operatorKeyPath });
      const registry = createRegistryClient({ rpcUrl: opts.evm.rpcUrl, deployment, operatorKey: await readOperatorKey(operatorKeyPath) });
      evm = { registry, deployment, ledger: createEvmLedger({ db, registry: async () => registry }) };
    }
    previousHook =
      setOnAppended(async (tx, seq) => {
        await maybeCheckpoint(tx, seq, { key });
        if (evm) await recordPending(tx, seq);
      }) ?? undefined;

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
    const anchorReport = evm ? await evm.ledger.anchorPending() : undefined;
    const feed = await buildFeed(db, w.batchId, { key, ledger: evm?.ledger ?? { adapter: 'hashchain', anchorPending: async () => null } });
    const keyDocument = await publishedKeys(keyPath);
    return {
      dir,
      batchId: w.batchId,
      feed,
      keyDocument,
      closure,
      uncheckpointedBeforeFeed,
      ...(evm && anchorReport ? { evm: { registry: evm.registry, deployment: evm.deployment, anchorReport } } : {}),
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
