import { env } from '../config/env';
import { evmPaths } from '../ledger/evm/deployment';
import { readOperatorKey } from '../ledger/evm/operator-key';
import { ChainError, createEscrowChain, type EscrowChain } from './chain';
import { escrowDeploymentPath, readEscrowDeployment } from './deployment';

// The escrow from the environment (TKT-25). SERVER-ONLY. ANVIL_RPC_URL, DATA_DIR/evm/agreements.json
// (written by `pnpm agreements:deploy`) and the operator key at EVM_OPERATOR_KEY_PATH. Cached once it
// loads; a failed load (no deployment yet, no key) is a ChainError('no_answer') and is retried next call,
// so the screens show "the ledger didn't answer, nothing moved" rather than an exception.

let cached: Promise<EscrowChain> | undefined;

export function escrowFromEnv(): Promise<EscrowChain> {
  if (!cached) {
    const p = evmPaths(env);
    cached = Promise.all([readEscrowDeployment(escrowDeploymentPath(env.DATA_DIR)), readOperatorKey(p.operatorKeyPath)])
      .then(([deployment, operatorKey]) => createEscrowChain({ rpcUrl: p.rpcUrl, deployment, operatorKey }))
      .catch(() => {
        cached = undefined;
        throw new ChainError('no_answer', 'escrow deployment or operator key not available');
      });
  }
  return cached;
}

/** A buyer organisation's mock INR balance in paise, or null when the ledger does not answer within `ms`. */
export async function buyerBalance(orgId: string, ms = 2_000): Promise<bigint | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.());
  try {
    return await Promise.race([escrowFromEnv().then((c) => c.balanceOf(orgId)), timeout]);
  } catch {
    return null;
  }
}
