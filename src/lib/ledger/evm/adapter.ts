import { and, asc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { writeTx, type Db, type Tx } from '../../db/client';
import { evmAnchors, ledgerEntries } from '../../db/schema';
import { log } from '../../log';
import { append as hashchainAppend } from '../hashchain';
import type { Anchor, LedgerKind } from '../types';
import type { AnchorReceipt, RegistryClient } from './client';

// The EVM ledger adapter (technical-plan TSK-24.6). SERVER-ONLY.
//
// The hash-chain store stays the system of record for payloads: append() is the hash-chain append plus
// an `evm_anchors` row with status 'pending', in the SAME write transaction. The chain call cannot be
// part of that transaction, so anchoring happens after the commit: anchorPending() sends pending rows in
// ascending seq, marks each 'anchored' with its tx hash and block, and stops at the first failure, so
// on-chain order always equals ledger order (BatchRegistry also refuses any other order). A failure
// never reaches the capture path: it is recorded on the row (attempts, last_error), logged, and retried
// by the next run. Rows are also backfilled for any ledger entry that has none (entries appended through
// hashchain.append directly, or before the adapter was switched on), so every entry is anchored in order.
//
// Statuses: pending → anchored (terminal; tx_hash immutable, migration 0020). 'failed' is terminal too
// and means the chain already holds a DIFFERENT hash at that seq: anchoring stops there and the
// mismatch is for an operator (and `pnpm ledger:audit`) to explain.

export type AnchorRunReport = {
  /** Rows anchored by this run. */
  anchored: number;
  /** Rows still pending after this run. */
  pending: number;
  /** Where the run stopped early, and why (the row keeps the error too). */
  stoppedAt?: { seq: number; reason: string };
};

export type EvmLedger = {
  adapter: 'evm';
  append(tx: Tx, kind: LedgerKind, payload: Record<string, unknown>): Promise<Anchor>;
  /** Anchor pending rows in seq order. Serialised per database; call it outside any write transaction. */
  anchorPending(): Promise<AnchorRunReport>;
};

export type EvmLedgerOptions = {
  db: Db;
  /** The registry client, created on first use (deployment and key files are read lazily). */
  registry: () => Promise<RegistryClient>;
  now?: () => Date;
};

/** The pending anchor row for `seq`, written in the caller's transaction (same tx as the append). */
export async function recordPending(tx: Tx, seq: number, now: Date = new Date()): Promise<void> {
  await tx.insert(evmAnchors).values({ seq, status: 'pending', attempts: 0, updatedAt: now.toISOString() });
}

/** A short, secret-free description of an anchoring error (viem's shortMessage, else the class). */
export function errorText(e: unknown): string {
  const short = (e as { shortMessage?: unknown })?.shortMessage;
  const text = typeof short === 'string' && short ? short : e instanceof Error ? e.message.split('\n')[0]! : 'unknown error';
  return text.slice(0, 300);
}

// One anchoring run at a time per database, across module instances (Next may load this module twice
// in one process; see db/client.ts), so two runs never send the same seq.
const QUEUES_KEY = Symbol.for('udgam.evm.anchor-queues');
const queues: WeakMap<Db, Promise<unknown>> = ((globalThis as Record<symbol, unknown>)[QUEUES_KEY] as WeakMap<Db, Promise<unknown>> | undefined) ??
  ((globalThis as Record<symbol, unknown>)[QUEUES_KEY] = new WeakMap<Db, Promise<unknown>>()) as WeakMap<Db, Promise<unknown>>;

export function createEvmLedger(o: EvmLedgerOptions): EvmLedger {
  const { db } = o;
  const now = o.now ?? (() => new Date());

  async function backfill(): Promise<void> {
    const missing = await db
      .select({ seq: ledgerEntries.seq })
      .from(ledgerEntries)
      .where(notExists(db.select({ one: sql`1` }).from(evmAnchors).where(eq(evmAnchors.seq, ledgerEntries.seq))))
      .limit(1);
    if (missing.length === 0) return;
    await writeTx(db, async (tx) => {
      await tx.run(sql`INSERT INTO evm_anchors (seq, status, attempts, updated_at)
        SELECT le.seq, 'pending', 0, ${now().toISOString()} FROM ledger_entries le
         WHERE NOT EXISTS (SELECT 1 FROM evm_anchors ea WHERE ea.seq = le.seq) ORDER BY le.seq`);
    });
  }

  async function noteError(seq: number, attempts: number, reason: string): Promise<void> {
    await writeTx(db, (tx) =>
      tx
        .update(evmAnchors)
        .set({ attempts: attempts + 1, lastError: reason, updatedAt: now().toISOString() })
        .where(and(eq(evmAnchors.seq, seq), eq(evmAnchors.status, 'pending'))),
    );
  }

  async function markAnchored(seq: number, attempts: number, client: RegistryClient, r: AnchorReceipt): Promise<void> {
    await writeTx(db, (tx) =>
      tx
        .update(evmAnchors)
        .set({
          status: 'anchored',
          chainId: client.chainId,
          contract: client.registry.toLowerCase(),
          txHash: r.txHash.toLowerCase(),
          blockNumber: r.blockNumber,
          attempts: attempts + 1,
          lastError: null,
          updatedAt: now().toISOString(),
        })
        .where(and(eq(evmAnchors.seq, seq), eq(evmAnchors.status, 'pending'))),
    );
  }

  async function markFailed(seq: number, attempts: number, reason: string): Promise<void> {
    await writeTx(db, (tx) =>
      tx
        .update(evmAnchors)
        .set({ status: 'failed', attempts: attempts + 1, lastError: reason, updatedAt: now().toISOString() })
        .where(and(eq(evmAnchors.seq, seq), eq(evmAnchors.status, 'pending'))),
    );
  }

  async function run(): Promise<AnchorRunReport> {
    await backfill();
    const pending = await db
      .select({ seq: evmAnchors.seq, attempts: evmAnchors.attempts, entryHash: ledgerEntries.entryHash })
      .from(evmAnchors)
      .innerJoin(ledgerEntries, eq(ledgerEntries.seq, evmAnchors.seq))
      .where(eq(evmAnchors.status, 'pending'))
      .orderBy(asc(evmAnchors.seq));
    if (pending.length === 0) return { anchored: 0, pending: 0 };

    let anchored = 0;
    const stop = async (row: { seq: number; attempts: number }, reason: string, failed = false): Promise<AnchorRunReport> => {
      if (failed) await markFailed(row.seq, row.attempts, reason);
      else await noteError(row.seq, row.attempts, reason);
      log.warn({ seq: row.seq, reason, failed }, 'evm.anchor_stopped');
      return { anchored, pending: pending.length - anchored - (failed ? 1 : 0), stoppedAt: { seq: row.seq, reason } };
    };

    // A failed seq (the chain holds another hash there) halts anchoring until an operator resolves it.
    const [failed] = await db.select({ seq: evmAnchors.seq }).from(evmAnchors).where(eq(evmAnchors.status, 'failed')).orderBy(asc(evmAnchors.seq)).limit(1);
    if (failed && failed.seq < pending[0]!.seq) return stop(pending[0]!, `seq ${failed.seq} failed to anchor (the registry holds a different hash); anchoring is halted`);

    let client: RegistryClient;
    let chainNext: number;
    try {
      client = await o.registry();
      const rpcChain = await client.rpcChainId();
      if (rpcChain !== client.chainId) return await stop(pending[0]!, `RPC reports chain ${rpcChain}, deployment is on chain ${client.chainId}`);
      chainNext = await client.nextSeq();
    } catch (e) {
      return stop(pending[0]!, errorText(e));
    }

    for (const row of pending) {
      let receipt: AnchorReceipt;
      try {
        if (row.seq < chainNext) {
          // Already on chain: sent before a crash, or the DB update was lost. Adopt it if it matches.
          const onChain = await client.entryHash(row.seq);
          if (onChain !== row.entryHash) return await stop(row, `registry holds a different hash at seq ${row.seq}`, true);
          const found = await client.anchoredLog(row.seq);
          if (!found) return await stop(row, `seq ${row.seq} is on chain but its EntryAnchored log was not found`);
          receipt = found;
        } else if (row.seq > chainNext) {
          return await stop(row, `registry expects seq ${chainNext} next, so seq ${row.seq} must wait`);
        } else {
          receipt = await client.append(row.seq, row.entryHash);
          chainNext = row.seq + 1;
        }
      } catch (e) {
        return stop(row, errorText(e));
      }
      await markAnchored(row.seq, row.attempts, client, receipt);
      anchored++;
    }
    if (anchored > 0) log.info({ anchored, lastSeq: pending[pending.length - 1]!.seq }, 'evm.anchored');
    return { anchored, pending: 0 };
  }

  return {
    adapter: 'evm',
    async append(tx, kind, payload) {
      const anchor = await hashchainAppend(tx, kind, payload);
      await recordPending(tx, anchor.seq, now());
      return anchor;
    },
    anchorPending() {
      const previous = queues.get(db) ?? Promise.resolve();
      const next = previous.then(run, run);
      queues.set(
        db,
        next.catch(() => undefined),
      );
      return next;
    },
  };
}

/** What a proof says about one entry's on-chain anchor (docs/proof-feed.md, "EVM extension"). */
export type EvmProofField =
  | { status: 'anchored'; chainId: number; contract: string; txHash: string; blockNumber: number }
  | { status: 'pending' }
  | { status: 'failed' };

/** The `evm` field of each seq (a seq with no row yet is pending: its anchor lags the DB commit). */
export async function evmFieldsFor(db: Db, seqs: number[]): Promise<Map<number, EvmProofField>> {
  const out = new Map<number, EvmProofField>(seqs.map((s) => [s, { status: 'pending' }]));
  for (let i = 0; i < seqs.length; i += 500) {
    const rows = await db.select().from(evmAnchors).where(inArray(evmAnchors.seq, seqs.slice(i, i + 500)));
    for (const r of rows) {
      if (r.status === 'anchored' && r.chainId !== null && r.contract && r.txHash && r.blockNumber !== null) {
        out.set(r.seq, { status: 'anchored', chainId: r.chainId, contract: r.contract, txHash: r.txHash, blockNumber: r.blockNumber });
      } else if (r.status === 'failed') {
        out.set(r.seq, { status: 'failed' });
      }
    }
  }
  return out;
}
