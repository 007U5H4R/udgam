import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { openField, seedCaptureWorld } from './helpers/capture';

// Stage 8 office fixes (docs/exec/stage8/stage8-office.md): the office shell around every admin, buyer and
// processor screen. DES-105: Sign out on every office screen (the rail foot on tablet and desktop, the end
// of the screen on phones, the list column's foot for the buyer), exactly one visible at a time.

test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => seedAccounts());

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 700;

async function axeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/** Exactly one visible Sign out, in the rail foot (≥ 700 px) or at the end of the screen (phones). */
async function oneSignOut(page: Page, where: string) {
  const out = page.getByRole('button', { name: 'Sign out' });
  await expect(out, where).toHaveCount(1);
  await expect(out, where).toBeVisible();
  if (!phone(page) && (await page.getByRole('navigation', { name: 'Admin sections' }).count())) {
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Sign out' }), where).toBeVisible();
  }
  const box = (await out.boundingBox())!;
  expect(box.width, where).toBeLessThanOrEqual(360);
  expect(box.height, where).toBeGreaterThanOrEqual(48);
}

test.describe('DES-105 Sign out on every office screen', () => {
  test('admin: every rail section, the demo-free lists, and the forced states', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    for (const path of ['/admin', '/admin?state=empty', '/admin?state=error', '/admin/plots', '/admin/plots/new', '/admin/batches', '/admin/batches/new', '/admin/phones', '/admin/agreements']) {
      await page.goto(path);
      await oneSignOut(page, path);
    }
    await axeClean(page);
  });

  test('admin: Sign out from a screen that had none ends the session', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await page.goto('/admin/phones');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/admin/phones');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('buyer: batches and agreements', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    for (const path of ['/buyer', '/buyer/agreements', '/buyer/agreements/new']) {
      await page.goto(path);
      await oneSignOut(page, path);
    }
    await axeClean(page);
  });

  test('processor: the batch list', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    for (const path of ['/processor', '/processor?state=empty']) {
      await page.goto(path);
      await oneSignOut(page, path);
    }
    await axeClean(page);
  });
});

/** The shared not-found card (DES-104, DES-011): a 404 on the dark ground, an h1 in a main, a way home. */
async function styledNotFound(page: Page, url: string, o: { title: string; back: string; href: string }) {
  const res = await page.goto(url);
  expect(res!.status(), url).toBe(404);
  const card = page.getByTestId('not-found');
  await expect(card, url).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 }), url).toHaveText(o.title);
  await expect(card.getByRole('link', { name: o.back }), url).toHaveAttribute('href', o.href);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg, url).not.toBe('rgb(255, 255, 255)');
  await expect(page, url).toHaveTitle('Not found · Udgam');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, url).toBeLessThanOrEqual(page.viewportSize()!.width);
  const { violations } = await new AxeBuilder({ page }).analyze();
  // serious/critical, plus the moderate landmark and heading rules Next's default 404 failed
  expect(
    violations.filter((v) => v.impact === 'serious' || v.impact === 'critical' || ['landmark-one-main', 'region', 'page-has-heading-one'].includes(v.id)).map((v) => v.id),
    url,
  ).toEqual([]);
}

const PAGE = 'We can’t find that page.';

test.describe('DES-104 / DES-011 one styled not-found', () => {
  test('admin: unknown batch, run and plot inside the shell, back to Review; any unknown URL', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    for (const url of ['/admin/batches/B-NOPE0000', '/admin/review/VR-NOPE00000000', '/admin/plots/PL-NOPE0000']) {
      await styledNotFound(page, url, { title: PAGE, back: 'Back to Review', href: '/admin' });
      await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(1);
    }
    await styledNotFound(page, '/no-such-page', { title: PAGE, back: 'Go to your home screen', href: '/' });
    await page.getByRole('link', { name: 'Go to your home screen' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('buyer and processor: unknown batch, back to Batches', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await styledNotFound(page, '/buyer/batches/B-NOPE0000', { title: PAGE, back: 'Back to Batches', href: '/buyer' });
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    await styledNotFound(page, '/processor/batches/B-NOPE0000', { title: PAGE, back: 'Back to Batches', href: '/processor' });
  });

  test('signed out: an unknown URL is styled and goes to sign-in', async ({ page }) => {
    await styledNotFound(page, '/no-such-page', { title: PAGE, back: 'Go to your home screen', href: '/' });
    await page.getByRole('link', { name: 'Go to your home screen' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('field: a missing picking says so, keeps the tab bar and goes back to Pickings', async ({ page, context }) => {
    const seed = seedCaptureWorld();
    await openField(page, context, seed);
    await styledNotFound(page, '/field/pickings/EV-NOPE00000000', { title: 'We can’t find that picking.', back: 'Back to Pickings', href: '/field/pickings' });
    await expect(page.getByTestId('not-found')).toContainText('Your saved pickings are safe on this phone.');
    await expect(page.locator('nav').last()).toBeVisible();
    await page.getByRole('link', { name: 'Back to Pickings' }).click();
    await expect(page).toHaveURL(/\/field\/pickings$/);
  });
});
