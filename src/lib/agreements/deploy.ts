import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACTS_DIR, forgeBuild, fundOperatorOnLocalAnvil } from '../ledger/evm/foundry';
import { loadOrCreateOperatorKey } from '../ledger/evm/operator-key';
import { FARMING_ABI, TOKEN_ABI } from './chain';
import { readEscrowDeployment, writeEscrowDeployment, type EscrowDeployment } from './deployment';

// Deploy MockINR + ContractFarming (TKT-25). TOOLING: `pnpm agreements:deploy`, the EVM tests and the
// settlement eval runners; never imported by the app. The same operator key as BatchRegistry
// (EVM_OPERATOR_KEY_PATH, generated 0600 on first use). On local Anvil only (chain 31337 and an anvil
// client) the operator is funded from Anvil's first unlocked dev account, so no dev private key appears
// anywhere. Bytecode comes from `forge build` (contracts/out, git-ignored). Idempotent: an existing
// deployment that is live on this chain with this operator is a no-op.

const OPERATOR_ABI = parseAbi(['function operator() view returns (address)']);
const MIN_BALANCE = parseEther('5');

export type EscrowDeployOptions = { rpcUrl: string; deploymentPath: string; operatorKeyPath: string; contractsDir?: string };

async function bytecode(contractsDir: string, name: string): Promise<Hex> {
  const json = JSON.parse(await readFile(join(contractsDir, 'out', `${name}.sol`, `${name}.json`), 'utf8')) as { bytecode: { object: Hex } };
  return json.bytecode.object;
}

async function live(pub: ReturnType<typeof createPublicClient>, d: EscrowDeployment, chainId: number): Promise<boolean> {
  if (d.chainId !== chainId) return false;
  for (const a of [d.escrow, d.token]) {
    const code = await pub.getCode({ address: a });
    if (!code || code === '0x') return false;
    const op = (await pub.readContract({ address: a, abi: OPERATOR_ABI, functionName: 'operator' })) as Address;
    if (op.toLowerCase() !== d.operator.toLowerCase()) return false;
  }
  return true;
}

export async function deployEscrow(o: EscrowDeployOptions): Promise<{ deployment: EscrowDeployment; created: boolean }> {
  const transport = http(o.rpcUrl, { retryCount: 0, timeout: 15_000 });
  const pub = createPublicClient({ transport, pollingInterval: 250 });
  const chainId = await pub.getChainId();

  if (existsSync(o.deploymentPath)) {
    const existing = await readEscrowDeployment(o.deploymentPath);
    if (await live(pub, existing, chainId)) return { deployment: existing, created: false };
    throw new Error(`${o.deploymentPath} names an escrow on chain ${existing.chainId} that is not live on this RPC; move the file aside to deploy again`);
  }

  const key = await loadOrCreateOperatorKey(o.operatorKeyPath);
  const operator = privateKeyToAccount(key);
  await fundOperatorOnLocalAnvil(pub, transport, operator.address, { chainId, minBalance: MIN_BALANCE });

  const dir = o.contractsDir ?? CONTRACTS_DIR;
  await forgeBuild(dir);
  const wallet = createWalletClient({ account: operator, transport });
  const startBlock = Number(await pub.getBlockNumber());
  const tokenTx = await wallet.deployContract({ abi: TOKEN_ABI, bytecode: await bytecode(dir, 'MockINR'), args: [operator.address], account: operator, chain: null });
  const tokenR = await pub.waitForTransactionReceipt({ hash: tokenTx });
  if (!tokenR.contractAddress) throw new Error('MockINR deployment produced no contract');
  const farmTx = await wallet.deployContract({ abi: FARMING_ABI, bytecode: await bytecode(dir, 'ContractFarming'), args: [operator.address, tokenR.contractAddress], account: operator, chain: null });
  const farmR = await pub.waitForTransactionReceipt({ hash: farmTx });
  if (!farmR.contractAddress) throw new Error('ContractFarming deployment produced no contract');

  const deployment: EscrowDeployment = { chainId, token: tokenR.contractAddress, escrow: farmR.contractAddress, operator: operator.address, deployedAtBlock: Math.max(startBlock, 0) };
  if (!(await live(pub, deployment, chainId))) throw new Error('escrow deployment finished but the contracts are not live');
  await writeEscrowDeployment(o.deploymentPath, deployment);
  return { deployment, created: true };
}
