import { mkdirSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { env } from '../config/env';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  client: Client;
  /** Resolves once journal_mode=WAL and foreign_keys=ON have been issued. */
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
  // A failure surfaces to whoever awaits `ready`; avoid an unhandled rejection for callers that do not.
  ready.catch(() => undefined);
  return { db: drizzle(client, { schema }), client, ready };
}

let singleton: DbHandle | undefined;

function handle(): DbHandle {
  if (!singleton) {
    mkdirSync(env.DATA_DIR, { recursive: true });
    singleton = createDb(env.DATABASE_URL);
  }
  return singleton;
}

/** Process-wide database from env.DATABASE_URL; creates DATA_DIR on first use. */
export function getDb(): Db {
  return handle().db;
}

/** The underlying libSQL client of the singleton (health ping, shutdown). */
export function getDbClient(): Client {
  return handle().client;
}
