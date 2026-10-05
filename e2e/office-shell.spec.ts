import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';

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
