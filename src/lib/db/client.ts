import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { env } from '../config/env';
import { log } from '../log';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;

/** A write-transaction handle (`writeTx(db, tx => …)`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Process-wide state, kept on globalThis rather than in this module (TKT-19, root cause of the SQLITE_BUSY
 * seen under parallel e2e load): `next start` bundles this file into two Turbopack runtimes — route
 * handlers and pages/Server Actions — each with its own module cache, so the module is instantiated
 * twice in one process. Module-level state gave each instance its own libSQL client and its own write
 * queue, so a route handler's write transaction and a Server Action's could overlap, and the second
 * BEGIN IMMEDIATE busy-waited on the very event loop the first needed to finish (see writeTx).
 */
type ProcessState = {
  singleton: DbHandle | undefined;
  writeQueues: WeakMap<Db, Promise<unknown>>;
  /** Set while a writeTx body runs, across its awaits (re-entrancy guard). */
  insideWriteTx: AsyncLocalStorage<true>;
};
const STATE_KEY = Symbol.for('udgam.db.process-state');
const state: ProcessState = ((globalThis as Record<symbol, unknown>)[STATE_KEY] as ProcessState | undefined) ??
  ((globalThis as Record<symbol, unknown>)[STATE_KEY] = {
    singleton: undefined,
    writeQueues: new WeakMap(),
    insideWriteTx: new AsyncLocalStorage<true>(),
  } satisfies ProcessState) as ProcessState;

/**
 * Run `fn` in a write transaction (BEGIN IMMEDIATE, technical-plan §4.3). Every write goes through here.
 *
 * libSQL's file driver is synchronous: a connection that finds the write lock taken busy-waits for up
 * to the 5 s busy timeout *on the event loop*, so the in-process holder can never finish and the
 * waiter fails with SQLITE_BUSY. Writers in this process therefore queue on an in-process FIFO first;
 * BEGIN IMMEDIATE and the busy timeout still serialise against other processes (seed scripts, CLI).
 */
export function writeTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // A writeTx inside a writeTx body would wait behind itself and stall every later write for good.
  if (state.insideWriteTx.getStore()) {
    return Promise.reject(new Error('nested writeTx: use the enclosing transaction handle instead'));
  }
  const previous = state.writeQueues.get(db) ?? Promise.resolve();
  const run = previous.then(() => state.insideWriteTx.run(true, () => db.transaction(fn, { behavior: 'immediate' })));
  state.writeQueues.set(
    db,
    run.catch(() => undefined),
  );
  return run;
}

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

function handle(): DbHandle {
  if (!state.singleton) {
    mkdirSync(env.DATA_DIR, { recursive: true });
    const h = createDb(env.DATABASE_URL);
    // Callers of the sync getDb() never see `ready`, so a failed pragma is logged here (class only,
    // no message or path). Awaiters of `ready` still get the rejection.
    h.ready.catch((err: unknown) => {
      log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'db.pragma_failed');
    });
    state.singleton = h;
  }
  return state.singleton;
}

/**
 * Process-wide database from env.DATABASE_URL (one per process, however many times this module is
 * bundled); creates DATA_DIR on first use. Synchronous, so the
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
  state.singleton?.client.close();
  state.singleton = undefined;
}
