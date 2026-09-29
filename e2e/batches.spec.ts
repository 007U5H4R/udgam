import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { SeededBatches } from './helpers/seed-batches';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { E2E_DATA_DIR } from './helpers/tracer';

// TKT-14 (TC-059/TC-060 through the screens, EVAL-080) with TC-080 (no horizontal scroll) and TC-081
// (axe) on every batch screen in its four states. Each Playwright project is one viewport (320, 375,
// 768, 1440). Every test seeds its own pickings (new random IDs) into the shared e2e database.

test.beforeAll(() => seedAccounts());

function seedBatches(transferTo?: string): SeededBatches {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const args = ['e2e/helpers/seed-batches.ts', ...(transferTo ? ['--transfer-to', transferTo] : [])];
  const out = execFileSync('./node_modules/.bin/tsx', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededBatches;
}

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function noSeriousAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

async function checkSurface(page: Page) {
  await noHorizontalScroll(page);
  await noSeriousAxeViolations(page);
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1100;

test.describe('admin batches (TSK-14.5, TC-059, TC-060)', () => {
  test('build a batch of one crop, see its members and certificate link, transfer it, and it locks', async ({ page }) => {
    test.setTimeout(90_000);
    const seeded = seedBatches();
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);

    await page.goto('/admin/batches/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New batch' })).toBeVisible();
    const pill = page.getByRole('button', { name: /^(Create batch|Choose pickings)/ });
    await expect(pill).toHaveText('Choose pickings');
    await expect(pill).toBeDisabled();
    const robusta = page.locator(`#pick-${seeded.robusta}`);
    await expect(robusta).toBeEnabled();

    // choosing an arabica picking disables the robusta rows
    await page.locator(`#pick-${seeded.arabica[0]}`).check();
    await expect(robusta).toBeDisabled();
    await expect(page.getByText('Another crop: a batch holds one crop.').first()).toBeVisible();
    await expect(pill).toHaveText('Create batch · 1 picking · 40 kg');
    for (const id of seeded.arabica.slice(1)) await page.locator(`#pick-${id}`).check();
    await expect(pill).toHaveText('Create batch · 3 pickings · 128.5 kg');
    await checkSurface(page);

    await pill.click();
    await expect(page).toHaveURL(/\/admin\/batches\/B-[0-9A-Z]{8}$/);
    const batchId = new URL(page.url()).pathname.split('/').pop()!;

    // detail: members, totals, certificate link and the transfer form
    await expect(page.getByRole('heading', { level: 2, name: batchId })).toBeVisible();
    await expect(page.getByText('Score 84 of 100')).toBeVisible();
    await expect(page.getByText('128.5 kg of arabica cherry · 3 pickings')).toBeVisible();
    const members = page.getByRole('region', { name: 'Pickings in this batch' }).getByRole('listitem');
    await expect(members).toHaveCount(3);
    await expect(members.first()).toContainText(seeded.producerIds[0]!);
    const certificate = page.getByRole('link', { name: 'Open the certificate' });
    await expect(certificate).toHaveAttribute('href', new RegExp(`^/verify/${batchId}\\?h=[0-9a-f]{12}$`));
    // the link's h is the batch's short hash: the proof feed answers for it
    const feed = await page.request.get((await certificate.getAttribute('href'))!.replace('/verify/', '/api/verify/'));
    expect(feed.status()).toBe(200);
    expect((await feed.json()).batchId).toBe(batchId);

    const form = page.getByRole('form', { name: 'Transfer custody' });
    await expect(form).toBeVisible();
    await expect(form.getByText('This is signed and recorded permanently.', { exact: false })).toBeVisible();
    const transfer = form.getByRole('button', { name: 'Sign and transfer' });
    await expect(transfer).toBeDisabled();
    await checkSurface(page);

    await form.getByLabel('Buyer').selectOption({ label: 'Demo Buyer A' });
    await transfer.click();

    // after the transfer the form is replaced by the custody line
    const custody = page.getByTestId('custody-line');
    await expect(custody).toContainText('Hosahalli FPO → Demo Buyer A');
    await expect(custody).toContainText('Locked: this batch can no longer change.');
    await expect(page.getByRole('form', { name: 'Transfer custody' })).toHaveCount(0);
    await checkSurface(page);

    // the list shows it transferred, with crop, kg, score and pickings
    await page.goto('/admin/batches');
    const row = page.locator(`[data-batch-id="${batchId}"]`);
    await expect(row).toContainText('128.5 kg');
    await expect(row).toContainText('Arabica · 3 pickings · score 84');
    await expect(row).toContainText('Transferred');
    await checkSurface(page);
  });

  test('a picking already in a batch is gone from the builder', async ({ page }) => {
    const seeded = seedBatches('ORG-BUYER-A');
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await page.goto('/admin/batches/new');
    await expect(page.locator(`#pick-${seeded.robusta}`)).toBeVisible();
    for (const id of seeded.arabica) await expect(page.locator(`#pick-${id}`)).toHaveCount(0);
  });

  test("another FPO's batch is a 404 (EVAL-080)", async ({ page }) => {
    const seeded = seedBatches('ORG-BUYER-A');
    await signIn(page, DEMO_ACCOUNTS.adminB.email, SEED_PASSWORD);
    const res = await page.goto(`/admin/batches/${seeded.batch!.batchId}`);
    expect(res?.status()).toBe(404);
    await page.goto('/admin/batches');
    await expect(page.locator(`[data-batch-id="${seeded.batch!.batchId}"]`)).toHaveCount(0);
  });

  for (const path of ['/admin/batches', '/admin/batches/new']) {
    test(`${path} in all four states (TC-080, TC-081)`, async ({ page }) => {
      test.setTimeout(90_000);
      seedBatches('ORG-BUYER-A');
      await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
      await page.goto(path);
      await expect(page.locator('ul[aria-label]').first()).toBeVisible();
      if (path === '/admin/batches' && isDesktop(page)) await expect(page.getByText('Choose a batch to see its pickings and transfer it.')).toBeVisible();
      await checkSurface(page);

      await page.goto(`${path}?state=loading`);
      await expect(page.locator('[data-state="loading"]')).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Loading the batches…');
      await checkSurface(page);

      await page.goto(`${path}?state=empty`);
      await expect(page.locator('[data-state="empty"]')).toBeVisible();
      await checkSurface(page);

      await page.goto(`${path}?state=error`);
      const alert = page.locator('[data-state="error"]');
      await expect(alert).toContainText("Couldn't load the batches.");
      await expect(alert).toContainText('Nothing was changed.');
      await expect(alert.getByRole('link', { name: 'Try again' })).toBeVisible();
      await checkSurface(page);
    });
  }

  test('buyers and agents cannot open the admin batch screens (TC-018)', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    for (const path of ['/admin/batches', '/admin/batches/new', '/admin/batches/B-00000000']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/buyer$/);
    }
  });
});
