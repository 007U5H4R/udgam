'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { BatchError, createBatch, type BatchErrorCode } from '../../../../lib/batches/create';
import { isCrop } from '../../../../lib/batches/eligible';
import { CustodyError, transferBatch, type CustodyErrorCode } from '../../../../lib/custody/transfer';
import { getDbReady } from '../../../../lib/db/client';
import { requireSession } from '../../../_auth/require';

// Server Actions of the admin batch screens (TSK-14.5). Each one guards itself first (technical-plan
// §10): the org and the admin come from the session, never from the form. The database enforces the
// batch invariants; these map the library's refusals to messages.

export type CreateBatchState = { error: BatchErrorCode | null };
export type TransferState = { error: Exclude<CustodyErrorCode, 'not_found'> | null };

/** Upper bound on pickings in one request (the builder lists the org's eligible pickings). */
const MAX_EVENTS = 1000;

const text = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v : '');

export async function createBatchAction(_prev: CreateBatchState, form: FormData): Promise<CreateBatchState> {
  const me = await requireSession('admin', { action: true });
  const crop = text(form.get('crop'));
  const eventIds = form.getAll('eventId').map(text).filter((id) => id.length > 0 && id.length <= 64);
  if (eventIds.length === 0) return { error: 'empty' };
  if (eventIds.length > MAX_EVENTS) return { error: 'not_eligible' };
  if (!isCrop(crop)) return { error: 'mixed_crop' };

  let batchId: string;
  try {
    ({ batchId } = await createBatch(await getDbReady(), { orgId: me.orgId, adminId: me.userId, crop, eventIds }));
  } catch (err) {
    if (!(err instanceof BatchError)) throw err;
    revalidatePath('/admin/batches/new'); // the list may be stale: show what is eligible now
    return { error: err.code };
  }
  redirect(`/admin/batches/${encodeURIComponent(batchId)}`);
}

export async function transferBatchAction(_prev: TransferState, form: FormData): Promise<TransferState> {
  const me = await requireSession('admin', { action: true });
  const batchId = text(form.get('batchId'));
  const toOrgId = text(form.get('toOrgId'));
  if (!toOrgId) return { error: 'not_buyer' };

  try {
    await transferBatch(await getDbReady(), { orgId: me.orgId, adminId: me.userId, batchId, toOrgId });
  } catch (err) {
    if (!(err instanceof CustodyError)) throw err;
    if (err.code === 'not_found') notFound(); // another org's batch reads exactly like an unknown one
    revalidatePath(`/admin/batches/${encodeURIComponent(batchId)}`);
    return { error: err.code };
  }
  redirect(`/admin/batches/${encodeURIComponent(batchId)}`);
}
