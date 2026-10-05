import { expect, test, type Page } from '@playwright/test';
import { openField, seedCaptureWorld } from './helpers/capture';
import { typePicking } from './helpers/field';

// Stage 8 design critique, surface `field` (docs/exec/stage8/stage8-field.md): the fixes for the DES-
// findings, each checked in the running app at the phone viewport the finding was measured at.

test.use({ viewport: { width: 375, height: 812 } });
test.describe.configure({ timeout: 150_000 });

async function tap(page: Page, ...keys: string[]) {
  for (const k of keys) await page.locator(`#keypad [data-k="${k === '⌫' ? 'del' : k}"]`).click();
}

test('DES-010: the weight screen pins the keypad and the Send pill to the bottom thumb zone', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Verified', '51:Needs Review'] });
  await openField(page, context, seed);
  await typePicking(page, seed, { photos: 1, kg: '42.5' });
  const send = await page.locator('#send-btn').boundingBox();
  // the pill ends within the bottom 60 px of the 812 px screen (it ended at y≈607 before)
  expect(send!.y + send!.height).toBeGreaterThan(812 - 60);
  expect(send!.y + send!.height).toBeLessThanOrEqual(812);
});

test('DES-019: a refused key says the half-kilo rule; a weight far from the own range asks to check it before sending', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Verified', '51:Needs Review'] });
  await openField(page, context, seed);
  await typePicking(page, seed, { photos: 1, kg: '499' });
  const hint = page.locator('.kg-hint');
  await expect(hint).toHaveText('499 kg is far from your last pickings (38–51 kg). Check the number before you send.');
  await expect(hint).toHaveClass(/warn/);
  await expect(page.locator('#send-btn')).toHaveText('Yes, send 499 kg');

  await tap(page, '⌫');
  await expect(hint).toHaveText('Your last pickings: 38–51 kg');
  await expect(hint).not.toHaveClass(/warn/);
  await expect(page.locator('#send-btn')).toHaveText('Send 49 kg');

  await tap(page, '.', '3'); // only .0 or .5
  await expect(page.locator('output.kg-num')).toHaveText('49.');
  await expect(hint).toHaveText('Kilos in halves (.0 or .5), up to 500 kg.');
  await expect(hint).toHaveClass(/warn/);
  await tap(page, '5');
  await expect(hint).toHaveText('Your last pickings: 38–51 kg');
  await expect(page.locator('#send-btn')).toHaveText('Send 49.5 kg');
});

test('DES-006: Try again while still offline shows "Trying…", then "Still no network. Nothing is lost."', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.abort('internetdisconnected'));
  await typePicking(page, seed, { photos: 1 });
  await page.locator('#send-btn').click();
  const sheet = page.getByTestId('saved-sheet');
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('No network here');
  await expect(sheet.getByTestId('saved-still')).toHaveText('');

  await page.unroute('**/api/capture');
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/capture', async (r) => {
    await held;
    await r.abort('internetdisconnected');
  });
  await sheet.getByRole('button', { name: 'Try again' }).click();
  const busy = sheet.getByRole('button', { name: 'Trying…' });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(sheet.getByTestId('saved-still')).toHaveText('Still no network. Nothing is lost.');
  await expect(sheet.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(sheet.getByTestId('saved-body')).toHaveText('Nothing is lost: 1 photo and 42.5 kg are saved on this phone.');
});

const helpTab = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Help' });

for (const vp of [
  { width: 375, height: 812 },
  { width: 360, height: 740 },
]) {
  test(`DES-001 at ${vp.width}×${vp.height}: Help's Close is pinned in view; a fade marks more below until the end is reached`, async ({ page, context }) => {
    await page.setViewportSize(vp);
    const seed = seedCaptureWorld({ phone: '+91 8272 000 111' });
    await openField(page, context, seed);
    await helpTab(page).click();
    const sheet = page.getByRole('dialog', { name: 'Help' });
    const close = sheet.getByRole('button', { name: 'Close' });
    await expect(close).toBeInViewport({ ratio: 1 });
    const body = sheet.getByTestId('help-sheet-body');
    await expect(body).toHaveAttribute('data-more', 'true');
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(body).not.toHaveAttribute('data-more');
    await expect(close).toBeInViewport({ ratio: 1 });
    // the language and this phone sit behind "More"
    const more = sheet.getByTestId('help-more');
    await expect(more.getByTestId('this-phone')).toBeHidden();
    await more.locator('summary').click();
    await expect(more.getByTestId('this-phone')).toBeVisible();
    await close.click();
    await expect(sheet).toBeHidden();
  });
}
