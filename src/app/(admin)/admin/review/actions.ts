'use server';

import { revalidatePath } from 'next/cache';
import { env } from '../../../../lib/config/env';
import { getDbReady } from '../../../../lib/db/client';
import { log } from '../../../../lib/log';
import { appRemoteSensing } from '../../../../lib/remote-sensing';
import { REVIEW_STATUS, ReviewError, type ReviewErrorCode } from '../../../../lib/review/errors';
import { rerunUnavailable } from '../../../../lib/review/rerun';
import type { Verdict } from '../../../../lib/verification/types';
import { requireSession } from '../../../_auth/require';

// Server Actions of the admin review (TSK-12.4; the override arrives with TSK-12.5). Each guards itself first (a layout never
// protects an action, technical-plan §10) and takes the organisation and the admin from the session,
// never from input: another organisation's run reads as unknown (404) and changes nothing (EVAL-080).
// A refusal comes back as { ok:false, reason, status } — a 409 for a run whose state forbids the change
// (TC-056: a hard-failed run, EVAL-076) — never as a raw database error (EXE16).

export type Refusal = { ok: false; reason: ReviewErrorCode | 'failed'; status: number };
export type RerunActionResult = { ok: true; runId: string; runNo: number; verdict: Verdict; score: number } | Refusal;

const MAX_ID = 64;
const refusal = (code: ReviewErrorCode): Refusal => ({ ok: false, reason: code, status: REVIEW_STATUS[code] });
const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

function refused(err: unknown, event: string): Refusal {
  if (err instanceof ReviewError) return refusal(err.code);
  log.error({ errClass: errClass(err) }, event);
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
