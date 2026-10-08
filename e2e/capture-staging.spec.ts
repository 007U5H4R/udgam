import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { inArray } from 'drizzle-orm';
import { applyReferenceProfile } from '../evals/perf/network';
import { createDb, writeTx } from '../src/lib/db/client';
import { stagedMedia } from '../src/lib/db/schema';
import { openField, seedCaptureWorld, type SeededCapture, choosePhoto } from './helpers/capture';
import { E2E_DATA_DIR } from './helpers/tracer';

// TSK-30.4 / TSK-30.5 · TC-094 (d, e) · EVAL-070 instrumentation. With the EV9 network profile (5 Mbit/s
// up, 80 ms) the phone uploads each photo when "Use this photo" is tapped (POST /api/capture/stage), so
// the request after Send carries no photo bytes and upload time falls outside t0→t1. Staged photos that
// have expired before Send get exactly one 409 media_not_staged, then the same signed picking is sent
// with its bytes and the verdict arrives. Nothing on screen changes (Tesler, Design.md §14). Photos are
// the AI-generated demo photos (TP29), padded to the S3 reference size of 4 MB: never evidence.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 240_000 });

const FOUR_MB = 4 * 1024 * 1024;
const SLOTS = [
  { label: 'The branch', file: 'branch-01.jpg' },
  { label: 'Basket on the scale', file: 'scale-01.jpg' },
  { label: "The day's pile", file: 'pile-01.jpg' },
] as const;

/** A demo photo padded after its end-of-image marker to 4 MB with random bytes: a valid, unique JPEG. */
function fourMbPhoto(file: string): Buffer {
  const base = readFileSync(`assets/demo-photos/${file}`);
  return Buffer.concat([base, randomBytes(Math.max(16, FOUR_MB - base.length))]);
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Take and accept three 4 MB photos, then wait until all three are staged (201 each). */
async function acceptThree(page: Page, seed: SeededCapture): Promise<Buffer[]> {
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  const photos = SLOTS.map((s) => fourMbPhoto(s.file));
  let stagedCount = 0;
  page.on('response', (r) => {
    if (r.url().endsWith('/api/capture/stage') && r.status() === 201) stagedCount++;
  });
  for (const [i, s] of SLOTS.entries()) {
    await choosePhoto(page.getByLabel(s.label), { name: s.file, mimeType: 'image/jpeg', buffer: photos[i]! });
    await page.getByRole('button', { name: 'Use this photo' }).click();
    await expect(page.getByRole('button', { name: 'Use this photo' })).toHaveCount(0, { timeout: 30_000 });
  }
  await expect.poll(() => stagedCount, { timeout: 180_000 }).toBe(3);
  await expect
    .poll(() => page.evaluate(() => [0, 1, 2].every((i) => performance.getEntriesByName(`udgam:stage-end:${i}`).length === 1)), { timeout: 30_000 })
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'How many kilos?' })).toBeVisible(); // the third photo moves on by itself
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  return photos;
}

/**
 * A phone's watchPosition reports about once a second; Playwright's emulated position reports once. Set it
 * again just before Send so the held fix is fresh (TP13), as on a phone; otherwise Submit waits the full
 * 10 s for a fresh fix and that wait, not the upload, dominates t0→t1.
 */
async function freshFix(context: BrowserContext, seed: SeededCapture): Promise<void> {
  await context.setGeolocation({ latitude: seed.plots[0]!.inside.lat, longitude: seed.plots[0]!.inside.lng, accuracy: 8 });
}

/** How many of `photos` the server stored as media (committed rows): the bytes reached it, staged or sent. */
async function storedPhotos(photos: Buffer[]): Promise<number> {
  const db = createClient({ url: `file:${join(E2E_DATA_DIR, 'udgam.db')}` });
  try {
    const hashes = photos.map(sha256);
    const r = await db.execute({ sql: `SELECT COUNT(DISTINCT sha256) AS n FROM media WHERE sha256 IN (?, ?, ?)`, args: hashes });
    return Number(r.rows[0]?.n);
  } finally {
    db.close();
  }
}

/** Every POST /api/capture from here on, with its status. */
function captureRequests(page: Page): { req: Request; status: () => Promise<number> }[] {
  const seen: { req: Request; status: () => Promise<number> }[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/capture') {
      seen.push({ req, status: async () => (await req.response())?.status() ?? 0 });
    }
  });
  return seen;
}

