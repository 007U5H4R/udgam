import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBatchWorld, transferAgain } from '../../../tests/helpers/batch-world';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { ledgerCheckpoints } from '../db/schema';
import { closureSeqs } from './closure';
import { buildFeed, getProof, resolveFeed } from './feed';
import { publishedKeys } from './keys';
import { verifyFeed, verifyProof } from './proof';

// TC-063, EVAL-065: the feed is exactly the closure, every entry is checkpointed before it is served
// (on demand when needed), and it verifies with the published key.

const keyDir = mkdtempSync(join(tmpdir(), 'udgam-feed-key-'));
vi.stubEnv('LEDGER_KEY_PATH', join(keyDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(keyDir, { recursive: true, force: true }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const keys = async () => (await publishedKeys()).keys;

describe('buildFeed (TC-063, EVAL-065)', () => {
  it('serves exactly the closure, checkpointing on demand, and verifies with the published key', async () => {
    const w = await seedBatchWorld(t.db, { events: 3, plots: 2, devices: 2, editPlot: true, attestation: true, override: true, transfer: true, revokeDevice: true });
    expect(await t.db.$count(ledgerCheckpoints)).toBe(0); // fewer than 100 entries so far

    const feed = await buildFeed(t.db, w.batchId);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(1); // created on demand (S7)
    expect(feed.format).toBe('udgam-proof-feed/1');
    expect(feed.batchId).toBe(w.batchId);
    expect(feed.shortHash).toBe(w.shortHash);
    expect(feed.ledgerKey).toEqual({ kid: (await keys())[0]!.kid, url: '/.well-known/udgam-ledger-key' });
    expect(feed.entries.map((e) => e.seq)).toEqual(await closureSeqs(t.db, w.batchId));
    expect(await verifyFeed(feed, await keys())).toMatchObject({ ok: true, entries: feed.entries.length });

    // a second request with nothing new creates nothing
    await buildFeed(t.db, w.batchId);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(1);
  }, 30_000);

  it('after a new custody transfer the next feed seals it under a new checkpoint (EVAL-065)', async () => {
    const w = await seedBatchWorld(t.db, { events: 2, plots: 1, transfer: true });
    await buildFeed(t.db, w.batchId);
    const again = await transferAgain(t.db, w, 'ORG-NEXTBUY1');
    const feed = await buildFeed(t.db, w.batchId);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(2);
    const entry = feed.entries.find((e) => e.seq === again.seq)!;
    expect(entry.kind).toBe('custody_transfer');
    expect(entry.checkpointId).toBe(2);
    expect(feed.checkpoints.map((c) => c.id)).toEqual([1, 2]);
    expect(await verifyFeed(feed, await keys())).toMatchObject({ ok: true });
  }, 30_000);

  it('concurrent requests create exactly one checkpoint, and one more after a new transfer (quality #6a)', async () => {
    const w = await seedBatchWorld(t.db, { events: 2, plots: 1, transfer: true });
    expect(await t.db.$count(ledgerCheckpoints)).toBe(0);
    const first = await Promise.all([buildFeed(t.db, w.batchId), buildFeed(t.db, w.batchId), resolveFeed(t.db, w.batchId, w.shortHash), resolveFeed(t.db, w.batchId, w.shortHash)]);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(1);
    for (const f of first) expect(f!.checkpoints.map((c) => c.id)).toEqual([1]);

    await transferAgain(t.db, w, 'ORG-NEXTBUY2');
    const second = await Promise.all([buildFeed(t.db, w.batchId), resolveFeed(t.db, w.batchId, w.shortHash), buildFeed(t.db, w.batchId)]);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(2);
    for (const f of second) {
      expect(f!.checkpoints.map((c) => c.id)).toEqual([1, 2]);
      expect(await verifyFeed(f, await keys())).toMatchObject({ ok: true });
    }
  }, 30_000);

  it('emits the short hash as 12 lowercase hex (nit)', async () => {
    const w = await seedBatchWorld(t.db, { events: 1, plots: 1 });
    const feed = await buildFeed(t.db, w.batchId);
    expect(feed.shortHash).toMatch(/^[0-9a-f]{12}$/);
    expect(feed.shortHash).toBe(w.anchors.batchCreated.entryHash.slice(0, 12));
  });

  it('spans automatic and on-demand checkpoints for a batch past 100 entries', async () => {
    const w = await seedBatchWorld(t.db, { events: 50, plots: 5, transfer: true });
    const feed = await buildFeed(t.db, w.batchId);
    expect(feed.checkpoints.map((c) => [c.fromSeq, c.toSeq])).toEqual([
      [1, 100],
      [101, feed.checkpoints[1]!.toSeq],
    ]);
    expect(await verifyFeed(feed, await keys())).toMatchObject({ ok: true, entries: 5 + 1 + 50 * 2 + 1 + 1 });
  }, 60_000);
});

describe('getProof', () => {
  it('returns one entry with its checkpoint and path, verifiable on its own', async () => {
    const w = await seedBatchWorld(t.db, { events: 2, plots: 1 });
    await buildFeed(t.db, w.batchId); // seals everything
    const proof = await getProof(t.db, w.anchors.batchCreated.seq);
    expect(proof.entry.kind).toBe('batch_created');
    expect(await verifyProof(proof, await keys())).toEqual({ ok: true });
  });

  it('refuses an entry no checkpoint covers yet', async () => {
    const w = await seedBatchWorld(t.db, { events: 1, plots: 1 });
    await expect(getProof(t.db, w.anchors.batchCreated.seq)).rejects.toThrow(/checkpoint/);
  });
});

describe('resolveFeed (TP8, EVAL-064 server side)', () => {
  it('returns the feed only for the right h, and null for an unknown batch, a missing h or a wrong h', async () => {
    const w = await seedBatchWorld(t.db, { events: 1, plots: 1 });
    expect((await resolveFeed(t.db, w.batchId, w.shortHash))?.batchId).toBe(w.batchId);
    expect(await resolveFeed(t.db, 'B-NOSUCH00', w.shortHash)).toBeNull();
    expect(await resolveFeed(t.db, w.batchId, null)).toBeNull();
    expect(await resolveFeed(t.db, w.batchId, '')).toBeNull();
    expect(await resolveFeed(t.db, w.batchId, w.shortHash.replace(/.$/, (c) => (c === '0' ? '1' : '0')))).toBeNull();
    expect(await resolveFeed(t.db, w.batchId, w.shortHash.slice(0, 11))).toBeNull();
    expect(await resolveFeed(t.db, w.batchId, w.shortHash + '0')).toBeNull();
    const upper = w.shortHash.toUpperCase();
    if (upper !== w.shortHash) expect(await resolveFeed(t.db, w.batchId, upper)).toBeNull();
    expect(await t.db.$count(ledgerCheckpoints)).toBe(1); // only the successful request checkpointed
  });
});
