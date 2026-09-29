import { randomBytes } from 'node:crypto';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '../config/env';
import { writeTx, type Db } from '../db/client';
import { log } from '../log';

// Better Auth (technical-plan §10, TSK-04.1): email + password for seeded accounts only (no public
// sign-up), the Drizzle adapter on the app's libSQL database, and `role` + `orgId` on the user. Both
// are `input: false`: no endpoint accepts them from a client, so a session's org always comes from
// the database (EVAL-080, CF-10).
//
// Framework-free (src/lib): the Next cookie plugin is passed in by src/app/_auth/auth.ts.

/**
 * The stand-in dev secret lives on globalThis, not in this module (TASK-20 fix round 1): `next start`
 * instantiates this module once per Turbopack runtime (route handlers; pages and Server Actions), like
 * src/lib/db/client.ts. A per-module secret would sign the cookie at sign-in (Server Action) with one
 * key and verify it in /api/capture (route handler) with another.
 */
const DEV_SECRET_KEY = Symbol.for('udgam.auth.dev-secret');
const processState = globalThis as Record<symbol, string | undefined>;

/**
 * BETTER_AUTH_SECRET from env. Outside production a random per-process secret stands in (sessions
 * then end when the process restarts); in production a missing secret is a startup error.
 */
export function authSecret(): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === 'production') throw new Error('BETTER_AUTH_SECRET is required when NODE_ENV=production');
  let secret = processState[DEV_SECRET_KEY];
  if (!secret) {
    secret = processState[DEV_SECRET_KEY] = randomBytes(32).toString('hex');
    log.warn('auth.dev_secret'); // the name of the event only, never the value
  }
  return secret;
}

const WRITES = new Set(['insert', 'update', 'delete']);

/**
 * Replays a recorded drizzle query-builder chain inside `writeTx` when it is awaited. Better Auth
 * writes with bare `db.insert(...)`, `db.update(...)` and `db.delete(...)`; on the libSQL file driver
 * a bare write while a capture transaction is open busy-waits on the event loop and stalls the server
 * (see writeTx). Routing its writes through the same in-process FIFO keeps the one-writer rule.
 */
function queuedWrite(db: Db, steps: [PropertyKey, unknown[]][]): unknown {
  // Started on the first read of `then` and reused, so a thenable probe followed by `await` writes once.
  let run: Promise<unknown> | undefined;
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          run ??= writeTx(db, async (tx) => {
            let q: unknown = tx;
            for (const [method, args] of steps) q = (q as Record<PropertyKey, (...a: unknown[]) => unknown>)[method]!(...args);
            return await q;
          });
          return run.then.bind(run);
        }
        if (typeof prop === 'symbol') return undefined;
        return (...args: unknown[]) => queuedWrite(db, [...steps, [prop, args]]);
      },
    },
  );
}

/** The database handle Better Auth sees: reads go straight to `db`, writes queue through `writeTx`. */
export function serialisedWrites(db: Db): Db {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && WRITES.has(prop)) return (...args: unknown[]) => queuedWrite(target, [[prop, args]]);
      if (prop === 'transaction') {
        return () => {
          throw new Error('Better Auth must not open its own transaction; writes go through writeTx');
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

function options(db: Db, plugins: BetterAuthPlugin[]) {
  const production = env.NODE_ENV === 'production';
  return {
    appName: 'Udgam',
    secret: authSecret(),
    baseURL: env.BETTER_AUTH_URL ?? env.PUBLIC_BASE_URL,
    database: drizzleAdapter(serialisedWrites(db), { provider: 'sqlite' }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        role: { type: 'string', input: false, required: true },
        orgId: { type: 'string', input: false, required: true },
      },
    },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: production },
    },
    telemetry: { enabled: false },
    plugins,
  } as const;
}

/** A Better Auth instance on `db`. `plugins` lets the Next adapter add its cookie plugin. */
export function createAuth(db: Db, plugins: BetterAuthPlugin[] = []) {
  return betterAuth(options(db, plugins));
}

export type Auth = ReturnType<typeof createAuth>;
