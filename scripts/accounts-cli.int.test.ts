// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addOrg } from '../tests/helpers/auth';
import { tempDirs } from '../tests/helpers/tmp';
import { createDb, type Db } from '../src/lib/db/client';
import { runMigrations } from '../src/lib/db/migrate';
import { account, user } from '../src/lib/db/schema';

// SEC-001 (TKT-28): `pnpm accounts:create` and `pnpm accounts:set-password`, run as the operator runs
// them (tsx child processes, stdin piped, so not a terminal). The password never travels in argv and is
// never printed: it is read from stdin (--password-stdin) or generated and written to a 0600 file.

const tempDir = tempDirs();
const DIR = tempDir('udgam-accounts-cli-');
const URL = `file:${join(DIR, 'udgam.db')}`;
let db: Db;
let close: () => void;

beforeAll(async () => {
  const d = createDb(URL);
  await d.ready;
  await runMigrations(d.db);
  db = d.db;
  close = () => d.client.close();
  await addOrg(db, 'ORG-FPO1', 'fpo');
});
afterAll(() => close());

function cli(script: 'create' | 'set-password', args: string[], input?: string) {
  const r = spawnSync('./node_modules/.bin/tsx', [`scripts/accounts-${script}.ts`, ...args], {
    input: input ?? '',
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', DATA_DIR: DIR, DATABASE_URL: URL, LOG_LEVEL: 'silent' },
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

async function signIn(email: string, password: string): Promise<number> {
  const { createAuth } = await import('../src/lib/auth/auth');
  return (await createAuth(db).api.signInEmail({ body: { email, password }, asResponse: true })).status;
}

const BUDGET = 120_000;

describe('pnpm accounts:create (SEC-001)', () => {
  it(
    'with --password-stdin: the account signs in with the piped password, which appears in no output',
    async () => {
      const pw = 'piped password for the first admin';
      const r = cli('create', ['--name', 'Asha K.', '--email', 'asha@fpo1.example', '--role', 'admin', '--org', 'ORG-FPO1', '--password-stdin'], `${pw}\n`);
      expect(r.err).toBe('');
      expect(r.code).toBe(0);
      expect(r.out).not.toContain(pw);
      expect(JSON.parse(r.out.trim().split('\n').at(-1)!)).toMatchObject({ created: 'account', email: 'asha@fpo1.example', role: 'admin', orgId: 'ORG-FPO1', password: 'from stdin' });
      expect(await signIn('asha@fpo1.example', pw)).toBe(200);
    },
    BUDGET,
  );

  it(
    'without --password-stdin and no terminal: generates a password into a new 0600 file, prints only its path; two such accounts never share a hash',
    async () => {
      const made: { email: string; file: string; password: string; userId: string }[] = [];
      for (const email of ['agent1@fpo1.example', 'agent2@fpo1.example']) {
        const r = cli('create', ['--name', 'Field agent', '--email', email, '--role', 'agent', '--org', 'ORG-FPO1']);
        expect(r.code, r.err).toBe(0);
        const summary = JSON.parse(r.out.trim().split('\n').at(-1)!) as { password: string; userId: string };
        const file = summary.password.replace(/^written to /, '');
        expect(file.startsWith(join(DIR, 'credentials'))).toBe(true);
        expect(statSync(file).mode & 0o777).toBe(0o600);
        expect(statSync(join(DIR, 'credentials')).mode & 0o777).toBe(0o700);
        const password = readFileSync(file, 'utf8').trim();
        expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/);
        expect(r.out + r.err).not.toContain(password);
        made.push({ email, file, password, userId: summary.userId });
      }
      const hashes = await Promise.all(made.map(async (m) => (await db.select({ p: account.password }).from(account).where(eq(account.userId, m.userId)))[0]!.p));
      expect(hashes[0]).not.toBe(hashes[1]);
      expect(made[0]!.password).not.toBe(made[1]!.password);
      expect(await signIn(made[0]!.email, made[0]!.password)).toBe(200);
      expect(await signIn(made[1]!.email, made[1]!.password)).toBe(200);
      expect(await signIn(made[0]!.email, made[1]!.password)).toBe(401);
    },
    BUDGET,
  );

  it(
    'refuses a password on the command line, in any spelling, and creates nothing',
    async () => {
      for (const args of [['--password', 'argv password here'], ['--password=argv password here'], ['-p', 'argv password here']]) {
        const r = cli('create', ['--name', 'X', '--email', 'x@fpo1.example', '--role', 'agent', '--org', 'ORG-FPO1', ...args]);
        expect(r.code).toBe(2);
        expect(r.err).toMatch(/never on the command line/);
        expect(r.out + r.err).not.toContain('argv password here');
      }
      expect(await db.select().from(user).where(eq(user.email, 'x@fpo1.example'))).toHaveLength(0);
    },
    BUDGET,
  );

  it(
    'a refusal (a reused password) exits 1 with the code, writes no account and leaves no credentials file',
    async () => {
      const before = readdirSync(join(DIR, 'credentials')).length;
      const r = cli('create', ['--name', 'Y', '--email', 'y@fpo1.example', '--role', 'admin', '--org', 'ORG-FPO1', '--password-stdin'], 'piped password for the first admin\n');
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/^accounts: password_in_use/);
      expect(r.err).not.toContain('piped password');
      expect(await db.select().from(user).where(eq(user.email, 'y@fpo1.example'))).toHaveLength(0);
      expect(readdirSync(join(DIR, 'credentials')).length).toBe(before);
    },
    BUDGET,
  );
});

describe('pnpm accounts:set-password (SEC-001)', () => {
  it(
    'sets a piped password: the old one stops working, the new one signs in',
    async () => {
      const fresh = 'a brand new piped password';
      const r = cli('set-password', ['--email', 'asha@fpo1.example', '--password-stdin'], `${fresh}\n`);
      expect(r.code, r.err).toBe(0);
      expect(r.out).not.toContain(fresh);
      expect(await signIn('asha@fpo1.example', 'piped password for the first admin')).toBe(401);
      expect(await signIn('asha@fpo1.example', fresh)).toBe(200);
    },
    BUDGET,
  );

  it(
    'generates one into a 0600 file when no password is piped',
    async () => {
      const r = cli('set-password', ['--email', 'asha@fpo1.example']);
      expect(r.code, r.err).toBe(0);
      const file = (JSON.parse(r.out.trim().split('\n').at(-1)!) as { password: string }).password.replace(/^written to /, '');
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(await signIn('asha@fpo1.example', readFileSync(file, 'utf8').trim())).toBe(200);
    },
    BUDGET,
  );

  it(
    'refuses an unknown account and a password in argv',
    async () => {
      expect(cli('set-password', ['--email', 'nobody@fpo1.example', '--password-stdin'], 'some long enough password\n')).toMatchObject({ code: 1 });
      const r = cli('set-password', ['--email', 'asha@fpo1.example', '--password=argv password here']);
      expect(r.code).toBe(2);
      expect(r.out + r.err).not.toContain('argv password here');
    },
    BUDGET,
  );
});
