import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { generatePrivateKey } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { evmWorld, type EvmWorld } from '../../../../tests/helpers/evm-world';
import { createRegistryClient } from './client';
import { CONTRACTS_DIR, foundryBin, foundryEnv } from './foundry';

// TSK-24.4: the viem client over BatchRegistry, against Anvil (the `evm` project's global setup).

const execFileAsync = promisify(execFile);
const rpcUrl = inject('anvilRpcUrl');
const h = (n: number) => n.toString(16).padStart(64, '0').replace(/^0/, 'a');
const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return ((await res.json()) as { result?: unknown }).result;
};

let w: EvmWorld;
beforeAll(async () => {
  w = await evmWorld(rpcUrl);
});
afterAll(async () => {
  await w?.cleanup();
});

describe('createRegistryClient', () => {
  it('appends then reads back; nextSeq advances; an unanchored seq reads null', async () => {
    expect(await w.registry.nextSeq()).toBe(1);
    expect(await w.registry.entryHash(1)).toBeNull();
    const r = await w.registry.append(1, h(1));
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.blockNumber).toBeGreaterThan(w.deployment.deployedAtBlock);
    expect(await w.registry.entryHash(1)).toBe(h(1));
    expect(await w.registry.nextSeq()).toBe(2);
    expect(await w.registry.anchoredLog(1)).toEqual({ seq: 1, entryHash: h(1), txHash: r.txHash, blockNumber: r.blockNumber });
    expect(await w.registry.receiptLogs(r.txHash)).toEqual({ blockNumber: r.blockNumber, success: true, logs: [{ seq: 1, entryHash: h(1) }] });
    expect(await w.registry.rpcChainId()).toBe(31337);
  });

  it('an out-of-order or repeated seq is refused by the contract', async () => {
    await expect(w.registry.append(5, h(5))).rejects.toThrow();
    await expect(w.registry.append(1, h(9))).rejects.toThrow();
    expect(await w.registry.entryHash(1)).toBe(h(1));
  });

  it('a read-only client cannot append; a key that is not the operator is refused', async () => {
    const ro = createRegistryClient({ rpcUrl, deployment: w.deployment });
    expect(await ro.entryHash(1)).toBe(h(1));
    await expect(ro.append(2, h(2))).rejects.toThrow(/read-only/);
    expect(() => createRegistryClient({ rpcUrl, deployment: w.deployment, operatorKey: generatePrivateKey() })).toThrow(/does not match/);
  });

  it('append waits for the deployment confirmations before it resolves (2 here: one more block)', async () => {
    const c = createRegistryClient({ rpcUrl, deployment: { ...w.deployment, confirmations: 2 }, operatorKey: w.operatorKey });
    expect(c.confirmations).toBe(2);
    const seq = await c.nextSeq();
    let settled = false;
    const p = c.append(seq, h(seq)).finally(() => (settled = true));
    await new Promise((r) => setTimeout(r, 2_000));
    expect(settled).toBe(false);
    await rpc('evm_mine', []);
    const r = await p;
    expect((await c.blockNumber()) - r.blockNumber + 1).toBeGreaterThanOrEqual(2);
    expect(await c.entryHash(seq)).toBe(h(seq));
  });

  it('anchoredLog queries logs in bounded block ranges and still finds a log far from the deployment block', async () => {
    const ranges: number[] = [];
    const c = createRegistryClient({
      rpcUrl,
      deployment: w.deployment,
      operatorKey: w.operatorKey,
      logRangeBlocks: 8,
      onFetchRequest: async (req) => {
        const body = (await req.clone().json()) as { method: string; params: { fromBlock: string; toBlock: string }[] };
        if (body.method === 'eth_getLogs') ranges.push(Number(BigInt(body.params[0]!.toBlock) - BigInt(body.params[0]!.fromBlock)) + 1);
      },
    });
    await rpc('anvil_mine', ['0x1e']); // 30 empty blocks after the deployment
    const seq = await c.nextSeq();
    const sent = await c.append(seq, h(seq));
    expect(await c.anchoredLog(seq)).toEqual({ seq, entryHash: h(seq), txHash: sent.txHash, blockNumber: sent.blockNumber });
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...ranges)).toBeLessThanOrEqual(8);
    expect(await c.anchoredLog(seq + 50)).toBeNull();
  });

  it('the committed ABI equals `forge inspect BatchRegistry abi`', async () => {
    const { stdout } = await execFileAsync(foundryBin('forge'), ['inspect', 'BatchRegistry', 'abi', '--json'], { cwd: CONTRACTS_DIR, env: foundryEnv(), maxBuffer: 8 * 1024 * 1024 });
    const committed = JSON.parse(await readFile(join(CONTRACTS_DIR, '..', 'src/lib/ledger/evm/abi/BatchRegistry.json'), 'utf8')) as unknown;
    expect(committed).toEqual(JSON.parse(stdout));
  });
});