test('TC-094 (d) EVAL-070: photos staged in the background; the request after Send carries no photo bytes; t0→t1 < 12 s; the marks are ordered', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'measured once, at 375 px on the phone project');
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await applyReferenceProfile(await context.newCDPSession(page));
  const photos = await acceptThree(page, seed);
  await freshFix(context, seed);
  const sent = captureRequests(page);

  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 60_000 });

  expect(sent).toHaveLength(1);
  // Playwright keeps a request body it can read in full; this one is the payload, its signature and three hashes.
  const body = sent[0]!.req.postDataBuffer() ?? Buffer.alloc(0);
  expect(body.length).toBeGreaterThan(0);
  expect(body.length).toBeLessThan(64 * 1024);
  expect(body.includes(Buffer.from('name="photo'))).toBe(false);
  expect(body.includes(Buffer.from('name="staged"'))).toBe(true);
  expect(await sent[0]!.status()).toBe(200);
  expect(await storedPhotos(photos)).toBe(3); // the staged copies are the stored media

  const timing = await page.evaluate(() => {
    const at = (n: string) => performance.getEntriesByName(n)[0]?.startTime ?? NaN;
    return {
      starts: [0, 1, 2].map((i) => at(`udgam:stage-start:${i}`)),
      ends: [0, 1, 2].map((i) => at(`udgam:stage-end:${i}`)),
      t0: at('udgam:t0-submit'),
      t1: at('udgam:t1-verdict'),
      verdictIn: at('udgam:verdict-in'),
    };
  });
  for (let i = 0; i < 3; i++) {
    expect(timing.starts[i]).toBeLessThanOrEqual(timing.ends[i]!);
    expect(timing.ends[i]).toBeLessThan(timing.t0); // upload is outside t0→t1
  }
  const s3 = timing.t1 - timing.t0;
  const upload = Math.max(...timing.ends) - Math.min(...timing.starts);
  console.log(
    `EVAL-070 split (staged): upload ${Math.round(upload)} ms before Send; t0→t1 ${Math.round(s3)} ms (t0→verdict-in ${Math.round(timing.verdictIn - timing.t0)} ms, then the 600 ms hold)`,
  );
  expect(s3).toBeLessThan(12_000);
});

test('TC-094 (e) staged photos expired before Send: exactly one 409, then the same picking with its bytes, and the verdict', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'run once, at 375 px on the phone project');
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  const photos = await acceptThree(page, seed);

  // Expire the three staged rows on the server, as an hour passing would. The write goes through the
  // app's writer (BEGIN IMMEDIATE, 5 s busy timeout), so a write the server or another worker's seed has
  // in flight is waited for instead of failing with SQLITE_BUSY.
  const h = createDb(`file:${join(E2E_DATA_DIR, 'udgam.db')}`);
  try {
    await h.ready;
    const r = await writeTx(h.db, (tx) => tx.update(stagedMedia).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where(inArray(stagedMedia.sha256, photos.map(sha256))));
    expect(r.rowsAffected).toBe(3);
  } finally {
    h.client.close();
  }

  await freshFix(context, seed);
  const sent = captureRequests(page);
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('main')).not.toContainText('Not accepted');
  expect(sent).toHaveLength(2);
  expect(await sent[0]!.status()).toBe(409);
  expect(await sent[1]!.status()).toBe(200);
  const first = sent[0]!.req.postDataBuffer()!;
  expect(first.includes(Buffer.from('name="photo'))).toBe(false);
  expect(first.includes(Buffer.from('name="staged"'))).toBe(true);
  expect(sent[1]!.req.postDataBuffer()?.includes(Buffer.from('name="staged"')) ?? false).toBe(false); // the resend carries every photo
  expect(await storedPhotos(photos)).toBe(3); // nothing lost
});

test('EVAL-070 before/after: with staging unavailable the photos go with Send as before, nothing lost; t0→t1 is logged for comparison', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'measured once, at 375 px on the phone project');
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await applyReferenceProfile(await context.newCDPSession(page));
  await page.route('**/api/capture/stage', (route) => route.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: 'application/json' }));
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  const photos = SLOTS.map((s) => fourMbPhoto(s.file));
  for (const [i, s] of SLOTS.entries()) {
    await choosePhoto(page.getByLabel(s.label), { name: s.file, mimeType: 'image/jpeg', buffer: photos[i]! });
    await page.getByRole('button', { name: 'Use this photo' }).click();
    await expect(page.getByRole('button', { name: 'Use this photo' })).toHaveCount(0, { timeout: 30_000 });
  }
  await expect
    .poll(() => page.evaluate(() => [0, 1, 2].every((i) => performance.getEntriesByName(`udgam:stage-end:${i}`).length === 1)), { timeout: 30_000 })
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'How many kilos?' })).toBeVisible(); // the third photo moves on by itself
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  await freshFix(context, seed);
  const sent = captureRequests(page);
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 120_000 });
  expect(sent).toHaveLength(1);
  expect(await storedPhotos(photos)).toBe(3);
  const s3 = await page.evaluate(() => performance.measure('udgam:s3-unstaged', 'udgam:t0-submit', 'udgam:t1-verdict').duration);
  const verdictIn = await page.evaluate(() => performance.measure('udgam:s3-unstaged-in', 'udgam:t0-submit', 'udgam:verdict-in').duration);
  console.log(`EVAL-070 split (not staged): t0→t1 ${Math.round(s3)} ms (t0→verdict-in ${Math.round(verdictIn)} ms), upload inside it`);
});
