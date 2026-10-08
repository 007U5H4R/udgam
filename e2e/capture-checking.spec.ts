import { expect, test, type Page } from '@playwright/test';
import { demoPhoto, openField, seedCaptureWorld, type SeededCapture, choosePhoto } from './helpers/capture';

// TSK-10.10 / TC-045: the checking screen shows the six farmer-facing groups ticking as the server's
// NDJSON stream reports their checks (TP12), local groups before the satellite ones; the bar fills by
// finished groups only; the live region announces each group and then the result. With reduced motion
// the screen waits on "See result" and the cherry does not move.
//
// Run with the server started as `E2E=1 E2E_FIXTURE_DELAY_MS=2000` (the NDVI calls answer 2 s late).
// Until TKT-07's remote checks are registered, the forest and satellite groups tick with the verdict.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 120_000 });

type Snap = { t: number; now: number; done: string[]; live: number };

async function toSend(page: Page, seed: SeededCapture) {
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  // Record every change of the progress bar and the rows from here on.
  await page.evaluate(() => {
    const w = window as unknown as { __rec: Snap[] };
    w.__rec = [];
    const snap = () => {
      const bar = document.querySelector('#bar');
      if (!bar) return;
      const s: Snap = {
        t: performance.now(),
        now: Number(bar.getAttribute('aria-valuenow')),
        done: [...document.querySelectorAll<HTMLElement>('.checks li[data-state="done"]')].map((l) => l.dataset.group!),
        live: document.querySelectorAll('[data-testid="checks-live"] p').length,
      };
      const last = w.__rec.at(-1);
      if (!last || last.now !== s.now || last.done.join() !== s.done.join() || last.live !== s.live) w.__rec.push(s);
    };
    new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-valuenow', 'data-state'] });
  });
}

const firstDone = (rec: Snap[], group: string) => rec.find((s) => s.done.includes(group))?.t ?? Infinity;

test('TC-045 the six groups tick as their checks stream, local before satellite; bar and live region follow', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await toSend(page, seed);
  await page.locator('#send-btn').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checking your picking');
  await expect(page.locator('.lede')).toHaveText('42.5 kg · Plot 1 · 1 photo');
  await expect(page.locator('.checks li .c-name')).toHaveText([
    "Your phone's seal",
    'Inside Plot 1',
    'Photos are new',
    'Forest map for Plot 1',
    'Satellite view this month',
    'Harvest size for this plot',
  ]);
  expect(await page.locator('.cherry').evaluate((el) => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);

  // It moves on to the result by itself 600 ms after the verdict (motion allowed).
  await expect(page.getByRole('heading', { name: 'Checking your picking' })).toHaveCount(0, { timeout: 15_000 });
  const rec = await page.evaluate(() => (window as unknown as { __rec: Snap[] }).__rec);

  expect(rec[0]!.now).toBe(0);
  expect(rec.at(-1)).toMatchObject({ now: 6, live: 7 });
  for (let i = 1; i < rec.length; i++) expect(rec[i]!.now).toBeGreaterThanOrEqual(rec[i - 1]!.now);
  for (const s of rec) expect(s.now).toBe(s.done.length); // the bar is filled by finished groups only
  for (const s of rec) expect(s.live).toBeLessThanOrEqual(s.done.length + 1);

  // local groups tick before the satellite groups
  expect(firstDone(rec, 'inside')).toBeLessThanOrEqual(firstDone(rec, 'forest'));
  expect(firstDone(rec, 'photos')).toBeLessThanOrEqual(firstDone(rec, 'satellite'));
  // TKT-07's remote checks are registered: the 2 s NDVI delay separates them visibly.
  expect(firstDone(rec, 'satellite') - firstDone(rec, 'inside')).toBeGreaterThanOrEqual(1500);
});

test('TC-045 with reduced motion: waits on "See result", the cherry does not move, the live region has 6 groups + the result', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await toSend(page, seed);
  await page.locator('#send-btn').click();
  await expect(page.locator('#see-result')).toBeVisible({ timeout: 30_000 });
  expect(await page.locator('.cherry').evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.waitForTimeout(1500); // longer than the 600 ms auto-advance
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checking your picking');
  // EV9: t1 is the verdict card becoming visible, so it is not marked while "See result" waits. The
  // verdict's arrival is its own mark (udgam:verdict-in), so the hold is reported as a separate split.
  expect(await page.evaluate(() => performance.getEntriesByName('udgam:verdict-in').length)).toBe(1);
  expect(await page.evaluate(() => performance.getEntriesByName('udgam:t1-verdict').length)).toBe(0);
  await expect(page.locator('#bar')).toHaveAttribute('aria-valuenow', '6');
  await expect(page.locator('.meter-txt')).toHaveText('6 of 6 checks done');
  const live = page.getByTestId('checks-live').locator('p');
  await expect(live).toHaveCount(7);
  await expect(live.last()).toHaveText('All 6 checks done. Your result is ready.');
  await page.locator('#see-result').click();
  await expect(page.getByRole('heading', { name: 'Checking your picking' })).toHaveCount(0);
  await expect(page.locator('#verdict-h')).toBeVisible();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('udgam:t1-verdict').length)).toBe(1);
});
