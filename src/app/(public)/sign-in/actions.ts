'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { appAuth } from '../../_auth/auth';

// Sign-in and sign-out Server Actions (TKT-04). Public by nature: they create or end a session and
// read nothing org-scoped. Cookies are set and cleared by Better Auth's nextCookies plugin.

/** End the session (if any) and go to the sign-in page. */
export async function signOut(): Promise<void> {
  try {
    await appAuth().api.signOut({ headers: await headers() });
  } catch {
    // already signed out: nothing to end
  }
  redirect('/sign-in');
}
