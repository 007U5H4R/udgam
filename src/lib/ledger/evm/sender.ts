import { AsyncLocalStorage } from 'node:async_hooks';
import { BaseError, NonceTooLowError, type Address, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { createNonceManager, jsonRpc, type NonceManager } from 'viem/nonce';

// One sender per EVM account in this process (Stage 10 SEC-200). SERVER-ONLY.
//
// The operator key signs for the BatchRegistry anchoring loop and for every agreement action (create,
// mint, gas top-up, settle); each buyer organisation's key signs its own approve/fund/refund. Each client
// builds its own viem account, so without coordination two overlapping sends from one account read the
// same pending nonce and the node turns the second away ("transaction already imported" / "nonce too
// low"), which the screens show as "the ledger did not answer". Three layers stop that:
//
// 1. sendFrom(): sends from one account on one chain run one at a time, in call order (an in-process FIFO,
//    the writeTx pattern), from prepare to broadcast. The receipt wait is outside, so a slow block does not
//    hold the account; a multi-step operation that must not interleave (approve then fund) holds it with
//    exclusive(), and the sends inside it run at once (re-entrant per async context).
// 2. evmAccount(): every account shares ONE viem nonce manager, so a send right after another one gets
//    the next nonce even when the RPC's pending count has not caught up yet.
// 3. A nonce collision (another process, such as a CLI run, took the nonce) resets the account's nonce
//    and retries the send once; the retry re-runs the caller's simulate, so a call that is no longer
//    valid fails on its revert instead of being sent twice.
//
// Process-wide state lives on globalThis, not in this module: `next start` instantiates server modules
// once per Turbopack runtime (route handlers, pages/Server Actions), as db/client.ts explains.
//
// The nonce manager remembers the last nonce it gave each account and never goes below it. A transaction
// the chain did not keep (Anvil restarted while it was in the mempool, or dropped) would leave a gap, so
// every receipt wait goes through receiptOf(), which forgets that memory when the wait fails.

type SenderState = {
  nonceManager: NonceManager;
  queues: Map<string, Promise<void>>;
  held: AsyncLocalStorage<ReadonlySet<string>>;
};
const STATE_KEY = Symbol.for('udgam.evm.sender-state');
const slot = globalThis as Record<symbol, unknown>;
const state: SenderState = (slot[STATE_KEY] as SenderState | undefined) ??
  (slot[STATE_KEY] = {
    nonceManager: createNonceManager({ source: jsonRpc() }),
    queues: new Map(),
    held: new AsyncLocalStorage<ReadonlySet<string>>(),
  } satisfies SenderState) as SenderState;

/** The process-wide nonce manager every EVM account signs with. */
export const processNonceManager = (): NonceManager => state.nonceManager;

/** The account for `key`, on the process nonce manager. Server-internal: never serialise it. */
export function evmAccount(key: Hex): PrivateKeyAccount {
  return privateKeyToAccount(key, { nonceManager: state.nonceManager });
}

const COLLISION = /nonce too low|transaction already imported|already known|replacement transaction underpriced/i;

/** True when the node refused a transaction because its nonce was already taken (retry after a resync). */
export function isNonceCollision(e: unknown): boolean {
  if (!(e instanceof BaseError)) return false;
  return e.walk((x) => x instanceof NonceTooLowError || (x instanceof BaseError && COLLISION.test(x.details ?? ''))) !== null;
}

const queueKey = (address: Address, chainId: number) => `${address.toLowerCase()}.${chainId}`;

/**
 * Run `fn` holding `address` on `chainId`: after every earlier holder in this process, before every later
 * one. Inside `fn`, sends from the same account (sendFrom, exclusive) run at once instead of queueing
 * behind themselves.
 */
export function exclusive<T>(address: Address, chainId: number, fn: () => Promise<T>): Promise<T> {
  const key = queueKey(address, chainId);
  const held = state.held.getStore();
  if (held?.has(key)) return fn();
  const previous = state.queues.get(key) ?? Promise.resolve();
  const run = previous.then(() => state.held.run(new Set([...(held ?? []), key]), fn));
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  state.queues.set(key, tail);
  void tail.then(() => {
    if (state.queues.get(key) === tail) state.queues.delete(key);
  });
  return run;
}

/**
 * Wait for a sent transaction's receipt. When the wait fails (a timeout, a node restarted or a dropped
 * transaction), the account's remembered nonce is forgotten so the next send asks the node again: the
 * nonce manager would otherwise hand out the nonce after a transaction the chain never kept, and every
 * later send would wait behind that gap.
 */
export async function receiptOf<R>(address: Address, chainId: number, wait: () => Promise<R>): Promise<R> {
  try {
    return await wait();
  } catch (e) {
    state.nonceManager.reset({ address, chainId });
    throw e;
  }
}

/**
 * Prepare, sign and broadcast one transaction from `address` (`send` returns once the node accepted it,
 * typically its hash), serialised per account. A nonce collision resyncs the nonce and retries once.
 */
export function sendFrom<T>(address: Address, chainId: number, send: () => Promise<T>): Promise<T> {
  return exclusive(address, chainId, async () => {
    try {
      return await send();
    } catch (e) {
      if (!isNonceCollision(e)) throw e;
      state.nonceManager.reset({ address, chainId });
      return send();
    }
  });
}
