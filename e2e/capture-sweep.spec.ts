import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { demoPhoto, expectNoHorizontalScroll, openField, seedCaptureWorld } from './helpers/capture';

// TSK-10.14 · the capture flow held to every viewport (each Playwright project is one: 320 × 568,
// 375 × 812, 768 × 1024, 1440 × 900):
//   TC-046  on every record-flow screen the primary pill lies fully inside the viewport without scrolling;
//   TC-044 / TC-080  no horizontal scroll on /field and every step;
//   EVAL-089 / TC-081  axe finds no serious or critical violation on /field and every step.
// Reduced motion is on, so the finished checking screen waits on "See result" and can be measured.
// With CAPTURE_SHOTS=<dir>, a full-page screenshot of every screen is written there (Stage 8 input).

test.describe.configure({ timeout: 180_000 });

async function seriousAxe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function pillInView(page: Page, pill: Locator) {
  await expect(pill).toBeVisible();
  const box = await pill.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, 'primary pill has a box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'primary pill bottom inside the viewport').toBeLessThanOrEqual(vp.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
}

test('TC-044 TC-046 TC-080 EVAL-089 /field and every record-flow screen: pill in view, no sideways scroll, axe-clean', async ({ page, context }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shots = process.env.CAPTURE_SHOTS;
  if (shots) mkdirSync(shots, { recursive: true });
  const vp = page.viewportSize()!;
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${name}-${vp.width}x${vp.height}.png`, fullPage: false });
  };
  const check = async (name: string, pill: Locator | null) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalScroll(page);
    if (pill) await pillInView(page, pill);
    expect(await seriousAxe(page), `${name} at ${info.project.name}`).toEqual([]);
    await shot(name);
  };

  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Needs Review', '51:Rejected'] });
  await openField(page, context, seed);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're inside Plot 1");
  await check('s1-home', page.getByRole('button', { name: "Record today's picking" }));

  await page.getByRole('button', { name: "Record today's picking" }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take up to 3 photos');
  await check('s2-photos', page.getByRole('button', { name: 'Open camera' }));

  await page.getByLabel('The branch').setInputFiles({ name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Is the photo clear?');
  await expect(page.locator('.photo-big img')).toBeVisible();
  await check('s3-review', page.getByRole('button', { name: 'Use this photo' }));

  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByTestId('photo-counter')).toHaveText('1 of 3');
  await check('s2-photos-after-1', page.getByRole('button', { name: 'Open camera' }));

  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How many kilos?');
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  await check('s3-kg-weight', page.locator('#send-btn'));
  // Every key is a primary target of at least 56 px, short screens included (Design.md §17).
  const keyHeights = await page.locator('#keypad button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(keyHeights.length).toBe(12);
  for (const h of keyHeights) expect(h).toBeGreaterThanOrEqual(56);

  await page.locator('#send-btn').click();
  await expect(page.locator('#see-result')).toBeVisible({ timeout: 45_000 });
  await check('s4-checking', page.locator('#see-result'));

  await page.locator('#see-result').click();
  await expect(page.locator('#verdict-h')).toHaveText('Verified');
  await check('s5-verified', page.getByRole('button', { name: 'Done' }));
});

test('TC-046 TC-080 EVAL-089 Needs a check and Not accepted screens, and Home with no pickings', async ({ page, context }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const shots = process.env.CAPTURE_SHOTS;
  const vp = page.viewportSize()!;
  const seed = seedCaptureWorld();
  await openField(page, context, seed, { ...seed.plots[0]!.inside, accuracy: 150 });
  await expectNoHorizontalScroll(page);
  expect(await seriousAxe(page)).toEqual([]);
  if (shots) await page.screenshot({ path: `${shots}/s1-home-empty-${vp.width}x${vp.height}.png` });

  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await page.getByLabel('The branch').setInputFiles({ name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  await page.locator('#keypad [data-k="4"]').click();
  await page.locator('#send-btn').click();
  await page.locator('#see-result').click({ timeout: 45_000 });
  await expect(page.locator('#verdict-h')).toHaveText('The office will check this one');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoHorizontalScroll(page);
  await pillInView(page, page.getByRole('button', { name: 'Done' }));
  expect(await seriousAxe(page), `s6 at ${info.project.name}`).toEqual([]);
  if (shots) await page.screenshot({ path: `${shots}/s6-needs-check-${vp.width}x${vp.height}.png` });

  // Not accepted (D5 template): a boundary refusal, here a phone the office has since switched off.
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await page.route('**/api/capture', (r) =>
    r.fulfill({ status: 403, contentType: 'application/x-ndjson', body: '{"t":"rejected","reason":"device_revoked","status":403}\n' }),
  );
  await page.getByLabel('The branch').setInputFiles({ name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  await page.locator('#keypad [data-k="4"]').click();
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toHaveText('Not accepted');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoHorizontalScroll(page);
  await pillInView(page, page.getByRole('button', { name: 'Done' }));
  expect(await seriousAxe(page), `not accepted at ${info.project.name}`).toEqual([]);
  if (shots) await page.screenshot({ path: `${shots}/not-accepted-${vp.width}x${vp.height}.png` });
});
