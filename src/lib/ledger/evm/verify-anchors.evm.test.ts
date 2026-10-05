import { asc } from 'drizzle-orm';
import { encodeFunctionData, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { evmWorld, type EvmWorld } from '../../../../tests/helpers/evm-world';
import { writeTx } from '../../db/client';
import { evmAnchors, ledgerEntries } from '../../db/schema';
import { setOnAppended } from '../hashchain';
import { createEvmLedger } from './adapter';
import { BATCH_REGISTRY_ABI } from './client';
import { checkFeedAnchors, type AnchorCheckStep } from './verify-anchors';

// EVAL-103 · TC-083 negative cases (TASK-25 fix round 1, MAJOR 3): checkFeedAnchors rejects every
// forged `evm` member, each at its own named step, so dropping any one check makes a case here fail.
// Three entries are anchored on Anvil; each case forges one member of entry seq 2 and expects exactly
// one failure, at a fixed step.

const rpcUrl = inject('anvilRpcUrl');

type Entry = { seq: number; entryHash: string; evm?: unknown };
let w: EvmWorld;
let honest: Entry[];
let revertedTx: { txHash: Hex; blockNumber: number };
let previousHook: ReturnType<typeof setOnAppended>;

const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
};

beforeAll(async () => {
  previousHook = setOnAppended(undefined);
  w = await evmWorld(rpcUrl);
  const ledger = createEvmLedger({ db: w.db, registry: async () => w.registry });
  for (let i = 1; i <= 3; i++) await writeTx(w.db, (tx) => ledger.append(tx, 'plot_registered', { plotId: `P-${i}` }));
  expect(await ledger.anchorPending()).toEqual({ anchored: 3, pending: 0 });
  const entries = await w.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.seq));
  const anchors = await w.db.select().from(evmAnchors).orderBy(asc(evmAnchors.seq));
  honest = entries.map((e, i) => ({
    seq: e.seq,
    entryHash: e.entryHash,
    evm: { status: 'anchored', chainId: anchors[i]!.chainId, contract: anchors[i]!.contract, txHash: anchors[i]!.txHash, blockNumber: anchors[i]!.blockNumber },
  }));

  // A mined but REVERTED transaction to the registry: an unlocked dev account (not the operator) calls
  // append(4, …). The explicit gas skips estimation, so Anvil mines it with status 0 and no log.
  const [from] = await rpc<string[]>('eth_accounts', []);
  const data = encodeFunctionData({ abi: BATCH_REGISTRY_ABI, functionName: 'append', args: [BigInt(4), `0x${'ab'.repeat(32)}`] });
  const txHash = await rpc<Hex>('eth_sendTransaction', [{ from, to: w.deployment.registry, data, gas: '0x30000' }]);
  let receipt: { status: string; blockNumber: string } | null = null;
  for (let i = 0; i < 100 && !receipt; i++) {
    receipt = await rpc<{ status: string; blockNumber: string } | null>('eth_getTransactionReceipt', [txHash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 100));
  }
  expect(receipt?.status).toBe('0x0');
  revertedTx = { txHash, blockNumber: Number(receipt!.blockNumber) };
});
afterAll(async () => {
  setOnAppended(previousHook);
  await w?.cleanup();
});

const evmOf = (seq: number) => honest[seq - 1]!.evm as { status: string; chainId: number; contract: string; txHash: string; blockNumber: number };

/** The honest feed with entry seq 2 replaced by `forged`. */
const withSeq2 = (forged: Entry): Entry[] => honest.map((e) => (e.seq === 2 ? forged : e));
const forgeEvm = (patch: Record<string, unknown>): Entry[] => withSeq2({ ...honest[1]!, evm: { ...evmOf(2), ...patch } });

async function failuresOf(entries: Entry[]): Promise<{ seq: number; step: AnchorCheckStep }[]> {
  const r = await checkFeedAnchors({ entries }, w.registry);
  expect(r.ok).toBe(false);
  expect(r.checked).toBe(3);
  expect(r.anchored).toBe(2);
  expect(r.problems).toHaveLength(1);
  return r.failures.map((f) => ({ seq: f.seq, step: f.step }));
}

describe('checkFeedAnchors: forged anchors are rejected at the named step', () => {
  it('the honest feed passes: 3/3 anchored, no failures', async () => {
    expect(await checkFeedAnchors({ entries: honest }, w.registry)).toEqual({ ok: true, checked: 3, anchored: 3, problems: [], failures: [] });
  });

  it('an empty feed is not a pass', async () => {
    expect(await checkFeedAnchors({ entries: [] }, w.registry)).toMatchObject({ ok: false, checked: 0 });
  });

  it('evm status pending on an entry the chain has anchored → evm-field', async () => {
    expect(await failuresOf(withSeq2({ ...honest[1]!, evm: { status: 'pending' } }))).toEqual([{ seq: 2, step: 'evm-field' }]);
  });

  it('a missing evm member → evm-field', async () => {
    expect(await failuresOf(withSeq2({ seq: 2, entryHash: honest[1]!.entryHash }))).toEqual([{ seq: 2, step: 'evm-field' }]);
  });

  it('a malformed txHash → malformed', async () => {
    expect(await failuresOf(forgeEvm({ txHash: '0xNOT-A-HASH' }))).toEqual([{ seq: 2, step: 'malformed' }]);
  });

  it('a wrong chainId → chain', async () => {
    expect(await failuresOf(forgeEvm({ chainId: 1 }))).toEqual([{ seq: 2, step: 'chain' }]);
  });

  it('a wrong contract address → contract', async () => {
    expect(await failuresOf(forgeEvm({ contract: '0x000000000000000000000000000000000000dead' }))).toEqual([{ seq: 2, step: 'contract' }]);
  });

  it("the entry hash differs from the registry's → registry-hash", async () => {
    expect(await failuresOf(withSeq2({ ...honest[1]!, entryHash: 'e'.repeat(64) }))).toEqual([{ seq: 2, step: 'registry-hash' }]);
  });

  it('a random txHash (no such transaction) → tx-not-found', async () => {
    expect(await failuresOf(forgeEvm({ txHash: `0x${'5a'.repeat(32)}` }))).toEqual([{ seq: 2, step: 'tx-not-found' }]);
  });

  it('a reverted transaction to the registry, in its own block → tx-status', async () => {
    expect(await failuresOf(forgeEvm({ txHash: revertedTx.txHash, blockNumber: revertedTx.blockNumber }))).toEqual([{ seq: 2, step: 'tx-status' }]);
  });

  it('the right txHash with a wrong blockNumber → tx-block', async () => {
    expect(await failuresOf(forgeEvm({ blockNumber: evmOf(2).blockNumber + 1000 }))).toEqual([{ seq: 2, step: 'tx-block' }]);
  });

  it("another seq's transaction (with that transaction's own block) → log", async () => {
    expect(await failuresOf(forgeEvm({ txHash: evmOf(1).txHash, blockNumber: evmOf(1).blockNumber }))).toEqual([{ seq: 2, step: 'log' }]);
  });
});
