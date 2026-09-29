'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME, isRole } from '../../../lib/auth/session';
import { refusalInfo, signInFailure, type SignInFailure } from '../../../lib/auth/sign-in-error';
import { recordSignInFailure, signInBlocked } from '../../../lib/auth/sign-in-limit';
import { clientIp } from '../../../lib/client-ip';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';
import { appAuth } from '../../_auth/auth';

// Sign-in and sign-out Server Actions (TKT-04). Public by nature: they create or end a session and
// read nothing org-scoped. Cookies are set and cleared by Better Auth's nextCookies plugin.

export type SignInState = { error: SignInFailure | null };

/**
 * Sign in with email + password and go to the role's home. A credential refusal answers
 * `{ error: 'credentials' }` and the form shows one message for every cause (never which field was
 * wrong, TC-020). Any other Better Auth refusal (5xx, rate limit, a session it could not create)
 * answers `{ error: 'unavailable' }` and is logged by status and code. Anything else (the database
 * down, a bug) is rethrown. Credential failures are counted per email and per address (TKT-19): past
 * the limit every attempt answers `unavailable` without reaching Better Auth, whose own rate limiter
 * only sees HTTP requests, not this in-process call.
 */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (email === '' || password === '') return { error: 'credentials' };
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const db = await getDbReady();
  if (await signInBlocked(db, email, ip)) {
    log.warn('auth.sign_in_throttled'); // never the email or the address
    return { error: 'unavailable' };
  }
  let role: unknown;
  try {
    const res = await appAuth().api.signInEmail({ body: { email, password }, headers: requestHeaders });
    role = res.user.role;
  } catch (err) {
    const failure = signInFailure(err);
    if (failure === null) throw err;
    if (failure === 'unavailable') log.error(refusalInfo(err as APIError), 'auth.sign_in_refused');
    else await recordSignInFailure(db, email, ip);
    return { error: failure };
  }
  redirect(isRole(role) ? HOME[role] : '/sign-in');
}

/** End the session (if any) and go to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    await appAuth().api.signOut({ headers: await headers() });
  } catch (err) {
    if (!(err instanceof APIError)) throw err; // already signed out: nothing to end
  }
  redirect('/sign-in');
}
