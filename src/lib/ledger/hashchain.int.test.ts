import { createHash } from 'node:crypto';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { writeTx } from '../db/client';
import { ledgerEntries } from '../db/schema';
import { append, entryHashOf, GENESIS_PREV, setOnAppended, verifyChain } from './hashchain';

// TC-008: formula (recomputed here from literal field values, never via entryHashOf), serialised
// concurrency on one SQLite file (Review focus 3), and transaction-only appends.
let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  setOnAppended(undefined);
  await t.cleanup();
});

const nodeSha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const at = (iso: string) => () => new Date(iso);

async function rows() {
  return t.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
}

describe('append (TC-008)', () => {
  it('writes seq, prev_hash, kind, payload_hash, ts and entry_hash exactly as §8.1 says', async () => {
    await writeTx(t.db, (tx) => append(tx, 'plot_registered', { plotId: 'PL-1', areaHa: 2 }, at('2026-10-01T00:00:00.000Z')));
    await writeTx(t.db, (tx) => append(tx, 'device_enrolled', { deviceId: 'DV-1', b: 'x', a: 'y' }, at('2026-10-01T00:00:01.500Z')));
    const third = await writeTx(t.db, (tx) =>
      append(tx, 'harvest_event', { eventId: 'HE-1', cherryKg: 42.5 }, at('2026-10-01T00:00:02.000Z')),
    );

    // payload_hash = sha256(jcs(payload)), written out by hand
    const p1 = nodeSha('{"areaHa":2,"plotId":"PL-1"}');
    const p2 = nodeSha('{"a":"y","b":"x","deviceId":"DV-1"}');
    const p3 = nodeSha('{"cherryKg":42.5,"eventId":"HE-1"}');
    // entry_hash = sha256(jcs({seq, prev_hash, kind, payload_hash, ts})), keys in JCS order
    const e1 = nodeSha(`{"kind":"plot_registered","payload_hash":"${p1}","prev_hash":"${'0'.repeat(64)}","seq":1,"ts":"2026-10-01T00:00:00.000Z"}`);
    const e2 = nodeSha(`{"kind":"device_enrolled","payload_hash":"${p2}","prev_hash":"${e1}","seq":2,"ts":"2026-10-01T00:00:01.500Z"}`);
    const e3 = nodeSha(`{"kind":"harvest_event","payload_hash":"${p3}","prev_hash":"${e2}","seq":3,"ts":"2026-10-01T00:00:02.000Z"}`);

    const r = await rows();
    expect(r.map((x) => [x.seq, x.prevHash, x.kind, x.payloadHash, x.ts, x.entryHash])).toEqual([
      [1, '0'.repeat(64), 'plot_registered', p1, '2026-10-01T00:00:00.000Z', e1],
      [2, e1, 'device_enrolled', p2, '2026-10-01T00:00:01.500Z', e2],
      [3, e2, 'harvest_event', p3, '2026-10-01T00:00:02.000Z', e3],
    ]);
    expect(r[1]!.payload).toBe('{"a":"y","b":"x","deviceId":"DV-1"}'); // stored canonical, so it re-hashes exactly
    expect(third).toEqual({ seq: 3, entryHash: e3, payloadHash: p3 });
    expect(GENESIS_PREV).toBe('0'.repeat(64));
    expect(await entryHashOf({ seq: 3, prev_hash: e2, kind: 'harvest_event', payload_hash: p3, ts: '2026-10-01T00:00:02.000Z' })).toBe(e3);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('serialises 20 concurrent write transactions into a gap-free chain (Review focus 3)', async () => {
    for (let i = 0; i < 3; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
    const anchors = await Promise.all(
      Array.from({ length: 20 }, (_, i) => writeTx(t.db, (tx) => append(tx, 'harvest_event', { n: i }))),
    );
    expect(anchors.map((a) => a.seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 4));
    const r = await rows();
    expect(r.map((x) => x.seq)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    for (let i = 1; i < r.length; i++) expect(r[i]!.prevHash).toBe(r[i - 1]!.entryHash);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  }, 30_000);

  it('leaves nothing behind when the surrounding transaction rolls back', async () => {
    await expect(
      writeTx(t.db, async (tx) => {
        await append(tx, 'harvest_event', { x: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await rows()).toEqual([]);
  });

  it('accepts only a transaction handle, never the database', async () => {
    // @ts-expect-error append(db, …) must not type-check: an anchor is written only inside a transaction
    const misuse = () => append(t.db, 'harvest_event', {});
    expect(typeof misuse).toBe('function');
  });

  it('refuses a payload that is not canonicalisable', async () => {
    await expect(writeTx(t.db, (tx) => append(tx, 'harvest_event', { bad: undefined }))).rejects.toThrow(TypeError);
    expect(await rows()).toEqual([]);
  });

  it('calls the onAppended hook inside the transaction with the new seq (TKT-15 checkpoints)', async () => {
    const seen: number[] = [];
    setOnAppended(async (_tx, seq) => {
      seen.push(seq);
    });
    await writeTx(t.db, (tx) => append(tx, 'harvest_event', { a: 1 }));
    await writeTx(t.db, (tx) => append(tx, 'harvest_event', { a: 2 }));
    expect(seen).toEqual([1, 2]);
  });
});

describe('verifyChain', () => {
  async function tamper(sql: string) {
    await t.client.execute('DROP TRIGGER ledger_no_update');
    await t.client.execute(sql);
  }

  beforeEach(async () => {
    for (let i = 0; i < 4; i++) await writeTx(t.db, (tx) => append(tx, 'harvest_event', { i }));
  });

  it('names the first entry whose payload no longer matches its hash', async () => {
    await tamper(`UPDATE ledger_entries SET payload = '{"i":9}' WHERE seq = 2`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, seq: 2, reason: 'payload-hash' });
  });

  it('names a broken prev_hash link', async () => {
    await tamper(`UPDATE ledger_entries SET prev_hash = '${'1'.repeat(64)}' WHERE seq = 3`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, seq: 3, reason: 'prev-hash' });
  });

  it('names an entry hash that does not recompute', async () => {
    await tamper(`UPDATE ledger_entries SET ts = '2000-01-01T00:00:00.000Z' WHERE seq = 4`);
    expect(await verifyChain(t.db)).toEqual({ ok: false, seq: 4, reason: 'entry-hash' });
  });

  it('checks from a later seq against the entry before it', async () => {
    expect(await verifyChain(t.db, 3)).toEqual({ ok: true });
    await tamper(`UPDATE ledger_entries SET entry_hash = '${'2'.repeat(64)}' WHERE seq = 2`);
    expect(await verifyChain(t.db, 3)).toEqual({ ok: false, seq: 3, reason: 'prev-hash' });
  });
});
