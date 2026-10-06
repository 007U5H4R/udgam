import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// TSK-27.1 (EXE29): the image's entrypoint migrates with the app's own runner, src/lib/db/migrate.ts
// (`pnpm db:migrate` semantics), never drizzle-kit. The runtime image has no tsx or pnpm, so
// deploy/build-migrate.mjs bundles that runner into one file next to server.js, leaving the packages
// the standalone server already ships (@libsql/client with its native binary, pino) as imports.

const OUT_DIR = resolve('node_modules/.cache/udgam-deploy-test'); // inside the repo: externals resolve
const OUT = join(OUT_DIR, `migrate-${process.pid}.mjs`);
let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'migrate-bundle-'));
  const b = spawnSync('node', ['deploy/build-migrate.mjs', OUT], { encoding: 'utf8' });
  expect(b.stderr).toBe('');
  expect(b.status).toBe(0);
}, 60_000);
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(OUT, { force: true });
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
