import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, test, type Page } from '@playwright/test';
import { demoPhoto, expectNoHorizontalScroll, openField, seedCaptureWorld, type SeededCapture, choosePhoto } from './helpers/capture';
import { E2E_DATA_DIR } from './helpers/tracer';

// TSK-10.11 · the three verdict screens on one template: Verified (#s5), Needs a check (#s6), and Not
// accepted from the D5 template (TC-048: --bad tokens, no green, no cherry rim, reason + what to do,
// one pill). EVAL-070 instrumentation: `udgam:t0-submit` (Send) → `udgam:t1-verdict` (card visible).
// Photos are the AI-generated demo photos (TP29): never evidence.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 120_000 });

async function record(page: Page, seed: SeededCapture, photo: Buffer, plot = seed.plots[0]!.id) {
  await page.goto(`/field/record?plot=${plot}`);
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 45_000 });
}

/** How many signed pickings are saved in the phone's outbox (IndexedDB `udgam` / `outbox`). */
const outboxCount = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('udgam');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    try {
      if (!db.objectStoreNames.contains('outbox')) return 0;
      return await new Promise<number>((res) => {
        const r = db.transaction('outbox').objectStore('outbox').count();
        r.onsuccess = () => res(r.result);
      });
    } finally {
      db.close();
    }
  });

/** Elements whose computed text colour is --ok or --ok-ink (TC-048: none on Not accepted). */
const greenText = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => ['rgb(127, 227, 166)', 'rgb(156, 240, 191)'].includes(getComputedStyle(el).color))
      .map((el) => el.outerHTML.slice(0, 80)),
  );

test('Verified: the lit word, "Your 42.5 kg from Plot 1 is recorded.", three evidence lines, one Done; t0→t1 measured; Done lists it first', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Needs Review'] });
  await openField(page, context, seed);
  await record(page, seed, demoPhoto());

  await expect(page.locator('h1 .lit')).toHaveText('Verified');
  await expect(page.locator('.v-sub')).toHaveText('Your 42.5 kg from Plot 1 is recorded.');
  const lines = page.getByTestId('evidence').locator('li');
  await expect(lines).toHaveCount(3);
  await expect(lines.first()).toHaveText(/^You were \d+ m inside Plot 1$/);
  await expect(lines.nth(1)).toHaveText('1 new photo');
  await expect(page.locator('main button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect(page.getByTestId('cherry')).toHaveClass(/\bgreen\b/);
  await expect(page.getByTestId('cherry')).toHaveClass(/\brise\b/);
  await expect(page.locator('#verdict-h')).toBeFocused();

  const timing = await page.evaluate(() => ({
    t1: performance.getEntriesByName('udgam:t1-verdict').length,
    s3: performance.measure('udgam:s3', 'udgam:t0-submit', 'udgam:t1-verdict').duration,
    // EV9: t1 is the card visible; the verdict's arrival (udgam:verdict-in) comes first, and the gap is the
    // designed auto-advance hold, reported as its own split.
    hold: performance.measure('udgam:hold', 'udgam:verdict-in', 'udgam:t1-verdict').duration,
  }));
  expect(timing.t1).toBe(1);
  expect(timing.s3).toBeGreaterThan(0);
  expect(timing.hold).toBeGreaterThanOrEqual(500);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/field$/);
  const first = page.getByTestId('home-rows').locator('li').first();
  await expect(first.locator('.r-kg')).toHaveText('42.5 kg');
  await expect(first.locator('.vchip')).toHaveText('Verified');
});

test('Needs a check (weak GPS): amber cherry, the chip, "The office will check this one", the reason and who checks', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed, { ...seed.plots[0]!.inside, accuracy: 150 });
  await record(page, seed, demoPhoto());
  await expect(page.getByTestId('cherry')).toHaveClass(/\bamber\b/);
  await expect(page.locator('.status-row .vchip')).toHaveText('Needs a check');
  await expect(page.locator('#verdict-h')).toHaveText('The office will check this one');
  const lines = page.getByTestId('evidence').locator('li');
  await expect(lines.first()).toHaveText('The GPS signal was weak (150 m).');
  await expect(lines.last()).toContainText("The office will look at this. You don't need to do anything.");
  await expect(lines.last()).toContainText('Your 42.5 kg and photos are saved.');
  await expect(page.locator('main button')).toHaveCount(1);
});

