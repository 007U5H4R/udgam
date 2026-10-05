import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { evmAnchors } from '../../db/schema';
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
