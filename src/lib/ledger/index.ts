import { env } from '../config/env';
import { getDbReady, type Db } from '../db/client';
import { log } from '../log';
import { append as hashchainAppend } from './hashchain';
import type { Anchor, LedgerKind, Tx } from './types';
import { createEvmLedger, type AnchorRunReport } from './evm/adapter';
import { createRegistryClient, type RegistryClient } from './evm/client';
import { evmPaths, readDeployment } from './evm/deployment';
import { readOperatorKey } from './evm/operator-key';

// The ledger port (technical-plan §8.1, TSK-24.6). SERVER-ONLY. LEDGER_ADAPTER selects the adapter:
//  - hashchain (default): the hash-chain store alone (M-001).
//  - evm: the same hash-chain append, plus each entry hash anchored on BatchRegistry after commit
//    (src/lib/ledger/evm/adapter.ts). The hash-chain store stays the payload system of record.
// Both adapters write the same ledger_entries rows, so every M-001 proof works unchanged under either.

export type LedgerAdapterName = 'hashchain' | 'evm';

export type Ledger = {
  adapter: LedgerAdapterName;
  /** Append inside the caller's write transaction (writeTx). */
  append(tx: Tx, kind: LedgerKind, payload: Record<string, unknown>): Promise<Anchor>;
  /** Anchor what is pending on chain (evm); null for hashchain. Call outside any write transaction. */
  anchorPending(): Promise<AnchorRunReport | null>;
};

const hashchainLedger: Ledger = {
  adapter: 'hashchain',
  append: (tx, kind, payload) => hashchainAppend(tx, kind, payload),
  anchorPending: async () => null,
};

/**
 * The registry client from the environment: ANVIL_RPC_URL, DATA_DIR/evm/deployment.json (written by
 * `pnpm contracts:deploy`) and the operator key at EVM_OPERATOR_KEY_PATH. Read on first use and cached
 * once it loads; a failed load is retried by the next anchoring run.
 */
let envClient: Promise<RegistryClient> | undefined;
export function registryFromEnv(): Promise<RegistryClient> {
  if (!envClient) {
    const p = evmPaths(env);
    envClient = Promise.all([readDeployment(p.deploymentPath), readOperatorKey(p.operatorKeyPath)]).then(([deployment, operatorKey]) =>
      createRegistryClient({ rpcUrl: p.rpcUrl, deployment, operatorKey }),
    );
    envClient.catch(() => (envClient = undefined));
  }
  return envClient;
}

export type LedgerOptions = { registry?: () => Promise<RegistryClient> };

/** The ledger for `db` with the named adapter (default: LEDGER_ADAPTER). */
export function ledgerFor(db: Db, adapter: LedgerAdapterName = env.LEDGER_ADAPTER, opts: LedgerOptions = {}): Ledger {
  if (adapter === 'hashchain') return hashchainLedger;
  const evm = createEvmLedger({ db, registry: opts.registry ?? registryFromEnv });
  return { adapter: 'evm', append: evm.append, anchorPending: evm.anchorPending };
}

const LOOP_KEY = Symbol.for('udgam.evm.anchor-loop');

/**
 * Boot hook (src/instrumentation.ts). With LEDGER_ADAPTER=evm, anchor whatever is pending now and then
 * every `intervalMs`, in the background: anchoring never blocks a request, and a failure is logged and
 * retried on the next tick. One loop per process, however many times this module is loaded; a tick
 * never overlaps a running one. `deps` lets tests pass the adapter and the anchoring call.
 */
export function startLedger(
  intervalMs = 5_000,
  deps: { adapter?: LedgerAdapterName; anchor?: () => Promise<unknown> } = {},
): void {
  if ((deps.adapter ?? env.LEDGER_ADAPTER) !== 'evm') return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[LOOP_KEY]) return;
  const anchor = deps.anchor ?? (async () => ledgerFor(await getDbReady(), 'evm').anchorPending());
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await anchor();
    } catch (e) {
      log.warn({ errClass: e instanceof Error ? e.constructor.name : 'unknown' }, 'evm.anchor_loop_failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  g[LOOP_KEY] = timer;
  void tick();
}

/** Stop the anchoring loop (tests, shutdown). */
export function stopLedger(): void {
  const g = globalThis as Record<symbol, unknown>;
  const timer = g[LOOP_KEY] as ReturnType<typeof setInterval> | undefined;
  if (timer) clearInterval(timer);
  delete g[LOOP_KEY];
}
