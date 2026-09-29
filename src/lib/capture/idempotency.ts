import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { harvestEvents, verificationRuns } from '../db/schema';
import type { CheckResult, Verdict } from '../verification/types';

// Idempotent retry by payload hash (technical-plan §3.1 step 3, TP7, EV15; TKT-09).
//
// Only an ACCEPTED payload short-circuits: its identical signed bytes get the original event and verdict
// back, and nothing is written. harvest_events.payload_hash is unique among accepted events only
// (migration 0012/0013), so a stored boundary refusal — an unverified signature, an unknown key, an
// un-assigned plot, mismatched bytes — never blocks a later genuine capture of the same payload: a
// refused payload is simply evaluated again, and the same refusal is anchored only once (unique with its
// reason). The pipeline looks the hash up after the signature and device-ownership checks and before
// revocation, plot assignment and media (so a retry after a later revocation or un-assignment still gets
// its original verdict), again at the start of the write transaction (the duplicate-resend race), and
// on a unique violation there (defence in depth: the loser re-reads the winner).

export type PriorOutcome =
  | { kind: 'accepted'; eventId: string; verdict: Verdict; score: number; checks: CheckResult[] }
  | { kind: 'rejected'; eventId: string; reason: string };

/**
 * What the server already recorded for this payload hash: the accepted event with its latest
 * verification run, else the most recent boundary refusal, else null.
 */
export async function findPriorOutcome(handle: Db | Tx, payloadHash: string): Promise<PriorOutcome | null> {
  const [accepted] = await handle
    .select({ id: harvestEvents.id })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.payloadHash, payloadHash), eq(harvestEvents.boundaryStatus, 'accepted')));
  if (accepted) {
    const [run] = await handle
      .select({ verdict: verificationRuns.verdict, score: verificationRuns.score, checks: verificationRuns.checks })
      .from(verificationRuns)
      .where(eq(verificationRuns.eventId, accepted.id))
      .orderBy(desc(verificationRuns.runNo))
      .limit(1);
    // An accepted event always commits with its first run (one transaction, N7).
    if (!run) throw new Error(`accepted event ${accepted.id} has no verification run`);
    return { kind: 'accepted', eventId: accepted.id, verdict: run.verdict, score: run.score, checks: JSON.parse(run.checks) as CheckResult[] };
  }
  const [rejected] = await handle
    .select({ id: harvestEvents.id, reason: harvestEvents.boundaryReason })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.payloadHash, payloadHash), eq(harvestEvents.boundaryStatus, 'rejected')))
    .orderBy(desc(harvestEvents.anchorSeq))
    .limit(1);
  return rejected ? { kind: 'rejected', eventId: rejected.id, reason: rejected.reason ?? 'rejected' } : null;
}

/** The accepted outcome for this hash, if there is one (the only kind that short-circuits). */
export async function findAcceptedOutcome(handle: Db | Tx, payloadHash: string): Promise<Extract<PriorOutcome, { kind: 'accepted' }> | null> {
  const prior = await findPriorOutcome(handle, payloadHash);
  return prior?.kind === 'accepted' ? prior : null;
}

/**
 * A duplicate-key refusal from SQLite: the UNIQUE index itself, or the no-replace trigger that fires
 * first (its message starts "UNIQUE:"). Walks the error's cause chain (drizzle wraps driver errors).
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (/UNIQUE constraint failed|UNIQUE: /.test(e.message)) return true;
  }
  return false;
}

/**
 * The write transaction lost a race on the payload hash (a unique violation): the winner's accepted
 * outcome, which the loser answers with. Any other error, or a violation with no accepted winner on
 * record, is rethrown unchanged.
 */
export async function winnerAfterUniqueViolation(db: Db, payloadHash: string, err: unknown): Promise<Extract<PriorOutcome, { kind: 'accepted' }>> {
  if (!isUniqueViolation(err)) throw err;
  const winner = await findAcceptedOutcome(db, payloadHash);
  if (!winner) throw err;
  return winner;
}
