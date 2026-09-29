import { afterEach, describe, expect, it } from 'vitest';
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
