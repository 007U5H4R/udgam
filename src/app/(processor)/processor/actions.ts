'use server';

import { revalidatePath } from 'next/cache';
import { getDbReady } from '../../../lib/db/client';
import { log } from '../../../lib/log';
import { handOnBatch, ProcessingError, recordProcessingStep, type ProcessingErrorCode } from '../../../lib/processing/actions';
import { checkStepFields, FIELD_MESSAGES, type StepFieldErrors } from '../../../lib/processing/validate';
import { requireSession } from '../../_auth/require';

// Server Actions of the processor surface (TKT-26, TSK-26.4/26.5, Design.md §28). Each guards itself
// first (technical-plan §10): the processor org and the person come from the session, never from the
// form (EVAL-080). The fields are checked again here with the browser's rules and words (§28.7). A
// refusal or an unexpected failure is an answer the screen shows as its action error: nothing was signed.

export type ActionRefusal = ProcessingErrorCode | 'failed';

export type RecordStepResult =
  | { ok: true; status: 'ok' | 'flag'; ratio: number; evidence: string; recordedAt: string }
  | { ok: false; reason: 'fields'; errors: StepFieldErrors }
  | { ok: false; reason: ActionRefusal };

export type HandOnResult = { ok: true; transferredAt: string } | { ok: false; reason: 'fields'; errors: { buyer: string } } | { ok: false; reason: ActionRefusal };

const str = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 64) : '');

function refusal(err: unknown, what: string): { ok: false; reason: ActionRefusal } {
  if (err instanceof ProcessingError) return { ok: false, reason: err.code };
  log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, `processor.${what}_failed`);
  return { ok: false, reason: 'failed' };
}

export async function recordStepAction(input: { batchId: unknown; process: unknown; inputKg: unknown; outputKg: unknown }): Promise<RecordStepResult> {
  const me = await requireSession('processor', { action: true });
  const batchId = str(input?.batchId);
  const checked = checkStepFields({ process: str(input?.process), inputKg: str(input?.inputKg), outputKg: str(input?.outputKg) });
  if (!checked.ok) return { ok: false, reason: 'fields', errors: checked.errors };
  try {
    const step = await recordProcessingStep(await getDbReady(), { orgId: me.orgId, userId: me.userId, batchId, ...checked.value });
    revalidatePath('/processor', 'layout');
    return { ok: true, status: step.status, ratio: step.ratio, evidence: step.evidence, recordedAt: step.recordedAt };
  } catch (err) {
    return refusal(err, 'record');
  }
}

export async function handOnAction(input: { batchId: unknown; toOrgId: unknown }): Promise<HandOnResult> {
  const me = await requireSession('processor', { action: true });
  const batchId = str(input?.batchId);
  const toOrgId = str(input?.toOrgId);
  if (!toOrgId) return { ok: false, reason: 'fields', errors: { buyer: FIELD_MESSAGES.buyer } };
  try {
    const out = await handOnBatch(await getDbReady(), { orgId: me.orgId, userId: me.userId, batchId, toOrgId });
    revalidatePath('/processor', 'layout');
    return { ok: true, transferredAt: out.transferredAt };
  } catch (err) {
    if (err instanceof ProcessingError && err.code === 'not_buyer') return { ok: false, reason: 'fields', errors: { buyer: FIELD_MESSAGES.buyer } };
    return refusal(err, 'hand_on');
  }
}
