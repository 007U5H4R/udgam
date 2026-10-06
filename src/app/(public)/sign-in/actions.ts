'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME, isRole } from '../../../lib/auth/session';
import { refusalInfo, signInFailure, type SignInFailure } from '../../../lib/auth/sign-in-error';
import { refundSignIn, reserveSignIn, type SignInReservation } from '../../../lib/auth/sign-in-limit';
import { clientIp } from '../../../lib/client-ip';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';
import { errFields } from '../../_log/err-fields';
import { appAuth } from '../../_auth/auth';

// Sign-in and sign-out Server Actions (TKT-04). Public by nature: they create or end a session and
// read nothing org-scoped. Cookies are set and cleared by Better Auth's nextCookies plugin.

/**
 * The form's state. `home` is set on success: the form then loads that page as a new document
 * (`window.location.assign`), never by a client navigation.
 */
export type SignInState = { error: SignInFailure | null; home?: string };

/**
 * Sign in with email + password and go to the role's home. A Content-Security-Policy belongs to the
 * document, and a redirect() from a Server Action is applied as a client navigation: the admin would land
 * on /admin still inside the /sign-in document, whose policy has no map-tile host, and every later click
 * would stay in it (TASK-20 fix round 2, review N1). So a success answers `{ error: null, home }` and the
 * form loads `home` in full. A form posted without JavaScript (no `Next-Action` header) still gets the
 * redirect, which Next answers with a 303 and so a full load too. A credential refusal answers
 * `{ error: 'credentials' }` and the form shows one message for every cause (never which field was
 * wrong, TC-020). Any other Better Auth refusal (5xx, rate limit, a session it could not create)
 * answers `{ error: 'unavailable' }` and is logged by status and code. Anything else (the database
 * down, a bug) is rethrown. Attempts are throttled per (email, address), per email and per address
 * (TKT-19, fix round 1): each one reserves a slot atomically before Better Auth is called, and gives it
 * back unless the credentials were wrong. Past a limit the attempt answers `unavailable` without reaching
 * Better Auth, whose own rate limiter only sees HTTP requests, not this in-process call.
 */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (email === '' || password === '') return { error: 'credentials' };
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const db = await getDbReady();
  const reservation = await reserveSignIn(db, email, ip);
  if (!reservation.ok) {
    log.warn('auth.sign_in_throttled'); // never the email or the address
    return { error: 'unavailable' };
  }
  let role: unknown;
  try {
    const res = await appAuth().api.signInEmail({ body: { email, password }, headers: requestHeaders });
    role = res.user.role;
  } catch (err) {
    const failure = signInFailure(err);
    if (failure !== 'credentials') await refund(reservation); // only wrong credentials count
    if (failure === null) throw err;
    if (failure === 'unavailable') log.error(refusalInfo(err as APIError), 'auth.sign_in_refused');
    return { error: failure };
  }
  await refund(reservation);
  const home = isRole(role) ? HOME[role] : '/sign-in';
  if (!requestHeaders.has('next-action')) redirect(home); // no JavaScript: a 303, a full page load
  return { error: null, home };
}

/** Give an attempt's reservation back. Never fails the sign-in: a lost refund only counts one attempt. */
async function refund(reservation: SignInReservation): Promise<void> {
  try {
    await refundSignIn(await getDbReady(), reservation);
  } catch (err) {
    log.error(errFields(err), 'auth.sign_in_refund_failed');
  }
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
