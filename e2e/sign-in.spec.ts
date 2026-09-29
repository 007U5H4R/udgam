import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';

// TC-020 (sign-in and sign-out; /verify stays public), with TC-080 (no horizontal scroll) and TC-081
// (axe) for the sign-in screen and the signed-in shells. Each Playwright project is one viewport
// (320, 375, 768, 1440).

test.beforeAll(() => seedAccounts());

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function noSeriousAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

test.describe('TC-020 sign-in', () => {
  for (const [who, account, home, heading] of [
    ['agent', DEMO_ACCOUNTS.agentA, '/field', 'Home'],
    ['admin', DEMO_ACCOUNTS.adminA, '/admin', 'Review'],
    ['buyer', DEMO_ACCOUNTS.buyerA, '/buyer', 'Batches'],
  ] as const) {
    test(`the ${who} signs in and lands on ${home}; TC-080/TC-081 on that shell`, async ({ page }) => {
      await signIn(page, account.email, SEED_PASSWORD);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await noHorizontalScroll(page);
      await noSeriousAxeViolations(page);
      // `/` sends a signed-in user home too
      await page.goto('/');
      await expect(page).toHaveURL(new RegExp(`${home}$`));
    });
  }

  test('a wrong password or an unknown email shows one inline error that never says which field was wrong', async ({ page }) => {
    for (const [email, password] of [
      [DEMO_ACCOUNTS.adminA.email, 'not the password'],
      ['nobody@hosahalli.udgam.test', SEED_PASSWORD],
    ]) {
      await page.goto('/sign-in');
      await expect(page.locator('#sign-in-error')).toHaveText('');
      await page.getByLabel('Email').fill(email!);
      await page.getByLabel('Password').fill(password!);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.locator('#sign-in-error')).toHaveText('Email or password is not right.');
      await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
      await expect(page).toHaveURL(/\/sign-in$/);
    }
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page); // the error state
  });

  test('sign-out clears the session', async ({ page, context }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await context.cookies()).filter((c) => c.name.includes('session_token'))).toEqual([]);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('signed-out navigation to /field, /admin or /buyer goes to sign-in', async ({ page }) => {
    for (const path of ['/field', '/admin', '/buyer', '/field/tracer', '/']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in$/);
    }
  });

  test("a signed-in user on another role's surface is sent to their own home", async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/buyer$/);
    await page.goto('/field');
    await expect(page).toHaveURL(/\/buyer$/);
    await page.goto('/sign-in'); // already signed in
    await expect(page).toHaveURL(/\/buyer$/);
  });

  test('a certificate URL opens signed out: /verify/* is public (a 404 page, never sign-in)', async ({ page }) => {
    const res = await page.goto('/verify/anything?h=abc');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/verify\/anything\?h=abc$/);
    const health = await page.request.get('/api/health');
    expect(health.status()).toBeLessThan(400);
  });

  test('the sign-in screen: one primary pill, labelled fields, no horizontal scroll, no serious axe violations (TC-080, TC-081)', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Udgam');
    await expect(page.getByRole('button')).toHaveCount(1);
    await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeInViewport();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });
});
