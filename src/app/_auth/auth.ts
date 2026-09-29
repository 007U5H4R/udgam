import { nextCookies } from 'better-auth/next-js';
import { createAuth, type Auth } from '../../lib/auth/auth';
import { getDb, type Db } from '../../lib/db/client';

// The app's Better Auth instance (the Next adapter side of src/lib/auth/auth.ts). Built on first use,
// not at import, so `next build` (no secrets) can import route modules. `nextCookies` must be the last
// plugin: it lets Server Actions (sign-in, sign-out) set and clear the session cookie.
// Keyed on the database handle, so after closeDb() the next call builds on the fresh handle.
let instance: { db: Db; auth: Auth } | undefined;

export function appAuth(): Auth {
  const db = getDb();
  if (instance?.db !== db) instance = { db, auth: createAuth(db, [nextCookies()]) };
  return instance.auth;
}
