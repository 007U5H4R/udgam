import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminOverrides, batchEvents, farmers, harvestEvents, media, plots, user, verificationRuns } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import type { ExifFacts } from '../media/exif';
import { CONFIG } from '../verification/config';
import { score } from '../verification/score';
import type { CheckId, CheckResult, Verdict } from '../verification/types';

// One run's review detail (technical-plan TSK-12.3). Org-scoped like the queue: another organisation's
// run reads exactly like an unknown one (null → 404, EVAL-080). The checks are the stored ones with their
// SYSTEM evidence sentences (§6.5), unchanged — including the " (demo data)" label (EXE12). The run
// table keeps no cap reasons, so they are scored again from the stored checks (score() is pure; cfg-1).

/**
 * Why the decision controls are absent: a hard fail can't be overruled (CF-06); an admin already
 * decided; the event is in a batch, whose entry froze its verdict (EXE16); a newer run replaced this
 * one; or the run is not Needs Review (the checks already accepted or rejected it).
 */
export type Locked = null | 'hard_fail' | 'decided' | 'batched' | 'superseded' | 'not_reviewable';

export type ReviewDetail = {
  run: { id: string; runNo: number; verdict: Verdict; score: number; createdAt: string; configVersion: string };
  event: { id: string; receivedAt: string; capturedAt: string | null; cherryKg: number; deviceId: string | null; seq: number | null };
  plot: { id: string; name: string; producerId: string; geojson: PlotPolygon; areaHa: number; crop: 'arabica' | 'robusta' };
  point: { lat: number; lng: number; accuracyM: number } | null;
  /** The event's photos in capture (upload) order; shown through the thumbnail route, never the original. */
  photos: { mediaId: string; takenAt: string | null }[];
  checks: CheckResult[];
  score: number;
  capReasons: string[];
  unavailableProviders: string[];
  /** Every check that could not run, whatever the reason (EXE18: a cloud answer names no provider). */
  unavailableChecks: CheckId[];
  locked: Locked;
  latestRunId: string;
  decision: { verdict: 'Verified' | 'Rejected'; reason: string; adminName: string; at: string } | null;
  batchId: string | null;
  history: { runId: string; runNo: number; verdict: Verdict; score: number; at: string }[];
};

const parseExif = (text: string | null): ExifFacts | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as ExifFacts;
  } catch {
    return null;
  }
};

/** The review detail of `runId` in `orgId`, or null when there is no such run in the organisation. */
export async function getReviewDetail(db: Db, orgId: string, runId: string): Promise<ReviewDetail | null> {
  const [row] = await db
    .select({ run: verificationRuns, event: harvestEvents, plot: plots, producerId: farmers.producerId })
    .from(verificationRuns)
    .innerJoin(harvestEvents, eq(harvestEvents.id, verificationRuns.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(verificationRuns.id, runId), eq(farmers.orgId, orgId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .limit(1);
  if (!row) return null;
  const { run, event, plot } = row;

  const [history, photoRows, [override], [batched]] = await Promise.all([
    db
      .select({ runId: verificationRuns.id, runNo: verificationRuns.runNo, verdict: verificationRuns.verdict, score: verificationRuns.score, at: verificationRuns.createdAt })
      .from(verificationRuns)
      .where(eq(verificationRuns.eventId, event.id))
      .orderBy(asc(verificationRuns.runNo)),
    // rowid is the insertion order: persistAccepted writes the photos in upload order
    db.select({ id: media.id, exif: media.exif }).from(media).where(eq(media.eventId, event.id)).orderBy(asc(sql`${media}.rowid`)),
    db
      .select({ verdict: adminOverrides.newVerdict, reason: adminOverrides.reason, at: adminOverrides.createdAt, adminName: user.name })
      .from(adminOverrides)
      .innerJoin(user, eq(user.id, adminOverrides.adminId))
      .where(eq(adminOverrides.runId, run.id))
      .limit(1),
    db.select({ batchId: batchEvents.batchId }).from(batchEvents).where(eq(batchEvents.eventId, event.id)).limit(1),
  ]);

  const checks = JSON.parse(run.checks) as CheckResult[];
  const { capReasons } = score(checks, CONFIG);
  const latest = history.at(-1)!;
  const locked: Locked = checks.some((c) => c.hardFail)
    ? 'hard_fail'
    : override
      ? 'decided'
      : batched
        ? 'batched'
        : latest.runId !== run.id
          ? 'superseded'
          : run.verdict !== 'Needs Review' || event.finalVerdict !== 'Needs Review'
            ? 'not_reviewable'
            : null;

  return {
    run: { id: run.id, runNo: run.runNo, verdict: run.verdict, score: run.score, createdAt: run.createdAt, configVersion: run.configVersion },
    event: { id: event.id, receivedAt: event.serverReceivedAt, capturedAt: event.clientCapturedAt, cherryKg: event.cherryKg ?? 0, deviceId: event.deviceId, seq: event.seq },
    plot: { id: plot.id, name: plot.id, producerId: row.producerId, geojson: JSON.parse(plot.geojson) as PlotPolygon, areaHa: plot.areaHa, crop: plot.crop },
    point: event.lat !== null && event.lng !== null ? { lat: event.lat, lng: event.lng, accuracyM: event.accuracyM ?? 0 } : null,
    photos: photoRows.map((p) => ({ mediaId: p.id, takenAt: parseExif(p.exif)?.takenAt ?? null })),
    checks,
    score: run.score,
    capReasons,
    unavailableProviders: JSON.parse(run.unavailableProviders) as string[],
    unavailableChecks: checks.filter((c) => c.status === 'unavailable').map((c) => c.id),
    locked,
    latestRunId: latest.runId,
    decision: override ? { verdict: override.verdict, reason: override.reason, adminName: override.adminName, at: override.at } : null,
    batchId: batched?.batchId ?? null,
    history,
  };
}
