import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outcome } from '../../../../tests/helpers/next';

// TSK-04.6 / TC-020 / review #4: the sign-in action maps only credential refusals to the "Email or
// password is not right" message. Other Better Auth refusals answer "unavailable" and are logged;
// errors that are not refusals are rethrown.

const h = vi.hoisted(() => ({ signInEmail: vi.fn(), error: vi.fn(), warn: vi.fn(), reserve: vi.fn(), refund: vi.fn(), js: false }));
// `js`: the form was submitted by the Next client (a fetch carrying Next-Action), not posted without JavaScript.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.5', ...(h.js ? { 'next-action': '7f00c0ffee' } : {}) }),
}));
vi.mock('../../_auth/auth', () => ({ appAuth: () => ({ api: { signInEmail: h.signInEmail } }) }));
vi.mock('../../../lib/log', async (importOriginal) => ({
  errFields: (await importOriginal<typeof import('../../../lib/log')>()).errFields,
  log: { error: h.error, warn: h.warn },
}));
vi.mock('../../../lib/db/client', () => ({ getDbReady: async () => 'db' }));
vi.mock('../../../lib/auth/sign-in-limit', () => ({ reserveSignIn: h.reserve, refundSignIn: h.refund }));

const RESERVED = { ok: true, keys: ['k'], windowStart: 0 } as const;

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
};

beforeEach(() => {
  h.signInEmail.mockReset();
  h.error.mockReset();
  h.warn.mockReset();
  h.reserve.mockReset().mockResolvedValue(RESERVED);
  h.refund.mockReset().mockResolvedValue(undefined);
  h.js = false;
});

describe('signIn action', () => {
  it('a wrong password or unknown email → { error: "credentials" }, nothing logged', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockRejectedValue(APIError.from('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }));
    expect(await signIn({ error: null }, form('agent@a.test', 'wrong'))).toEqual({ error: 'credentials' });
    expect(h.error).not.toHaveBeenCalled();
  });

  it('an empty field → { error: "credentials" } without calling Better Auth', async () => {
    const { signIn } = await import('./actions');
    expect(await signIn({ error: null }, form('', 'x'))).toEqual({ error: 'credentials' });
    expect(h.signInEmail).not.toHaveBeenCalled();
  });

  it('a 5xx refusal → { error: "unavailable" } and one log line with status and code only', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockRejectedValue(APIError.from('INTERNAL_SERVER_ERROR', { code: 'FAILED_TO_GET_SESSION', message: 'boom' }));
    expect(await signIn({ error: null }, form('agent@a.test', 'secret pw'))).toEqual({ error: 'unavailable' });
    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalledWith({ status: 500, code: 'FAILED_TO_GET_SESSION' }, 'auth.sign_in_refused');
    expect(JSON.stringify(h.error.mock.calls)).not.toMatch(/agent@a\.test|secret pw/);
  });

  it('a rate limit (429) → { error: "unavailable" }', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockRejectedValue(new APIError('TOO_MANY_REQUESTS'));
    expect(await signIn({ error: null }, form('agent@a.test', 'pw'))).toEqual({ error: 'unavailable' });
  });

  it('an error that is not a Better Auth refusal is rethrown', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockRejectedValue(new Error('database is down'));
    await expect(signIn({ error: null }, form('agent@a.test', 'pw'))).rejects.toThrow('database is down');
  });

  it('TKT-19: every attempt reserves a slot for the email and the address before Better Auth; a credential failure keeps it', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockImplementation(() => {
      expect(h.reserve).toHaveBeenCalledWith('db', 'agent@a.test', '203.0.113.5'); // reserved first
      return Promise.reject(APIError.from('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }));
    });
    await signIn({ error: null }, form('agent@a.test', 'wrong'));
    expect(h.signInEmail).toHaveBeenCalledTimes(1);
    expect(h.refund).not.toHaveBeenCalled();
  });

  it('TKT-19: once throttled → { error: "unavailable" } without calling Better Auth, logged without the email', async () => {
    const { signIn } = await import('./actions');
    h.reserve.mockResolvedValue({ ok: false });
    expect(await signIn({ error: null }, form('agent@a.test', 'right password'))).toEqual({ error: 'unavailable' });
    expect(h.reserve).toHaveBeenCalledWith('db', 'agent@a.test', '203.0.113.5');
    expect(h.signInEmail).not.toHaveBeenCalled();
    expect(h.refund).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith('auth.sign_in_throttled');
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain('agent@a.test');
  });

  it('TKT-19: a success, a server-side refusal or a thrown error gives the reservation back', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockRejectedValue(APIError.from('INTERNAL_SERVER_ERROR', { code: 'FAILED_TO_GET_SESSION', message: 'boom' }));
    await signIn({ error: null }, form('agent@a.test', 'pw'));
    expect(h.refund).toHaveBeenLastCalledWith('db', RESERVED);
    h.signInEmail.mockReset().mockRejectedValue(new Error('database is down'));
    await expect(signIn({ error: null }, form('agent@a.test', 'pw'))).rejects.toThrow('database is down');
    h.signInEmail.mockReset().mockResolvedValue({ user: { role: 'agent' } });
    expect(await outcome(() => signIn({ error: null }, form('agent@a.test', 'pw')))).toEqual({ redirect: '/field' });
    expect(h.refund).toHaveBeenCalledTimes(3);
  });

  it('TKT-19: a failed refund is logged and never fails a successful sign-in', async () => {
    const { signIn } = await import('./actions');
    h.refund.mockRejectedValue(new Error('SQLITE_BUSY'));
    h.signInEmail.mockResolvedValue({ user: { role: 'admin' } });
    expect(await outcome(() => signIn({ error: null }, form('admin@a.test', 'pw')))).toEqual({ redirect: '/admin' });
    expect(h.error).toHaveBeenCalledWith({ errClass: 'Error' }, 'auth.sign_in_refund_failed');
  });

  it('success, form posted without JavaScript → redirect to the role home (Next answers a 303: a full page load)', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockResolvedValue({ user: { role: 'admin' } });
    expect(await outcome(() => signIn({ error: null }, form('admin@a.test', 'pw')))).toEqual({ redirect: '/admin' });
  });

  it('success from the Next client → the role home for a full page load, never a client-side redirect (fix round 2, N1)', async () => {
    const { signIn } = await import('./actions');
    h.js = true;
    for (const [role, home] of [
      ['admin', '/admin'],
      ['agent', '/field'],
      ['buyer', '/buyer'],
      ['processor', '/processor'],
      ['something else', '/sign-in'],
    ] as const) {
      h.signInEmail.mockResolvedValue({ user: { role } });
      expect(await outcome(() => signIn({ error: null }, form('x@a.test', 'pw'))), role).toEqual({ rendered: { error: null, home } });
    }
    expect(h.refund).toHaveBeenCalledTimes(5);
    // refusals are unchanged
    h.signInEmail.mockRejectedValue(APIError.from('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }));
    expect(await signIn({ error: null }, form('x@a.test', 'wrong'))).toEqual({ error: 'credentials' });
  });
});
