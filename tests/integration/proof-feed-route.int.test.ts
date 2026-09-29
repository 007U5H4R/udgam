// @vitest-environment node
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBatchWorld, transferAgain, type BatchWorld } from '../helpers/batch-world';
import { tempDb, type TempDb } from '../helpers/db';

// TC-063, EVAL-064 (server side), EVAL-065: GET /api/verify/[batchId]?h= serves the proof feed for
// the right short hash, checkpoints on demand, and answers the same 404 for every not-found case.

let t: TempDb;
let w: BatchWorld;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  w = await seedBatchWorld(t.db, { events: 3, plots: 2, devices: 2, override: true, attestation: true, transfer: true });
});
afterEach(async () => {
  (await import('../../src/lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function get(batchId: string, h?: string | null) {
  const { GET } = await import('../../src/app/api/verify/[batchId]/route');
  const url = new URL(`http://localhost/api/verify/${encodeURIComponent(batchId)}`);
  if (h !== undefined && h !== null) url.searchParams.set('h', h);
  return GET(new Request(url), { params: Promise.resolve({ batchId }) });
}

const count = async (table: string) => Number((await t.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]!.n);

describe('GET /api/verify/[batchId] (TC-063)', () => {
  it('returns the feed as JSON, no-store, and it verifies with the published key', async () => {
    const res = await get(w.batchId, w.shortHash);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const feed = (await res.json()) as { format: string; batchId: string; entries: { seq: number; checkpointId: number }[] };
    expect(feed.format).toBe('udgam-proof-feed/1');
    expect(feed.batchId).toBe(w.batchId);

    const { closureSeqs } = await import('../../src/lib/ledger/closure');
    expect(feed.entries.map((e) => e.seq)).toEqual(await closureSeqs(t.db, w.batchId));
    const { publishedKeys } = await import('../../src/lib/ledger/keys');
    const { verifyFeed } = await import('../../src/lib/ledger/proof');
    expect(await verifyFeed(feed, (await publishedKeys()).keys)).toMatchObject({ ok: true, entries: feed.entries.length });
  });

  it('checkpoints a new custody transfer before serving it (EVAL-065)', async () => {
    await get(w.batchId, w.shortHash);
    expect(await count('ledger_checkpoints')).toBe(1);
    const next = await transferAgain(t.db, w, 'ORG-NEXTBUY2');
    const res = await get(w.batchId, w.shortHash);
    expect(await count('ledger_checkpoints')).toBe(2);
    const feed = (await res.json()) as { entries: { seq: number; checkpointId: number | null }[] };
    expect(feed.entries.every((e) => Number.isInteger(e.checkpointId))).toBe(true);
    expect(feed.entries.find((e) => e.seq === next.seq)?.checkpointId).toBe(2);
    const { publishedKeys } = await import('../../src/lib/ledger/keys');
    const { verifyFeed } = await import('../../src/lib/ledger/proof');
    expect(await verifyFeed(feed, (await publishedKeys()).keys)).toMatchObject({ ok: true });
  });

  it('answers byte-identical 404s for an unknown batch, a missing h and a wrong h (EVAL-064, TP8)', async () => {
    const flip = (s: string) => s.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    const cases = [
      await get('B-NOSUCH00', w.shortHash),
      await get(w.batchId, null),
      await get(w.batchId, ''),
      await get(w.batchId, flip(w.shortHash)),
      await get(w.batchId, 'short'),
    ];
    const seen = await Promise.all(cases.map(async (r) => ({ status: r.status, body: await r.text(), headers: [...r.headers.entries()].sort() })));
    for (const s of seen) {
      expect(s.status).toBe(404);
      expect(s.body).toBe('{"error":"not_found"}');
      expect(s.headers).toEqual(seen[0]!.headers);
    }
    expect(seen[0]!.headers).toContainEqual(['cache-control', 'no-store']);
    expect(await count('ledger_checkpoints')).toBe(0); // no provenance work for a not-found request
  });
});
