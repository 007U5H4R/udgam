import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD, signIn } from './helpers/auth';
import { seedEnrolment } from './helpers/enrolment';

// CR-100 · EVAL-088: a server failure on an admin screen without a nearer boundary (Plots, Phones,
// Agreements), on /enrol or on /sign-in shows that route group's designed error state — what happened,
// that nothing was changed, and a working Try again — never Next's bare "Application error" page.
// `?state=throw` makes the page throw (dev and e2e builds only: src/lib/config/test-surfaces.ts).

test.describe.configure({ timeout: 120_000 });

const ADMIN = { title: 'Couldn’t load this page.', body: 'Nothing was changed. Try again in a moment.', retry: 'Try again' };
const SIGN_IN = {
  en: { title: 'Couldn’t open sign-in.', body: 'Nothing was changed. Check the connection and try again.', retry: 'Try again' },
  kn: { title: 'ಸೈನ್ ಇನ್ ತೆರೆಯಲಾಗಲಿಲ್ಲ.', body: 'ಏನೂ ಬದಲಾಗಿಲ್ಲ. ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' },
};
const ENROL = { title: 'Couldn’t open phone set-up.', body: 'Nothing was changed. Check the signal and try again.', retry: 'Try again' };

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectBoundary(page: Page, words: { title: string; body: string; retry: string }, url: string) {
  const alert = page.locator('main [role="alert"]');
  await expect(alert, url).toContainText(words.title);
  await expect(alert, url).toContainText(words.body);
  await expect(page.getByRole('button', { name: words.retry }), url).toBeVisible();
  await expect(page.getByText('Application error'), url).toHaveCount(0);
}

test('EVAL-088: a thrown server error on Plots, Phones and Agreements shows the admin error state in the shell', async ({ page }) => {
  const seed = seedEnrolment({ plot: true });
  await signIn(page, seed.adminEmail, SEED_PASSWORD);
  const rail = page.getByRole('navigation', { name: 'Admin sections' });
  const routes: [string, string, string][] = [
    ['/admin/plots?state=throw', 'Plots', 'Plots'],
    ['/admin/plots/new?state=throw', 'Plots', 'Plots'],
    [`/admin/plots/${seed.plotId}?state=throw`, 'Plots', 'Plots'],
    ['/admin/phones?state=throw', 'Phones', 'Phones'],
    ['/admin/agreements?state=throw', 'Agreements', 'Batches'],
    ['/admin/agreements/AGR-UNKNOWN?state=throw', 'Agreements', 'Batches'],
  ];
  for (const [url, h1, section] of routes) {
    await page.goto(url);
    await expectBoundary(page, ADMIN, url);
    await expect(page.getByRole('heading', { level: 1 }), url).toHaveText(h1);
    await expect(rail.getByRole('link', { name: section }), url).toHaveAttribute('aria-current', 'page');
    await noHorizontalScroll(page);
  }

  // Try again renders the route afresh: the forced throw is in the URL, so the boundary shows again
  await page.goto('/admin/phones?state=throw');
  await page.getByRole('button', { name: ADMIN.retry }).click();
  await expect(page).toHaveURL(/\/admin\/phones\?state=throw$/);
  await expectBoundary(page, ADMIN, 'retry');

  // without the forced throw the same page renders as usual
  await page.goto('/admin/phones');
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phones');
});

test('EVAL-088: a thrown server error on /sign-in shows its error state, in the chosen language', async ({ page, context }) => {
  await page.goto('/sign-in?state=throw');
  await expectBoundary(page, SIGN_IN.en, 'en');
  await noHorizontalScroll(page);
  await context.addCookies([{ name: 'udgam_lang', value: 'kn', url: page.url() }]);
  await page.goto('/sign-in?state=throw');
  await expectBoundary(page, SIGN_IN.kn, 'kn');
  await noHorizontalScroll(page);
  await page.goto('/sign-in');
  await expect(page.locator('#email')).toBeVisible();
});

test('EVAL-088: a thrown server error on /enrol shows its error state', async ({ page }) => {
  const seed = seedEnrolment();
  await signIn(page, seed.agentEmail, SEED_PASSWORD);
  await page.goto('/enrol?state=throw');
  await expectBoundary(page, ENROL, '/enrol');
  await noHorizontalScroll(page);
});
