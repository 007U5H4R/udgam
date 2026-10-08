// Seeds review-queue pickings for e2e/admin-review.spec.ts (TKT-12) into DATA_DIR's database. Every run
// makes its OWN FPO ("E2E FPO …") with an admin who can sign in (a random per-run TEST password), so
// parallel workers never share a queue. Four pickings, oldest first: a cloud-blocked harvest window
// (Needs Review, three real photos stored under DATA_DIR/media), a boundary fail, a high-harvest flag, and
// a hard-failed reused photo ("Not accepted by the checks"). Plus, older still, a Verified picking put in
// a batch (its detail is locked with the batch's explanation, EXE16); it is in neither list. Prints one
// JSON line: IDs and the test-only password, never key material.
//
// Usage: NODE_ENV=test DATA_DIR=.e2e-data pnpm exec tsx e2e/helpers/seed-review.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '../../src/lib/crypto';
import { closeDb, getDbReady } from '../../src/lib/db/client';
import { prepareDatabase } from '../../src/lib/db/migrate';
import { newId } from '../../src/lib/ids';
import { createBatch } from '../../src/lib/batches/create';
import { localMediaStore } from '../../src/lib/media/store';
import { env } from '../../src/lib/config/env';
import { seedFpo } from '../../tests/helpers/batch-fixtures';
import { checksWith, seedReviewCapture } from '../../tests/helpers/review-world';

export type SeededReview = {
  orgName: string;
  adminEmail: string;
  /** TEST-ONLY random password for this run's admin. Never used outside .e2e-data. */
  testOnlyAdminPassword: string;
  cloudy: string;
  outside: string;
  harvest: string;
  final: string;
  /** A Verified picking's run whose event is in batch `batchId`. */
  batched: string;
  batchId: string;
};

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const db = await getDbReady();
try {
  await prepareDatabase(db);
  const store = localMediaStore(env.DATA_DIR);
  const photos = [];
  for (const name of ['branch-01.jpg', 'scale-01.jpg', 'pile-01.jpg']) {
    const bytes = new Uint8Array(readFileSync(`assets/demo-photos/${name}`));
    const sha256 = await sha256Hex(bytes);
    const { path } = await store.put(bytes, sha256, 'image/jpeg');
    store.release(path);
    photos.push({ sha256, path, exif: { gps: null, takenAt: ago(4), hadOffset: false } });
  }

  const password = randomBytes(18).toString('base64url');
  const w = await seedFpo(db, { orgName: `E2E FPO ${newId('')}`, adminPassword: password });
  const inBatch = await seedReviewCapture(db, w, { checks: checksWith(), kg: 40, receivedAt: ago(5) });
  const batch = await createBatch(db, { orgId: w.orgId, adminId: w.adminId, crop: 'arabica', eventIds: [inBatch.eventId] });
  const cloudy = await seedReviewCapture(db, w, {
    checks: checksWith({ ndvi_harvest_window: { status: 'unavailable', evidence: 'Satellite view blocked by cloud for ±30 days (demo data)' } }),
    kg: 38.5,
    receivedAt: ago(4),
    media: photos,
  });
  const outside = await seedReviewCapture(db, w, {
    checks: checksWith({ geofence: { status: 'fail', evidence: '38 m outside the plot edge (allowance 25 m)' } }),
    kg: 41,
    receivedAt: ago(3),
  });
  const harvest = await seedReviewCapture(db, w, {
    checks: checksWith({ yield_plausibility: { status: 'flag', evidence: 'Season total 1.60x the reference upper bound (flag above 1.50x, hard fail above 2.00x)' } }),
    kg: 58.5,
    receivedAt: ago(2),
  });
  const final = await seedReviewCapture(db, w, {
    checks: checksWith({ photo_uniqueness: { status: 'fail', hardFail: true, evidence: '1 of 1 photos seen before' } }),
    kg: 45,
    receivedAt: ago(1),
  });
  const out: SeededReview = {
    orgName: w.orgName,
    adminEmail: w.adminEmail,
    testOnlyAdminPassword: password,
    cloudy: cloudy.runId,
    outside: outside.runId,
    harvest: harvest.runId,
    final: final.runId,
    batched: inBatch.runId,
    batchId: batch.batchId,
  };
  console.log(JSON.stringify(out));
} finally {
  closeDb();
}
