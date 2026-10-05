// `pnpm agreements:deploy` (TKT-25): deploy MockINR + ContractFarming to the chain at ANVIL_RPC_URL
// (default http://127.0.0.1:8545) and write DATA_DIR/evm/agreements.json. Uses the same operator key as
// BatchRegistry (EVM_OPERATOR_KEY_PATH, generated 0600 on first use, funded from Anvil's dev account on
// local Anvil only). Running it again with a live deployment is a no-op. Prints addresses only, never a key.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployEscrow } from '../src/lib/agreements/deploy';
import { escrowDeploymentPath } from '../src/lib/agreements/deployment';
import { env } from '../src/lib/config/env';
import { evmPaths } from '../src/lib/ledger/evm/deployment';

export async function main(): Promise<number> {
  const { rpcUrl, operatorKeyPath } = evmPaths(env);
  const deploymentPath = escrowDeploymentPath(env.DATA_DIR);
  try {
    const { deployment: d, created } = await deployEscrow({ rpcUrl, operatorKeyPath, deploymentPath });
    console.log(
      created
        ? `did: ContractFarming at ${d.escrow} and MockINR at ${d.token} on chain ${d.chainId}, operator ${d.operator}; wrote ${deploymentPath}`
        : `ok: escrow already deployed at ${d.escrow} on chain ${d.chainId}; nothing to do`,
    );
    return 0;
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
