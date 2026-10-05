import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// TASK-21 fix round 1 (review finding 1): `pnpm seed [--reset]` runs only when the RAW NODE_ENV is
// explicitly `development` or `test`, or on the Playwright server (E2E=1), as scripts/seed-accounts.ts
// does. env.ts defaults an unset NODE_ENV to `development`, so a shell on the production host without
// NODE_ENV must still be refused — and refused before anything under DATA_DIR is touched.

const DATA_DIR = mkdtempSync(join(tmpdir(), 'udgam-seed-guard-'));
const SENTINEL = join(DATA_DIR, 'media', 'ab', 'real.jpg');
const ORIGINAL = { ...process.env };

/** Fresh modules under `vars` (env.ts reads process.env once per module instance). */
async function load(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ['NODE_ENV', 'E2E', 'DATABASE_URL', 'LEDGER_KEY_PATH', 'BETTER_AUTH_SECRET', 'REMOTE_SENSING_PROVIDER', 'GFW_API_KEY', 'CDSE_CLIENT_ID', 'CDSE_CLIENT_SECRET']) delete process.env[k];
  process.env.DATA_DIR = DATA_DIR;
  process.env.LOG_LEVEL = 'silent';
  process.env.REMOTE_SENSING_PROVIDER = 'fixture';
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return { run: await import('./run'), client: await import('../../src/lib/db/client') };
}

/** Run `pnpm seed <argv>` and capture its exit code and error line. */
async function runMain(run: typeof import('./run'), argv: string[]): Promise<{ code: number; error: string }> {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const code = await run.main(argv);
    return { code, error: err.mock.calls.map((c) => String(c[0])).join('\n') };
  } finally {
    err.mockRestore();
    out.mockRestore();
  }
}

async function orgCount(): Promise<number> {
  const { getDbClient, getDbReady, closeDb } = (await load({ NODE_ENV: 'test' })).client;
  await getDbReady();
  const n = Number((await getDbClient().execute('SELECT count(*) AS n FROM organisations')).rows[0]!.n);
  closeDb();
  return n;
}

// A non-empty database and a media file stand in for a production DATA_DIR.
beforeAll(async () => {
  const { client } = await load({ NODE_ENV: 'test' });
  const { prepareDatabase } = await import('../../src/lib/db/migrate');
  const { organisations } = await import('../../src/lib/db/schema');
  const db = await client.getDbReady();
  await prepareDatabase(db);
  await client.writeTx(db, (tx) => tx.insert(organisations).values({ id: 'ORG-REAL', type: 'fpo', name: 'A real FPO' }));
  client.closeDb();
  mkdirSync(join(DATA_DIR, 'media', 'ab'), { recursive: true });
  writeFileSync(SENTINEL, 'real photo bytes');
});
afterEach(async () => {
  (await import('../../src/lib/db/client')).closeDb();
});
afterAll(() => {
  for (const k of Object.keys(process.env)) if (!(k in ORIGINAL)) delete process.env[k];
  Object.assign(process.env, ORIGINAL);
  rmSync(DATA_DIR, { recursive: true, force: true });
});

const REFUSED = /^seed: the demo seed runs only with NODE_ENV=development or NODE_ENV=test, or on the Playwright server \(E2E=1\)/;

