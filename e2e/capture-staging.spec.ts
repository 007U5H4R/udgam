import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, test, type Page, type Request } from '@playwright/test';
import { applyReferenceProfile } from '../evals/perf/network';
import { openField, seedCaptureWorld, type SeededCapture } from './helpers/capture';
import { E2E_DATA_DIR } from './helpers/tracer';

// TSK-30.4 · TC-094 (d, e) · EVAL-070. With the EV9 network profile (5 Mbit/s
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
    await page.getByLabel(s.label).setInputFiles({ name: s.file, mimeType: 'image/jpeg', buffer: photos[i]! });
    await page.getByRole('button', { name: 'Use this photo' }).click();
    await expect(page.getByRole('button', { name: 'Use this photo' })).toHaveCount(0, { timeout: 30_000 });
  }
  await expect.poll(() => stagedCount, { timeout: 180_000 }).toBe(3);
  await page.getByRole('button', { name: 'Continue with 3 photos' }).click();
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  return photos;
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

test('TC-094 (d) EVAL-070: photos staged in the background; the request after Send carries no photo bytes; t0→t1 < 12 s', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'measured once, at 375 px on the phone project');
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await applyReferenceProfile(await context.newCDPSession(page));
  await acceptThree(page, seed);
  const sent = captureRequests(page);

  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 60_000 });

  expect(sent).toHaveLength(1);
  const body = sent[0]!.req.postDataBuffer() ?? Buffer.alloc(0);
  expect(body.length).toBeLessThan(64 * 1024); // the signed payload, its signature and three hashes
  expect(body.includes(Buffer.from('name="photo'))).toBe(false);
  expect(body.includes(Buffer.from('name="staged"'))).toBe(true);
  expect(await sent[0]!.status()).toBe(200);

  const s3 = await page.evaluate(() => performance.measure('udgam:s3', 'udgam:t0-submit', 'udgam:t1-verdict').duration);
  console.log(`EVAL-070 (staged): t0→t1 ${Math.round(s3)} ms`);
  expect(s3).toBeLessThan(12_000);
});

test('TC-094 (e) staged photos expired before Send: exactly one 409, then the same picking with its bytes, and the verdict', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'run once, at 375 px on the phone project');
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  const photos = await acceptThree(page, seed);

  // Expire the three staged rows on the server, as an hour passing would.
  const db = createClient({ url: `file:${join(E2E_DATA_DIR, 'udgam.db')}` });
  try {
    const hashes = photos.map(sha256);
    const r = await db.execute({
      sql: `UPDATE staged_media SET expires_at = '2000-01-01T00:00:00.000Z' WHERE sha256 IN (?, ?, ?)`,
      args: hashes,
    });
    expect(r.rowsAffected).toBe(3);
  } finally {
    db.close();
  }

  const sent = captureRequests(page);
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('main')).not.toContainText('Not accepted');
  expect(sent).toHaveLength(2);
  expect(await sent[0]!.status()).toBe(409);
  expect(await sent[1]!.status()).toBe(200);
  const first = sent[0]!.req.postDataBuffer()!;
  const second = sent[1]!.req.postDataBuffer()!;
  expect(first.includes(Buffer.from('name="photo'))).toBe(false);
  expect(second.includes(Buffer.from('name="staged"'))).toBe(false);
  expect(second.length).toBeGreaterThan(3 * FOUR_MB);
});
