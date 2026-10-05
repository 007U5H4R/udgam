import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { append, setOnAppended } from '../hashchain';

// TSK-24.5: evm_anchors(seq → ledger_entries) holds the on-chain anchoring state. Database invariants
// (migration 0020, the 0010/0015/0016/0018 guard pattern), attempted directly in SQL:
// FK to the ledger, tx_hash immutable once set, anchored is terminal, no REPLACE and no DELETE.

const TX = `0x${'ab'.repeat(32)}`;
const TX2 = `0x${'cd'.repeat(32)}`;
const REGISTRY = `0x${'11'.repeat(20)}`;
const NOW = '2026-10-05T00:00:00.000Z';

let t: TempDb;
let previousHook: ReturnType<typeof setOnAppended>;
beforeEach(async () => {
  previousHook = setOnAppended(undefined);
  t = await tempDb();
  await writeTx(t.db, async (tx) => {
    await append(tx, 'plot_registered', { plotId: 'P-1' });
    await append(tx, 'plot_registered', { plotId: 'P-2' });
  });
});
afterEach(async () => {
  setOnAppended(previousHook);
  await t.cleanup();
});

const exec = (sql: string, args: (string | number | null)[] = []) => t.client.execute({ sql, args });
const pending = (seq: number) => exec(`INSERT INTO evm_anchors (seq, status, attempts, updated_at) VALUES (?, 'pending', 0, ?)`, [seq, NOW]);
const anchor = (seq: number, tx = TX) =>
  exec(`UPDATE evm_anchors SET status='anchored', chain_id=31337, contract=?, tx_hash=?, block_number=7, attempts=attempts+1, updated_at=? WHERE seq=?`, [REGISTRY, tx, NOW, seq]);

describe('evm_anchors invariants', () => {
  it('a row for a seq that is not in the ledger fails (FK)', async () => {
    await expect(pending(99)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('a pending row can be anchored once; tx_hash and its anchor fields are then immutable', async () => {
    await pending(1);
    await anchor(1);
    await expect(exec(`UPDATE evm_anchors SET tx_hash=? WHERE seq=1`, [TX2])).rejects.toThrow(/immutable/);
    await expect(exec(`UPDATE evm_anchors SET tx_hash=NULL WHERE seq=1`)).rejects.toThrow(/immutable/);
    await expect(exec(`UPDATE evm_anchors SET block_number=8 WHERE seq=1`)).rejects.toThrow(/immutable/);
    await expect(exec(`UPDATE evm_anchors SET status='pending' WHERE seq=1`)).rejects.toThrow(/immutable/);
    const { rows } = await exec(`SELECT status, tx_hash FROM evm_anchors WHERE seq=1`);
    expect(rows[0]).toMatchObject({ status: 'anchored', tx_hash: TX });
  });

  it('anchored needs chain, contract, tx hash and block; status is one of three', async () => {
    await pending(1);
    await expect(exec(`UPDATE evm_anchors SET status='anchored' WHERE seq=1`)).rejects.toThrow(/CHECK/);
    await expect(exec(`UPDATE evm_anchors SET status='done' WHERE seq=1`)).rejects.toThrow(/CHECK/);
    // While pending, retries may record attempts and errors.
    await exec(`UPDATE evm_anchors SET attempts=3, last_error='rpc down', updated_at=? WHERE seq=1`, [NOW]);
  });

  it('rows are never replaced or deleted', async () => {
    await pending(1);
    await expect(exec(`INSERT OR REPLACE INTO evm_anchors (seq, status, attempts, updated_at) VALUES (1, 'pending', 0, ?)`, [NOW])).rejects.toThrow(/UNIQUE/);
    await expect(exec(`DELETE FROM evm_anchors WHERE seq=1`)).rejects.toThrow(/never deleted/);
  });

  it('failed is terminal too', async () => {
    await pending(2);
    await exec(`UPDATE evm_anchors SET status='failed', last_error='hash differs', updated_at=? WHERE seq=2`, [NOW]);
    await expect(exec(`UPDATE evm_anchors SET status='pending' WHERE seq=2`)).rejects.toThrow(/terminal/);
  });
});