test('Needs a check (P09, satellite picture cloudy): the fixture-derived line ends with "(demo data)" (EXE12)', async ({ page, context }) => {
  const seed = seedCaptureWorld({ plots: ['P09'] });
  await openField(page, context, seed);
  await record(page, seed, demoPhoto());
  await expect(page.getByTestId('cherry')).toHaveClass(/\bamber\b/);
  await expect(page.locator('#verdict-h')).toHaveText('The office will check this one');
  const cloudy = page.getByTestId('evidence').locator('li', { hasText: 'The satellite picture for this month was cloudy.' });
  await expect(cloudy).toHaveText(/\(demo data\)$/);
  await expect(cloudy).toHaveText('The satellite picture for this month was cloudy. (demo data)');
  await expect(page.getByTestId('evidence')).toContainText('The office will look at this.');
});

test('TC-048 Not accepted (a photo reused from an earlier picking): the reason, what to do, no green, no rim, one pill', async ({ page, context }) => {
  const photo = demoPhoto('scale-01.jpg');
  mkdirSync(E2E_DATA_DIR, { recursive: true });
  const file = join(E2E_DATA_DIR, `reused-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  writeFileSync(file, photo);
  const seed = seedCaptureWorld({ events: ['40:Verified'], photo: file });
  await openField(page, context, seed);
  await record(page, seed, photo);

  await expect(page.locator('#verdict-h')).toHaveText('Not accepted');
  await expect(page.locator('#verdict-h .lit')).toHaveCount(0);
  await expect(page.locator('.v-sub')).toHaveText('Your 42.5 kg from Plot 1 could not be accepted.');
  const lines = page.getByTestId('evidence').locator('li');
  await expect(lines).toHaveText(['1 of 1 photos were used before.', "Take new photos of today's picking and record it again."]);
  await expect(page.getByTestId('cherry')).toHaveClass(/\bnone\b/);
  await expect(page.getByTestId('cherry')).not.toHaveClass(/green|amber|rise/);
  expect(await greenText(page)).toEqual([]);
  await expect(page.locator('main button')).toHaveCount(1);
  await expect(page.locator('main')).not.toContainText(/fraud|fake|cheat|rejected/i);
});

test('Not accepted at the boundary (plot no longer assigned): what happened and what to do', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  await page.locator('#keypad [data-k="9"]').click();
  // The office takes the plot away while the farmer is typing.
  const db = createClient({ url: `file:${join(E2E_DATA_DIR, 'udgam.db')}` });
  try {
    await db.execute({ sql: 'UPDATE agent_plots SET revoked_at = ? WHERE plot_id = ?', args: [new Date().toISOString(), seed.plots[0]!.id] });
  } finally {
    db.close();
  }
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toHaveText('Not accepted', { timeout: 45_000 });
  await expect(page.getByTestId('evidence').locator('li')).toHaveText([
    'This plot is not assigned to you.',
    'Ask the office to assign it to you, then record the picking again.',
  ]);
  expect(await greenText(page)).toEqual([]);
});

test('no network at Send: the amber sheet says nothing is lost; Try again sends the saved copy and gets the verdict', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.abort('internetdisconnected'));
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  await page.locator('#send-btn').click();
  const sheet = page.getByTestId('saved-sheet');
  await expect(sheet.getByRole('heading')).toHaveText('No network here');
  await expect(sheet).toContainText('Nothing is lost: 1 photo and 42.5 kg are saved on this phone.');
  expect(await outboxCount(page)).toBe(1);
  await page.unroute('**/api/capture');
  await sheet.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#verdict-h')).toHaveText('Verified', { timeout: 45_000 });
  // the saved copy is gone once the office has it
  expect(await outboxCount(page)).toBe(0);
});

test('a picture the office cannot read (PNG) is refused on "Use this photo", before anything is signed', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByTestId('photo-error')).toHaveText('This photo is not a camera picture the office can read. Take it again with Open camera.');
  await expect(page.getByRole('button', { name: 'Use this photo' })).toBeDisabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Is the photo clear?');
  expect(await outboxCount(page)).toBe(0);
});
