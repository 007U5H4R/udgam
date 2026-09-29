import { and, desc, eq } from 'drizzle-orm';
import { buildContextAsOf } from '../capture/context';
import { writeTx, type Db, type Tx } from '../db/client';
import { adminOverrides, batchEvents, farmers, harvestEvents, plots, verificationRuns } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import { CONFIG } from '../verification/config';
import { score } from '../verification/score';
import type { CheckId, CheckResult, Verdict } from '../verification/types';
import { verify } from '../verification/verify';
import { ReviewError, refusalFromDb } from './errors';

// "Check again" (technical-plan TSK-12.4, §7 re-run, TC-057, EVAL-069). Re-runs every check of the run
// that could not run — by check, not by provider: TKT-07 marks a cloud-blocked harvest window and an
// NDVI history with too few clear months `unavailable` without naming a provider, since the provider
// did answer (EXE18) — and copies the other results byte for byte. The capture is verified again as of
// its original capture (buildContextAsOf: its own photos are not "seen before", its own kilograms are
// not in the season total), re-scored with the same score() and cfg-1, and stored as a new anchored run
// (run_no + 1) in one transaction with its ledger entry. Run 1 stays.

export type RerunInput = { orgId: string; runId: string; provider?: RemoteSensingProvider; now?: () => Date };
export type RerunResult = { runId: string; runNo: number; verdict: Verdict; score: number };

type RunRow = { id: string; eventId: string; runNo: number; verdict: Verdict; checks: string };

/** The run in the organisation, or null. */
export async function findRun(db: Db | Tx, orgId: string, runId: string): Promise<(RunRow & { finalVerdict: Verdict | null }) | null> {
  const [row] = await db
    .select({
      id: verificationRuns.id,
      eventId: verificationRuns.eventId,
      runNo: verificationRuns.runNo,
      verdict: verificationRuns.verdict,
      checks: verificationRuns.checks,
      finalVerdict: harvestEvents.finalVerdict,
    })
    .from(verificationRuns)
    .innerJoin(harvestEvents, eq(harvestEvents.id, verificationRuns.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(verificationRuns.id, runId), eq(farmers.orgId, orgId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .limit(1);
  return row ?? null;
}

/**
 * Whether the run may still be decided or re-run: not batched (EXE16), not decided by an admin, the
 * event's latest run, and Needs Review. Throws the refusal otherwise. Read again inside the write
 * transaction, so two admins pressing at once cannot both act.
 */
export async function assertReviewable(db: Db | Tx, run: RunRow & { finalVerdict: Verdict | null }): Promise<void> {
  const [[batched], [decided], [latest]] = await Promise.all([
    db.select({ id: batchEvents.eventId }).from(batchEvents).where(eq(batchEvents.eventId, run.eventId)).limit(1),
    db
      .select({ id: adminOverrides.id })
      .from(adminOverrides)
      .innerJoin(verificationRuns, eq(verificationRuns.id, adminOverrides.runId))
      .where(eq(verificationRuns.eventId, run.eventId))
      .limit(1),
    db.select({ id: verificationRuns.id }).from(verificationRuns).where(eq(verificationRuns.eventId, run.eventId)).orderBy(desc(verificationRuns.runNo)).limit(1),
  ]);
  if (batched) throw new ReviewError('batched');
  if (decided) throw new ReviewError('already_decided');
  if (latest?.id !== run.id || run.verdict !== 'Needs Review' || run.finalVerdict !== 'Needs Review') throw new ReviewError('not_reviewable');
}

export async function rerunUnavailable(db: Db, input: RerunInput): Promise<RerunResult> {
  const { orgId, runId } = input;
  const now = input.now ?? (() => new Date());
  const run = await findRun(db, orgId, runId);
  if (!run) throw new ReviewError('not_found');
  await assertReviewable(db, run);

  const previous = JSON.parse(run.checks) as CheckResult[];
  const retry: CheckId[] = previous.filter((c) => c.status === 'unavailable').map((c) => c.id);
  if (retry.length === 0) throw new ReviewError('nothing_to_rerun');

  const rebuilt = await buildContextAsOf(db, run.eventId, input.provider ? { remoteSensing: input.provider } : {});
  if (!rebuilt) throw new ReviewError('not_found');
  const fresh = await verify(rebuilt.sub, rebuilt.ctx, { enabled: retry });
  const byId = new Map(fresh.checks.map((c) => [c.id, c]));
  // Registry order kept; the checks that ran before are the stored objects, unchanged.
  const checks = previous.map((c) => byId.get(c.id) ?? c);
  const s = score(checks, CONFIG);
  const unavailableProviders = [...new Set(checks.filter((c) => c.status === 'unavailable' && c.provider).map((c) => c.provider!))];
  const newRunId = newId('VR-', 12);
  const runNo = run.runNo + 1;

  try {
    await writeTx(db, async (tx) => {
      const current = await findRun(tx, orgId, runId);
      if (!current) throw new ReviewError('not_found');
      await assertReviewable(tx, current);
      const createdAt = now().toISOString();
      const anchor = await append(tx, 'verification_run', {
        runId: newRunId,
        eventId: run.eventId,
        runNo,
        rerunOf: run.id,
        verdict: s.verdict,
        score: s.score,
        checks: checks.map(({ id, status, hardFail, evidence, provider }) => ({ id, status, hardFail, evidence, ...(provider ? { provider } : {}) })),
        capReasons: s.capReasons,
        unavailableProviders,
        config: fresh.config,
        createdAt,
      });
      await tx.insert(verificationRuns).values({
        id: newRunId,
        eventId: run.eventId,
        runNo,
        verdict: s.verdict,
        score: s.score,
        checks: JSON.stringify(checks),
        unavailableProviders: JSON.stringify(unavailableProviders),
        configVersion: fresh.config.version,
        configHash: fresh.config.hash,
        createdAt,
        anchorSeq: anchor.seq,
      });
    });
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    const code = refusalFromDb(err);
    if (code) throw new ReviewError(code);
    throw err;
  }
  return { runId: newRunId, runNo, verdict: s.verdict, score: s.score };
}
