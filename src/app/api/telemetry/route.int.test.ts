// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';

// TASK-17 fix round 1: POST /api/telemetry is rate-limited per client address on the shared rate_limits
// table (30 per 10-minute window, an IPv6 client keyed by its /64): the 31st beacon in a window is 429
// with Retry-After and is not logged; another address is unaffected.

let t: TempDb;

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

const VIEW = JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D' });
const FAILED = JSON.stringify({ event: 'certificate.proof_failed', batchId: 'B-7K2M9Q4D', step: 'entry-hash' });

async function beacon(ip: string, kind: 'view' | 'failed' = 'view'): Promise<Response> {
  const { POST } = await import('./route');
  const body = kind === 'view' ? VIEW : FAILED;
  const url = kind === 'view' ? 'http://localhost/api/telemetry' : 'http://localhost/api/telemetry?e=proof_failed';
  const headers = { 'content-type': 'application/json', 'content-length': String(body.length), 'x-forwarded-for': ip };
  return POST(new Request(url, { method: 'POST', body, headers }));
}

describe('POST /api/telemetry per-address limit (TASK-17 fix round 1)', () => {
  it('accepts 30 beacons from one address in a window, refuses the 31st with 429 and Retry-After, and lets another address through', async () => {
    for (let i = 1; i <= 30; i++) expect((await beacon('203.0.113.20')).status, `beacon ${i}`).toBe(204);
    const over = await beacon('203.0.113.20');
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: 'rate_limited' });
    const retry = Number(over.headers.get('retry-after'));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(600);
    expect((await beacon('203.0.113.21')).status).toBe(204);
  });

  it('proof failures have their own bucket: after 30 views a failure is still accepted, and failures stop at their own 30 (TASK-17 r2 N2)', async () => {
    for (let i = 1; i <= 30; i++) expect((await beacon('203.0.113.30')).status, `view ${i}`).toBe(204);
    expect((await beacon('203.0.113.30')).status).toBe(429);
    for (let i = 1; i <= 30; i++) expect((await beacon('203.0.113.30', 'failed')).status, `failure ${i}`).toBe(204);
    expect((await beacon('203.0.113.30', 'failed')).status).toBe(429);
  });

  it('counts every address of one IPv6 /64 in one bucket', async () => {
    for (let i = 1; i <= 30; i++) expect((await beacon(`2001:db8:5:6::${i.toString(16)}`)).status).toBe(204);
    expect((await beacon('2001:db8:5:6:ffff::1')).status).toBe(429);
    expect((await beacon('2001:db8:5:7::1')).status).toBe(204);
  });
});
