import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, openField, seedCaptureWorld } from './helpers/capture';

// TKT-11 · TC-053 (TC-UI-MOBILE-NAV): Home · Pickings · Help are each reachable by tap and by keyboard
// (Tab + Enter), with aria-current="page" on the current tab; the bar floats above the safe area; the
// Help sheet (final/index.html #help-dialog, and the /field/help deep link) explains the three verdicts,
// photo tips and why gallery photos are not allowed, "Call the office" as a tel: link from the
// organisation's office phone (hidden when there is none), the language, and this phone.

test.describe.configure({ timeout: 120_000 });

/** Press Tab until `target` has focus (at most 40 presses). */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('never reached by Tab');
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('TC-053: the tabs work by tap and by keyboard, with aria-current on the current one, above the safe area', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  const nav = tabs(page);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Pickings' })).not.toHaveAttribute('aria-current');

  // tap
  await nav.getByRole('link', { name: 'Pickings' }).click();
  await expect(page).toHaveURL(/\/field\/pickings$/);
  await expect(tabs(page).getByRole('link', { name: 'Pickings' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs(page).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');

  // keyboard
  await tabTo(page, tabs(page).getByRole('link', { name: 'Home' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/field$/);
  await expect(tabs(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await tabTo(page, tabs(page).getByRole('link', { name: 'Pickings' }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/field\/pickings$/);

  const help = tabs(page).getByRole('button', { name: 'Help' });
  await tabTo(page, help);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  await expect(help).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeHidden();

  // the bar floats inside the viewport, lifted by the safe-area inset (field.css .tabbar)
  const bar = await tabs(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { position: cs.position, bottomGap: innerHeight - r.bottom };
  });
  expect(bar.position).toBe('fixed'); // DES-012: at the bottom edge on short pages too
  expect(bar.bottomGap).toBeGreaterThanOrEqual(0);
  const rule = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => [...s.cssRules]).some((r) => r instanceof CSSStyleRule && r.selectorText === '.tabbar' && r.style.bottom.includes('safe-area-inset-bottom')),
  );
  expect(rule).toBe(true);
});

test('TC-053: the Help sheet explains the verdicts, photos and the gallery, calls the office, offers the language and names this phone', async ({ page, context }) => {
  const seed = seedCaptureWorld({ phone: '+91 8272 000 111' });
  await openField(page, context, seed);
  await tabs(page).getByRole('button', { name: 'Help' }).click();
  const sheet = page.getByRole('dialog', { name: 'Help' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Stand inside your plot, then tap Record today's picking. One photo is enough.");
  await expect(sheet).toContainText('Take the photos in daylight');
  await expect(sheet).toContainText('Photos come from the camera, never the gallery: this phone seals each photo as it is taken, so the office knows it is new.');
  const verdicts = sheet.getByTestId('help-verdicts').locator('.help-row');
  await expect(verdicts.locator('.vchip')).toHaveText(['Verified', 'Needs a check', 'Not accepted']);
  await expect(verdicts.nth(0)).toContainText('The office has what it needs. Nothing to do.');
  await expect(verdicts.nth(1)).toContainText("The office will look at this picking. You don't need to do anything.");
  await expect(verdicts.nth(2)).toContainText('The picking could not be accepted. The screen says why and what to do.');
  const call = sheet.getByTestId('call-office');
  await expect(call).toHaveAttribute('href', 'tel:+918272000111');
  // DES-014: a 56 px ghost pill "Call the office" with the number as its second line
  await expect(call).toHaveText('Call the office+91 8272 000 111');
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  // DES-001: the language and this phone sit behind the "More" row
  await sheet.getByTestId('help-more').locator('summary').click();
  await expect(sheet.getByRole('button', { name: 'ಕನ್ನಡ' })).toBeVisible();
  await expect(sheet.getByTestId('this-phone')).toHaveText(new RegExp(`^${seed.deviceId}, set up on \\d{1,2} [A-Z][a-z]{2}$`));
  await expectNoHorizontalScroll(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // the language row opens the language sheet
  await sheet.getByRole('button', { name: 'ಕನ್ನಡ' }).click();
  await expect(page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' })).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('TC-053: /field/help opens Home with the Help sheet; closing it returns to /field; no office phone → no call link', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto('/field/help');
  const sheet = page.getByRole('dialog', { name: 'Help' });
  await expect(sheet).toBeVisible();
  await expect(tabs(page).getByRole('button', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
  await expect(sheet.getByTestId('call-office')).toHaveCount(0);
  await expect(sheet).not.toContainText('Call the');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/field$/);
  await expect(tabs(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
});

test('quality minor 1: on /field/help the Help sheet\'s language row opens the language sheet; choosing ಕನ್ನಡ leaves the deep link for /field in Kannada', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto('/field/help');
  const sheet = page.getByRole('dialog', { name: 'Help' });
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('help-more').locator('summary').click(); // DES-001
  await sheet.getByRole('button', { name: 'ಕನ್ನಡ' }).click();
  const langSheet = page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' });
  await expect(langSheet).toBeVisible();
  await expect(sheet).toBeHidden();
  await langSheet.getByRole('button', { name: /ಕನ್ನಡ/ }).click();
  await expect(langSheet).toBeHidden();
  await expect(page).toHaveURL(/\/field$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  await expect(page.locator('nav.tabbar .tab')).toHaveText(['ಮುಖಪುಟ', 'ಕೊಯ್ಲುಗಳು', 'ಸಹಾಯ']);
});
