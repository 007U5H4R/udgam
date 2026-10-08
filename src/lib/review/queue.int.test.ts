import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedFpo, type FpoWorld } from '../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { addOverride, addRun, checksWith, seedReviewCapture } from '../../../tests/helpers/review-world';
import { countWaiting, listReviewQueue } from './queue';

// TSK-12.1 (TC-054 query half): the review queue of one organisation. `waiting` = each event's latest
// run when it is Needs Review, not overridden, and the event's final verdict is Needs Review, oldest
// first; `final` = the latest 20 hard-failed Rejected runs ("Not accepted by the checks").

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

const at = (min: number) => new Date(Date.UTC(2026, 8, 24, 2, 0) + min * 60_000).toISOString();
const cloudy = checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: 'Satellite view blocked by cloud for ±30 days (demo data)' } });
const outside = checksWith({ geofence: { status: 'fail', evidence: '38 m outside the plot edge (allowance 25 m)' } });
const reused = checksWith({ photo_uniqueness: { status: 'fail', hardFail: true, evidence: '1 of 3 photos seen before' } });

describe('listReviewQueue (TSK-12.1)', () => {
  it('lists only this organisation’s Needs Review pickings, oldest first, with headline, score and icon', async () => {
    const second = await seedReviewCapture(t.db, a, { checks: outside, receivedAt: at(60) });
    const first = await seedReviewCapture(t.db, a, { checks: cloudy, receivedAt: at(0), kg: 38.5 });
    await seedReviewCapture(t.db, b, { checks: cloudy, receivedAt: at(-60) }); // FPO B: never in A's queue
    await seedReviewCapture(t.db, a, { checks: checksWith(), receivedAt: at(-30) }); // Verified: not waiting

    const q = await listReviewQueue(t.db, a.orgId);
    expect(q.waiting.map((i) => i.runId)).toEqual([first.runId, second.runId]);
    expect(q.waiting[0]).toMatchObject({
      eventId: first.eventId,
      plotId: a.plots.arabica.plotId,
      plotName: a.plots.arabica.plotId,
      producerId: a.plots.arabica.producerId,
      receivedAt: at(0),
      cherryKg: 38.5,
      score: 100,
      verdict: 'Needs Review',
      headline: 'Satellite picture cloudy',
      icon: 'cloud',
    });
    expect(q.waiting[1]).toMatchObject({ headline: 'Taken outside the plot', icon: 'location' });
    expect(q.final).toEqual([]);

    const qb = await listReviewQueue(t.db, b.orgId);
    expect(qb.waiting).toHaveLength(1);
    expect(qb.waiting[0]!.producerId).toBe(b.plots.arabica.producerId);
  });

  it('an event whose run 1 was Needs Review and run 2 is Verified is not waiting', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    expect((await listReviewQueue(t.db, a.orgId)).waiting.map((i) => i.eventId)).toEqual([c.eventId]);
    await addRun(t.db, c.eventId, 2, checksWith());
    expect((await listReviewQueue(t.db, a.orgId)).waiting).toEqual([]);
  });

  it('an event whose latest run is Needs Review again after a re-run is waiting with the latest run', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    const run2 = await addRun(t.db, c.eventId, 2, cloudy);
    expect((await listReviewQueue(t.db, a.orgId)).waiting.map((i) => i.runId)).toEqual([run2]);
  });

  it('an overridden run is not waiting', async () => {
    const c = await seedReviewCapture(t.db, a, { checks: cloudy });
    await addOverride(t.db, c.runId, a.adminId);
    expect((await listReviewQueue(t.db, a.orgId)).waiting).toEqual([]);
  });

  it('a hard-failed Rejected run appears in final only, newest first; another org’s never', async () => {
    const older = await seedReviewCapture(t.db, a, { checks: reused, receivedAt: at(0) });
    const newer = await seedReviewCapture(t.db, a, { checks: reused, receivedAt: at(10) });
    await seedReviewCapture(t.db, a, { checks: checksWith({ gps_accuracy: { status: 'fail' }, geofence: { status: 'fail' }, exif_gps_agreement: { status: 'fail' }, exif_time_agreement: { status: 'fail' }, movement_plausibility: { status: 'fail' }, ndvi_cultivation: { status: 'fail' }, ndvi_harvest_window: { status: 'fail' } }) }); // Rejected by score (no hard fail): neither list
    await seedReviewCapture(t.db, b, { checks: reused });

    const q = await listReviewQueue(t.db, a.orgId);
    expect(q.waiting).toEqual([]);
    expect(q.final.map((i) => i.runId)).toEqual([newer.runId, older.runId]);
    expect(q.final[0]).toMatchObject({ verdict: 'Rejected', headline: 'Photo already used', icon: 'camera' });
  });

  it('countWaiting counts what waits: latest run Needs Review, not overridden, this organisation only', async () => {
    expect(await countWaiting(t.db, a.orgId)).toBe(0);
    await seedReviewCapture(t.db, a, { checks: cloudy, receivedAt: at(0) }); // waits
    const reran = await seedReviewCapture(t.db, a, { checks: cloudy, receivedAt: at(1) });
    await addRun(t.db, reran.eventId, 2, cloudy); // waits once, with run 2
    const cleared = await seedReviewCapture(t.db, a, { checks: cloudy, receivedAt: at(2) });
    await addRun(t.db, cleared.eventId, 2, checksWith()); // Verified on run 2: not waiting
    const decided = await seedReviewCapture(t.db, a, { checks: cloudy, receivedAt: at(3) });
    await addOverride(t.db, decided.runId, a.adminId); // decided: not waiting
    await seedReviewCapture(t.db, a, { checks: reused, receivedAt: at(4) }); // final, not waiting
    await seedReviewCapture(t.db, b, { checks: cloudy, receivedAt: at(5) }); // FPO B
    expect(await countWaiting(t.db, a.orgId)).toBe(2);
    expect(await countWaiting(t.db, b.orgId)).toBe(1);
  });

  it('keeps at most 20 final items', async () => {
    for (let i = 0; i < 22; i++) await seedReviewCapture(t.db, a, { checks: reused, receivedAt: at(i) });
    const q = await listReviewQueue(t.db, a.orgId);
    expect(q.final).toHaveLength(20);
    expect(q.final[0]!.receivedAt).toBe(at(21));
  });
});
