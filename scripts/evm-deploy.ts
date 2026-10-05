// `pnpm contracts:deploy` (technical-plan TSK-24.3): deploy BatchRegistry to the chain at ANVIL_RPC_URL
// (default http://127.0.0.1:8545) and write DATA_DIR/evm/deployment.json. The operator key is generated
// at EVM_OPERATOR_KEY_PATH (default DATA_DIR/keys/evm-operator.key, 0600) on first use and funded from
// Anvil's dev account on local Anvil only. Running it again with a live deployment is a no-op.
// Prints addresses and block numbers only, never the key.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/lib/config/env';
import { deployRegistry } from '../src/lib/ledger/evm/deploy';
import { evmPaths } from '../src/lib/ledger/evm/deployment';

export async function main(): Promise<number> {
  const paths = evmPaths(env);
  try {
    const { deployment: d, created } = await deployRegistry(paths);
    console.log(
      created
        ? `did: BatchRegistry deployed at ${d.registry} on chain ${d.chainId} (block ${d.deployedAtBlock}), operator ${d.operator}; wrote ${paths.deploymentPath}`
        : `ok: BatchRegistry already deployed at ${d.registry} on chain ${d.chainId}; nothing to do`,
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
