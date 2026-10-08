import { eq } from 'drizzle-orm';
import { getUserPublicKey, signAsUser } from '../auth/signing-keys';
import { jcs } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { batchEvents, batches } from '../db/schema';
import { newId } from '../ids';
import { shortHashOf } from '../ledger/feed';
import { append } from '../ledger/hashchain';
import { eligibleRows, type Crop } from './eligible';

// Create a batch (technical-plan TSK-14.3, S8, TP14, TP15). Membership is fixed here: the signed
// batch_created entry lists the member events with their capture hashes, and there is no add-later
// path. The app computes quantity and minimum score and anchors them; the database recomputes both
// by trigger, and the two must agree inside the same transaction or everything rolls back.

export type BatchErrorCode = 'empty' | 'not_eligible' | 'mixed_crop';

/** A refusal the admin can act on (nothing was written). */
export class BatchError extends Error {
  constructor(readonly code: BatchErrorCode) {
    super(code);
    this.name = 'BatchError';
  }
}

export type CreateBatchInput = { orgId: string; adminId: string; crop: Crop; eventIds: string[] };

/** Event ids are `HE-` + 12 base32; anything much longer is not one of ours. */
export const MAX_EVENT_ID_LENGTH = 64;

/** Kilograms in whole half-kg units, or null when not a multiple of 0.5 kg (the capture rule). */
const halfKg = (kg: number): number | null => (Number.isSafeInteger(kg * 2) ? kg * 2 : null);

/**
 * A database refusal of a member insert (UNIQUE event_id or a membership trigger). Inside one process
 * writeTx serialises creation; this is another process having batched a picking after our read.
 */
const isMembershipRefusal = (err: unknown): boolean =>
  /UNIQUE constraint failed: batch_events\.event_id|batch member|batch is locked|batch not found/.test(
    err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : '',
  );
export type CreatedBatch = { batchId: string; shortHash: string; anchorSeq: number; quantityKg: number; integrityScore: number };

/**
 * Create a batch of `eventIds` (Verified, of `crop`, on the org's plots, in no batch) in one write
 * transaction: select and compute → sign on behalf of the admin → anchor batch_created → insert the
 * batch and its members → compare the trigger-maintained aggregates with the anchored ones.
 * Throws BatchError('empty' | 'not_eligible' | 'mixed_crop') with nothing persisted.
 */
export async function createBatch(db: Db, input: CreateBatchInput, now: () => Date = () => new Date()): Promise<CreatedBatch> {
  const { orgId, adminId, crop } = input;
  const eventIds = [...new Set(input.eventIds)];
  if (eventIds.length === 0) throw new BatchError('empty');
  if (eventIds.some((id) => id.length > MAX_EVENT_ID_LENGTH)) throw new BatchError('not_eligible');
  // Load (or create) the admin's key before taking the write lock.
  await getUserPublicKey(adminId);

  return writeTx(db, async (tx) => {
    const rows = await eligibleRows(tx, orgId, { eventIds });
    if (rows.length !== eventIds.length) throw new BatchError('not_eligible');
    if (rows.some((r) => r.crop !== crop)) throw new BatchError('mixed_crop');

    const members = rows.sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
    // Sum in whole half-kg units, so the anchored total is exact and compares exactly with SQLite's
    // SUM (which uses compensated summation and can differ from a naive float sum). Captures are
    // multiples of 0.5 kg (capture/payload.ts); anything else cannot go in a batch.
    const halves = members.map((m) => halfKg(m.cherryKg));
    if (halves.some((h) => h === null)) throw new BatchError('not_eligible');
    const totalHalves = halves.reduce<number>((sum, h) => sum + h!, 0);
    const quantityKg = totalHalves / 2;
    const integrityScore = Math.min(...members.map((m) => m.score));
    const batchId = newId('B-');
    const ts = now().toISOString();
    const statement = {
      v: 1,
      batchId,
      orgId,
      crop,
      events: members.map((m) => ({ eventId: m.eventId, payloadHash: m.payloadHash })),
      quantityKg,
      integrityScore,
      adminId,
      ts,
    };
    const { kid, publicJwk, signature } = await signAsUser(adminId, jcs(statement));
    const anchor = await append(tx, 'batch_created', { ...statement, kid, publicJwk, signature });
    const shortHash = shortHashOf(anchor.entryHash);

    await tx.insert(batches).values({ id: batchId, orgId, crop, shortHash, anchorSeq: anchor.seq, createdAt: ts });
    try {
      await tx.insert(batchEvents).values(members.map((m) => ({ batchId, eventId: m.eventId })));
    } catch (err) {
      if (isMembershipRefusal(err)) throw new BatchError('not_eligible'); // rolls everything back
      throw err;
    }

    const [row] = await tx.select({ quantityKg: batches.quantityKg, integrityScore: batches.integrityScore }).from(batches).where(eq(batches.id, batchId));
    if (!row || Math.round(row.quantityKg * 2) !== totalHalves || row.integrityScore !== integrityScore) {
      throw new Error('createBatch: the database aggregates differ from the anchored statement');
    }
    return { batchId, shortHash, anchorSeq: anchor.seq, quantityKg, integrityScore };
  });
}
