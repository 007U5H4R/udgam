// @vitest-environment node
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedBatchWorld, type BatchWorld } from '../../../../../tests/helpers/batch-world';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';

// TSK-16.2 (carried from TKT-14 / QA-P4) · TC-063 route half · EVAL-064 · TP8 (GAP-6): at the route,
// an unknown batch, a missing `h` and a wrong `h` answer 404 with byte-identical bodies and headers;
// the right `h` answers the feed.

let t: TempDb;
let w: BatchWorld;

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  w = await seedBatchWorld(t.db, { events: 2, plots: 1, transfer: true });
});

afterAll(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function get(batchId: string, query: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/verify/${batchId}${query}`), { params: Promise.resolve({ batchId }) });
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) };
}

describe('GET /api/verify/[batchId] (TC-063 route half, EVAL-064)', () => {
  it('unknown batch, missing h and wrong h: the same 404 status, headers and body, byte for byte', async () => {
    const wrong = w.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    const answers = [
      await get('B-UNKNOWN0', `?h=${w.shortHash}`),
      await get(w.batchId, ''),
      await get(w.batchId, `?h=${wrong}`),
      await get(w.batchId, `?h=${w.shortHash.toUpperCase()}`),
      await get(w.batchId, '?h='),
    ];
    for (const a of answers) {
      expect(a.status).toBe(404);
      expect(a.body).toBe('{"error":"not_found"}');
      expect(a.headers).toEqual(answers[0]!.headers);
    }
    expect(new Set(answers.map((a) => a.body)).size).toBe(1);
  });

  it('the right h answers the feed of that batch', async () => {
    const ok = await get(w.batchId, `?h=${w.shortHash}`);
    expect(ok.status).toBe(200);
    const feed = JSON.parse(ok.body) as { batchId: string; shortHash: string; format: string };
    expect(feed).toMatchObject({ format: 'udgam-proof-feed/1', batchId: w.batchId, shortHash: w.shortHash });
    expect(ok.headers['cache-control']).toBe('no-store');
  });
});
