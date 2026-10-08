import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

let t: TempDb | undefined;
afterEach(async () => {
  await t?.cleanup();
  t = undefined;
});

describe('createDb', () => {
  it('turns on foreign keys and WAL, and sets a 5 s busy timeout on every connection', async () => {
    t = await tempDb();
    expect((await t.client.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys).toBe(1);
    expect((await t.client.execute('PRAGMA journal_mode')).rows[0]?.journal_mode).toBe('wal');
    // a second pooled connection is used while a transaction holds the first
    const tx = await t.client.transaction('write');
    try {
      expect((await t.client.execute('PRAGMA busy_timeout')).rows[0]?.timeout).toBe(5000);
      expect((await t.client.execute('PRAGMA foreign_keys')).rows[0]?.foreign_keys).toBe(1);
    } finally {
      await tx.rollback();
    }
  });
});

describe('writeTx (technical-plan §4.3)', () => {
  it('runs concurrent writers one at a time, in call order, each in its own transaction', async () => {
    t = await tempDb();
    const { writeTx } = await import('./client');
    await t.client.execute('CREATE TABLE w (i INTEGER)');
    const events: string[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        writeTx(t!.db, async (tx) => {
          events.push(`start ${i}`);
          await tx.run(sql`INSERT INTO w (i) VALUES (${i})`);
          await new Promise((r) => setTimeout(r, 5));
          events.push(`end ${i}`);
        }),
      ),
    );
    expect(events).toEqual([0, 1, 2, 3, 4].flatMap((i) => [`start ${i}`, `end ${i}`]));
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM w')).rows[0]?.n).toBe(5);
  });

  it('holds the write lock from the start (BEGIN IMMEDIATE) and rolls back on a throw without blocking the queue', async () => {
    t = await tempDb();
    const { writeTx } = await import('./client');
    await t.client.execute('CREATE TABLE w (i INTEGER)');
    // A second libSQL client on the same file cannot take the write lock while the transaction is open,
    // even before the transaction has written anything.
    const other = createClient({ url: t.url, timeout: 1 });
    try {
      const failing = writeTx(t.db, async () => {
        await expect(other.execute('BEGIN IMMEDIATE')).rejects.toThrow(/locked|busy/i);
        throw new Error('boom');
      });
      const next = writeTx(t.db, (tx) => tx.run(sql`INSERT INTO w (i) VALUES (1)`));
      await expect(failing).rejects.toThrow('boom');
      await next;
      expect((await t.client.execute('SELECT COUNT(*) AS n FROM w')).rows[0]?.n).toBe(1);
    } finally {
      other.close();
    }
  });
});

describe('writeTx re-entrancy guard', () => {
  it('a nested writeTx in the same async context fails at once with a clear error instead of deadlocking', async () => {
    t = await tempDb();
    const { writeTx } = await import('./client');
    await t.client.execute('CREATE TABLE w (i INTEGER)');
    const nestedError = await Promise.race([
      writeTx(t.db, async (tx) => {
        await tx.run(sql`INSERT INTO w (i) VALUES (1)`);
        try {
          await writeTx(t!.db, (inner) => inner.run(sql`INSERT INTO w (i) VALUES (2)`));
          return 'no error';
        } catch (err) {
          return (err as Error).message;
        }
      }),
      new Promise<string>((r) => setTimeout(() => r('deadlocked'), 2_000)),
    ]);
    expect(nestedError).toMatch(/nested writeTx/);
    // the outer transaction committed its own write, and the queue still works
    await writeTx(t.db, (tx) => tx.run(sql`INSERT INTO w (i) VALUES (3)`));
    expect((await t.client.execute('SELECT i FROM w ORDER BY i')).rows.map((r) => r.i)).toEqual([1, 3]);
  });

  it('writers started from separate contexts still queue normally', async () => {
    t = await tempDb();
    const { writeTx } = await import('./client');
    await t.client.execute('CREATE TABLE w (i INTEGER)');
    await Promise.all([1, 2, 3].map((i) => writeTx(t!.db, (tx) => tx.run(sql`INSERT INTO w (i) VALUES (${i})`))));
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM w')).rows[0]?.n).toBe(3);
  });
});

describe('database singleton', () => {
  afterEach(() => {
    vi.doUnmock('@libsql/client');
    vi.doUnmock('../log');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getDbReady resolves to a usable database once the pragmas are in place', async () => {
    t = await tempDb();
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', t.url);
    vi.stubEnv('DATA_DIR', '.');
    const mod = await import('./client');
    const db = await mod.getDbReady();
    expect((await db.run(sql`PRAGMA journal_mode`)).rows[0]?.journal_mode).toBe('wal');
    mod.closeDb();
  });

  it('logs and rethrows a failed pragma, never swallowing it', async () => {
    vi.resetModules();
    const error = vi.fn();
    vi.doMock('../log', () => ({ log: { error } }));
    vi.doMock('@libsql/client', () => ({
      createClient: () => ({
        execute: async () => {
          throw new Error('pragma refused');
        },
        close() {},
      }),
    }));
    vi.stubEnv('DATABASE_URL', 'file:./never-created.db');
    vi.stubEnv('DATA_DIR', '.');
    const mod = await import('./client');
    await expect(mod.getDbReady()).rejects.toThrow('pragma refused');
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(error.mock.calls)).not.toContain('pragma refused'); // class name only
    expect(error.mock.calls[0]?.[1]).toBe('db.pragma_failed');
  });
});
