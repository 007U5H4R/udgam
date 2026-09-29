import { and, asc, desc, gte, lte } from 'drizzle-orm';
import { hexToBytes, bytesToHex, jcs, sha256Hex } from '../crypto';
import type { Tx } from '../db/client';
import { ledgerCheckpoints, ledgerEntries } from '../db/schema';
import { loadLedgerKey, type LedgerKey } from './keys';
import { merkleRoot } from './merkle';

// Signed Merkle checkpoints (technical-plan §8.2, TP9). Server-only. A checkpoint seals the
// contiguous range after the previous checkpoint up to `toSeq`: leaves are the entry_hash bytes in
// seq order (RFC 6962 tree, merkle.ts), and the statement is signed with the ledger key. Checkpoints
// are made inside the caller's write transaction, so a failed checkpoint rolls back its trigger.

export const CHECKPOINT_EVERY = 100;
export const GENESIS_CHECKPOINT_HASH = '0'.repeat(64);

export type Checkpoint = {
  id: number;
  fromSeq: number;
  toSeq: number;
  /** Lowercase hex RFC 6962 root. */
  merkleRoot: string;
  /** sha256Hex(statement of the previous checkpoint), or 64 zeros for the first. */
  prevCheckpointHash: string;
  ts: string;
  /** The ledger key's RFC 7638 thumbprint. */
  keyId: string;
  /** ECDSA P-256 / SHA-256 over the statement's UTF-8 bytes; P1363 r‖s, base64url. */
  signature: string;
};

type StatementFields = Pick<Checkpoint, 'id' | 'fromSeq' | 'toSeq' | 'merkleRoot' | 'prevCheckpointHash' | 'ts'>;

/** The signed statement: jcs({ v:1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts }). */
export function checkpointStatement(cp: StatementFields): string {
  const { id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts } = cp;
  return jcs({ v: 1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts });
}

export type CheckpointOptions = { key?: LedgerKey; now?: () => Date };

async function lastCheckpoint(tx: Tx): Promise<Checkpoint | undefined> {
  const [last] = await tx.select().from(ledgerCheckpoints).orderBy(desc(ledgerCheckpoints.id)).limit(1);
  return last;
}

/** Seal every entry after the last checkpoint up to and including `toSeq`. */
export async function createCheckpoint(tx: Tx, toSeq: number, opts: CheckpointOptions = {}): Promise<Checkpoint> {
  const last = await lastCheckpoint(tx);
  const fromSeq = (last?.toSeq ?? 0) + 1;
  if (toSeq < fromSeq) throw new RangeError(`checkpoint: nothing to seal up to seq ${toSeq}`);
  const rows = await tx
    .select({ seq: ledgerEntries.seq, entryHash: ledgerEntries.entryHash })
    .from(ledgerEntries)
    .where(and(gte(ledgerEntries.seq, fromSeq), lte(ledgerEntries.seq, toSeq)))
    .orderBy(asc(ledgerEntries.seq));
  if (rows.length !== toSeq - fromSeq + 1 || rows.some((r, i) => r.seq !== fromSeq + i)) {
    throw new RangeError(`checkpoint: ledger entries ${fromSeq}..${toSeq} are not all present`);
  }
  const fields: StatementFields = {
    id: (last?.id ?? 0) + 1,
    fromSeq,
    toSeq,
    merkleRoot: bytesToHex(await merkleRoot(rows.map((r) => hexToBytes(r.entryHash)))),
    prevCheckpointHash: last ? await sha256Hex(checkpointStatement(last)) : GENESIS_CHECKPOINT_HASH,
    ts: (opts.now ?? (() => new Date()))().toISOString(),
  };
  const key = opts.key ?? (await loadLedgerKey());
  const cp: Checkpoint = { ...fields, keyId: key.kid, signature: await key.sign(checkpointStatement(fields)) };
  await tx.insert(ledgerCheckpoints).values(cp);
  return cp;
}

/** On demand (S7): seal the entries after the last checkpoint, or return null when there are none. */
export async function checkpointIfNeeded(tx: Tx, opts: CheckpointOptions = {}): Promise<Checkpoint | null> {
  const [head] = await tx.select({ seq: ledgerEntries.seq }).from(ledgerEntries).orderBy(desc(ledgerEntries.seq)).limit(1);
  if (!head) return null;
  const last = await lastCheckpoint(tx);
  if (head.seq <= (last?.toSeq ?? 0)) return null;
  return createCheckpoint(tx, head.seq, opts);
}

/** The ledger's onAppended hook: every 100th entry is sealed in the transaction that appended it. */
export async function maybeCheckpoint(tx: Tx, seq: number, opts: CheckpointOptions = {}): Promise<void> {
  if (seq % CHECKPOINT_EVERY === 0) await createCheckpoint(tx, seq, opts);
}
