import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkFeed } from '../../../../evals/scorers/independent-verifier/src/verify';
import { seedBatchWorld } from '../../../../tests/helpers/batch-world';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { evmAnchors } from '../../db/schema';
import { maybeCheckpoint } from '../checkpoint';
import { buildFeed } from '../feed';
import { setOnAppended } from '../hashchain';
import { ledgerFor } from '../index';
import { loadLedgerKey, publishedKeys } from '../keys';
import { verifyFeed, type VerifierKey } from '../proof';

// TSK-24.6/24.7 without a chain: with LEDGER_ADAPTER=evm and the chain unreachable, appends (captures)
// still commit, the anchoring failure is recorded and retried, and the proof feed is served with
// `evm: {status:'pending'}` on every entry. Both verifiers (the library and the clean-room checker,
// TC-073) still accept that feed: the optional `evm` member is ignored by §10 (docs/proof-feed.md §13).

let t: TempDb;
let previousHook: ReturnType<typeof setOnAppended>;
let keyPath: string;
const deadChain = async () => {
  throw new Error('connect ECONNREFUSED 127.0.0.1:1');
};

beforeAll(async () => {
  t = await tempDb();
  keyPath = join(t.dir, 'keys', 'ledger.jwk');
  const key = await loadLedgerKey(keyPath);
  previousHook = setOnAppended((tx, seq) => maybeCheckpoint(tx, seq, { key }));
});
afterAll(async () => {
  setOnAppended(previousHook);
  await t.cleanup();
});

describe('EVM adapter with the chain down', () => {
  it('appends commit with a pending anchor; the failure is recorded on the row, never thrown', async () => {
    const ledger = ledgerFor(t.db, 'evm', { registry: deadChain });
    const a = await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-solo' }));
    expect(a.seq).toBe(1);
    const report = await ledger.anchorPending();
    expect(report).toMatchObject({ anchored: 0, pending: 1, stoppedAt: { seq: 1, reason: expect.stringContaining('ECONNREFUSED') } });
    const [row] = await t.db.select().from(evmAnchors);
    expect(row).toMatchObject({ seq: 1, status: 'pending', attempts: 1, lastError: expect.stringContaining('ECONNREFUSED') });
  });

  it('the proof feed carries evm {status:"pending"} per entry, and both verifiers still accept it (TC-073)', async () => {
    const w = await seedBatchWorld(t.db, { events: 3, plots: 2, devices: 1, transfer: true });
    const ledger = ledgerFor(t.db, 'evm', { registry: deadChain });
    const key = await loadLedgerKey(keyPath);
    const feed = await buildFeed(t.db, w.batchId, { key, ledger });
    expect(feed.entries.length).toBeGreaterThan(5);
    expect(feed.entries.every((e) => JSON.stringify(e.evm) === '{"status":"pending"}')).toBe(true);
    expect(feed.format).toBe('udgam-proof-feed/1');

    const keys = (await publishedKeys(keyPath)).keys as VerifierKey[];
    const received = JSON.parse(JSON.stringify(feed)) as unknown;
    expect(await verifyFeed(received, keys)).toMatchObject({ ok: true, entries: feed.entries.length });
    expect(await checkFeed(received, { keys })).toEqual({ ok: true, verified: feed.entries.length, total: feed.entries.length });

    // The hash-chain adapter serves the same feed without the member.
    const plain = await buildFeed(t.db, w.batchId, { key, ledger: ledgerFor(t.db, 'hashchain') });
    expect(plain.entries.some((e) => 'evm' in e)).toBe(false);
  });
});
