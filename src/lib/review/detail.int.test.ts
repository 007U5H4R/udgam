import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { addOverride, addRun, checksWith, seedReviewCapture } from '../../../tests/helpers/review-world';
import { createBatch } from '../batches/create';
import { P01_AREA_HA, P01_INSIDE, P01_POLYGON } from '../../../scripts/tracer-plot';
import { getReviewDetail } from './detail';

// TSK-12.3 (TC-054 detail half): one run's review detail, scoped to the admin's organisation. The admin
// reads the SYSTEM evidence sentences unchanged, including the " (demo data)" label on fixture-derived
// lines (EXE12); cap reasons are scored again from the stored checks (score() is pure, cfg-1 fixed).

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-review-detail-'));
vi.stubEnv('DATA_DIR', dataDir); // createBatch signs with the admin's server-held key
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let a: FpoWorld;
let b: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  a = await seedFpo(t.db);
  b = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const CLOUD = 'Satellite view blocked by cloud for ±30 days (demo data)';
const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: CLOUD } });

describe('getReviewDetail (TSK-12.3)', () => {
  it('returns the run, event, plot, point, photos in order, all twelve checks and the cap reasons', async () => {
    const photos = ['a', 'b', 'c'].map((c) => ({ sha256: c.repeat(64), exif: { gps: null, takenAt: '2026-09-24T02:09:00.000Z', hadOffset: false } }));
    const c = await seedReviewCapture(t.db, a, { checks: cloudy, kg: 38.5, media: photos, receivedAt: '2026-09-24T02:12:00.000Z' });
    const d = await getReviewDetail(t.db, a.orgId, c.runId);
    expect(d).not.toBeNull();
    expect(d!.run).toMatchObject({ id: c.runId, runNo: 1, verdict: 'Needs Review', score: 100 });
    expect(d!.event).toMatchObject({ id: c.eventId, cherryKg: 38.5, receivedAt: '2026-09-24T02:12:00.000Z', deviceId: a.device.id });
    expect(d!.plot).toEqual({ id: a.plots.arabica.plotId, name: a.plots.arabica.plotId, producerId: a.plots.arabica.producerId, geojson: P01_POLYGON, areaHa: P01_AREA_HA, crop: 'arabica' });
    expect(d!.point).toEqual({ lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 });
    expect(d!.photos.map((p) => p.takenAt)).toEqual(['2026-09-24T02:09:00.000Z', '2026-09-24T02:09:00.000Z', '2026-09-24T02:09:00.000Z']);
    expect(d!.photos).toHaveLength(3);
    expect(new Set(d!.photos.map((p) => p.mediaId)).size).toBe(3);
    expect(d!.checks).toHaveLength(12);
    expect(d!.checks.find((x) => x.id === 'ndvi_harvest_window')!.evidence).toBe(CLOUD); // system words, demo label kept
    expect(d!.capReasons).toEqual(['anyUnavailable']);
    expect(d!.unavailableChecks).toEqual(['ndvi_harvest_window']);
    expect(d!.unavailableProviders).toEqual([]); // a cloud answer names no provider (EXE18)
    expect(d!.locked).toBeNull();
    expect(d!.decision).toBeNull();
    expect(d!.history).toEqual([{ runId: c.runId, runNo: 1, verdict: 'Needs Review', score: 100, at: c.serverReceivedAt }]);
  });

  it('DES-102: marks each photo used before, with the earlier picking’s time when it is this organisation’s', async () => {
    const seenHere = 'd'.repeat(64);
    const seenElsewhere = 'e'.repeat(64);
    const fresh = 'f'.repeat(64);
    await seedReviewCapture(t.db, a, { checks: cloudy, media: [{ sha256: seenHere }], receivedAt: '2026-09-12T03:00:00.000Z' });
    await seedReviewCapture(t.db, b, { checks: cloudy, media: [{ sha256: seenElsewhere }], receivedAt: '2026-09-13T03:00:00.000Z' });
    const replay = checksWith({ photo_uniqueness: { status: 'fail', hardFail: true, evidence: '2 of 3 photos seen before' } });
    const c = await seedReviewCapture(t.db, a, { checks: replay, media: [{ sha256: fresh }, { sha256: seenHere }, { sha256: seenElsewhere }], receivedAt: '2026-09-24T02:12:00.000Z' });
    const d = await getReviewDetail(t.db, a.orgId, c.runId);
    expect(d!.photos.map((p) => p.usedBefore)).toEqual([null, { at: '2026-09-12T03:00:00.000Z' }, { at: null }]); // another org's time is not shown
  });

  it('DES-102: no photo is marked when the photo check passed', async () => {
    const same = 'a'.repeat(64);
    await seedReviewCapture(t.db, a, { checks: cloudy, media: [{ sha256: same }], receivedAt: '2026-09-12T03:00:00.000Z' });
    const c = await seedReviewCapture(t.db, a, { checks: cloudy, media: [{ sha256: same }], receivedAt: '2026-09-24T02:12:00.000Z' });
    const d = await getReviewDetail(t.db, a.orgId, c.runId);
    expect(d!.photos.map((p) => p.usedBefore)).toEqual([null]);
  });

  it('another organisation’s run, and an unknown run, are null (the page answers 404)', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    expect(await getReviewDetail(t.db, b.orgId, c.runId)).toBeNull();
    expect(await getReviewDetail(t.db, a.orgId, 'VR-NOPE')).toBeNull();
  });

  it('a hard-failed run is locked (no override anywhere)', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: checksWith({ photo_uniqueness: { status: 'fail', hardFail: true, evidence: '1 of 3 photos seen before' } }) });
    const d = await getReviewDetail(t.db, a.orgId, c.runId);
    expect(d!.run.verdict).toBe('Rejected');
    expect(d!.locked).toBe('hard_fail');
  });

  it('a decided run is locked and carries the decision; an earlier run is superseded', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const run2 = await addRun(t.db, c.eventId, 2, cloudy);
    const old = await getReviewDetail(t.db, a.orgId, c.runId);
    expect(old!.locked).toBe('superseded');
    expect(old!.latestRunId).toBe(run2);
    expect(old!.history.map((h) => h.runNo)).toEqual([1, 2]);

    await addOverride(t.db, run2, a.adminId, 'Verified');
    const d = await getReviewDetail(t.db, a.orgId, run2);
    expect(d!.locked).toBe('decided');
    expect(d!.decision).toMatchObject({ verdict: 'Verified', reason: 'Checked by the office in person', adminName: 'Test admin' });
  });

  it('a batched event is locked with its batch (EXE16: its verdict is frozen)', async () => {
    const v = await seedCapture(t.db, a, { kg: 40 });
    const batch = await createBatch(t.db, { orgId: a.orgId, adminId: a.adminId, crop: 'arabica', eventIds: [v.eventId] });
    const d = await getReviewDetail(t.db, a.orgId, v.runId);
    expect(d!.locked).toBe('batched');
    expect(d!.batchId).toBe(batch.batchId);
  });

  it('a Verified run needs no decision (not reviewable)', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: checksWith() });
    expect((await getReviewDetail(t.db, a.orgId, c.runId))!.locked).toBe('not_reviewable');
  });
});
