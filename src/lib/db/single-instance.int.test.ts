import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TKT-19 (SQLITE_BUSY under parallel e2e load, root cause). `next start` bundles src/lib/db/client.ts
// into two Turbopack runtimes — route handlers (chunks/) and pages + Server Actions (chunks/ssr/) —
// each with its own module cache, so the module is instantiated twice in one process. With per-module
// state that meant two libSQL clients and two write queues: a route handler's write transaction and a
// Server Action's could run at once, and the second BEGIN IMMEDIATE busy-waited on the event loop the
// first needed, until SQLITE_BUSY. The handle and the write queue are therefore process-wide.
// Here two module instances stand in for the two runtimes.

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udgam-single-'));
  vi.stubEnv('DATABASE_URL', `file:${join(dir, 'x.db')}`);
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  vi.resetModules();
  (await import('./client')).closeDb();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

async function freshInstance() {
  vi.resetModules();
  return import('./client');
}

describe('one database handle and one write queue per process', () => {
  it('two module instances share the handle', async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    expect(a).not.toBe(b); // really two instances of the module
    expect(await a.getDbReady()).toBe(await b.getDbReady());
    expect(a.getDbClient()).toBe(b.getDbClient());
  });

  it("a write from one instance waits for the other instance's open transaction instead of failing with SQLITE_BUSY", async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    const dbA = await a.getDbReady();
    const dbB = await b.getDbReady();
    await a.writeTx(dbA, (tx) => tx.run(sql`CREATE TABLE t (n INTEGER)`));

    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const first = a.writeTx(dbA, async (tx) => {
      await tx.run(sql`INSERT INTO t VALUES (1)`);
      entered();
      await held; // the write lock is held across an await, as a capture's transaction does
      await tx.run(sql`INSERT INTO t VALUES (2)`);
    });
    await inside;
    const second = b.writeTx(dbB, (tx) => tx.run(sql`INSERT INTO t VALUES (3)`));
    setTimeout(release, 50);
    await expect(Promise.all([first, second])).resolves.toBeDefined();
    const rows = (await b.getDbClient().execute('SELECT n FROM t ORDER BY rowid')).rows.map((r) => Number(r.n));
    expect(rows).toEqual([1, 2, 3]);
  }, 15_000);

  it('the nested-writeTx guard holds across instances', async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    const db = await a.getDbReady();
    await expect(a.writeTx(db, () => b.writeTx(db, async () => 1))).rejects.toThrow('nested writeTx');
  });

  it('closeDb() from either instance closes the shared handle; the next use opens a fresh one', async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    const first = await a.getDbReady();
    b.closeDb();
    const second = await a.getDbReady();
    expect(second).not.toBe(first);
    expect(await b.getDbReady()).toBe(second);
  });
});
