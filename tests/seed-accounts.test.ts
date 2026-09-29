import { afterEach, describe, expect, it, vi } from 'vitest';

// TSK-04.5: the demo password comes from SEED_PASSWORD; the default exists only outside production.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** A production environment: an auth secret and the live provider (EXE12), placeholder values only. */
const PRODUCTION = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), REMOTE_SENSING_PROVIDER: 'live', GFW_API_KEY: 'k', CDSE_CLIENT_ID: 'i', CDSE_CLIENT_SECRET: 's' };

// Heavy by design: each case re-imports the seed script, which loads Better Auth (and its password hashing) cold.
const BUDGET = 60_000;

const load = async (vars: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('../scripts/seed-accounts');
};

describe('seedPassword', () => {
  it('uses SEED_PASSWORD when set', async () => {
    const { seedPassword } = await load({ ...PRODUCTION, SEED_PASSWORD: 'a long seed value' });
    expect(seedPassword()).toBe('a long seed value');
  }, BUDGET);

  it('falls back to the demo default in dev and test only', async () => {
    const dev = await load({ NODE_ENV: 'development', SEED_PASSWORD: '' });
    expect(dev.seedPassword()).toBe(dev.DEV_SEED_PASSWORD);
    const test = await load({ NODE_ENV: 'test', SEED_PASSWORD: '' });
    expect(test.seedPassword()).toBe(test.DEV_SEED_PASSWORD);
  }, BUDGET);

  it('refuses to seed production without SEED_PASSWORD', async () => {
    const { seedPassword } = await load({ ...PRODUCTION, SEED_PASSWORD: '' });
    expect(() => seedPassword()).toThrow(/SEED_PASSWORD is required/);
  }, BUDGET);

  it('refuses the demo default when NODE_ENV is not set explicitly (a shell on the production host)', async () => {
    const { seedPassword } = await load({ NODE_ENV: '', SEED_PASSWORD: '' });
    expect(() => seedPassword()).toThrow(/SEED_PASSWORD is required/);
  }, BUDGET);

  it('uses SEED_PASSWORD when NODE_ENV is not set', async () => {
    const { seedPassword } = await load({ NODE_ENV: '', SEED_PASSWORD: 'a long seed value' });
    expect(seedPassword()).toBe('a long seed value');
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
