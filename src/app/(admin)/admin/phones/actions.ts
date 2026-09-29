'use server';

import { revalidatePath } from 'next/cache';
import { getDbReady } from '../../../../lib/db/client';
import { assignPlot, unassignPlot } from '../../../../lib/enrolment/assign';
import { issueCode } from '../../../../lib/enrolment/codes';
import { revokeDevice } from '../../../../lib/enrolment/enrol';
import { NotFoundError } from '../../../../lib/enrolment/errors';
import { formatIst } from '../../../../lib/enrolment/phones';
import { requireSession } from '../../../_auth/require';

// Server Actions of /admin/phones (TSK-05.7). Each guards itself first (a layout never protects an
// action, §10) and takes the org from the session: another org's agent, phone or plot reads as unknown
// and changes nothing (EVAL-080).

export type ActionState = { status: 'idle' } | { status: 'done' } | { status: 'error' };
/** An issued code is returned once, to this admin's page, and stored nowhere (only its hash). */
export type IssueState = { status: 'idle' } | { status: 'issued'; agentId: string; code: string; expires: string } | { status: 'error'; agentId: string };

const field = (form: FormData, name: string) => String(form.get(name) ?? '');
const PATH = '/admin/phones';

export async function issueCodeAction(_prev: IssueState, form: FormData): Promise<IssueState> {
  const admin = await requireSession('admin', { action: true });
  const agentId = field(form, 'agentId');
  const db = await getDbReady();
  try {
    const { code, expiresAt } = await issueCode(db, { agentId, adminId: admin.userId, orgId: admin.orgId });
    return { status: 'issued', agentId, code, expires: formatIst(expiresAt) };
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'error', agentId };
    throw err;
  }
}

export async function revokeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireSession('admin', { action: true });
  const db = await getDbReady();
  try {
    await revokeDevice(db, { deviceId: field(form, 'deviceId'), adminOrgId: admin.orgId });
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'error' };
    throw err;
  }
  revalidatePath(PATH);
  return { status: 'done' };
}

export async function assignAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireSession('admin', { action: true });
  const db = await getDbReady();
  try {
    await assignPlot(db, { agentId: field(form, 'agentId'), plotId: field(form, 'plotId'), orgId: admin.orgId });
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'error' };
    throw err;
  }
  revalidatePath(PATH);
  return { status: 'done' };
}

export async function unassignAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireSession('admin', { action: true });
  const db = await getDbReady();
  try {
    await unassignPlot(db, { agentId: field(form, 'agentId'), plotId: field(form, 'plotId'), orgId: admin.orgId });
  } catch (err) {
    if (err instanceof NotFoundError) return { status: 'error' };
    throw err;
  }
  revalidatePath(PATH);
  return { status: 'done' };
}
