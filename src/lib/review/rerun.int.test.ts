import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { addOverride, addRun, checksWith, seedReviewCapture } from '../../../tests/helpers/review-world';
import { seedYieldReference } from '../db/seed/yield-reference';
import { harvestEvents, ledgerEntries, verificationRuns } from '../db/schema';
import { verifyChain } from '../ledger/hashchain';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CheckResult } from '../verification/types';
import { ReviewError } from './errors';
import { listReviewQueue } from './queue';
import { rerunUnavailable } from './rerun';

// TSK-12.4 · TC-057 · EVAL-069: "Check again" re-runs only the checks that could not run (by check, not
// by provider: EXE18), copies the rest byte for byte, re-scores, and anchors a new run (run_no 2) in the
// same transaction; run 1 stays. The context is rebuilt as of the original capture.

vi.stubEnv('LOG_LEVEL', 'silent');

let t: TempDb;
let a: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  a = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

/** A live-looking provider whose every call is a spy; the harvest window now has a clear view. */
function spyProvider() {
  const p = {
    name: 'live' as const,
    forestLoss: vi.fn(async () => ({ lossHa: 0, lossPct: 0, yearsFrom: 2021, dataYear: 2025, source: 'live' as const })),
    ndviHistory: vi.fn(async (_plot: unknown, endMonth: string) => ({
      months: Array.from({ length: 12 }, (_, i) => ({ month: `${endMonth}-${i}`, mean: 0.72, clearFraction: 1 })),
      source: 'live' as const,
    })),
    ndviWindow: vi.fn(async () => ({ mean: 0.61, clearObservations: 3, source: 'live' as const })),
  };
  return p satisfies RemoteSensingProvider;
}

const CLOUD = 'Satellite view blocked by cloud for ±30 days (demo data)';
const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: CLOUD } });
const storedChecks = async (runId: string) => {
  const [r] = await t.db.select({ checks: verificationRuns.checks }).from(verificationRuns).where(eq(verificationRuns.id, runId));
  return JSON.parse(r!.checks) as CheckResult[];
};

