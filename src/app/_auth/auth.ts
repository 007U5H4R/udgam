import { nextCookies } from 'better-auth/next-js';
import { createAuth, type Auth } from '../../lib/auth/auth';
import { getDb } from '../../lib/db/client';

// The app's Better Auth instance (the Next adapter side of src/lib/auth/auth.ts). Built on first use,
// not at import, so `next build` (no secrets) can import route modules. `nextCookies` must be the last
// plugin: it lets Server Actions (sign-in, sign-out) set and clear the session cookie.
let instance: Auth | undefined;

export function appAuth(): Auth {
  instance ??= createAuth(getDb(), [nextCookies()]);
  return instance;
}
