import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// TSK-27.1 (EXE29): the image's entrypoint migrates with the app's own runner, src/lib/db/migrate.ts
// (`pnpm db:migrate` semantics), never drizzle-kit. The runtime image has no tsx or pnpm, so
// deploy/build-tools.mjs bundles that runner into one file next to server.js, leaving the packages
// the standalone server already ships (@libsql/client with its native binary, pino) as imports.

// Inside the repo, so the external imports resolve.
const OUT_DIR = resolve(`node_modules/.cache/udgam-deploy-test/migrate-${process.pid}`);
const OUT = join(OUT_DIR, 'migrate.mjs');
let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'migrate-bundle-'));
  const b = spawnSync('node', ['deploy/build-tools.mjs', OUT_DIR], { encoding: 'utf8' });
  expect(b.stderr).toBe('');
  expect(b.status).toBe(0);
}, 60_000);
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(OUT_DIR, { recursive: true, force: true });
});

// Only what the runner needs: no inherited secret or DATA_DIR reaches it.
const migrate = (env: Record<string, string>) => {
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH ?? '', LOG_LEVEL: 'silent' };
  return spawnSync('node', [OUT], { encoding: 'utf8', env: Object.assign(childEnv, env) });
};

describe('the bundled migration runner', () => {
  it('is the app runner, not drizzle-kit, and keeps the native client external', () => {
    const src = readFileSync(OUT, 'utf8');
    expect(src).not.toMatch(/(from|import\(|require\()\s*["']drizzle-kit/);
    expect(src).toContain('readMigrationFiles'); // drizzle-orm's migrator is bundled in
    expect(src).toMatch(/from ["']@libsql\/client["']/);
    expect(src).toContain('seedYieldReference');
  });

  it('applies every committed migration and the yield reference, twice without change', async () => {
    const env = { NODE_ENV: 'test', DATA_DIR: dataDir };
    const first = migrate(env);
    expect(first.stderr).toBe('');
    expect(first.status).toBe(0);
    expect(migrate(env).status).toBe(0); // idempotent

    const db = createClient({ url: `file:${join(dataDir, 'udgam.db')}` });
    try {
      const applied = await db.execute('SELECT count(*) AS n FROM __drizzle_migrations');
      const files = readdirSync('src/lib/db/migrations').filter((f) => f.endsWith('.sql'));
      expect(Number(applied.rows[0]!.n)).toBe(files.length);
      const ref = await db.execute('SELECT count(*) AS n FROM crop_yield_reference');
      expect(Number(ref.rows[0]!.n)).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('fails the boot loudly on an invalid environment, naming the variable and not its value', () => {
    const r = migrate({ NODE_ENV: 'production', DATA_DIR: dataDir, REMOTE_SENSING_PROVIDER: 'live' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BETTER_AUTH_SECRET');
  });
});

// EXE55: the entrypoint runs config-check.mjs before migrate.mjs. An invalid environment stops the
// container with one `config.invalid: <names>` line on stderr: never a value, never a stack trace.
describe('the bundled configuration check', () => {
  const check = (env: Record<string, string>) =>
    spawnSync('node', [join(OUT_DIR, 'config-check.mjs')], { encoding: 'utf8', env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...env } });
  /** Made-up values, built at run time, that must never be printed. */
  const fake = (n: string) => ['fake', 'value', n].join('-');

  it('exits 0 and prints nothing for a valid environment', () => {
    const r = check({ NODE_ENV: 'test', DATA_DIR: dataDir });
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('exits 1 with exactly one line naming the variables, and no value', () => {
    const env = { NODE_ENV: 'production', REMOTE_SENSING_PROVIDER: 'live', GFW_API_KEY: fake('gfw'), CDSE_CLIENT_ID: fake('id'), PUBLIC_BASE_URL: `http://${fake('host')}.example` };
    const r = check(env);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('config.invalid: BETTER_AUTH_SECRET, BETTER_AUTH_URL, PUBLIC_BASE_URL, CDSE_CLIENT_SECRET\n');
    expect(r.stderr).not.toContain('fake-value');
  });
});
