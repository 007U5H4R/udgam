import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { evmAnchors, ledgerEntries } from '../../db/schema';
import { append as hashchainAppend, setOnAppended } from '../hashchain';
import { createEvmLedger } from './adapter';
import { fakeRegistry } from './testing/fake-registry';

// TASK-25 fix round 1: anchoring passes are coalesced per database (MAJOR 1), and the pending set is read
// in one consistent snapshot after backfill (spec Minor 2). An in-memory registry stands in for the chain.

let t: TempDb;
let previousHook: ReturnType<typeof setOnAppended>;
beforeEach(async () => {
  previousHook = setOnAppended(undefined);
  t = await tempDb();
});
afterEach(async () => {
  setOnAppended(previousHook);
  await t.cleanup();
});

const rows = () => t.db.select().from(evmAnchors).orderBy(asc(evmAnchors.seq));

describe('anchorPending coalescing (MAJOR 1)', () => {
  it('20 concurrent callers while the RPC is slow and failing → at most 2 passes, attempts ≤ 2, every caller resolves', async () => {
    const reg = fakeRegistry({ delayMs: 150, rpcError: 'The request took too long to respond.' });
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));

    const results = await Promise.all(Array.from({ length: 20 }, () => ledger.anchorPending()));
    expect(results).toHaveLength(20);
    for (const r of results) expect(r).toMatchObject({ anchored: 0, pending: 1, stoppedAt: { seq: 1 } });
    expect(reg.calls.rpcChainId).toBeLessThanOrEqual(2);
    const [row] = await rows();
    expect(row!.attempts).toBeLessThanOrEqual(2);
    expect(row!.attempts).toBeGreaterThanOrEqual(1);
    expect(row!.lastError).toBe('The request took too long to respond.');
  });

  it('callers from separate ledger instances on the same database share the passes too', async () => {
    const reg = fakeRegistry({ delayMs: 100, rpcError: 'down' });
    const make = () => createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => make().append(tx, 'plot_registered', { plotId: 'P-1' }));
    await Promise.all(Array.from({ length: 10 }, () => make().anchorPending()));
    expect(reg.calls.rpcChainId).toBeLessThanOrEqual(2);
    expect((await rows())[0]!.attempts).toBeLessThanOrEqual(2);
  });

  it('a call made after a pass has finished starts a fresh pass (nothing is lost)', async () => {
    const reg = fakeRegistry();
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-2' }));
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
    expect([...reg.hashes.keys()]).toEqual([1, 2]);
  });

  it('a call made while a pass runs is covered by the one queued follow-up pass', async () => {
    const reg = fakeRegistry({ delayMs: 50 });
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));
    const first = ledger.anchorPending();
    // Appended while the first pass is in flight: the follow-up pass picks it up.
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-2' }));
    const second = ledger.anchorPending();
    const third = ledger.anchorPending();
    expect(third).toBe(second);
    await first;
    await second;
    expect((await rows()).map((r) => r.status)).toEqual(['anchored', 'anchored']);
  });
});

describe('pending snapshot (spec Minor 2)', () => {
  it('a row-less entry followed by an entry with a row anchors both, with no spurious attempt or error', async () => {
    const reg = fakeRegistry();
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => hashchainAppend(tx, 'plot_registered', { plotId: 'P-1' })); // no evm row
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-2' })); // pending row
    expect(await ledger.anchorPending()).toEqual({ anchored: 2, pending: 0 });
    expect((await rows()).map((r) => [r.seq, r.status, r.attempts, r.lastError])).toEqual([
      [1, 'anchored', 1, null],
      [2, 'anchored', 1, null],
    ]);
  });

  it('appends racing anchoring passes (row-less and with a row, interleaved) never record an error', async () => {
    const reg = fakeRegistry({ delayMs: 2 });
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    const appends = (async () => {
      for (let i = 1; i <= 30; i++) {
        await writeTx(t.db, (tx) => (i % 2 ? hashchainAppend(tx, 'plot_registered', { plotId: `P-${i}` }) : ledger.append(tx, 'plot_registered', { plotId: `P-${i}` })));
      }
    })();
    const passes = (async () => {
      for (let i = 0; i < 30; i++) await ledger.anchorPending();
    })();
    await Promise.all([appends, passes]);
    await ledger.anchorPending();
    const all = await rows();
    expect(all).toHaveLength(30);
    expect(all.every((r) => r.status === 'anchored' && r.lastError === null && r.attempts === 1)).toBe(true);
  });
});

describe('transient chain answers are retried, never marked failed (quality minors 4 and 7)', () => {
  it('a null on-chain hash below nextSeq (a lagging replica) → the row stays pending with the error; the next pass adopts it', async () => {
    const reg = fakeRegistry();
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));
    const [e1] = await t.db.select().from(ledgerEntries);
    await reg.append(1, e1!.entryHash); // sent before a crash: on chain, DB never updated
    reg.entryHashOverride = () => null; // the replica reads seq 1 as empty
    expect(await ledger.anchorPending()).toMatchObject({ anchored: 0, stoppedAt: { seq: 1, reason: 'registry read no hash at seq 1 below nextSeq 2; retrying' } });
    expect((await rows())[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: 'registry read no hash at seq 1 below nextSeq 2; retrying' });
    reg.entryHashOverride = undefined;
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
    expect((await rows())[0]).toMatchObject({ status: 'anchored', attempts: 2, lastError: null });
  });

  it('an adopted on-chain anchor is recorded only once it has the configured confirmations', async () => {
    const reg = fakeRegistry({ confirmations: 3 });
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));
    const [e1] = await t.db.select().from(ledgerEntries);
    await reg.append(1, e1!.entryHash); // its block is the head: 1 of 3 confirmations
    expect(await ledger.anchorPending()).toMatchObject({ anchored: 0, stoppedAt: { seq: 1, reason: 'seq 1 has 1 of 3 confirmations' } });
    expect((await rows())[0]).toMatchObject({ status: 'pending', attempts: 1 });
    reg.mine(2);
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
  });

  it("the adopt path's log scan starts at the block of the last anchored seq, not the deploy block (r2 #4)", async () => {
    const reg = fakeRegistry();
    const ledger = createEvmLedger({ db: t.db, registry: async () => reg });
    reg.mine(5); // the deploy block is long behind
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-1' }));
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
    expect((await rows())[0]).toMatchObject({ seq: 1, status: 'anchored', blockNumber: 7 });
    await writeTx(t.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: 'P-2' }));
    const entries = await t.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
    await reg.append(2, entries[1]!.entryHash); // sent before a crash: on chain, DB still pending
    expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
    expect(reg.anchoredLogFrom).toEqual([[2, 7]]);
  });
});
