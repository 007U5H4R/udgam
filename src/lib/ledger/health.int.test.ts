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
    expect(await ledgerHealth(t.db, { keyPath })).toEqual({ lastSeq: 0, lastCheckpointAgeSec: null, keyPresent: true });
  });

  it('reports the last seq and the whole seconds since the last checkpoint', async () => {
    const key = await loadLedgerKey(keyPath);
    for (let i = 0; i < 3; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
    await writeTx(t.db, (tx) => checkpointIfNeeded(tx, { key, now: () => new Date('2026-10-01T00:00:00.000Z') }));
    await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 3 }));
    const h = await ledgerHealth(t.db, { keyPath, now: () => new Date('2026-10-01T00:01:30.900Z') });
    expect(h).toEqual({ lastSeq: 4, lastCheckpointAgeSec: 90, keyPresent: true });
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
