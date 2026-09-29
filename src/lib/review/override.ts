import { getUserPublicKey, signAsUser } from '../auth/signing-keys';
import { jcs } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { adminOverrides } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import type { CheckResult } from '../verification/types';
import { ReviewError, refusalFromDb } from './errors';
import { checkReason } from './reason';
import { assertReviewable, findRun } from './rerun';

// An admin's decision on a Needs Review run (technical-plan TSK-12.5, §10 TP15, TC-055, TC-056,
// EVAL-075/076). The statement jcs({ v:1, runId, eventId, newVerdict, reason, adminId, ts }) is signed by
// the server on behalf of the signed-in admin with their server-held key, anchored as admin_override
// with { …statement, kid, publicJwk, signature } (docs/proof-feed.md §9.2: the clean-room checker
// verifies it from the feed alone), and recorded in admin_overrides — one transaction. The database
// sets the event's final verdict and is the last line against overriding a hard fail (CF-06), a batched
// event (EXE16) or a run twice. The reason is public: it appears on the certificate (Review focus 5).

export type OverrideInput = { orgId: string; adminId: string; runId: string; newVerdict: 'Verified' | 'Rejected'; reason: string };
export type OverrideResult = { overrideId: string; anchorSeq: number; reason: string; at: string };

export const OVERRIDE_VERDICTS = ['Verified', 'Rejected'] as const;

export async function overrideRun(db: Db, input: OverrideInput, now: () => Date = () => new Date()): Promise<OverrideResult> {
  const { orgId, adminId, runId, newVerdict } = input;
  const checked = checkReason(input.reason);
  if (!checked.ok) throw new ReviewError(checked.code);
  if (!OVERRIDE_VERDICTS.includes(newVerdict)) throw new ReviewError('not_reviewable');
  const { reason } = checked;

  const run = await findRun(db, orgId, runId);
  if (!run) throw new ReviewError('not_found');
  if ((JSON.parse(run.checks) as CheckResult[]).some((c) => c.hardFail)) throw new ReviewError('hard_fail_final');
  await assertReviewable(db, run);
  await getUserPublicKey(adminId); // load (or create) the admin's key before taking the write lock

  try {
    return await writeTx(db, async (tx) => {
      const current = await findRun(tx, orgId, runId);
      if (!current) throw new ReviewError('not_found');
      await assertReviewable(tx, current);
      const ts = now().toISOString();
      const statement = { v: 1, runId, eventId: run.eventId, newVerdict, reason, adminId, ts };
      const { kid, publicJwk, signature } = await signAsUser(adminId, jcs(statement));
      const anchor = await append(tx, 'admin_override', { ...statement, kid, publicJwk, signature });
      const overrideId = newId('AO-', 12);
      await tx.insert(adminOverrides).values({ id: overrideId, runId, adminId, newVerdict, reason, signature, keyId: kid, createdAt: ts, anchorSeq: anchor.seq });
      return { overrideId, anchorSeq: anchor.seq, reason, at: ts };
    });
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    const code = refusalFromDb(err);
    if (code) throw new ReviewError(code);
    throw err;
  }
}
