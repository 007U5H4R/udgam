import { APIError } from 'better-auth/api';
import { describe, expect, it } from 'vitest';
import { signInFailure } from './sign-in-error';

// TC-020 / review #4: only a credential refusal says "Email or password is not right"; any other
// refusal from Better Auth is a server-side problem and says "Couldn't sign in right now".

describe('signInFailure', () => {
  it('a wrong email or password (401 INVALID_EMAIL_OR_PASSWORD) is a credential failure', () => {
    expect(signInFailure(APIError.from('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' }))).toBe('credentials');
  });

  it('a malformed email or password (400 INVALID_EMAIL / INVALID_PASSWORD) is a credential failure too', () => {
    expect(signInFailure(APIError.from('BAD_REQUEST', { code: 'INVALID_EMAIL', message: 'x' }))).toBe('credentials');
    expect(signInFailure(APIError.from('BAD_REQUEST', { code: 'INVALID_PASSWORD', message: 'x' }))).toBe('credentials');
  });

  it('a bare 401 is a credential failure', () => {
    expect(signInFailure(new APIError('UNAUTHORIZED'))).toBe('credentials');
  });

  it('a 5xx, a rate limit, or a 401 that means the server failed is "unavailable"', () => {
    expect(signInFailure(new APIError('INTERNAL_SERVER_ERROR'))).toBe('unavailable');
    expect(signInFailure(new APIError('TOO_MANY_REQUESTS'))).toBe('unavailable');
    expect(signInFailure(new APIError('FORBIDDEN', { code: 'INVALID_ORIGIN', message: 'x' }))).toBe('unavailable');
    expect(signInFailure(APIError.from('UNAUTHORIZED', { code: 'FAILED_TO_CREATE_SESSION', message: 'x' }))).toBe('unavailable');
  });

  it('an error that is not from Better Auth is not a refusal (null: the caller rethrows it)', () => {
    expect(signInFailure(new Error('database is down'))).toBeNull();
    expect(signInFailure('nope')).toBeNull();
  });
});
