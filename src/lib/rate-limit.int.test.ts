import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../tests/helpers/db';
import { writeTx } from './db/client';
import { hit } from './rate-limit';

// TSK-05.1: fixed-window counters in rate_limits (no Redis, N3), upserted inside BEGIN IMMEDIATE.
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const T0 = new Date('2026-10-14T04:00:00.000Z'); // on an hour boundary

describe('hit()', () => {
  it('allows 10 hits in the window and refuses the 11th', async () => {
    const got: { allowed: boolean; remaining: number }[] = [];
    for (let i = 0; i < 11; i++) got.push(await hit(t.db, 'ip:1.2.3.4', 10, 3600, new Date(T0.getTime() + i * 1000)));
    expect(got.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(got.map((r) => r.remaining)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]);
    expect(got[10]).toEqual({ allowed: false, remaining: 0 });
  });

  it('a new window starts the count again', async () => {
    for (let i = 0; i < 11; i++) await hit(t.db, 'k', 10, 3600, T0);
    expect(await hit(t.db, 'k', 10, 3600, new Date(T0.getTime() + 3599_000))).toEqual({ allowed: false, remaining: 0 });
    expect(await hit(t.db, 'k', 10, 3600, new Date(T0.getTime() + 3600_000))).toEqual({ allowed: true, remaining: 9 });
  });

  it('keys are independent', async () => {
    for (let i = 0; i < 3; i++) await hit(t.db, 'a', 3, 60, T0);
    expect((await hit(t.db, 'a', 3, 60, T0)).allowed).toBe(false);
    expect(await hit(t.db, 'b', 3, 60, T0)).toEqual({ allowed: true, remaining: 2 });
  });

  it('runs inside a caller transaction and rolls back with it', async () => {
    await writeTx(t.db, async (tx) => {
      expect(await hit(tx, 'in-tx', 2, 60, T0)).toEqual({ allowed: true, remaining: 1 });
    });
    await expect(
      writeTx(t.db, async (tx) => {
        await hit(tx, 'in-tx', 2, 60, T0);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await hit(t.db, 'in-tx', 2, 60, T0)).toEqual({ allowed: true, remaining: 0 });
  });

  it('keeps one row per key: earlier windows are dropped', async () => {
    await hit(t.db, 'k', 5, 60, T0);
    await hit(t.db, 'k', 5, 60, new Date(T0.getTime() + 120_000));
    const rows = await t.client.execute(`SELECT window_start, count FROM rate_limits WHERE key = 'k'`);
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([{ window_start: T0.getTime() / 1000 + 120, count: 1 }]);
  });

  it('Fix 1: sweeps every key’s windows older than 48 h, at most once a minute, inside a normal hit', async () => {
    const now = new Date('2026-11-01T12:00:00.000Z');
    const s = now.getTime() / 1000;
    const put = (key: string, ageH: number) =>
      t.client.execute({ sql: 'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)', args: [key, s - ageH * 3600] });
    const keys = async () => (await t.client.execute('SELECT key FROM rate_limits ORDER BY key')).rows.map((r) => String(r.key));
    await put('enrol:code:old', 49);
    await put('enrol:ip:old', 72);
    await put('enrol:ip:recent', 47);
    await hit(t.db, 'sweeper', 10, 60, now);
    expect(await keys()).toEqual(['enrol:ip:recent', 'sweeper']);
    await put('enrol:code:later', 49);
    await hit(t.db, 'sweeper', 10, 60, new Date(now.getTime() + 30_000)); // within the minute: no sweep
    expect(await keys()).toContain('enrol:code:later');
    await hit(t.db, 'sweeper', 10, 60, new Date(now.getTime() + 61_000));
    expect(await keys()).not.toContain('enrol:code:later');
  });

  it('counts concurrent hits exactly (no lost updates)', async () => {
    const all = await Promise.all(Array.from({ length: 20 }, () => hit(t.db, 'race', 10, 60, T0)));
    expect(all.filter((r) => r.allowed)).toHaveLength(10);
  });
});