describe('rerunUnavailable (TC-057, EVAL-069)', () => {
  it('asks only Sentinel Hub for the harvest window, copies the other 11 checks, anchors run 2, and the picking leaves the queue', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const provider = spyProvider();

    const r = await rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider });
    expect(provider.ndviWindow).toHaveBeenCalledTimes(1);
    expect(provider.forestLoss).not.toHaveBeenCalled();
    expect(provider.ndviHistory).not.toHaveBeenCalled();
    expect(r).toMatchObject({ runNo: 2, verdict: 'Verified', score: 100 });

    const [run1, run2] = [await storedChecks(c.runId), await storedChecks(r.runId)];
    for (const [i, before] of run1.entries()) {
      if (before.id === 'ndvi_harvest_window') continue;
      expect(JSON.stringify(run2[i]), before.id).toBe(JSON.stringify(before)); // byte-identical copies
    }
    expect(run2.find((x) => x.id === 'ndvi_harvest_window')).toMatchObject({ status: 'ok', evidence: 'Living canopy around the picking date: NDVI 0.61 (needs ≥ 0.45)' });

    const runs = await t.db.select().from(verificationRuns).where(eq(verificationRuns.eventId, c.eventId));
    expect(runs.map((x) => [x.runNo, x.verdict]).sort()).toEqual([
      [1, 'Needs Review'],
      [2, 'Verified'],
    ]);
    const run2Row = runs.find((x) => x.runNo === 2)!;
    const [entry] = await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.seq, run2Row.anchorSeq));
    expect(entry!.kind).toBe('verification_run');
    expect(JSON.parse(entry!.payload)).toMatchObject({ runId: r.runId, eventId: c.eventId, runNo: 2, rerunOf: c.runId, verdict: 'Verified', score: 100 });
    expect(await verifyChain(t.db)).toEqual({ ok: true });

    const [event] = await t.db.select({ v: harvestEvents.finalVerdict }).from(harvestEvents).where(eq(harvestEvents.id, c.eventId));
    expect(event!.v).toBe('Verified');
    expect((await listReviewQueue(t.db, a.orgId)).waiting).toEqual([]);
  });

  it('retries every check that could not run, by check: a provider-less cloud answer too (EXE18)', async () => {
    const c = await seedReviewCapture(t.db, a, {
      checks: checksWith({
        deforestation_overlap: { status: 'unavailable', provider: 'gfw', evidence: 'Forest-loss data unavailable: timeout; an admin re-run will retry' },
        ndvi_cultivation: { status: 'unavailable', evidence: 'Only 4 clear months of the 12 (needs 6)' }, // no provider named
      }),
    });
    const provider = spyProvider();
    const r = await rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider });
    expect(provider.forestLoss).toHaveBeenCalledTimes(1);
    expect(provider.ndviHistory).toHaveBeenCalledTimes(1);
    expect(provider.ndviWindow).not.toHaveBeenCalled();
    expect(r.verdict).toBe('Verified');
  });

  it('a provider still down keeps the picking at Needs Review with the new run waiting', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const provider = { ...spyProvider(), ndviWindow: vi.fn(async () => ({ mean: null, clearObservations: 0, source: 'live' as const })) };
    const r = await rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider });
    expect(r).toMatchObject({ runNo: 2, verdict: 'Needs Review' });
    expect((await listReviewQueue(t.db, a.orgId)).waiting.map((i) => i.runId)).toEqual([r.runId]);
  });

  it('rebuilds the context as of the capture: its own photo is not "seen before", its own and later kg are not in the season total', async () => {
    await seedYieldReference(t.db); // the app seeds it at boot (prepareDatabase)
    const shared = 'e'.repeat(64);
    await seedReviewCapture(t.db, a, { checks: checksWith(), kg: 2000, receivedAt: '2026-10-05T04:00:00.000Z' }); // earlier: counts
    const c = await seedReviewCapture(t.db, a, {
      checks: checksWith({
        photo_uniqueness: { status: 'unavailable', evidence: 'Check could not run: TypeError' },
        yield_plausibility: { status: 'unavailable', evidence: 'Check could not run: TypeError' },
      }),
      kg: 8000,
      receivedAt: '2026-10-06T04:00:00.000Z',
      media: [{ sha256: shared }],
    });
    // later: the same photo again and more kg — neither was there when c was captured
    await seedReviewCapture(t.db, a, { checks: checksWith(), kg: 3000, receivedAt: '2026-10-07T04:00:00.000Z', media: [{ sha256: shared }] });

    const provider = spyProvider();
    const r = await rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider });
    const checks = await storedChecks(r.runId);
    expect(checks.find((x) => x.id === 'photo_uniqueness')).toMatchObject({ status: 'ok', hardFail: false, evidence: '1 of 1 photos are new' });
    // (2000 + 8000) kg × 1/6 ÷ 2 ha ÷ 783 kg/ha = 1.06× (own kg twice: 1.92×; with the later 3000 kg: 1.38×)
    expect(checks.find((x) => x.id === 'yield_plausibility')).toMatchObject({ status: 'ok', evidence: expect.stringContaining('Season total 1.06x') });
    expect(provider.ndviWindow).not.toHaveBeenCalled(); // local checks only
  });

  it('refuses a run with nothing unavailable (409 nothing_to_rerun), writing nothing', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: checksWith({ chain_continuity: { status: 'flag' }, gps_accuracy: { status: 'flag' }, exif_gps_agreement: { status: 'flag' }, geofence: { status: 'flag' }, exif_time_agreement: { status: 'flag' } }) });
    const err = await rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider: spyProvider() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReviewError);
    expect(err).toMatchObject({ code: 'nothing_to_rerun', status: 409 });
    expect(await t.db.$count(verificationRuns)).toBe(1);
  });

  it('refuses another organisation’s run (404), a decided run and a superseded run (409)', async () => {
    const b = await seedFpo(t.db);
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    await expect(rerunUnavailable(t.db, { orgId: b.orgId, runId: c.runId, provider: spyProvider() })).rejects.toMatchObject({ code: 'not_found', status: 404 });

    const run2 = await addRun(t.db, c.eventId, 2, cloudy);
    await expect(rerunUnavailable(t.db, { orgId: a.orgId, runId: c.runId, provider: spyProvider() })).rejects.toMatchObject({ code: 'not_reviewable', status: 409 });

    await addOverride(t.db, run2, a.adminId);
    await expect(rerunUnavailable(t.db, { orgId: a.orgId, runId: run2, provider: spyProvider() })).rejects.toMatchObject({ code: 'already_decided', status: 409 });
  });
});
