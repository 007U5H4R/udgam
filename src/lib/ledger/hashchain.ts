import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { jcs, sha256Hex } from '../crypto';
import type { Db } from '../db/client';
import { ledgerEntries } from '../db/schema';
import type { Anchor, ChainCheck, EntryHeader, LedgerKind, Tx } from './types';

// Hash-chain ledger adapter (technical-plan §8.1, S7). Checkpoints arrive with TKT-15 via onAppended.

export const GENESIS_PREV = '0'.repeat(64);

type OnAppended = (tx: Tx, seq: number) => Promise<void>;
let onAppended: OnAppended | undefined;

/** Register the hook that runs inside the append's transaction after each entry (TKT-15 checkpoints). */
export function setOnAppended(hook: OnAppended | undefined): void {
  onAppended = hook;
}

/** entry_hash = sha256Hex(jcs({seq, prev_hash, kind, payload_hash, ts})) */
export function entryHashOf(e: EntryHeader): Promise<string> {
  return sha256Hex(jcs({ seq: e.seq, prev_hash: e.prev_hash, kind: e.kind, payload_hash: e.payload_hash, ts: e.ts }));
}

/**
 * Append one entry inside the caller's write transaction. The transaction (BEGIN IMMEDIATE) holds
 * SQLite's write lock from its start, so reading MAX(seq) and inserting seq+1 cannot interleave with
 * another writer; `seq` is also the primary key. The payload is stored as its canonical JSON.
 */
export async function append(
  tx: Tx,
  kind: LedgerKind,
  payload: Record<string, unknown>,
  now: () => Date = () => new Date(),
): Promise<Anchor> {
  const payloadText = jcs(payload);
  const [last] = await tx
    .select({ seq: ledgerEntries.seq, entryHash: ledgerEntries.entryHash })
    .from(ledgerEntries)
    .orderBy(desc(ledgerEntries.seq))
    .limit(1);
  const header: EntryHeader = {
    seq: (last?.seq ?? 0) + 1,
    prev_hash: last?.entryHash ?? GENESIS_PREV,
    kind,
    payload_hash: await sha256Hex(payloadText),
    ts: now().toISOString(),
  };
  const entryHash = await entryHashOf(header);
  await tx.insert(ledgerEntries).values({
    seq: header.seq,
    prevHash: header.prev_hash,
    kind,
    payload: payloadText,
    payloadHash: header.payload_hash,
    ts: header.ts,
    entryHash,
  });
  if (onAppended) await onAppended(tx, header.seq);
  return { seq: header.seq, entryHash, payloadHash: header.payload_hash };
}

const PAGE = 500;

/** Recompute the chain from `fromSeq` (default 1): contiguity, links, payload and entry hashes. */
export async function verifyChain(db: Db | Tx, fromSeq = 1): Promise<ChainCheck> {
  let prevHash = GENESIS_PREV;
  if (fromSeq > 1) {
    const [before] = await db
      .select({ entryHash: ledgerEntries.entryHash })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seq, fromSeq - 1));
    if (!before) return { ok: false, seq: fromSeq, reason: 'seq-gap' };
    prevHash = before.entryHash;
  }
  let expectSeq = fromSeq;
  for (;;) {
    const page = await db
      .select()
      .from(ledgerEntries)
      .where(and(gte(ledgerEntries.seq, expectSeq)))
      .orderBy(asc(ledgerEntries.seq))
      .limit(PAGE);
    for (const e of page) {
      if (e.seq !== expectSeq) return { ok: false, seq: expectSeq, reason: 'seq-gap' };
      if (e.prevHash !== prevHash) return { ok: false, seq: e.seq, reason: 'prev-hash' };
      if ((await sha256Hex(e.payload)) !== e.payloadHash) return { ok: false, seq: e.seq, reason: 'payload-hash' };
      const recomputed = await entryHashOf({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts });
      if (recomputed !== e.entryHash) return { ok: false, seq: e.seq, reason: 'entry-hash' };
      prevHash = e.entryHash;
      expectSeq = e.seq + 1;
    }
    if (page.length < PAGE) return { ok: true };
  }
}
