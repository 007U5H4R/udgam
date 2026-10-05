import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { writeTx, type Db, type Tx } from '../../db/client';
import { evmAnchors } from '../../db/schema';
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
// and means the chain already holds a DIFFERENT hash at that seq: anchoring halts there until the
// operator records one resolution (`pnpm ledger:evm:resolve`, migration 0023, docs/proof-feed.md §13.4).
// An anchor is recorded after `confirmations` blocks (deployment.json; 1 on Anvil).

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

// One anchoring pass at a time per database, across module instances and ledger objects (Next may load
// this module twice in one process; see db/client.ts), so two passes never send the same seq. Calls are
// coalesced (single-flight): with no pass running, a call starts one; while one runs, every call shares
// ONE queued follow-up pass, which starts when the running pass ends and sees whatever was appended
// meanwhile. However many requests call anchorPending() (each /api/verify and proof build does), at most
// one pass runs and one waits, so a slow or dead chain costs at most two RPC rounds and two error writes.
type Flight = { running?: Promise<AnchorRunReport>; queued?: Promise<AnchorRunReport> };
const FLIGHTS_KEY = Symbol.for('udgam.evm.anchor-flights');
const flights: WeakMap<Db, Flight> = ((globalThis as Record<symbol, unknown>)[FLIGHTS_KEY] as WeakMap<Db, Flight> | undefined) ??
  ((globalThis as Record<symbol, unknown>)[FLIGHTS_KEY] = new WeakMap<Db, Flight>()) as WeakMap<Db, Flight>;

/** Run `pass` single-flight for `db`: share the queued follow-up when a pass is already running. */
export function coalesced(db: Db, pass: () => Promise<AnchorRunReport>): Promise<AnchorRunReport> {
  let f = flights.get(db);
  if (!f) flights.set(db, (f = {}));
  const flight = f;
  if (flight.queued) return flight.queued;
  const start = (): Promise<AnchorRunReport> => {
    const p: Promise<AnchorRunReport> = pass().finally(() => {
      if (flight.running === p) flight.running = undefined;
    });
    flight.running = p;
    return p;
  };
  if (!flight.running) return start();
  const settle = () => undefined;
  const queued: Promise<AnchorRunReport> = flight.running.then(settle, settle).then(() => {
    flight.queued = undefined;
    return start();
  });
  flight.queued = queued;
  return queued;
}

export function createEvmLedger(o: EvmLedgerOptions): EvmLedger {
  const { db } = o;
  const now = o.now ?? (() => new Date());

  // The anchoring frontier: every seq up to the highest non-pending row has a row already (rows are
  // anchored strictly in order), so backfill and the pending read only look above it, by primary key.
  // ONE statement reads the entries still to anchor, with or without a row, so the set is a consistent
  // snapshot with no gaps: an append that commits after it waits for the next pass (spec Minor 2).
  async function toAnchor(): Promise<{ seq: number; attempts: number; entryHash: string; hasRow: boolean }[]> {
    const rows = await db.all<{ seq: number; attempts: number | null; entry_hash: string; status: string | null }>(sql`
      SELECT le.seq AS seq, ea.attempts AS attempts, le.entry_hash AS entry_hash, ea.status AS status
        FROM ledger_entries le LEFT JOIN evm_anchors ea ON ea.seq = le.seq
       WHERE le.seq > (SELECT COALESCE(MAX(seq), 0) FROM evm_anchors WHERE status <> 'pending')
         AND (ea.seq IS NULL OR ea.status = 'pending')
       ORDER BY le.seq`);
    return rows.map((r) => ({ seq: r.seq, attempts: r.attempts ?? 0, entryHash: r.entry_hash, hasRow: r.status !== null }));
  }

  /** Pending rows for entries that have none (appended through hashchain.append, or before the switch). */
  async function backfill(seqs: number[]): Promise<void> {
    if (seqs.length === 0) return;
    const at = now().toISOString();
    await writeTx(db, async (tx) => {
      for (const seq of seqs) {
        await tx.run(sql`INSERT INTO evm_anchors (seq, status, attempts, updated_at)
          SELECT ${seq}, 'pending', 0, ${at} WHERE NOT EXISTS (SELECT 1 FROM evm_anchors WHERE seq = ${seq})`);
      }
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
    const pending = await toAnchor();
    if (pending.length === 0) return { anchored: 0, pending: 0 };
    await backfill(pending.filter((r) => !r.hasRow).map((r) => r.seq));

    let anchored = 0;
    // At most one error write per pass: every stop() ends the pass.
    const stop = async (row: { seq: number; attempts: number }, reason: string, failed = false): Promise<AnchorRunReport> => {
      if (failed) await markFailed(row.seq, row.attempts, reason);
      else await noteError(row.seq, row.attempts, reason);
      log.warn({ seq: row.seq, reason, failed }, 'evm.anchor_stopped');
      return { anchored, pending: pending.length - anchored - (failed ? 1 : 0), stoppedAt: { seq: row.seq, reason } };
    };

    // An unresolved failed seq (the chain holds another hash there) halts anchoring until the operator
    // records a resolution (resolve.ts, `pnpm ledger:evm:resolve`). A halted pass sends and writes nothing.
    const [failed] = await db
      .select({ seq: evmAnchors.seq })
      .from(evmAnchors)
      .where(and(eq(evmAnchors.status, 'failed'), isNull(evmAnchors.resolution)))
      .orderBy(asc(evmAnchors.seq))
      .limit(1);
    if (failed && failed.seq < pending[0]!.seq) {
      const reason = `seq ${failed.seq} failed to anchor (the registry holds a different hash); anchoring is halted until it is resolved`;
      log.warn({ seq: pending[0]!.seq, failedSeq: failed.seq }, 'evm.anchor_halted');
      return { anchored: 0, pending: pending.length, stoppedAt: { seq: pending[0]!.seq, reason } };
    }

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
          // null below nextSeq is an inconsistent read (a lagging replica): transient, retried next pass.
          if (onChain === null) return await stop(row, `registry read no hash at seq ${row.seq} below nextSeq ${chainNext}; retrying`);
          if (onChain !== row.entryHash) return await stop(row, `registry holds a different hash at seq ${row.seq}`, true);
          const found = await client.anchoredLog(row.seq);
          if (!found) return await stop(row, `seq ${row.seq} is on chain but its EntryAnchored log was not found`);
          const depth = (await client.blockNumber()) - found.blockNumber + 1;
          if (depth < client.confirmations) return await stop(row, `seq ${row.seq} has ${depth} of ${client.confirmations} confirmations`);
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
      return coalesced(db, run);
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
