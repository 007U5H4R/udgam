import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createPublicClient, getContractAddress, http, parseAbi, parseEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defaultConfirmations, readDeployment, writeDeployment, type Deployment } from './deployment';
import { CONTRACTS_DIR, foundryBin, foundryEnv, fundOperatorOnLocalAnvil } from './foundry';
import { loadOrCreateOperatorKey } from './operator-key';

// Deploy BatchRegistry (technical-plan TSK-24.3). Tooling: used by `pnpm contracts:deploy`, the eval
// harness (--ledger=evm) and EVM tests, never by the app.
//  1. An existing deployment.json whose registry is live on this chain with this operator → no-op.
//  2. The operator key is generated at EVM_OPERATOR_KEY_PATH if missing (0600, operator-key.ts).
//  3. On local Anvil only (chain id 31337 and an anvil client), the operator is funded from Anvil's
//     first unlocked dev account by eth_sendTransaction, so no dev private key appears anywhere. On any
//     other chain an unfunded operator is an error naming its address.
//  4. contracts/script/Deploy.s.sol is broadcast by `forge script`, with the key passed in the child's
//     environment (never argv), and broadcast files kept in a temp directory.
//  5. DATA_DIR/evm/deployment.json = { chainId, registry, operator, deployedAtBlock, confirmations }.

const execFileAsync = promisify(execFile);
const OPERATOR_ABI = parseAbi(['function operator() view returns (address)']);

/** Below this, the operator is topped up on local Anvil (a registry append costs well under 0.001 ETH). */
const MIN_BALANCE = parseEther('1');

export type DeployOptions = { rpcUrl: string; deploymentPath: string; operatorKeyPath: string; contractsDir?: string };
export type DeployResult = { deployment: Deployment; created: boolean };

async function liveDeployment(pub: ReturnType<typeof createPublicClient>, d: Deployment, chainId: number): Promise<boolean> {
  if (d.chainId !== chainId) return false;
  const code = await pub.getCode({ address: d.registry });
  if (!code || code === '0x') return false;
  const operator = (await pub.readContract({ address: d.registry, abi: OPERATOR_ABI, functionName: 'operator' })) as Address;
  return operator.toLowerCase() === d.operator.toLowerCase();
}

/** The first block at which `address` has code (binary search over historical state). */
async function deployedAt(pub: ReturnType<typeof createPublicClient>, address: Address): Promise<number> {
  let lo = BigInt(0);
  let hi = await pub.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const code = await pub.getCode({ address, blockNumber: mid });
    if (code && code !== '0x') hi = mid;
    else lo = mid + BigInt(1);
  }
  return Number(lo);
}

export async function deployRegistry(o: DeployOptions): Promise<DeployResult> {
  const transport = http(o.rpcUrl, { retryCount: 0, timeout: 15_000 });
  const pub = createPublicClient({ transport, pollingInterval: 250 });
  const chainId = await pub.getChainId();

  if (existsSync(o.deploymentPath)) {
    const existing = await readDeployment(o.deploymentPath);
    if (await liveDeployment(pub, existing, chainId)) return { deployment: existing, created: false };
    throw new Error(
      `${o.deploymentPath} names registry ${existing.registry} on chain ${existing.chainId}, which is not live on this RPC; move the file aside to deploy a new registry`,
    );
  }

  const key = await loadOrCreateOperatorKey(o.operatorKeyPath);
  const operator = privateKeyToAccount(key).address;

  await fundOperatorOnLocalAnvil(pub, transport, operator, { chainId, minBalance: MIN_BALANCE });

  const nonce = await pub.getTransactionCount({ address: operator, blockTag: 'pending' });
  const expected = getContractAddress({ from: operator, nonce: BigInt(nonce) });
  const broadcast = await mkdtemp(join(tmpdir(), 'udgam-forge-broadcast-'));
  try {
    await execFileAsync(foundryBin('forge'), ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', o.rpcUrl, '--broadcast', '--non-interactive'], {
      cwd: o.contractsDir ?? CONTRACTS_DIR,
      env: foundryEnv({ UDGAM_DEPLOY_OPERATOR_KEY: key, FOUNDRY_BROADCAST: broadcast }),
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    // forge's own output can echo its environment on some errors: report the exit, not the output.
    const code = (e as { code?: unknown }).code;
    throw new Error(`forge script Deploy.s.sol failed (exit ${String(code)}); run it by hand in contracts/ to see why`);
  } finally {
    await rm(broadcast, { recursive: true, force: true });
  }

  const deployment: Deployment = { chainId, registry: expected, operator, deployedAtBlock: await deployedAt(pub, expected), confirmations: defaultConfirmations(chainId) };
  if (!(await liveDeployment(pub, deployment, chainId))) throw new Error(`forge script finished but no BatchRegistry with operator ${operator} is at ${expected}`);
  await writeDeployment(o.deploymentPath, deployment);
  return { deployment, created: true };
}
