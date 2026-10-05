import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

// Where the EVM adapter finds its chain, registry and operator key (technical-plan TSK-24.3). SERVER-ONLY.
// DATA_DIR/evm/deployment.json is written by `pnpm contracts:deploy` and is git-ignored with DATA_DIR.

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const DeploymentSchema = z.object({
  chainId: z.number().int().positive(),
  registry: address,
  operator: address,
  deployedAtBlock: z.number().int().nonnegative(),
  /** Blocks (including the anchor's own) before an anchor is recorded; absent = 1 (Anvil). */
  confirmations: z.number().int().min(1).max(256).optional(),
});

export type Deployment = { chainId: number; registry: `0x${string}`; operator: `0x${string}`; deployedAtBlock: number; confirmations?: number };

/** Confirmations `pnpm contracts:deploy` writes: 1 on Anvil (it never reorganises), 12 on any other chain. */
export const defaultConfirmations = (chainId: number): number => (chainId === 31337 ? 1 : 12);

/** Anvil's default listen address, used when ANVIL_RPC_URL is unset. */
export const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

export type EvmPaths = { rpcUrl: string; deploymentPath: string; operatorKeyPath: string };

/** The EVM settings from the validated environment (src/lib/config/env.ts), with their documented defaults. */
export function evmPaths(e: { DATA_DIR: string; ANVIL_RPC_URL?: string; EVM_OPERATOR_KEY_PATH?: string }): EvmPaths {
  return {
    rpcUrl: e.ANVIL_RPC_URL ?? DEFAULT_RPC_URL,
    deploymentPath: resolve(join(e.DATA_DIR, 'evm', 'deployment.json')),
    operatorKeyPath: resolve(e.EVM_OPERATOR_KEY_PATH ?? join(e.DATA_DIR, 'keys', 'evm-operator.key')),
  };
}

export async function readDeployment(path: string): Promise<Deployment> {
  return DeploymentSchema.parse(JSON.parse(await readFile(path, 'utf8'))) as Deployment;
}

/** Write atomically (temp file + rename), so a reader never sees half a deployment. */
export async function writeDeployment(path: string, d: Deployment): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(DeploymentSchema.parse(d), null, 2)}\n`);
  await rename(tmp, path);
}
