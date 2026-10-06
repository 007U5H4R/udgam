// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addOrg } from '../helpers/auth';
import { createDb, type Db } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';

// SEC-001 in the production image (M-003): the runtime image is Next's standalone server, with no tsx,
// pnpm or scripts/. deploy/build-tools.mjs bundles `accounts:create` and `accounts:set-password` into
// self-contained .mjs files beside server.js (/app/accounts-create.mjs, /app/accounts-set-password.mjs),
// Better Auth's password hashing and drizzle bundled in, @libsql/client and pino left as imports of the
// packages the standalone server ships. Run here with plain node, as the image runs them.

// Inside the repo, so the external imports resolve as they do from /app.
const OUT_DIR = resolve(`node_modules/.cache/udgam-deploy-test/tools-${process.pid}`);
const BUDGET = 120_000;
let dataDir: string;
let db: Db;
let close: () => void;

beforeAll(async () => {
  const b = spawnSync('node', ['deploy/build-tools.mjs', OUT_DIR], { encoding: 'utf8' });
  expect(b.stderr).toBe('');
  expect(b.status).toBe(0);
  dataDir = mkdtempSync(join(tmpdir(), 'accounts-bundle-'));
  const d = createDb(`file:${join(dataDir, 'udgam.db')}`);
  await d.ready;
  await runMigrations(d.db);
  db = d.db;
  close = () => d.client.close();
  await addOrg(db, 'ORG-FPOB', 'fpo');
}, BUDGET);
afterAll(() => {
  close?.();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(OUT_DIR, { recursive: true, force: true });
});

/** A bundled tool under plain node: no tsx, no inherited secret, the repo root as the working directory (/app in the image). */
function tool(name: string, args: string[], input = '') {
  const r = spawnSync('node', [join(OUT_DIR, name), ...args], {
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', DATA_DIR: dataDir, DATABASE_URL: `file:${join(dataDir, 'udgam.db')}`, LOG_LEVEL: 'silent' },
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

async function signIn(email: string, password: string): Promise<number> {
  const { createAuth } = await import('../../src/lib/auth/auth');
  return (await createAuth(db).api.signInEmail({ body: { email, password }, asResponse: true })).status;
}

describe('the bundled accounts CLI (SEC-001 in the image)', () => {
  it('builds both bundles, self-contained but for the native client and pino', () => {
    for (const name of ['accounts-create.mjs', 'accounts-set-password.mjs']) {
      const src = readFileSync(join(OUT_DIR, name), 'utf8');
      expect(src).toMatch(/from ["']@libsql\/client["']/);
      expect(src).not.toMatch(/^\s*import[^\n;]*["'](better-auth|drizzle-orm|zod|tsx)[/"']/m);
      expect(src).not.toMatch(/(import\(|require\()\s*["'](better-auth|drizzle-orm|zod|tsx)[/"']/);
      expect(src).toContain('hashPassword'); // Better Auth's own scrypt hashing, bundled in
    }
  });

  it('--help prints the usage and exits 0, touching no database', () => {
    for (const name of ['accounts-create.mjs', 'accounts-set-password.mjs']) {
      const r = tool(name, ['--help']);
      expect(r.err).toBe('');
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/^usage: /);
      expect(r.out).toContain('--password-stdin');
    }
    expect(existsSync(join(OUT_DIR, 'udgam.db'))).toBe(false);
  });

  it(
    'creates an account whose password signs in, and sets a new one: the password is in no output',
    async () => {
      const first = ['bundle', 'first', 'password', 'value'].join(' ');
      const c = tool('accounts-create.mjs', ['--name', 'Bundle Admin', '--email', 'bundle@fpob.example', '--role', 'admin', '--org', 'ORG-FPOB', '--password-stdin'], `${first}\n`);
      expect(c.err).toBe('');
      expect(c.code).toBe(0);
      expect(c.out).not.toContain(first);
      expect(JSON.parse(c.out.trim().split('\n').at(-1)!)).toMatchObject({ created: 'account', email: 'bundle@fpob.example', orgId: 'ORG-FPOB', password: 'from stdin' });
      expect(await signIn('bundle@fpob.example', first)).toBe(200);

      const second = ['bundle', 'second', 'password', 'value'].join(' ');
      const s = tool('accounts-set-password.mjs', ['--email', 'bundle@fpob.example', '--password-stdin'], `${second}\n`);
      expect(s.err).toBe('');
      expect(s.code).toBe(0);
      expect(s.out).not.toContain(second);
      expect(await signIn('bundle@fpob.example', second)).toBe(200);
      expect(await signIn('bundle@fpob.example', first)).not.toBe(200);
    },
    BUDGET,
  );

  it('refuses a password in argv, as the tsx commands do, even next to --help', () => {
    for (const args of [['--email', 'bundle@fpob.example', '--password=x'], ['--password=x', '--help']]) {
      const r = tool('accounts-set-password.mjs', args);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/never on the command line/);
      expect(r.out).toBe('');
    }
  });
});

describe('build-tools input rule', () => {
  it('refuses data, key, env and secrets files as bundle inputs', async () => {
    const { forbiddenInput } = (await import('../../deploy/build-tools.mjs')) as { forbiddenInput: (p: string) => string | null };
    for (const p of ['.env', '.env.local', 'src/.env.production', '.secrets/auth', 'data/udgam.db', 'keys/ledger.jwk', 'x/ledger.key', 'cert.pem']) expect(forbiddenInput(p), p).not.toBeNull();
    for (const p of ['src/lib/auth/accounts.ts', 'node_modules/better-auth/dist/crypto/index.mjs']) expect(forbiddenInput(p), p).toBeNull();
  });
});
