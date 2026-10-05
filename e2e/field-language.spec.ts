import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, openField, seedCaptureWorld } from './helpers/capture';

// TKT-11 · TSK-11.7 / TC-052 (e2e half): the header chip opens the language sheet (the first-run sheet,
// reused); choosing ಕನ್ನಡ sets <html lang="kn">, changes the Home heading and the tab labels, and
// persists after a reload (the `udgam_lang` cookie, a year, sameSite=lax). Kannada body text has a
// line-height of at least 1.6 times its size, and at 320 px no text is clipped.

test.describe.configure({ timeout: 120_000 });

const TABS_KN = ['ಮುಖಪುಟ', 'ಕೊಯ್ಲುಗಳು', 'ಸಹಾಯ'];

/** line-height ÷ font-size of every paragraph of body text in main (headings excepted). */
const bodyRatios = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main p')]
      .filter((p) => !p.classList.contains('h1') && (p.textContent ?? '').trim() !== '' && (p as HTMLElement).offsetParent !== null)
      .map((p) => {
        const cs = getComputedStyle(p);
        return { text: (p.textContent ?? '').slice(0, 30), ratio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
      }),
  );

/** Elements with their own text whose content is wider than their box (clipped). */
const clipped = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''))
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent ?? '').slice(0, 30)}`),
  );

test('TSK-11.7: ಕನ್ನಡ from the header chip changes the heading and tabs, sets <html lang="kn"> and persists; English switches back', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const heading = await page.getByRole('heading', { level: 1 }).textContent();
  await expect(page.getByRole('navigation', { name: 'Main' }).locator('.tab')).toHaveText(['Home', 'Pickings', 'Help']);

  await page.getByRole('button', { name: 'Language' }).click();
  const sheet = page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /ಕನ್ನಡ/ }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  await expect(page.locator('nav.tabbar .tab')).toHaveText(TABS_KN);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(heading!);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ತೋಟ 1/);

  const cookie = (await context.cookies()).find((c) => c.name === 'udgam_lang');
  // Secure in production (`next start`; Chromium accepts Secure cookies on http://localhost), quality minor 9
  expect(cookie).toMatchObject({ value: 'kn', sameSite: 'Lax', path: '/', secure: true });
  const year = cookie!.expires * 1000 - Date.now();
  expect(year).toBeGreaterThan(364 * 86_400_000);
  expect(year).toBeLessThan(366 * 86_400_000);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  await expect(page.locator('nav.tabbar .tab')).toHaveText(TABS_KN);
  await page.goto('/field/pickings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ನಿಮ್ಮ ಕೊಯ್ಲುಗಳು');

  // back to English from the same chip (it names English now)
  await page.getByRole('button', { name: 'ಭಾಷೆ' }).click();
  await page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' }).getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your pickings');
});

test('TC-052: Kannada body text has line-height ≥ 1.6 and nothing is clipped at 320 px', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Needs Review:cloud', '29:Rejected:outside'], refusal: 'plot_not_assigned' });
  await context.addCookies([{ name: 'udgam_lang', value: 'kn', url: test.info().project.use.baseURL! }]);
  await openField(page, context, seed);
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');

  for (const path of ['/field', '/field/pickings', '/field/help']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    const ratios = await bodyRatios(page);
    expect(ratios.length, path).toBeGreaterThan(0);
    for (const r of ratios) expect(r.ratio, `${path}: ${r.text}`).toBeGreaterThanOrEqual(1.6);
    expect(await clipped(page), path).toEqual([]);
    await expectNoHorizontalScroll(page);
  }
});
