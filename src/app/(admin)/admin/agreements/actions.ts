'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { settleFromForm, type ActionState } from '../../../../lib/agreements/actions';
import { getDbReady } from '../../../../lib/db/client';
import { requireSession } from '../../../_auth/require';

// The FPO admin's settle Server Action (TSK-25.7). Guarded first (technical-plan §10); the FPO and the
// admin come from the session; another FPO's agreement is a 404 like an unknown one (EVAL-080). The
// conditions are read from anchored data by src/lib/agreements/settle.ts, never from the form.

export async function settleAgreementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireSession('admin', { action: true });
  const out = await settleFromForm(await getDbReady(), { orgId: me.orgId, userId: me.userId }, form);
  if (out.ok) {
    revalidatePath('/admin/agreements', 'layout');
    redirect(`/admin/agreements/${encodeURIComponent(out.agreementId)}`);
  }
  if (out.notFound) notFound();
  return out.state;
}
