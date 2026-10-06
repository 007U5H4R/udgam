// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDirs } from '../../../tests/helpers/tmp';

// QA-P5-4 (TKT-28): under EXE12 an invalid production environment threw out of the instrumentation
// hook, so Next answered a bare 500 on every route, /api/health included, and nothing said why. Now the
// boot step logs config.invalid (names only) and returns: the server stays up (EXE12 refuses to *serve*
// with a bad config, it never ran fixture data) and /api/health answers 503 config:"error", which the
// Compose healthcheck and the uptime probe both read as a failure.

const tempDir = tempDirs();
let dir: string;

beforeEach(() => {
  dir = tempDir('udgam-boot-');
  vi.resetModules();
  for (const k of ['DATABASE_URL', 'LEDGER_KEY_PATH', 'E2E', 'BETTER_AUTH_SECRET', 'PUBLIC_BASE_URL', 'BETTER_AUTH_URL']) vi.stubEnv(k, '');
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  (await import('../db/client')).closeDb();
  vi.doUnmock('../log');
  vi.unstubAllEnvs();
});

/** A production environment missing its auth secret and running the fixture provider (EXE12). */
function invalidProduction() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
}

describe('boot with an invalid environment (QA-P5-4)', () => {
  it('register() resolves without touching DATA_DIR and logs config.invalid with variable names only', async () => {
    invalidProduction();
    vi.stubEnv('GFW_API_KEY', 'canary-'.repeat(5)); // a value that must never be logged
    const fatal = vi.fn();
    vi.doMock('../log', async (importOriginal) => {
      const real = await importOriginal<typeof import('../log')>();
      return { ...real, log: new Proxy(real.log, { get: (l, p) => (p === 'fatal' ? fatal : Reflect.get(l, p)) }) };
    });
    const { register } = await import('../../instrumentation');
    await expect(register()).resolves.toBeUndefined();
    expect(existsSync(join(dir, 'udgam.db'))).toBe(false); // no migration against a database it cannot trust
    expect(fatal).toHaveBeenCalledTimes(1);
    const [fields, event] = fatal.mock.calls[0]!;
    expect(event).toBe('config.invalid');
    expect(fields.problem).toMatch(/BETTER_AUTH_SECRET: required when NODE_ENV=production/);
    expect(fields.problem).toMatch(/REMOTE_SENSING_PROVIDER/);
    expect(JSON.stringify(fatal.mock.calls)).not.toContain('canary-');
  });

  it('/api/health then answers 503 with config:"error" (a failure for curl --fail and for the uptime probe)', async () => {
    invalidProduction();
    const error = vi.fn();
    vi.doMock('../log', async (importOriginal) => ({ ...(await importOriginal<typeof import('../log')>()), log: { error, fatal: vi.fn() } }));
    const { register } = await import('../../instrumentation');
    await register();
    const res = await (await import('../../app/api/health/route')).GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ config: 'error', db: 'unchecked' });
    expect(error).toHaveBeenCalledWith(expect.anything(), 'health.config_invalid');
  });
});

describe('boot with a valid environment', () => {
  it('migrates as before', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
    const { register } = await import('../../instrumentation');
    await register();
    expect(existsSync(join(dir, 'udgam.db'))).toBe(true);
    const res = await (await import('../../app/api/health/route')).GET();
    expect(res.status).toBe(200);
  });
});
