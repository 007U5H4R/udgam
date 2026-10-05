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

test('DES-021: Help → More → Sign out ends the session and opens sign-in; the saved pickings stay on the phone', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await helpTab(page).click();
  const sheet = page.getByRole('dialog', { name: 'Help' });
  await sheet.getByTestId('help-more').locator('summary').click();
  await expect(sheet).toContainText('Pickings saved on this phone stay on it.');
  await sheet.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/field');
  await expect(page).toHaveURL(/\/sign-in/);
});

/** How many lines an element's text takes (its height over its line-height). */
const lines = (el: Element) => {
  const cs = getComputedStyle(el);
  return Math.round((el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight));
};

test('DES-008, DES-009, DES-023 (Kannada): verdict words, the language chip and slot states never break inside a word; headings get 1.35 leading', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await context.addCookies([{ name: 'udgam_lang', value: 'kn', url: test.info().project.use.baseURL! }]);
  await openField(page, context, seed);
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  const h1 = await page.locator('h1.h1').first().evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
  expect(h1).toBeCloseTo(1.35, 2);

  // Help legend: each chip sits on its own line above its explanation; a one-word verdict is one line
  await page.locator('nav.tabbar .tab').nth(2).click();
  const legend = page.getByTestId('help-verdicts').locator('.help-row');
  await expect(legend).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const [chip, text] = await legend.nth(i).evaluate((row) => {
      const c = row.querySelector('.vchip')!.getBoundingClientRect();
      const t = row.querySelector('span:last-child')!.getBoundingClientRect();
      return [c, t].map((r) => ({ top: r.top, bottom: r.bottom }));
    });
    expect(text!.top).toBeGreaterThanOrEqual(chip!.bottom - 1);
  }
  expect(await legend.nth(2).locator('.vchip').evaluate(lines)).toBe(1); // ಸ್ವೀಕರಿಸಿಲ್ಲ
  expect(await legend.nth(0).locator('.vchip').evaluate(lines)).toBe(1); // ಪರಿಶೀಲಿತ
  await page.keyboard.press('Escape');

  // Pickings header: the title wraps, the chip keeps its word on one line
  await page.goto('/field/pickings');
  const chip = page.locator('header.top .chip');
  expect(await chip.locator('span[lang]').evaluate(lines)).toBe(1);

  // Photo slots: the "next" slot's state word is never split
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  const state = page.locator('.slot[data-state="next"] .s-state > span');
  expect(await state.evaluate(lines)).toBe(1);
});

test('DES-002: offline, a tab or the Record pill keeps the app and shows the saved-on-phone sheet', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  await context.setOffline(true);
  const offline = page.getByTestId('offline-sheet');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pickings' }).click();
  await expect(offline).toBeVisible();
  await expect(offline.getByRole('heading')).toHaveText('No network here');
  await expect(offline).toContainText('Nothing is lost: pickings saved on this phone stay here until you send them.');
  await expect(page).toHaveURL(/\/field$/);
  expect(page.url()).not.toContain('chrome-error');
  await offline.getByRole('button', { name: 'Close' }).click();
  await expect(offline).toBeHidden();

  await page.getByRole('button', { name: "Record today's picking" }).click();
  await expect(offline).toBeVisible();
  await expect(page).toHaveURL(/\/field$/);
  await offline.getByRole('button', { name: 'Close' }).click();

  await context.setOffline(false);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pickings' }).click();
  await expect(page).toHaveURL(/\/field\/pickings$/);
  await expect(offline).toBeHidden();
});

test('DES-002: offline, Send now stays on Pickings with the saved row and says nothing is lost; online it sends', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.abort('internetdisconnected'));
  await typePicking(page, seed, { photos: 1 });
  await page.locator('#send-btn').click();
  await page.getByTestId('saved-sheet').getByRole('button', { name: 'Try later' }).click();
  await expect(page).toHaveURL(/\/field$/);
  await page.unroute('**/api/capture');
  await page.goto('/field/pickings');
  const pending = page.getByTestId('pending-rows').locator('li');
  await expect(pending).toHaveCount(1);

  await context.setOffline(true);
  await pending.getByRole('button', { name: 'Send now' }).click();
  const offline = page.getByTestId('offline-sheet');
  await expect(offline).toBeVisible();
  await expect(page).toHaveURL(/\/field\/pickings$/);
  await expect(page.getByTestId('pending-note')).toHaveText('No network here. Nothing is lost: your pickings are still saved on this phone.');
  await expect(pending).toHaveCount(1);
  await offline.getByRole('button', { name: 'Close' }).click();

  await context.setOffline(false);
  await pending.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByTestId('pending-rows')).toHaveCount(0, { timeout: 90_000 });
});

test('DES-003: the Home plot card clips the contour lines that run past its glass edge', async ({ page, context }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  const card = page.locator('.plot-card');
  const m = await card.evaluate((el) => {
    const c = el.getBoundingClientRect();
    const g = el.querySelector('.m-contour')!.getBoundingClientRect();
    return { overflow: getComputedStyle(el).overflow, past: g.left < c.left || g.right > c.right };
  });
  expect(m.past).toBe(true); // the lines are drawn wider than the card …
  expect(m.overflow).toBe('hidden'); // … and the card clips them
});

test('DES-007: the current language and the current plot carry a check mark, not colour alone', async ({ page, context }) => {
  const seed = seedCaptureWorld({ plots: ['P02', 'P01'] });
  await openField(page, context, seed);
  await page.getByRole('button', { name: 'Language' }).click();
  const lang = page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' });
  await expect(lang.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  await expect(lang.getByRole('button', { name: 'English' }).locator('svg.ic')).toHaveCount(1);
  await expect(lang.getByRole('button', { name: /ಕನ್ನಡ/ }).locator('svg.ic')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Change plot' }).click();
  const plots = page.getByRole('dialog', { name: 'Choose a plot' });
  const pressed = plots.locator('button[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);
  await expect(pressed.locator('svg.ic')).toHaveCount(1);
  await expect(plots.locator('button[aria-pressed="false"] svg.ic')).toHaveCount(0);
});
