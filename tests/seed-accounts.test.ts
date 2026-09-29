import { afterEach, describe, expect, it, vi } from 'vitest';

// TSK-04.5: the demo password comes from SEED_PASSWORD; the default exists only outside production.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// Heavy by design: each case re-imports the seed script, which loads Better Auth (and its password hashing) cold.
const BUDGET = 60_000;

const load = async (vars: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('../scripts/seed-accounts');
};

describe('seedPassword', () => {
  it('uses SEED_PASSWORD when set', async () => {
    const { seedPassword } = await load({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), SEED_PASSWORD: 'a long seed value' });
    expect(seedPassword()).toBe('a long seed value');
  }, BUDGET);

  it('falls back to the demo default in dev and test only', async () => {
    const dev = await load({ NODE_ENV: 'development', SEED_PASSWORD: '' });
    expect(dev.seedPassword()).toBe(dev.DEV_SEED_PASSWORD);
    const test = await load({ NODE_ENV: 'test', SEED_PASSWORD: '' });
    expect(test.seedPassword()).toBe(test.DEV_SEED_PASSWORD);
  }, BUDGET);

  it('refuses to seed production without SEED_PASSWORD', async () => {
    const { seedPassword } = await load({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), SEED_PASSWORD: '' });
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
