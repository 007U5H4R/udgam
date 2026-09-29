import { expect, test, type Page } from '@playwright/test';
import { demoPhoto, openField, seedCaptureWorld, type SeededCapture } from './helpers/capture';

// TSK-10.8 (s3-kg Weight) and TC-047: the keypad fills the lit number and the Send pill carries the
// value; the hint is the farmer's own recent range (D6); tapping Send marks `udgam:t0-submit` (EV9 t0);
// a weak GPS fix never disables Send.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 120_000 });

/** From Home to the weight screen with one photo accepted. */
async function toWeight(page: Page, seed: SeededCapture) {
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await page.getByLabel('The branch').setInputFiles({ name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('button', { name: 'Continue with 1 photo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How many kilos?');
}

async function tap(page: Page, ...keys: string[]) {
  for (const k of keys) await page.locator(`#keypad [data-k="${k === '⌫' ? 'del' : k}"]`).click();
}

test('4, 2, ., 5 → 42.5 in the lit number and "Send 42.5 kg"; the hint is the own range; Send marks t0', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Verified', '51:Needs Review'] });
  await openField(page, context, seed);
  await toWeight(page, seed);

  await expect(page.locator('.eyebrow')).toHaveText('Plot 1 · 1 photo');
  await expect(page.locator('output.kg-num')).toHaveClass(/empty/);
  await expect(page.locator('#send-btn')).toBeDisabled();
  await expect(page.locator('#send-btn')).toHaveText('Type the weight');
  await expect(page.locator('.kg-hint')).toHaveText('Your last pickings: 38–51 kg');

  await tap(page, '4', '2', '.', '5');
  await expect(page.locator('output.kg-num.lit')).toHaveText('42.5');
  await expect(page.locator('#send-btn')).toHaveText('Send 42.5 kg');
  // only .5 or .0, and never above 500
  await tap(page, '5');
  await expect(page.locator('output.kg-num')).toHaveText('42.5');
  const keyHeight = await page.locator('#keypad [data-k="5"]').evaluate((el) => el.getBoundingClientRect().height);
  expect(keyHeight).toBeGreaterThanOrEqual(56);

  expect(await page.evaluate(() => performance.getEntriesByName('udgam:t0-submit').length)).toBe(0);
  await page.locator('#send-btn').click();
  expect(await page.evaluate(() => performance.getEntriesByName('udgam:t0-submit').length)).toBe(1);
});

test('TC-047 with a 150 m fix the "Move to open sky" line shows and Send stays enabled', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed, { ...seed.plots[0]!.inside, accuracy: 150 });
  await toWeight(page, seed);
  await expect(page.getByTestId('gps-line')).toHaveText('Move to open sky for a better location. You can still record.');
  await tap(page, '3', '0');
  await expect(page.locator('#send-btn')).toBeEnabled();
  await expect(page.locator('.kg-hint')).toHaveCount(0); // no earlier pickings: no hint
});
