import { join } from 'node:path';
import { createRegistryClient, type RegistryClient } from '../../src/lib/ledger/evm/client';
import { deployRegistry } from '../../src/lib/ledger/evm/deploy';
import type { Deployment } from '../../src/lib/ledger/evm/deployment';
import { readOperatorKey, type Hex } from '../../src/lib/ledger/evm/operator-key';
import { tempDb, type TempDb } from './db';

// EVM test world (TKT-24): a fresh migrated libSQL file plus a BatchRegistry deployed for it alone on
// the shared Anvil of the `evm` vitest project, with a freshly generated operator key in the temp dir.
// Each world has its own registry, so its seq counter starts at 1 like its ledger.

export type EvmWorld = TempDb & {
  rpcUrl: string;
  deployment: Deployment;
  deploymentPath: string;
  operatorKeyPath: string;
  operatorKey: Hex;
  registry: RegistryClient;
};

export async function evmWorld(rpcUrl: string): Promise<EvmWorld> {
  const t = await tempDb();
  try {
    const deploymentPath = join(t.dir, 'evm', 'deployment.json');
    const operatorKeyPath = join(t.dir, 'keys', 'evm-operator.key');
    const { deployment } = await deployRegistry({ rpcUrl, deploymentPath, operatorKeyPath });
    const operatorKey = await readOperatorKey(operatorKeyPath);
    const registry = createRegistryClient({ rpcUrl, deployment, operatorKey });
    return { ...t, rpcUrl, deployment, deploymentPath, operatorKeyPath, operatorKey, registry };
  } catch (e) {
    await t.cleanup();
    throw e;
  }
}
