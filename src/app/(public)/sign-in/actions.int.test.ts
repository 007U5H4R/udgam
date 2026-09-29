// @vitest-environment node
import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { outcome } from '../../../../tests/helpers/next';

// TASK-20 fix round 1 (review major 4): the sign-in throttle reserves each attempt atomically before
// Better Auth is called, so a parallel burst of wrong passwords gets at most the limit through, not N.
// Real rate_limits table; Better Auth's password check is stubbed (slow, always wrong).

const h = vi.hoisted(() => ({ signInEmail: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.5' }) }));
vi.mock('../../_auth/auth', () => ({ appAuth: () => ({ api: { signInEmail: h.signInEmail } }) }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  h.signInEmail.mockReset();
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
};
const wrong = () => APIError.from('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });

describe('signIn action throttle (real rate_limits)', () => {
  it('20 parallel wrong-password attempts: at most 10 reach Better Auth, the rest answer "unavailable"', async () => {
    // scrypt is slow: every call is still in flight when the others start
    h.signInEmail.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(wrong()), 50)));
    const { signIn } = await import('./actions');
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => signIn({ error: null }, form('agent@a.test', `guess ${i}`))));
    expect(h.signInEmail.mock.calls.length).toBeLessThanOrEqual(10);
    expect(h.signInEmail).toHaveBeenCalledTimes(10);
    expect(results.filter((r) => r.error === 'credentials')).toHaveLength(10);
    expect(results.filter((r) => r.error === 'unavailable')).toHaveLength(10);
  });

  it('successful sign-ins give their reservation back: 30 in a row never throttle', async () => {
    h.signInEmail.mockResolvedValue({ user: { role: 'agent' } });
    const { signIn } = await import('./actions');
    for (let i = 0; i < 30; i++) expect(await outcome(() => signIn({ error: null }, form('agent@a.test', 'right')))).toEqual({ redirect: '/field' });
    expect(h.signInEmail).toHaveBeenCalledTimes(30);
  });
});
