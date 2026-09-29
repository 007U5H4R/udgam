'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME, isRole } from '../../../lib/auth/session';
import { appAuth } from '../../_auth/auth';

// Sign-in and sign-out Server Actions (TKT-04). Public by nature: they create or end a session and
// read nothing org-scoped. Cookies are set and cleared by Better Auth's nextCookies plugin.

export type SignInState = { error: boolean };

/**
 * Sign in with email + password and go to the role's home. A refusal answers `{ error: true }` and the
 * form shows one message for every cause (never which field was wrong, TC-020). Anything else — the
 * database down, a bug — is not a wrong password and is rethrown.
 */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (email === '' || password === '') return { error: true };
  let role: unknown;
  try {
    const res = await appAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
    role = res.user.role;
  } catch (err) {
    if (err instanceof APIError) return { error: true };
    throw err;
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
