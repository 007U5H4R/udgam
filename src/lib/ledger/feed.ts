import { timingSafeEqual } from 'node:crypto';
import { and, asc, desc, gte, inArray, lte } from 'drizzle-orm';
import { bytesToHex, hexToBytes } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { ledgerCheckpoints, ledgerEntries } from '../db/schema';
import { checkpointIfNeeded, type Checkpoint } from './checkpoint';
import { batchCreatedEntry, closureSeqs } from './closure';
import { loadLedgerKey } from './keys';
import { merkleTree } from './merkle';
import { LEDGER_KEY_URL, PROOF_FEED_FORMAT, type FeedCheckpoint, type FeedEntry, type Proof, type ProofFeedV1 } from './proof';

// The proof feed builder (technical-plan §8.3, docs/proof-feed.md). Server-only. The certificate page
// and GET /api/verify/[batchId] both go through resolveFeed, so the three not-found cases are the
// same everywhere (TP8).

type EntryRow = typeof ledgerEntries.$inferSelect;

const toFeedCheckpoint = (c: Checkpoint): FeedCheckpoint => ({
  id: c.id,
  fromSeq: c.fromSeq,
  toSeq: c.toSeq,
  merkleRoot: c.merkleRoot,
  prevCheckpointHash: c.prevCheckpointHash,
  ts: c.ts,
  kid: c.keyId,
  signature: c.signature,
});

async function lastCheckpointedSeq(db: Db): Promise<number> {
  const [last] = await db.select({ toSeq: ledgerCheckpoints.toSeq }).from(ledgerCheckpoints).orderBy(desc(ledgerCheckpoints.id)).limit(1);
  return last?.toSeq ?? 0;
}

/** Checkpoints covering any of `seqs` (sorted ascending), in id order. */
async function coveringCheckpoints(db: Db, seqs: number[]): Promise<Checkpoint[]> {
  const rows = await db
    .select()
    .from(ledgerCheckpoints)
    .where(and(gte(ledgerCheckpoints.toSeq, seqs[0]!), lte(ledgerCheckpoints.fromSeq, seqs[seqs.length - 1]!)))
    .orderBy(asc(ledgerCheckpoints.id));
  return rows.filter((c) => seqs.some((s) => s >= c.fromSeq && s <= c.toSeq));
}

/** Audit paths for `seqs` under checkpoint `cp` (its leaves are the entry hashes fromSeq..toSeq). */
async function pathsUnder(db: Db, cp: Checkpoint): Promise<(seq: number) => string[]> {
  const leaves = await db
    .select({ entryHash: ledgerEntries.entryHash })
    .from(ledgerEntries)
    .where(and(gte(ledgerEntries.seq, cp.fromSeq), lte(ledgerEntries.seq, cp.toSeq)))
    .orderBy(asc(ledgerEntries.seq));
  const tree = await merkleTree(leaves.map((l) => hexToBytes(l.entryHash)));
  if (bytesToHex(tree.root) !== cp.merkleRoot) throw new Error(`feed: ledger entries no longer match checkpoint ${cp.id}`);
  return (seq) => tree.path(seq - cp.fromSeq).map(bytesToHex);
}

function toFeedEntry(e: EntryRow, cp: Checkpoint, path: string[]): FeedEntry {
  return {
    seq: e.seq,
    prevHash: e.prevHash,
    kind: e.kind,
    payload: JSON.parse(e.payload) as Record<string, unknown>,
    payloadHash: e.payloadHash,
    ts: e.ts,
    entryHash: e.entryHash,
    checkpointId: cp.id,
    leafIndex: e.seq - cp.fromSeq,
    path,
  };
}

export class FeedNotFound extends Error {
  constructor() {
    super('not_found');
  }
}

/**
 * The proof feed of `batchId`: its provenance closure, every entry with its Merkle path under a signed
 * checkpoint. If any closure entry is after the last checkpoint, one is created first in a write
 * transaction (S7, EVAL-065); checkpointIfNeeded is idempotent. Throws FeedNotFound for an unknown batch.
 */
export async function buildFeed(db: Db, batchId: string): Promise<ProofFeedV1> {
  const seqs = await closureSeqs(db, batchId);
  if (seqs.length === 0) throw new FeedNotFound();
  if (seqs[seqs.length - 1]! > (await lastCheckpointedSeq(db))) await writeTx(db, (tx) => checkpointIfNeeded(tx));

  const rows = await db.select().from(ledgerEntries).where(inArray(ledgerEntries.seq, seqs)).orderBy(asc(ledgerEntries.seq));
  const checkpoints = await coveringCheckpoints(db, seqs);
  const entries: FeedEntry[] = [];
  let batchHash = '';
  for (const cp of checkpoints) {
    const pathOf = await pathsUnder(db, cp);
    for (const e of rows) {
      if (e.seq < cp.fromSeq || e.seq > cp.toSeq) continue;
      entries.push(toFeedEntry(e, cp, pathOf(e.seq)));
      if (e.kind === 'batch_created' && !batchHash) batchHash = e.entryHash;
    }
  }
  if (entries.length !== seqs.length) throw new Error('feed: a closure entry is not covered by a checkpoint');

  return {
    format: PROOF_FEED_FORMAT,
    batchId,
    shortHash: batchHash.slice(0, 12),
    ledgerKey: { kid: (await loadLedgerKey()).kid, url: LEDGER_KEY_URL },
    checkpoints: checkpoints.map(toFeedCheckpoint),
    entries,
  };
}

/** One entry's proof: the entry, the checkpoint that seals it, and its path. Throws if not yet sealed. */
export async function getProof(db: Db, seq: number): Promise<Proof> {
  const [entry] = await db.select().from(ledgerEntries).where(inArray(ledgerEntries.seq, [seq]));
  if (!entry) throw new RangeError(`proof: no ledger entry ${seq}`);
  const [cp] = await coveringCheckpoints(db, [seq]);
  if (!cp) throw new RangeError(`proof: entry ${seq} is not under a checkpoint yet`);
  const pathOf = await pathsUnder(db, cp);
  return { entry: toFeedEntry(entry, cp, pathOf(seq)), checkpoint: toFeedCheckpoint(cp) };
}

const SHORT_HASH_LENGTH = 12;
const DUMMY = Buffer.from('0'.repeat(SHORT_HASH_LENGTH));

/** Constant-time equality of two strings; unequal lengths still spend one comparison. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b.length === DUMMY.length ? DUMMY : b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * The feed for a certificate link, or null — the same null for an unknown batch, a missing `h` and an
 * `h` that is not the batch's short hash (TP8, GAP-6). `h` is compared in constant time.
 */
export async function resolveFeed(db: Db, batchId: string, h: string | null): Promise<ProofFeedV1 | null> {
  const batch = await batchCreatedEntry(db, batchId);
  const expected = batch ? batch.entryHash.slice(0, SHORT_HASH_LENGTH) : DUMMY.toString('utf8');
  const matches = sameSecret(h ?? '', expected);
  if (!batch || !h || !matches) return null;
  return buildFeed(db, batchId);
}
