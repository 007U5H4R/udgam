import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { evmWorld, type EvmWorld } from '../../../../tests/helpers/evm-world';
import { tempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../../db/client';
import { evmAnchors, ledgerEntries } from '../../db/schema';
import { append as hashchainAppend, setOnAppended, verifyChain } from '../hashchain';
import { getProof } from '../feed';
import { ledgerFor } from '../index';
import { createEvmLedger } from './adapter';
import { createRegistryClient } from './client';
import { deployRegistry } from './deploy';
import { startAnvil } from './foundry';
import { readOperatorKey } from './operator-key';

// TSK-24.6 · TC-083: the EVM adapter behind the Ledger port. Appends go to the hash-chain store with a
// pending evm_anchors row in the same transaction; anchorPending() anchors after commit, in seq order,
// stops at the first failure and resumes after the chain comes back.

const rpcUrl = inject('anvilRpcUrl');
let previousHook: ReturnType<typeof setOnAppended>;
beforeAll(() => {
  previousHook = setOnAppended(undefined);
});
afterAll(() => {
  setOnAppended(previousHook);
});

const worlds: { cleanup(): Promise<void> }[] = [];
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.cleanup();
});

async function world(): Promise<EvmWorld> {
  const w = await evmWorld(rpcUrl);
  worlds.push(w);
  return w;
}

async function appendN(w: { db: EvmWorld['db'] }, ledger: { append: ReturnType<typeof createEvmLedger>['append'] }, n: number, from = 1) {
  for (let i = from; i < from + n; i++) await writeTx(w.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: `P-${i}` }));
}

const rows = (w: { db: EvmWorld['db'] }) => w.db.select().from(evmAnchors).orderBy(asc(evmAnchors.seq));

