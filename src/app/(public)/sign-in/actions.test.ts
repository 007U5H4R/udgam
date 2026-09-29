import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outcome } from '../../../../tests/helpers/next';

// TSK-04.6 / TC-020 / review #4: the sign-in action maps only credential refusals to the "Email or
// password is not right" message. Other Better Auth refusals answer "unavailable" and are logged;
// errors that are not refusals are rethrown.

const h = vi.hoisted(() => ({ signInEmail: vi.fn(), error: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../../_auth/auth', () => ({ appAuth: () => ({ api: { signInEmail: h.signInEmail } }) }));
vi.mock('../../../lib/log', () => ({ log: { error: h.error } }));

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('password', password);
  return f;
};

beforeEach(() => {
  h.signInEmail.mockReset();
  h.error.mockReset();
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

  it('success → redirect to the role home', async () => {
    const { signIn } = await import('./actions');
    h.signInEmail.mockResolvedValue({ user: { role: 'admin' } });
    expect(await outcome(() => signIn({ error: null }, form('admin@a.test', 'pw')))).toEqual({ redirect: '/admin' });
  });
});
