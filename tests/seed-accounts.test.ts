import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tempDirs } from './helpers/tmp';

const tempDir = tempDirs();

// TSK-04.5: the demo password comes from SEED_PASSWORD; the default exists only outside production.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** A production environment: an auth secret and the live provider (EXE12), placeholder values only. */
const PRODUCTION = { NODE_ENV: 'production' as const, BETTER_AUTH_SECRET: 'x'.repeat(32), REMOTE_SENSING_PROVIDER: 'live', GFW_API_KEY: 'k', CDSE_CLIENT_ID: 'i', CDSE_CLIENT_SECRET: 's' };

// Heavy by design: each case re-imports the seed script, which loads Better Auth (and its password hashing) cold.
const BUDGET = 60_000;

const load = async (vars: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('../scripts/seed-accounts');
};

describe('seedPassword', () => {
  it('uses SEED_PASSWORD when set, in development or test', async () => {
    const { seedPassword } = await load({ NODE_ENV: 'development', SEED_PASSWORD: 'a long seed value' });
    expect(seedPassword()).toBe('a long seed value');
  }, BUDGET);

  it('falls back to the demo default in dev and test only', async () => {
    const dev = await load({ NODE_ENV: 'development', SEED_PASSWORD: '' });
    expect(dev.seedPassword()).toBe(dev.DEV_SEED_PASSWORD);
    const test = await load({ NODE_ENV: 'test', SEED_PASSWORD: '' });
    expect(test.seedPassword()).toBe(test.DEV_SEED_PASSWORD);
  }, BUDGET);
});

// SEC-001 (TKT-28, EXE35): the demo accounts share one password by design, so the account seed never
// runs in production, whatever SEED_PASSWORD says. Production accounts come from `pnpm accounts:create`.
describe('the account seed refuses production (SEC-001)', () => {
  const REFUSED = /seed-accounts: the demo accounts are seeded only with NODE_ENV=development or NODE_ENV=test, or on the Playwright server \(E2E=1\); production accounts come from pnpm accounts:create/;

  it('NODE_ENV=production is refused, with or without SEED_PASSWORD', async () => {
    expect((await load({ ...PRODUCTION, SEED_PASSWORD: '' })).seedPassword).toThrow(REFUSED);
    expect((await load({ ...PRODUCTION, SEED_PASSWORD: 'a long seed value' })).seedPassword).toThrow(REFUSED);
  }, BUDGET);

  it('NODE_ENV unset (a shell on the production host) is refused, with or without SEED_PASSWORD', async () => {
    expect((await load({ NODE_ENV: '', SEED_PASSWORD: '' })).seedPassword).toThrow(REFUSED);
    expect((await load({ NODE_ENV: '', SEED_PASSWORD: 'a long seed value' })).seedPassword).toThrow(REFUSED);
  }, BUDGET);

  it('the Playwright server (E2E=1, a production build) may seed', async () => {
    const { seedPassword, DEV_SEED_PASSWORD } = await load({ ...PRODUCTION, REMOTE_SENSING_PROVIDER: 'fixture', E2E: '1', SEED_PASSWORD: '' });
    expect(seedPassword()).toBe(DEV_SEED_PASSWORD);
  }, BUDGET);

  it('`tsx scripts/seed-accounts.ts` in production exits 1 with the refusal and writes nothing', () => {
    const dir = tempDir('udgam-seed-acc-');
    const r = spawnSync('./node_modules/.bin/tsx', ['scripts/seed-accounts.ts'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...PRODUCTION, DATA_DIR: dir, SEED_PASSWORD: 'a long seed value', LOG_LEVEL: 'silent' },
      timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(REFUSED);
    expect(r.stderr + r.stdout).not.toContain('a long seed value');
    expect(existsSync(join(dir, 'udgam.db'))).toBe(false);
  }, BUDGET);
});

// EXE13 (EV16): a seeded user ID reaches anchored ledger payloads (device_enrolled.agentId), so it must be
// opaque, like Better Auth's generated IDs: `USR-` + 8 Crockford base32 characters, no org name or role.
describe('DEMO_ACCOUNTS ids (EXE13)', () => {
  it('every seeded user ID is opaque: ^USR-[0-9A-HJKMNP-TV-Z]{8}$, unique, and carries no org name, role or email part', async () => {
    const { DEMO_ACCOUNTS, DEMO_ORGS } = await load({ NODE_ENV: 'test', SEED_PASSWORD: '' });
    const accounts = Object.values(DEMO_ACCOUNTS);
    const orgName = (id: string) => Object.values(DEMO_ORGS).find((o) => o.id === id)!.name;
    for (const a of accounts) {
      expect(a.id).toMatch(/^USR-[0-9A-HJKMNP-TV-Z]{8}$/);
      const words = [...`${orgName(a.orgId)} ${a.orgId} ${a.name} ${a.role} ${a.email}`.toUpperCase().matchAll(/[A-Z]{4,}/g)].map((w) => w[0]);
      for (const w of words) expect(a.id, `${a.id} contains ${w}`).not.toContain(w);
    }
    expect(new Set(accounts.map((a) => a.id)).size).toBe(accounts.length);
  }, BUDGET);
});