describe('EVM ledger adapter', () => {
  it('TC-083: 5 appends → 5 pending rows in the append tx → anchored; on-chain hashes equal entry_hash, in order', async () => {
    const w = await world();
    const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
    await appendN(w, ledger, 5);
    expect((await rows(w)).map((r) => [r.seq, r.status])).toEqual([1, 2, 3, 4, 5].map((s) => [s, 'pending']));

    expect(await ledger.anchorPending()).toEqual({ anchored: 5, pending: 0 });
    const entries = await w.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
    const anchors = await rows(w);
    for (const e of entries) expect(await w.registry.entryHash(e.seq), `seq ${e.seq}`).toBe(e.entryHash);
    expect(anchors.every((a) => a.status === 'anchored' && a.chainId === 31337 && a.contract === w.deployment.registry.toLowerCase() && /^0x[0-9a-f]{64}$/.test(a.txHash ?? ''))).toBe(true);
    const blocks = anchors.map((a) => a.blockNumber!);
    expect([...blocks].sort((a, b) => a - b)).toEqual(blocks);
    expect(await w.registry.nextSeq()).toBe(6);
    expect(await verifyChain(w.db)).toEqual({ ok: true });

    // A second run has nothing to do.
    expect(await ledger.anchorPending()).toEqual({ anchored: 0, pending: 0 });
  });

  it('anvil down between runs → rows stay pending (attempts, last_error); restarted → they anchor in order', async () => {
    const t = await tempDb();
    worlds.push(t);
    const state = join(t.dir, 'anvil-state.json');
    let chain = await startAnvil({ statePath: state });
    try {
      const deploymentPath = join(t.dir, 'evm', 'deployment.json');
      const operatorKeyPath = join(t.dir, 'keys', 'evm-operator.key');
      const { deployment } = await deployRegistry({ rpcUrl: chain.rpcUrl, deploymentPath, operatorKeyPath });
      const client = createRegistryClient({ rpcUrl: chain.rpcUrl, deployment, operatorKey: await readOperatorKey(operatorKeyPath), timeoutMs: 3_000 });
      const ledger = createEvmLedger({ db: t.db, registry: async () => client });

      await appendN(t, ledger, 3);
      expect(await ledger.anchorPending()).toMatchObject({ anchored: 3, pending: 0 });

      await chain.stop();
      // Appends (captures) still succeed while the chain is down: anchoring never blocks them.
      await appendN(t, ledger, 2, 4);
      const down = await ledger.anchorPending();
      expect(down).toMatchObject({ anchored: 0, pending: 2, stoppedAt: { seq: 4 } });
      const pendingRows = (await rows(t)).filter((r) => r.status === 'pending');
      expect(pendingRows.map((r) => r.seq)).toEqual([4, 5]);
      expect(pendingRows[0]).toMatchObject({ attempts: 1 });
      expect(pendingRows[0]!.lastError).toBeTruthy();
      expect(pendingRows[1]).toMatchObject({ attempts: 0, lastError: null });

      chain = await startAnvil({ port: chain.port, statePath: state });
      expect(await client.nextSeq()).toBe(4);
      expect(await ledger.anchorPending()).toEqual({ anchored: 2, pending: 0 });
      const all = await rows(t);
      expect(all.map((r) => r.status)).toEqual(['anchored', 'anchored', 'anchored', 'anchored', 'anchored']);
      expect(all[3]).toMatchObject({ attempts: 2, lastError: null });
      const entries = await t.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
      for (const e of entries) expect(await client.entryHash(e.seq)).toBe(e.entryHash);
      expect(all[3]!.blockNumber!).toBeLessThan(all[4]!.blockNumber!);
    } finally {
      await chain.stop();
    }
  });

  it('anvil killed while an append transaction is in flight → the row stays pending; restarted → it anchors, in order', async () => {
    const t = await tempDb();
    worlds.push(t);
    const state = join(t.dir, 'anvil-state.json');
    let chain = await startAnvil({ statePath: state });
    try {
      const deploymentPath = join(t.dir, 'evm', 'deployment.json');
      const operatorKeyPath = join(t.dir, 'keys', 'evm-operator.key');
      const { deployment } = await deployRegistry({ rpcUrl: chain.rpcUrl, deploymentPath, operatorKeyPath });
      const client = createRegistryClient({ rpcUrl: chain.rpcUrl, deployment, operatorKey: await readOperatorKey(operatorKeyPath), timeoutMs: 3_000 });
      const ledger = createEvmLedger({ db: t.db, registry: async () => client });
      await appendN(t, ledger, 2);
      expect(await ledger.anchorPending()).toMatchObject({ anchored: 2, pending: 0 });

      const rpc = async (method: string, params: unknown[] = []) => {
        const res = await fetch(chain.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        return ((await res.json()) as { result?: unknown }).result;
      };
      await rpc('evm_setAutomine', [false]); // the next transaction waits in the mempool
      await appendN(t, ledger, 1, 3);
      const inFlight = ledger.anchorPending();
      const deadline = Date.now() + 15_000;
      for (;;) {
        const pool = (await rpc('txpool_status')) as { pending: string } | undefined;
        if (pool && Number(pool.pending) > 0) break;
        if (Date.now() > deadline) throw new Error('the append transaction never reached the mempool');
        await new Promise((r) => setTimeout(r, 50));
      }
      await chain.stop(); // killed mid-run: the pass is waiting for the receipt
      const r = await inFlight;
      expect(r).toMatchObject({ anchored: 0, pending: 1, stoppedAt: { seq: 3 } });
      const row = (await rows(t)).find((x) => x.seq === 3)!;
      expect(row).toMatchObject({ status: 'pending', attempts: 1 });
      expect(row.lastError).toBeTruthy();

      chain = await startAnvil({ port: chain.port, statePath: state });
      expect(await ledger.anchorPending()).toEqual({ anchored: 1, pending: 0 });
      const all = await rows(t);
      expect(all.map((x) => x.status)).toEqual(['anchored', 'anchored', 'anchored']);
      const entries = await t.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
      for (const e of entries) expect(await client.entryHash(e.seq)).toBe(e.entryHash);
      expect(await client.nextSeq()).toBe(4);
    } finally {
      await chain.stop();
    }
  });

  it('backfills entries appended through hashchain.append directly (or before the switch), in order', async () => {
    const w = await world();
    for (let i = 1; i <= 3; i++) await writeTx(w.db, (tx) => hashchainAppend(tx, 'plot_registered', { plotId: `P-${i}` }));
    expect(await rows(w)).toEqual([]);
    const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
    expect(await ledger.anchorPending()).toEqual({ anchored: 3, pending: 0 });
    expect((await rows(w)).map((r) => r.status)).toEqual(['anchored', 'anchored', 'anchored']);
  });

  it('adopts a seq already on chain with the same hash (sent before a crash); a different hash is failed and stops', async () => {
    const w = await world();
    const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
    await appendN(w, ledger, 3);
    const [e1] = await w.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, 1));
    const sent = await w.registry.append(1, e1!.entryHash); // the "crash": on chain, DB never updated
    await w.registry.append(2, 'f'.repeat(64)); // someone else's hash at seq 2
    const r = await ledger.anchorPending();
    expect(r).toMatchObject({ anchored: 1, stoppedAt: { seq: 2 } });
    const all = await rows(w);
    expect(all[0]).toMatchObject({ status: 'anchored', txHash: sent.txHash, blockNumber: sent.blockNumber });
    expect(all[1]).toMatchObject({ status: 'failed' });
    expect(all[2]).toMatchObject({ status: 'pending' });
    // Seq 3 cannot jump the failed seq 2: order is preserved on chain.
    expect(await ledger.anchorPending()).toMatchObject({ anchored: 0, stoppedAt: { seq: 3 } });
  });

  it('getProof carries evm fields: anchored with tx and block, pending before anchoring', async () => {
    const w = await world();
    const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
    await appendN(w, ledger, 2);
    const { checkpointIfNeeded } = await import('../checkpoint');
    const { loadLedgerKey } = await import('../keys');
    const key = await loadLedgerKey(join(w.dir, 'keys', 'ledger.jwk'));
    await writeTx(w.db, (tx) => checkpointIfNeeded(tx, { key }));
    const failing = { adapter: 'evm' as const, anchorPending: async () => ({ anchored: 0, pending: 2 }) };
    expect((await getProof(w.db, 1, { ledger: failing })).entry).toMatchObject({ evm: { status: 'pending' } });
    const p = await getProof(w.db, 1, { ledger });
    const [a] = await rows(w);
    expect(p.entry).toMatchObject({ evm: { status: 'anchored', chainId: 31337, contract: w.deployment.registry.toLowerCase(), txHash: a!.txHash, blockNumber: a!.blockNumber } });
  });

  it('ledgerFor selects by adapter name; hashchain anchors nothing', async () => {
    const w = await world();
    expect(ledgerFor(w.db, 'hashchain').adapter).toBe('hashchain');
    expect(await ledgerFor(w.db, 'hashchain').anchorPending()).toBeNull();
    const evm = ledgerFor(w.db, 'evm', { registry: async () => w.registry });
    expect(evm.adapter).toBe('evm');
    await writeTx(w.db, (tx) => evm.append(tx, 'plot_registered', { plotId: 'P-1' }));
    expect(await evm.anchorPending()).toEqual({ anchored: 1, pending: 0 });
  });
});
