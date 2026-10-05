'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { createFromForm, fundFromForm, gradeFromForm, refundFromForm, type ActionOutcome, type ActionState } from '../../../../lib/agreements/actions';
import { getDbReady } from '../../../../lib/db/client';
import { requireSession } from '../../../_auth/require';

// The buyer's agreement Server Actions (TSK-25.7). Each guards itself first (technical-plan §10): the
// buyer organisation and user come from the session, never from the form; another organisation's
// agreement is a 404 like an unknown one (EVAL-080). The logic lives in src/lib/agreements/actions.ts.

function settle(out: ActionOutcome): ActionState {
  if (out.ok) {
    revalidatePath('/buyer/agreements', 'layout');
    redirect(`/buyer/agreements/${encodeURIComponent(out.agreementId)}`);
  }
  if (out.notFound) notFound();
  return out.state;
}

export async function createAgreementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSession('buyer', { action: true });
  return settle(await createFromForm(await getDbReady(), { orgId: me.orgId, userId: me.userId }, form));
}

export async function fundAgreementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSession('buyer', { action: true });
  return settle(await fundFromForm(await getDbReady(), { orgId: me.orgId, userId: me.userId }, form));
}

export async function refundAgreementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSession('buyer', { action: true });
  return settle(await refundFromForm(await getDbReady(), { orgId: me.orgId, userId: me.userId }, form));
}

export async function gradeBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSession('buyer', { action: true });
  return settle(await gradeFromForm(await getDbReady(), { orgId: me.orgId, userId: me.userId }, form));
}
