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
