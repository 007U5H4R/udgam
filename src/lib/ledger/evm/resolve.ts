import { and, eq, isNull } from 'drizzle-orm';
import { writeTx, type Db } from '../../db/client';
import { evmAnchors } from '../../db/schema';
import { log } from '../../log';

// The operator path out of a `failed` anchor (TASK-25 fix round 1; docs/proof-feed.md §13.4). SERVER-ONLY.
//
// `failed` means the registry already holds a DIFFERENT hash at that seq: the contract has no overwrite
// path, so this registry can never hold the ledger's hash there. Anchoring halts at a failed seq so the
// mismatch cannot pass unnoticed. After investigating (`pnpm ledger:audit`), the operator records ONE
// resolution on the row with `pnpm ledger:evm:resolve --seq=N --reason="…"`: the row stays `failed`
// (the proof keeps saying so and the audit keeps naming the seq), the reason and time are written once
// and are then immutable (migration 0025), and anchoring resumes with the next seq. Nothing is deleted
// or rewritten, on chain or in the ledger.

export const MIN_REASON_LENGTH = 10;

export class ResolveRefused extends Error {}

export type Resolution = { seq: number; resolution: string; resolvedAt: string };

export async function resolveFailedAnchor(db: Db, seq: number, reason: string, now: Date = new Date()): Promise<Resolution> {
  const text = reason.trim();
  if (!Number.isSafeInteger(seq) || seq < 1) throw new ResolveRefused('seq must be a positive integer');
  if (text.length < MIN_REASON_LENGTH) throw new ResolveRefused(`the reason must be at least ${MIN_REASON_LENGTH} characters`);
  const resolvedAt = now.toISOString();
  return writeTx(db, async (tx) => {
    const [row] = await tx.select().from(evmAnchors).where(eq(evmAnchors.seq, seq));
    if (!row) throw new ResolveRefused(`seq ${seq} has no evm anchor row`);
    if (row.status !== 'failed') throw new ResolveRefused(`seq ${seq} is ${row.status}, not failed: only a failed anchor can be resolved`);
    if (row.resolution !== null) throw new ResolveRefused(`seq ${seq} was already resolved at ${row.resolvedAt}`);
    await tx
      .update(evmAnchors)
      .set({ resolution: text, resolvedAt })
      .where(and(eq(evmAnchors.seq, seq), eq(evmAnchors.status, 'failed'), isNull(evmAnchors.resolution)));
    log.warn({ seq, resolvedAt }, 'evm.anchor_failure_resolved');
    return { seq, resolution: text, resolvedAt };
  });
}
