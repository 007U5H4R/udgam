import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { SeededBatches } from './helpers/seed-batches';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { E2E_DATA_DIR } from './helpers/tracer';

// TKT-14 (TC-059/TC-060 through the screens, EVAL-080) with TC-080 (no horizontal scroll) and TC-081
// (axe) on every batch screen in its four states. Each Playwright project is one viewport (320, 375,
// 768, 1440). Every test seeds its own FPO, admin and pickings (e2e/helpers/seed-batches.ts) into the
// shared e2e database, so parallel workers never crowd the demo FPO's lists.

test.beforeAll(() => seedAccounts());

function seedBatches(transferTo?: string, attestIssuer?: string): SeededBatches {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const args = ['e2e/helpers/seed-batches.ts', ...(transferTo ? ['--transfer-to', transferTo] : []), ...(attestIssuer ? ['--attest', attestIssuer] : [])];
  const out = execFileSync('./node_modules/.bin/tsx', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededBatches;
}

async function noHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
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

/** TKT-05's admin rail (a floating tab bar below 700 px) is present with Batches current. */
async function expectRail(page: Page) {
  const rail = page.getByRole('navigation', { name: 'Admin sections' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page');
}

/** The primary pill is not covered by the rail or tab bar (on phones the tab bar floats at the bottom). */
async function notCoveredByRail(page: Page, pill: Locator) {
  // At the end of the page (where the shell leaves room below the content) and for a sticky pill anywhere.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const a = (await pill.boundingBox())!;
  const b = (await page.getByRole('navigation', { name: 'Admin sections' }).boundingBox())!;
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlap, `pill ${JSON.stringify(a)} vs rail ${JSON.stringify(b)}`).toBe(false);
}

test.describe('admin batches (TSK-14.5, TC-059, TC-060)', () => {
  test('build a batch of one crop, see its members and certificate link, transfer it, and it locks', async ({ page }) => {
    test.setTimeout(90_000);
    const seeded = seedBatches();
    await signIn(page, seeded.adminEmail, seeded.testOnlyAdminPassword);

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
    await expectRail(page);
    await notCoveredByRail(page, pill);
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
    await expect(transfer).toBeEnabled();
    await expectRail(page);
    await notCoveredByRail(page, transfer);
    await checkSurface(page);
    // DES-109 (§28.7): nothing chosen → the field check under the select, focus on it, nothing recorded
    await transfer.click();
    const select = form.getByLabel('Hand to');
    await expect(form.locator('#transfer-err')).toHaveText('Choose a buyer or processor from the list.');
    await expect(select).toHaveAttribute('aria-invalid', 'true');
    await expect(select).toBeFocused();
    await expect(page.getByTestId('custody-line')).toHaveCount(0);

    await form.getByLabel('Hand to').selectOption({ label: 'Demo Buyer A' }); // M-002 T4: the label was "Buyer"
    await transfer.click();

    // after the transfer the form is replaced by the custody line
    const custody = page.getByTestId('custody-line');
    await expect(custody).toContainText(`${seeded.orgName} → Demo Buyer A`);
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
    await signIn(page, seeded.adminEmail, seeded.testOnlyAdminPassword);
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
      const seeded = seedBatches('ORG-BUYER-A');
      await signIn(page, seeded.adminEmail, seeded.testOnlyAdminPassword);
      await page.goto(path);
      await expectRail(page);
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

test.describe('buyer list and detail (TSK-14.6, TC-060, EVAL-080)', () => {
  test('buyer A sees its batch with score, quantity, plots, custody chain and certificate link', async ({ page }) => {
    test.setTimeout(90_000);
    const seeded = seedBatches('ORG-BUYER-A');
    const { batchId, shortHash } = seeded.batch!;
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/buyer$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toHaveCount(0); // buyers have no admin rail
    const row = page.locator(`[data-batch-id="${batchId}"]`);
    await expect(row).toContainText('128.5 kg');
    await expect(row).toContainText('Arabica · 1 plot · score 84');
    await expect(row).toContainText(`From ${seeded.orgName}`);
    await checkSurface(page);

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/buyer/batches/${batchId}$`));
    await expect(page.getByRole('heading', { level: 2, name: batchId })).toBeVisible();
    await expect(page.getByText('Score 84 of 100')).toBeVisible();
    await expect(page.getByText('128.5 kg of arabica cherry · 3 pickings · 1 plot')).toBeVisible();
    const plots = page.getByRole('region', { name: 'Plots and producers' });
    await expect(plots).toContainText(`producer ${seeded.producerIds[0]}`);
    await expect(page.getByTestId('custody-chain')).toContainText(`${seeded.orgName} → Demo Buyer A`);
    await expect(page.locator('body')).not.toContainText('Test farmer'); // producer IDs only (EV16)
    const certificate = page.getByTestId('certificate-link');
    await expect(certificate).toHaveText('Open the certificate');
    await expect(certificate).toHaveAttribute('href', `/verify/${batchId}?h=${shortHash}`);
    // TSK-16.7 (TC-069): the certificate QR card carries the absolute link with h
    await expect(page.getByTestId('batch-qr')).toContainText(`/verify/${batchId}?h=${shortHash}`);
    await expect(page.getByTestId('batch-qr').locator('svg')).toBeVisible();
    // The certificate page itself arrives with TKT-16; its data is the proof feed, served for this h.
    const feed = await page.request.get(`/api/verify/${batchId}?h=${shortHash}`);
    expect(feed.status()).toBe(200);
    expect((await feed.json()).shortHash).toBe(shortHash);
    await checkSurface(page);

    // TKT-16 (carried from TKT-14 / QA-P4): the link opens the public certificate, and the buyer's own
    // browser verifies its proof
    await certificate.click();
    await expect(page).toHaveURL(new RegExp(`/verify/${batchId}\\?h=${shortHash}$`));
    await expect(page.locator('body')).toHaveAttribute('data-state', 'verified', { timeout: 20_000 });
    await expect(page.getByText('Verified on this device just now')).toBeVisible();
  });

  test('the organic line shows on both batch detail pages for an attested member plot, and only there (QA-P5-2, TC-058)', async ({ page }) => {
    test.setTimeout(90_000);
    const LINE = 'Certified by E2E Organic Body — certificate on record · valid 1 Jan 2026–1 Jan 2036';
    const attested = seedBatches('ORG-BUYER-A', 'E2E Organic Body');
    // another FPO's batch, also held by buyer A, has no certificate on record: the first FPO's never shows on it
    const plain = seedBatches('ORG-BUYER-A');
    /** Sign in as someone else in this project's own page (its viewport kept). */
    const signInAs = async (email: string, password: string) => {
      await page.context().clearCookies();
      await signIn(page, email, password);
    };

    await signInAs(attested.adminEmail, attested.testOnlyAdminPassword);
    await page.goto(`/admin/batches/${attested.batch!.batchId}`);
    const members = page.getByRole('region', { name: 'Pickings in this batch' });
    await expect(members.getByTestId('attestation-line')).toHaveCount(3); // one per picking of the attested plot
    await expect(members.getByTestId('attestation-line').first()).toHaveText(LINE);
    await expect(members.getByTestId('attestation-line').first().locator('bdi')).toHaveText('E2E Organic Body');
    await checkSurface(page);

    await signInAs(plain.adminEmail, plain.testOnlyAdminPassword);
    await page.goto(`/admin/batches/${plain.batch!.batchId}`);
    await expect(page.getByRole('heading', { level: 2, name: plain.batch!.batchId })).toBeVisible();
    await expect(page.getByTestId('attestation-line')).toHaveCount(0);

    await signInAs(DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await page.goto(`/buyer/batches/${attested.batch!.batchId}`);
    const plots = page.getByRole('region', { name: 'Plots and producers' });
    await expect(plots.getByTestId('attestation-line')).toHaveCount(1);
    await expect(plots.getByTestId('attestation-line')).toHaveText(LINE);
    await checkSurface(page);
    await page.goto(`/buyer/batches/${plain.batch!.batchId}`);
    await expect(page.getByRole('heading', { level: 2, name: plain.batch!.batchId })).toBeVisible();
    await expect(page.getByTestId('attestation-line')).toHaveCount(0);
  });

  test("buyer B does not see buyer A's batch, and opening it is a 404 (EVAL-080, TC-019)", async ({ page }) => {
    const seeded = seedBatches('ORG-BUYER-A');
    await signIn(page, DEMO_ACCOUNTS.buyerB.email, SEED_PASSWORD);
    await expect(page.locator(`[data-batch-id="${seeded.batch!.batchId}"]`)).toHaveCount(0);
    const res = await page.goto(`/buyer/batches/${seeded.batch!.batchId}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator('body')).not.toContainText(seeded.batch!.batchId);
  });

  test('/buyer in all four states (TC-080, TC-081)', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, DEMO_ACCOUNTS.buyerB.email, SEED_PASSWORD);
    await page.goto('/buyer?state=empty');
    await expect(page.locator('[data-state="empty"]')).toContainText('No batches have been transferred to you yet.');
    await checkSurface(page);

    await page.goto('/buyer?state=loading');
    await expect(page.getByRole('status')).toContainText('Loading the batches…');
    await checkSurface(page);

    await page.goto('/buyer?state=error');
    const alert = page.locator('[data-state="error"]');
    await expect(alert).toContainText("Couldn't load the batches.");
    await expect(alert.getByRole('link', { name: 'Try again' })).toBeVisible();
    await checkSurface(page);

    seedBatches('ORG-BUYER-A');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await expect(page.getByRole('list', { name: 'Batches transferred to you' })).toBeVisible();
    if (isDesktop(page)) await expect(page.getByText('Choose a batch to see its plots, custody and certificate.')).toBeVisible();
    await checkSurface(page);
  });

  test('admins and agents cannot open the buyer screens (TC-018)', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    for (const path of ['/buyer', '/buyer/batches/B-00000000']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin$/);
    }
  });
});
