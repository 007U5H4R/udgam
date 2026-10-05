// @vitest-environment node
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import type { ProofFeedV1, VerifierKey } from './proof';

// TASK-17 fix round 1 (review finding 5): verifyFeed checks entries 32 at a time. On a real feed of more
// than two windows (a 30-picking batch: 70 entries, windows 0–31, 32–63, 64–69), faults across a window
// edge must report the FIRST faulty entry in feed order, never a later one that finished first, and
// progress must stop just before it.

let t: TempDb;
let feed: ProofFeedV1;
let keys: VerifierKey[];

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  const { seedCertificateWorld } = await import('../certificate/__fixtures__/world');
  const { buildFeed } = await import('./feed');
  const { publishedKeys } = await import('./keys');
  const w = await seedCertificateWorld(t.db, { events: 30, plots: 3, attestation: true, transfer: true });
  feed = (await buildFeed(t.db, w.batchId)) as ProofFeedV1;
  keys = (await publishedKeys()).keys as VerifierKey[];
}, 120_000);

afterAll(async () => {
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

/** The feed with an extra member in the payload of each entry at `indices` (a payload-hash failure). */
function faulty(indices: number[]): ProofFeedV1 {
  const f = structuredClone(feed);
  for (const i of indices) (f.entries[i]!.payload as Record<string, unknown>).tampered = true;
  return f;
}

describe('verifyFeed across entry windows (TASK-17 fix round 1)', () => {
  it('the fixture spans three windows and verifies intact, counting 1..70 in order', async () => {
    const { verifyFeed } = await import('./proof');
    expect(feed.entries).toHaveLength(70);
    const seen: number[] = [];
    const out = await verifyFeed(feed, keys, { onProgress: (d) => seen.push(d) });
    expect(out).toMatchObject({ ok: true, entries: 70 });
    expect(seen).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
  });

  it.each([
    ['31, 32 and 33 (the last of window 1 and the first two of window 2)', [31, 32, 33], 31],
    ['33 and 32, listed out of order', [33, 32], 32],
    ['69 and 40 (two later windows)', [69, 40], 40],
    ['63 and 64 (either side of the second edge)', [64, 63], 63],
  ])('faults at %s: the first faulty entry in feed order is reported', async (_name, indices, first) => {
    const { verifyFeed } = await import('./proof');
    const f = faulty(indices);
    for (let run = 0; run < 3; run++) {
      const seen: number[] = [];
      const out = await verifyFeed(f, keys, { onProgress: (d) => seen.push(d) });
      expect(out).toMatchObject({ ok: false, step: 'payload-hash', seq: f.entries[first]!.seq });
      expect(seen.at(-1) ?? 0).toBe(first);
    }
  });
});
