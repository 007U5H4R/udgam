import { mkdirSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { env } from '../config/env';
import { log } from '../log';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  client: Client;
  /** Resolves once journal_mode=WAL and foreign_keys=ON have been issued; rejects if either fails. Await it. */
  ready: Promise<void>;
}

/**
 * Open a libSQL database. `timeout` is the busy timeout (5000 ms) and is applied by libsql to every
 * pooled connection, unlike a `PRAGMA busy_timeout` which only reaches one. foreign_keys is on by
 * default in libsql and is re-asserted here; WAL is persistent in the database file.
 */
export function createDb(url: string): DbHandle {
  const client = createClient({ url, timeout: 5000 });
  const ready = (async () => {
    await client.execute('PRAGMA journal_mode=WAL');
    await client.execute('PRAGMA foreign_keys=ON');
  })();
  return { db: drizzle(client, { schema }), client, ready };
}

let singleton: DbHandle | undefined;

function handle(): DbHandle {
  if (!singleton) {
    mkdirSync(env.DATA_DIR, { recursive: true });
    const h = createDb(env.DATABASE_URL);
    // Callers of the sync getDb() never see `ready`, so a failed pragma is logged here (class only,
    // no message or path). Awaiters of `ready` still get the rejection.
    h.ready.catch((err: unknown) => {
      log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'db.pragma_failed');
    });
    singleton = h;
  }
  return singleton;
}

/**
 * Process-wide database from env.DATABASE_URL; creates DATA_DIR on first use. Synchronous, so the
 * pragmas may still be in flight on the first call: await `getDbReady()` on paths that need them.
 */
export function getDb(): Db {
  return handle().db;
}

/** Like getDb(), but resolves only after WAL and foreign_keys are set, and rejects if that failed. */
export async function getDbReady(): Promise<Db> {
  const h = handle();
  await h.ready;
  return h.db;
}

/** The underlying libSQL client of the singleton (health ping, shutdown). */
export function getDbClient(): Client {
  return handle().client;
}

/** Close the singleton (shutdown, tests). A later getDb() opens a fresh one. No-op if never opened. */
export function closeDb(): void {
  singleton?.client.close();
  singleton = undefined;
}
