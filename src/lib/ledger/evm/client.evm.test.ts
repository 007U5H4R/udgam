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

  it('the committed ABI equals `forge inspect BatchRegistry abi`', async () => {
    const { stdout } = await execFileAsync(foundryBin('forge'), ['inspect', 'BatchRegistry', 'abi', '--json'], { cwd: CONTRACTS_DIR, env: foundryEnv(), maxBuffer: 8 * 1024 * 1024 });
    const committed = JSON.parse(await readFile(join(CONTRACTS_DIR, '..', 'src/lib/ledger/evm/abi/BatchRegistry.json'), 'utf8')) as unknown;
    expect(committed).toEqual(JSON.parse(stdout));
  });
});
