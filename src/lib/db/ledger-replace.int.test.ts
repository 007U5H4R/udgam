import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// TASK-15 fix round 1 (review note N1, §4.2 append-only ledger). INSERT OR REPLACE resolves a key
// conflict by deleting the old row without firing DELETE triggers, so ledger_no_delete alone did not
// stop a REPLACE from rewriting an entry. The existence guards in migration *_batch_replace_guards.sql
// do.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const H = (c: string) => c.repeat(64);
const TS = '2026-10-01T00:00:00.000Z';

const entry = (verb: string, seq: number, entryHash: string, payload = '{}') =>
  t.client.execute({
    sql: `${verb} INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (?, ?, 'x', ?, ?, ?, ?)`,
    args: [seq, H('0'), payload, H('a'), TS, entryHash],
  });

const checkpoint = (verb: string, id: number, toSeq: number, root: string) =>
  t.client.execute({
    sql: `${verb} INTO ledger_checkpoints (id, from_seq, to_seq, merkle_root, prev_checkpoint_hash, ts, key_id, signature) VALUES (?, 1, ?, ?, ?, ?, 'kid', 'sig')`,
    args: [id, toSeq, root, H('0'), TS],
  });

const rows = async (sql: string) => (await t.client.execute(sql)).rows;

describe('ledger_entries cannot be rewritten by REPLACE or an upsert (§4.2)', () => {
  it('REPLACE on an existing seq is refused and the entry is unchanged', async () => {
    await entry('INSERT', 1, H('1'));
    await expect(entry('INSERT OR REPLACE', 1, H('9'), '{"t":1}')).rejects.toThrow('ledger is append-only');
    await expect(entry('REPLACE', 1, H('9'))).rejects.toThrow('ledger is append-only');
    expect(await rows(`SELECT seq, payload, entry_hash FROM ledger_entries`)).toEqual([expect.objectContaining({ seq: 1, payload: '{}', entry_hash: H('1') })]);
  });

  it('REPLACE on an existing entry_hash under a new seq is refused', async () => {
    await entry('INSERT', 1, H('1'));
    await expect(entry('INSERT OR REPLACE', 2, H('1'))).rejects.toThrow('ledger is append-only');
    expect(await rows(`SELECT seq FROM ledger_entries`)).toEqual([expect.objectContaining({ seq: 1 })]);
  });

  it('an upsert that updates an entry is refused', async () => {
    await entry('INSERT', 1, H('1'));
    await expect(
      t.client.execute({
        sql: `INSERT INTO ledger_entries (seq, prev_hash, kind, payload, payload_hash, ts, entry_hash) VALUES (1, ?, 'x', '{}', ?, ?, ?) ON CONFLICT(seq) DO UPDATE SET payload = '{"t":1}'`,
        args: [H('0'), H('a'), TS, H('9')],
      }),
    ).rejects.toThrow('ledger is append-only');
  });

  it('a new entry still appends', async () => {
    await entry('INSERT', 1, H('1'));
    await entry('INSERT', 2, H('2'));
    expect((await rows(`SELECT COUNT(*) AS n FROM ledger_entries`))[0]!.n).toBe(2);
  });
});

describe('ledger_checkpoints cannot be rewritten by REPLACE (§4.2)', () => {
  it('REPLACE on an existing id or to_seq is refused and the checkpoint is unchanged', async () => {
    await entry('INSERT', 1, H('1'));
    await entry('INSERT', 2, H('2'));
    await checkpoint('INSERT', 1, 1, H('c'));
    await expect(checkpoint('INSERT OR REPLACE', 1, 2, H('d'))).rejects.toThrow('ledger is append-only');
    await expect(checkpoint('INSERT OR REPLACE', 2, 1, H('d'))).rejects.toThrow('ledger is append-only');
    expect(await rows(`SELECT id, to_seq, merkle_root FROM ledger_checkpoints`)).toEqual([expect.objectContaining({ id: 1, to_seq: 1, merkle_root: H('c') })]);
    await checkpoint('INSERT', 2, 2, H('e'));
  });
});
