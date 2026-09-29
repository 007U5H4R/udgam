// @vitest-environment node
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  // Same module registry as the route's (no reset since beforeEach): close the singleton it opened.
  (await import('../../../lib/db/client')).closeDb();
  vi.doUnmock('../../../lib/log');
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe('GET /api/health (TC-001)', () => {
  it('returns 200 with db ok, the ledger block and fixture providers, then 503 once the handle is closed', async () => {
    const { GET } = await import('./route');
    const { getDbClient } = await import('../../../lib/db/client');

    const ok = await GET();
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      config: 'ok',
      db: 'ok',
      ledger: { lastSeq: 0, lastCheckpointAgeSec: null, keyPresent: true },
      providers: { gfw: 'fixture', sentinelHub: 'fixture' },
    });
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

  it('answers 503 with config:error (not db:error) and a log line when the environment is invalid (QA-P1-1)', async () => {
    const error = vi.fn();
    vi.doMock('../../../lib/log', () => ({ log: { error } }));
    vi.stubEnv('REMOTE_SENSING_PROVIDER', 'not-a-provider');
    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { config: string; db: string };
    expect(body.config).toBe('error');
    expect(body.db).toBe('unchecked');
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('not-a-provider');
  });

  it('answers 503 with keyPresent:false once the ledger key file is removed (TC-001 ledger part)', async () => {
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(200); // first boot generates the key
    rmSync(join(t.dir, 'keys', 'ledger.jwk'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { db: string; ledger: { keyPresent: boolean } };
    expect(body.db).toBe('ok');
    expect(body.ledger.keyPresent).toBe(false);
  });
});
