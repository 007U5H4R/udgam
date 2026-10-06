'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { log } from '../../../../lib/log';
import { errFields } from '../../../_log/err-fields';
import { requireSession } from '../../../_auth/require';
import { demoEnabled, isAttackId, submitStaged, type SubmitResult } from './attacks';

// The demo attack page's Server Actions (technical-plan TSK-20.3, TP27). Admin only, and only while the
// demo surface is on (DEMO_MODE=1, never a production deployment): otherwise refused as not found and
// nothing is sent. The submission itself is the capture pipeline's (attacks.ts → /api/capture).

/** Submit staged attack `id`; resolves with the capture's verdict or a refusal. */
export async function submitAttack(id: unknown): Promise<SubmitResult> {
  const admin = await requireSession('admin', { action: true });
  if (!demoEnabled(env)) return { ok: false, reason: 'not_staged', status: 404 };
  if (!isAttackId(id)) return { ok: false, reason: 'not_staged', status: 404 };
  try {
    const r = await submitStaged(await getDbReady(), env.DATA_DIR, id, admin.orgId);
    if (!r.ok) log.warn({ reason: r.reason, status: r.status }, 'demo.attack_refused');
    return r;
  } catch (err) {
    log.error(errFields(err), 'demo.attack_failed');
    return { ok: false, reason: 'failed', status: 500 };
  }
}

/** The card's form: submit, then show the page again with the verdict on that card. */
export async function submitAttackForm(form: FormData): Promise<void> {
  await requireSession('admin', { action: true });
  const id = form.get('attack');
  const r = await submitAttack(id);
  if (!r.ok && r.status === 404) redirect('/admin/demo');
  revalidatePath('/admin/demo');
  redirect(`/admin/demo?sent=${encodeURIComponent(String(id))}${r.ok ? '' : `&error=${r.reason}`}#attack-${encodeURIComponent(String(id))}`);
}
