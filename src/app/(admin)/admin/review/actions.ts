'use server';

import { revalidatePath } from 'next/cache';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { log } from '../../../../lib/log';
import { errFields } from '../../../_log/err-fields';
import { appRemoteSensing } from '../../../../lib/remote-sensing';
import { REVIEW_STATUS, ReviewError, type ReviewErrorCode } from '../../../../lib/review/errors';
import { OVERRIDE_VERDICTS, overrideRun as overrideService } from '../../../../lib/review/override';
import { rerunUnavailable } from '../../../../lib/review/rerun';
import type { Verdict } from '../../../../lib/verification/types';
import { requireSession } from '../../../_auth/require';

// Server Actions of the admin review (TSK-12.4, TSK-12.5). Each guards itself first (a layout never
// protects an action, technical-plan §10) and takes the organisation and the admin from the session,
// never from input: another organisation's run reads as unknown (404) and changes nothing (EVAL-080).
// A refusal comes back as { ok:false, reason, status } — a 409 for a run whose state forbids the change
// (TC-056: a hard-failed run, EVAL-076) — never as a raw database error (EXE16).

export type Refusal = { ok: false; reason: ReviewErrorCode | 'failed'; status: number };
export type RerunActionResult = { ok: true; runId: string; runNo: number; verdict: Verdict; score: number } | Refusal;
export type OverrideActionResult = { ok: true; overrideId: string; reason: string; at: string } | Refusal;

const MAX_ID = 64;
const refusal = (code: ReviewErrorCode): Refusal => ({ ok: false, reason: code, status: REVIEW_STATUS[code] });

function refused(err: unknown, event: string): Refusal {
  if (err instanceof ReviewError) return refusal(err.code);
  log.error(errFields(err), event);
  return { ok: false, reason: 'failed', status: 500 };
}

function revalidate(runId: string): void {
  revalidatePath('/admin');
  revalidatePath(`/admin/review/${encodeURIComponent(runId)}`);
}

/** "Check again": re-run the checks of `runId` that could not run (TSK-12.4). */
export async function rerunRun(runId: unknown): Promise<RerunActionResult> {
  const admin = await requireSession('admin', { action: true });
  if (typeof runId !== 'string' || runId.length === 0 || runId.length > MAX_ID) return refusal('not_found');
  try {
    const db = await getDbReady();
    const r = await rerunUnavailable(db, { orgId: admin.orgId, runId, provider: appRemoteSensing(db, env) });
    revalidate(runId);
    return { ok: true, ...r };
  } catch (err) {
    return refused(err, 'review.rerun_failed');
  }
}

/** Accept as verified / mark as not accepted, with a public reason (TSK-12.5). */
export async function overrideRun(input: unknown): Promise<OverrideActionResult> {
  const admin = await requireSession('admin', { action: true });
  const { runId, newVerdict, reason } = (input ?? {}) as { runId?: unknown; newVerdict?: unknown; reason?: unknown };
  if (typeof runId !== 'string' || runId.length === 0 || runId.length > MAX_ID) return refusal('not_found');
  if (typeof newVerdict !== 'string' || !(OVERRIDE_VERDICTS as readonly string[]).includes(newVerdict)) return refusal('not_reviewable');
  if (typeof reason !== 'string') return refusal('reason_too_short');
  try {
    const r = await overrideService(await getDbReady(), {
      orgId: admin.orgId,
      adminId: admin.userId,
      runId,
      newVerdict: newVerdict as (typeof OVERRIDE_VERDICTS)[number],
      reason,
    });
    log.info({ runId, newVerdict, anchorSeq: r.anchorSeq }, 'review.override_recorded');
    revalidate(runId);
    return { ok: true, overrideId: r.overrideId, reason: r.reason, at: r.at };
  } catch (err) {
    return refused(err, 'review.override_failed');
  }
}