describe('the demo seed refuses outside development, test or E2E (review finding 1)', () => {
  it('NODE_ENV unset: `pnpm seed --reset` is refused and nothing under DATA_DIR is deleted', async () => {
    const { run } = await load({ NODE_ENV: undefined });
    const r = await runMain(run, ['--reset']);
    expect(r.code).toBe(1);
    expect(r.error).toMatch(REFUSED);
    expect(readFileSync(SENTINEL, 'utf8')).toBe('real photo bytes');
    expect(existsSync(join(DATA_DIR, 'udgam.db'))).toBe(true);
    expect(await orgCount()).toBe(1);
  });

  it('NODE_ENV=production: refused, nothing deleted', async () => {
    const { run } = await load({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'x'.repeat(40),
      REMOTE_SENSING_PROVIDER: 'live',
      GFW_API_KEY: 'placeholder',
      CDSE_CLIENT_ID: 'placeholder',
      CDSE_CLIENT_SECRET: 'placeholder',
    });
    const r = await runMain(run, ['--reset']);
    expect(r.code).toBe(1);
    expect(r.error).toMatch(REFUSED);
    expect(readFileSync(SENTINEL, 'utf8')).toBe('real photo bytes');
    expect(await orgCount()).toBe(1);
  });

  it('NODE_ENV=production with E2E=1 (the Playwright server): allowed past the guard', async () => {
    const { run } = await load({ NODE_ENV: 'production', E2E: '1', BETTER_AUTH_SECRET: 'x'.repeat(40) });
    // Without --reset the guard is passed and the seed stops only at the non-empty database.
    const r = await runMain(run, []);
    expect(r.code).toBe(1);
    expect(r.error).toBe(`seed: ${run.SEED_NOT_EMPTY}`);
    expect(readFileSync(SENTINEL, 'utf8')).toBe('real photo bytes');
  });

  it('NODE_ENV=development: allowed past the guard', async () => {
    const { run } = await load({ NODE_ENV: 'development' });
    const r = await runMain(run, []);
    expect(r.code).toBe(1);
    expect(r.error).toBe(`seed: ${run.SEED_NOT_EMPTY}`);
    expect(await orgCount()).toBe(1);
  });
});

describe('--reset deletes only the database the app opens (review minor 1)', () => {
  it('refuses --reset, before deleting anything, when DATABASE_URL is not DATA_DIR/udgam.db', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'udgam-seed-elsewhere-'));
    try {
      const { run } = await load({ NODE_ENV: 'test', DATABASE_URL: `file:${join(elsewhere, 'other.db')}` });
      const r = await runMain(run, ['--reset']);
      expect(r.code).toBe(1);
      expect(r.error).toBe(`seed: ${run.SEED_RESET_ELSEWHERE}`);
      expect(run.SEED_RESET_ELSEWHERE).toBe('--reset recreates only DATA_DIR/udgam.db, but DATABASE_URL points elsewhere: unset DATABASE_URL or point it there. Nothing was changed.');
      expect(readFileSync(SENTINEL, 'utf8')).toBe('real photo bytes');
      expect(await orgCount()).toBe(1);
      expect(existsSync(join(elsewhere, 'other.db'))).toBe(false);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('accepts a DATABASE_URL that names DATA_DIR/udgam.db by another spelling (past the reset check)', async () => {
    const { run } = await load({ NODE_ENV: 'test', DATABASE_URL: `file:${join(DATA_DIR, '.', 'media', '..', 'udgam.db')}` });
    expect(run.resetTargetsDataDir()).toBe(true);
  });
});

/** Every file under `dir` and its sha256 (the DATA_DIR before and after a refused run). */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const path = join(dir, name);
    if (statSync(path).isFile()) out[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return out;
}

describe('the season room is checked before --reset (TASK-21 re-review minor 1)', () => {
  it('1 Oct 00:05 IST: `pnpm seed --reset` refuses with the season message and leaves DATA_DIR unchanged', async () => {
    const { run } = await load({ NODE_ENV: 'test' });
    const before = snapshot(DATA_DIR);
    expect(before['udgam.db']).toBeDefined();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T18:35:00.000Z') }); // 1 Oct 2026 00:05 IST
    let r: { code: number; error: string };
    try {
      r = await runMain(run, ['--reset']);
    } finally {
      vi.useRealTimers();
    }
    expect(r.code).toBe(1);
    expect(r.error).toBe('seed: the coffee season began at 00:00 IST; run the seed after 00:10 IST, so Y01’s pickings fit in the new season');
    expect(snapshot(DATA_DIR)).toEqual(before);
    expect(readFileSync(SENTINEL, 'utf8')).toBe('real photo bytes');
    expect(await orgCount()).toBe(1);
  });
});
