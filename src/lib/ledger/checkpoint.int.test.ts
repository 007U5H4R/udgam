import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { bytesToHex, hexToBytes, verify } from '../crypto';
import { writeTx } from '../db/client';
import { ledgerCheckpoints, ledgerEntries } from '../db/schema';
import { checkpointIfNeeded, checkpointStatement, createCheckpoint, maybeCheckpoint } from './checkpoint';
import { append, setOnAppended, verifyChain } from './hashchain';
import { publishedKeys } from './keys';
import { merkleRoot } from './merkle';

// TC-062: checkpoints every 100 entries (inside the appending transaction) and on demand; each is
// signed with the published ledger key and linked to the previous statement.

const keyDir = mkdtempSync(join(tmpdir(), 'udgam-cp-key-'));
vi.stubEnv('LEDGER_KEY_PATH', join(keyDir, 'keys', 'ledger.jwk'));
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(keyDir, { recursive: true, force: true }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  setOnAppended(maybeCheckpoint);
});
afterEach(async () => {
  setOnAppended(maybeCheckpoint);
  await t.cleanup();
});

const nodeSha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

async function appendN(n: number) {
  for (let i = 0; i < n; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
}
const checkpoints = () => t.db.select().from(ledgerCheckpoints).orderBy(asc(ledgerCheckpoints.id));

describe('checkpoints (TC-062)', () => {
  it('seals [1–100] and [101–200] automatically, then [201–250] on demand, signed and linked', async () => {
    await appendN(250);
    expect((await checkpoints()).map((c) => [c.id, c.fromSeq, c.toSeq])).toEqual([
      [1, 1, 100],
      [2, 101, 200],
    ]);

    const onDemand = await writeTx(t.db, (tx) => checkpointIfNeeded(tx));
    expect(onDemand).toMatchObject({ id: 3, fromSeq: 201, toSeq: 250 });
    expect(await writeTx(t.db, (tx) => checkpointIfNeeded(tx))).toBeNull(); // nothing new

    const rows = await checkpoints();
    expect(rows.map((c) => [c.id, c.fromSeq, c.toSeq])).toEqual([
      [1, 1, 100],
      [2, 101, 200],
      [3, 201, 250],
    ]);
    const entries = await t.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
    const [jwk] = (await publishedKeys()).keys;

    let prev = '0'.repeat(64);
    for (const c of rows) {
      // the statement, written out by hand in JCS key order
      const statement = `{"fromSeq":${c.fromSeq},"id":${c.id},"merkleRoot":"${c.merkleRoot}","prevCheckpointHash":"${prev}","toSeq":${c.toSeq},"ts":"${c.ts}","v":1}`;
      expect(checkpointStatement({ ...c })).toBe(statement);
      expect(c.prevCheckpointHash).toBe(prev);
      expect(c.keyId).toBe(jwk!.kid);
      expect(await verify(jwk!, statement, c.signature)).toBe(true);
      const leaves = entries.filter((e) => e.seq >= c.fromSeq && e.seq <= c.toSeq).map((e) => hexToBytes(e.entryHash));
      expect(c.merkleRoot).toBe(bytesToHex(await merkleRoot(leaves)));
      expect(c.ts).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      prev = nodeSha(statement);
    }
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  }, 60_000);

  it('creates the checkpoint inside the transaction that appends the 100th entry', async () => {
    await appendN(99);
    const seen = await writeTx(t.db, async (tx) => {
      await append(tx, 'harvest_event', { i: 99 });
      return tx.select().from(ledgerCheckpoints);
    });
    expect(seen.map((c) => [c.fromSeq, c.toSeq])).toEqual([[1, 100]]);
  }, 30_000);

  it('rolls the 100th append back when the checkpoint fails', async () => {
    await appendN(99);
    const failingKey = {
      kid: 'x',
      publicJwk: { kty: 'EC' as const, crv: 'P-256' as const, x: 'x', y: 'y' },
      sign: async () => {
        throw new Error('signing failed');
      },
    };
    setOnAppended((tx, seq) => maybeCheckpoint(tx, seq, { key: failingKey }));
    await expect(writeTx(t.db, (tx) => append(tx, 'harvest_event', { i: 99 }))).rejects.toThrow('signing failed');
    expect(await t.db.$count(ledgerEntries)).toBe(99);
    expect(await t.db.$count(ledgerCheckpoints)).toBe(0);
  }, 30_000);

  it('is on by default: a freshly loaded ledger seals entry 100 without any setup', async () => {
    vi.resetModules();
    const fresh = await import('./hashchain');
    for (let i = 0; i < 100; i++) await writeTx(t.db, (tx) => fresh.append(tx, 'harvest_event', { i }));
    expect((await checkpoints()).map((c) => [c.fromSeq, c.toSeq])).toEqual([[1, 100]]);
  }, 30_000);

  it('refuses a checkpoint that would cover nothing or entries that do not exist', async () => {
    await appendN(3);
    await expect(writeTx(t.db, (tx) => createCheckpoint(tx, 5))).rejects.toThrow(/entries/);
    await writeTx(t.db, (tx) => createCheckpoint(tx, 2));
    await expect(writeTx(t.db, (tx) => createCheckpoint(tx, 2))).rejects.toThrow(/nothing/);
    expect(await writeTx(t.db, (tx) => checkpointIfNeeded(tx))).toMatchObject({ fromSeq: 3, toSeq: 3 });
  });

  it('refuses UPDATE and DELETE on ledger_checkpoints', async () => {
    await appendN(2);
    await writeTx(t.db, (tx) => checkpointIfNeeded(tx));
    await expect(t.client.execute(`UPDATE ledger_checkpoints SET merkle_root = '${'0'.repeat(64)}' WHERE id = 1`)).rejects.toThrow(/append-only/);
    await expect(t.client.execute('DELETE FROM ledger_checkpoints WHERE id = 1')).rejects.toThrow(/append-only/);
    const triggers = await t.client.execute(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'ledger_checkpoints' ORDER BY name`);
    expect(triggers.rows.map((r) => r.name)).toEqual(['ledger_checkpoints_no_delete', 'ledger_checkpoints_no_update']);
  });

  it('checkpointIfNeeded on an empty ledger creates nothing', async () => {
    expect(await writeTx(t.db, (tx) => checkpointIfNeeded(tx))).toBeNull();
  });
});
