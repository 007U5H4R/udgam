// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', '.'); // exists; the singleton only needs the directory
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe('GET /api/health (TC-001)', () => {
  it('returns 200 with db ok and fixture providers, then 503 once the handle is closed', async () => {
    const { GET } = await import('./route');
    const { getDbClient } = await import('../../../lib/db/client');

    const ok = await GET();
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ db: 'ok', providers: { gfw: 'fixture', sentinelHub: 'fixture' } });
    expect(typeof body.version).toBe('string');
    expect(typeof body.commit).toBe('string');

    getDbClient().close();
    const down = await GET();
    expect(down.status).toBe(503);
    expect(((await down.json()) as { db: string }).db).toBe('error');
  });

  it('does not put env values in the body', async () => {
    // Low-entropy on purpose, so the CI secret scan never mistakes a test canary for a key.
    const authCanary = 'canary-'.repeat(6);
    const gfwCanary = 'gfw-canary-'.repeat(2);
    vi.stubEnv('BETTER_AUTH_SECRET', authCanary);
    vi.stubEnv('GFW_API_KEY', gfwCanary);
    const { GET } = await import('./route');
    const text = await (await GET()).text();
    expect(text).not.toContain(authCanary);
    expect(text).not.toContain(gfwCanary);
    expect(text).not.toContain(t.url);
  });
});
