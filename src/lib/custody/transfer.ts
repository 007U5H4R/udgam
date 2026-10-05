import { and, eq } from 'drizzle-orm';
import { getUserPublicKey, signAsUser } from '../auth/signing-keys';
import { jcs } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { batches, custodyTransfers, organisations } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';

// Custody transfer (technical-plan TSK-14.4, §10 TP15, F10). The statement is signed by the server on
// behalf of the signed-in admin with their server-held key, anchored as custody_transfer, recorded in
// custody_transfers, and then the batch's single open→transferred change locks it (the database
// refuses that change without the custody row, and every change after it).

export type CustodyErrorCode = 'not_found' | 'not_open' | 'not_buyer';

/** A refusal the admin can act on (nothing was written). */
export class CustodyError extends Error {
  constructor(readonly code: CustodyErrorCode) {
    super(code);
    this.name = 'CustodyError';
  }
}

export type TransferInput = { orgId: string; adminId: string; batchId: string; toOrgId: string };

/**
 * Transfer the org's open batch to a buyer or a processor organisation, in one write transaction. Throws
 * CustodyError('not_found') for an unknown or another org's batch (indistinguishable, EVAL-080),
 * 'not_open' when it was already transferred, 'not_buyer' when `toOrgId` is neither a buyer nor a processor
 * organisation (the code keeps its M-001 name).
 */
export async function transferBatch(db: Db, input: TransferInput, now: () => Date = () => new Date()): Promise<{ transferId: string; anchorSeq: number }> {
  const { orgId, adminId, batchId, toOrgId } = input;
  // Load (or create) the admin's key before taking the write lock.
  await getUserPublicKey(adminId);

  return writeTx(db, async (tx) => {
    const [batch] = await tx
      .select({ status: batches.status })
      .from(batches)
      .where(and(eq(batches.id, batchId), eq(batches.orgId, orgId)));
    if (!batch) throw new CustodyError('not_found');
    if (batch.status !== 'open') throw new CustodyError('not_open');
    const [to] = await tx.select({ type: organisations.type }).from(organisations).where(eq(organisations.id, toOrgId));
    // A buyer, or (M-002, TKT-26 T4) a processor that records a step and hands the batch on to a buyer.
    if (to?.type !== 'buyer' && to?.type !== 'processor') throw new CustodyError('not_buyer');

    const ts = now().toISOString();
    const statement = { v: 1, batchId, fromOrg: orgId, toOrg: toOrgId, ts, adminId };
    const { kid, publicJwk, signature } = await signAsUser(adminId, jcs(statement));
    const anchor = await append(tx, 'custody_transfer', { ...statement, kid, publicJwk, signature });

    const transferId = newId('CT-');
    await tx.insert(custodyTransfers).values({
      id: transferId,
      batchId,
      fromOrg: orgId,
      toOrg: toOrgId,
      adminId,
      transferredAt: ts,
      signature,
      keyId: kid,
      anchorSeq: anchor.seq,
    });
    await tx.update(batches).set({ status: 'transferred' }).where(eq(batches.id, batchId));
    return { transferId, anchorSeq: anchor.seq };
  });
}
