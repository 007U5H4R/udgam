import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { writeTx } from '../db/client';
import { checkpointIfNeeded } from './checkpoint';
import { append } from './hashchain';
import { ledgerHealth } from './health';
import { loadLedgerKey } from './keys';

// TC-001 (ledger part): last seq, age of the last checkpoint, and whether the key file is present.

let t: TempDb;
let keyPath: string;
beforeEach(async () => {
  t = await tempDb();
  keyPath = join(t.dir, 'keys', 'ledger.jwk');
});
afterEach(async () => {
  await t.cleanup();
});

describe('ledgerHealth (TC-001 ledger part)', () => {
  it('reports an empty ledger with no checkpoint, and generates the key on first boot', async () => {
    expect(await ledgerHealth(t.db, { keyPath })).toEqual({ lastSeq: 0, lastCheckpointAgeSec: null, oldestUnsealedAgeSec: 0, keyPresent: true, keyMismatch: false });
  });

  it('reports the last seq and the whole seconds since the last checkpoint', async () => {
    const key = await loadLedgerKey(keyPath);
    for (let i = 0; i < 3; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
    await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key, now: () => new Date('2026-10-01T00:00:00.000Z') }));
    await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 3 }, () => new Date('2026-10-01T00:00:30.000Z')));
    const h = await ledgerHealth(t.db, { keyPath, now: () => new Date('2026-10-01T00:01:30.900Z') });
    expect(h).toEqual({ lastSeq: 4, lastCheckpointAgeSec: 90, oldestUnsealedAgeSec: 60, keyPresent: true, keyMismatch: false });
  });

  describe('oldestUnsealedAgeSec (EXE55): the age of the oldest entry after the last checkpoint', () => {
    const at = (iso: string) => () => new Date(iso);

    it('is the age of the first unsealed entry, not the newest; with no checkpoint yet, of entry 1', async () => {
      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 0 }, at('2026-10-01T00:00:00.000Z')));
      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 1 }, at('2026-10-02T00:00:00.000Z')));
      const h = await ledgerHealth(t.db, { keyPath, now: at('2026-10-02T01:00:00.000Z') });
      expect(h).toMatchObject({ lastSeq: 2, lastCheckpointAgeSec: null, oldestUnsealedAgeSec: 25 * 3600 });
    });

    it('is 0 when everything is sealed, however old the checkpoint (a quiet day)', async () => {
      const key = await loadLedgerKey(keyPath);
      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 0 }, at('2026-10-01T00:00:00.000Z')));
      await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key, now: at('2026-10-01T00:10:00.000Z') }));
      const h = await ledgerHealth(t.db, { keyPath, now: at('2026-10-05T00:00:00.000Z') });
      expect(h).toMatchObject({ lastSeq: 1, oldestUnsealedAgeSec: 0 });
      expect(h.lastCheckpointAgeSec).toBeGreaterThan(86400);
    });

    it('after a checkpoint, counts only the entries after it', async () => {
      const key = await loadLedgerKey(keyPath);
      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 0 }, at('2026-10-01T00:00:00.000Z')));
      await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key, now: at('2026-10-01T00:10:00.000Z') }));
      await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 1 }, at('2026-10-04T23:00:00.000Z')));
      const h = await ledgerHealth(t.db, { keyPath, now: at('2026-10-05T00:00:00.000Z') });
      expect(h.oldestUnsealedAgeSec).toBe(3600);
    });

    it('reads one entry by primary key: a SEARCH on ledger_entries, never a SCAN', async () => {
      const { oldestUnsealedQuery } = await import('./health');
      const q = oldestUnsealedQuery(t.db, 5).toSQL();
      const plan = (await t.client.execute({ sql: `EXPLAIN QUERY PLAN ${q.sql}`, args: q.params as never })).rows.map((r) => String(r.detail)).join('\n');
      expect(plan).toMatch(/SEARCH ledger_entries USING INTEGER PRIMARY KEY \(rowid>\?\)/);
      expect(plan).not.toMatch(/SCAN ledger_entries/);
    });
  });

  it('reports keyMismatch when a checkpoint was signed by a kid that is not published (lost key, quality #4)', async () => {
    // The key that sealed checkpoint 1 is lost; the next boot generates a new one at keyPath.
    const lost = await loadLedgerKey(join(t.dir, 'lost', 'ledger.jwk'));
    for (let i = 0; i < 3; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
    await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key: lost }));
    const h = await ledgerHealth(t.db, { keyPath });
    expect(h).toMatchObject({ keyPresent: true, keyMismatch: true });
    expect((await loadLedgerKey(keyPath)).kid).not.toBe(lost.kid);
    // With the original key back in place, the checkpoints match the published key again.
    expect((await ledgerHealth(t.db, { keyPath: join(t.dir, 'lost', 'ledger.jwk') })).keyMismatch).toBe(false);
  });

  it('reports keyPresent:false once the key file is gone, even though the key is still loaded', async () => {
    await loadLedgerKey(keyPath);
    rmSync(keyPath);
    expect((await ledgerHealth(t.db, { keyPath })).keyPresent).toBe(false);
  });

  it('reports keyPresent:false when the key cannot be loaded or created', async () => {
    const h = await ledgerHealth(t.db, { keyPath: join(t.dir, 'test.db', 'ledger.jwk') }); // parent is a file
    expect(h.keyPresent).toBe(false);
  });
});
