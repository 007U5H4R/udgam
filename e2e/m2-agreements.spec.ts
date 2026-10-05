import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import type { SeededAgreements } from './helpers/seed-agreements';
import { E2E_DATA_DIR } from './helpers/tracer';

// @eval EVAL-105 · TC-085 (TKT-25, TSK-25.8): the agreement and settlement screens of the M-002
// addendum (Design.md §28, final/contract.html) at every viewport project (320, 375, 768, 1440): no
// horizontal scroll, axe without serious or critical violations, the four states, the field checks
// (aria-invalid + aria-describedby, §28.7), the action working and action-error states (§28.6), the
// settlement panel with each condition as value vs threshold, "released" in --ok and "not released" in
// --check naming the condition, exactly one primary pill per screen at 1440 (A6/Q10), and the M-001
// touch points T1–T3. The e2e server has no chain: actions answer with the "ledger didn't answer"
// state, which is one of the designed states; the chain path itself is EVAL-093–099 (evm project).

// Each test signs in, walks several states and runs axe on each: slow under a loaded machine.
test.describe.configure({ timeout: 120_000 });

let seeded: SeededAgreements;

function seed(): SeededAgreements {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const out = execFileSync('./node_modules/.bin/tsx', ['e2e/helpers/seed-agreements.ts'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededAgreements;
}

test.beforeAll(() => {
  seedAccounts();
  seeded = seed();
});

async function checkSurface(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1100;

/** Visible glowing (primary) pills: the radial glow is on the primary pill only (rule of light). */
async function primaryPills(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll('a, button')].filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.backgroundImage.includes('radial-gradient') && !s.backgroundImage.includes('242, 184, 75');
    }).length,
  );
}

const asBuyer = (page: Page) => signIn(page, seeded.buyerEmail, seeded.testOnlyPassword);
const asAdmin = (page: Page, email: string) => signIn(page, email, seeded.testOnlyPassword);

test.describe('buyer agreements (Design.md §28.1 screens 1–4)', () => {
  test('T1: Batches header links to Agreements; the list shows every agreement with its status mark', async ({ page }) => {
    await asBuyer(page);
    await page.goto('/buyer');
    await page.getByTestId('agreements-link').click();
    await expect(page).toHaveURL(/\/buyer\/agreements$/);
    await expect(page.getByRole('heading', { level: 1, name: /Agreements/ })).toBeVisible();
    const list = page.getByRole('list', { name: 'Your agreements' });
    await expect(list.getByRole('link')).toHaveCount(7);
    await expect(list.locator(`[data-agreement="${seeded.created.id}"]`)).toContainText('Not funded yet');
    await expect(list.locator(`[data-agreement="${seeded.refund.id}"]`)).toContainText('Deadline passed · you can take it back');
    await expect(list.locator(`[data-agreement="${seeded.toGrade.id}"]`)).toContainText('Delivered · needs your grade');
    await expect(list.locator(`[data-agreement="${seeded.released.id}"]`)).toContainText('Payment released');
    await expect(list.locator(`[data-agreement="${seeded.notReleased.id}"]`)).toContainText('Not released yet · 1 condition not met');
    await expect(list.locator(`[data-agreement="${seeded.created.id}"]`)).toContainText('₹2,40,000.00');
    // the buyer has no rail and no tab bar (§5)
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toHaveCount(0);
    expect(await primaryPills(page)).toBe(1);
    await checkSurface(page);
  });

  test('DES-101: after grading, the buyer sees the FPO settles next, the delivered batch and the signed grade', async ({ page }) => {
    await asBuyer(page);
    await page.goto('/buyer/agreements');
    await expect(page.locator(`[data-agreement="${seeded.ready.id}"]`)).toContainText('Graded · waiting for the FPO to settle');
    await page.goto(`/buyer/agreements/${seeded.ready.id}`);
    await expect(page.locator('.d-title .vchip')).toHaveText('Waiting for the FPO to settle');
    await expect(page.getByRole('heading', { name: 'Delivered batch' })).toBeVisible();
    await expect(page.getByTestId('grade-card')).toContainText('You graded it Very good · 80.');
    await expect(page.getByTestId('grade-card')).toContainText(`${seeded.ready.fpoName} settles it next.`);
    await expect(page.getByRole('radio')).toHaveCount(0); // read-only: no grade form
    await checkSurface(page);
  });

  for (const state of ['loading', 'empty', 'error'] as const) {
    test(`list ${state} state`, async ({ page }) => {
      await asBuyer(page);
      await page.goto(`/buyer/agreements?state=${state}`);
      const text = { loading: 'Loading your agreements…', empty: 'No agreements yet.', error: 'Couldn’t load your agreements.' }[state];
      await expect(page.getByText(text)).toBeVisible();
      if (state === 'error') await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
      if (state === 'empty') await expect(page.getByTestId('new-agreement')).toBeVisible();
      await checkSurface(page);
    });
  }

  test('new agreement: field checks on submit (aria-invalid, describedby, focus), values kept; ledger down → create error; working', async ({ page }) => {
    await asBuyer(page);
    await page.goto('/buyer/agreements/new');
    await expect(page.getByRole('heading', { level: 2, name: 'New agreement' })).toBeVisible();
    if (wide(page)) expect(await primaryPills(page)).toBe(1); // the list's "New agreement" is a ghost beside the form
    await page.getByLabel('Amount (mock INR)').fill('1,50,000.505');
    await page.getByLabel('Deadline').fill('2020-01-01');
    await page.getByTestId('action-pill').click();
    const kg = page.getByLabel('Agreed quantity (kg)');
    await expect(kg).toHaveAttribute('aria-invalid', 'true');
    await expect(kg).toBeFocused();
    await expect(kg).toHaveAttribute('aria-describedby', 'f-kg-e f-kg-h');
    await expect(page.locator('#f-kg-e')).toHaveText('Enter the agreed quantity in kg, for example 600.0.');
    await expect(page.locator('#f-min-e')).toHaveText('Choose the lowest grade you accept.');
    await expect(page.locator('#f-amt-e')).toHaveText('Paise take two digits at most, for example 150000.50.');
    await expect(page.locator('#f-by-e')).toHaveText('Choose a date after today.');
    await expect(page.getByLabel('Amount (mock INR)')).toHaveValue('1,50,000.505');
    await checkSurface(page);

    await kg.fill('600.0');
    await expect(kg).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Minimum grade').selectOption('70');
    await page.getByLabel('Amount (mock INR)').fill('150000');
    await expect(page.locator('#f-amt-h')).toHaveText('Reads as ₹1,50,000.00 (mock INR). No real money moves.');
    await page.getByLabel('Deadline').fill('2099-12-31');
    await expect(page.locator('#f-by-h')).toContainText('Open until 31 Dec 2099, end of the day (IST).');
    await page.getByTestId('action-pill').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t create the agreement.' })).toBeVisible();
    await expect(page.getByTestId('action-pill')).toHaveText('Try again');
    await expect(page.getByLabel('Agreed quantity (kg)')).toHaveValue('600.0');
    await checkSurface(page);

    await page.goto('/buyer/agreements/new?state=working');
    await expect(page.getByTestId('action-pill')).toBeDisabled();
    await expect(page.getByTestId('action-pill')).toHaveText('Creating the agreement…');
    await checkSurface(page);
    for (const state of ['loading', 'empty'] as const) {
      await page.goto(`/buyer/agreements/new?state=${state}`);
      if (state === 'empty') await expect(page.getByText('No FPO to agree with yet.')).toBeVisible();
      await checkSurface(page);
    }
  });

  test('fund: what moves where and the three conditions; ledger down → fund error, nothing moved; working', async ({ page }) => {
    await asBuyer(page);
    await page.goto(`/buyer/agreements/${seeded.created.id}`);
    const panel = page.locator('form.decide');
    await expect(panel.getByRole('heading', { name: 'Fund this agreement' })).toBeVisible();
    await expect(panel).toContainText('₹2,40,000.00 (mock INR) moves from your balance into escrow.');
    await expect(panel).toContainText('At least 1,200.0 kg is delivered.');
    await expect(panel).toContainText('Your grade for the batch is at least Fair · 60.');
    await expect(panel).toContainText('Every picking in the batch is Verified.');
    if (wide(page)) expect(await primaryPills(page)).toBe(1);
    await page.getByTestId('action-pill').click();
    await expect(panel.getByRole('alert')).toContainText('Couldn’t fund the agreement.The ledger didn’t answer, so nothing moved. Your balance is unchanged.');
    await expect(page.getByTestId('action-pill')).toHaveText('Try again');
    await expect(page.locator('.d-title .vchip')).toHaveText('Not funded yet');
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.created.id}?state=working`);
    await expect(page.getByTestId('action-pill')).toHaveText('Moving ₹2,40,000.00 into escrow…');
    await expect(page.getByTestId('action-pill')).toBeDisabled();
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.created.id}?state=loading`);
    await checkSurface(page);
  });

  test('take the money back after the deadline; ledger down → refund error', async ({ page }) => {
    await asBuyer(page);
    await page.goto(`/buyer/agreements/${seeded.refund.id}`);
    const panel = page.locator('form.decide');
    await expect(panel.getByRole('heading', { name: 'Take the money back' })).toBeVisible();
    await expect(page.getByTestId('action-pill')).toHaveText('Take back ₹1,00,000.00');
    await page.getByTestId('action-pill').click();
    await expect(panel.getByRole('alert')).toContainText('The ₹1,00,000.00 (mock INR) is still in escrow.');
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.refund.id}?state=working`);
    await expect(page.getByTestId('action-pill')).toHaveText('Moving ₹1,00,000.00 back to your balance…');
    await checkSurface(page);
  });

  test('grade a delivered batch: field check, below-minimum marks, ledger down → grade error; no batch yet → empty', async ({ page }) => {
    await asBuyer(page);
    await page.goto(`/buyer/agreements/${seeded.toGrade.id}`);
    await expect(page.getByRole('heading', { name: `Grade batch ${seeded.toGrade.batchId}` })).toBeVisible();
    await expect(page.getByText('Below the agreed minimum')).toHaveCount(2);
    await page.getByTestId('action-pill').click();
    await expect(page.locator('#gr-e')).toHaveText('Choose one of the five grades.');
    await expect(page.getByRole('group', { name: 'Quality grade' })).toHaveAttribute('aria-describedby', 'gr-e gr-n');
    await expect(page.getByRole('radio').first()).toHaveAttribute('aria-invalid', 'true');
    await checkSurface(page);
    await page.getByRole('radio', { name: /Very good/ }).check();
    await expect(page.getByTestId('action-pill')).toHaveText('Sign: Very good · 80');
    await page.getByTestId('action-pill').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t save the grade.' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Very good/ })).toBeChecked();
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.toGrade.id}?state=working`);
    await expect(page.getByTestId('action-pill')).toHaveText('Signing the grade…');
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.waiting.id}`);
    await expect(page.getByText('No batch delivered yet.')).toBeVisible();
    await checkSurface(page);
  });

  test('read-only results: released and not released, conditions as value vs threshold', async ({ page }) => {
    await asBuyer(page);
    await page.goto(`/buyer/agreements/${seeded.notReleased.id}`);
    const out = page.locator('[data-outcome="not_released"]');
    await expect(out).toContainText('1 condition is not met: delivered quantity (598.5 kg of 600.0 kg).');
    await expect(out).toContainText('Your ₹1,50,000.00 (mock INR) stays in escrow.');
    await expect(page.locator('[data-condition="quantity"]')).toContainText('598.5 kg delivered · at least 600.0 kg agreed (1.5 kg short)');
    await expect(page.locator('[data-condition="quantity"] .c-stat')).toHaveText('Not met');
    await checkSurface(page);
    await page.goto(`/buyer/agreements/${seeded.released.id}`);
    await expect(page.locator('[data-outcome="released"]')).toContainText('Payment released');
    await checkSurface(page);
  });

  test("another organisation's agreement is not found, like an unknown id (EVAL-080)", async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    for (const id of [seeded.created.id, 'AG-NOSUCH00']) {
      const res = await page.goto(`/buyer/agreements/${id}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByText(`There’s no agreement ${id} for your account.`)).toBeVisible();
    }
    await checkSurface(page);
  });
});

test.describe('FPO admin agreements and settlement (Design.md §28.1 screen 5)', () => {
  test('T2: Batches header links to Agreements with buyers; list states', async ({ page }) => {
    await asAdmin(page, seeded.ready.adminEmail);
    await page.goto('/admin/batches');
    await page.getByTestId('agreements-link').click();
    await expect(page).toHaveURL(/\/admin\/agreements$/);
    await expect(page.getByRole('heading', { level: 1, name: /Agreements with buyers/ })).toBeVisible();
    await expect(page.locator(`[data-agreement="${seeded.ready.id}"]`)).toContainText('Ready to settle');
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page');
    await checkSurface(page);
    for (const state of ['loading', 'empty', 'error'] as const) {
      await page.goto(`/admin/agreements?state=${state}`);
      await expect(page.locator(`[data-state="${state}"]`).first()).toBeVisible();
      await checkSurface(page);
    }
  });

  test('ready: three conditions before settling; ledger down → nothing judged, chip stays Ready to settle; working', async ({ page }) => {
    await asAdmin(page, seeded.ready.adminEmail);
    await page.goto(`/admin/agreements/${seeded.ready.id}`);
    await expect(page.locator('.d-title .vchip')).toHaveText('Ready to settle');
    await expect(page.getByTestId('conditions')).toContainText('Before settling: 3 of 3 met');
    await expect(page.locator('[data-condition="quantity"]')).toContainText('612.0 kg delivered · at least 600.0 kg agreed');
    await expect(page.locator('[data-condition="grade"]')).toContainText('Graded Very good · 80 · minimum Good · 70');
    await expect(page.locator('[data-condition="all_verified"]')).toContainText('2 of 2 pickings Verified · all must be Verified');
    await expect(page.getByText('The contract does the arithmetic.')).toBeVisible();
    if (wide(page)) expect(await primaryPills(page)).toBe(1);
    const pill = page.getByTestId('action-pill');
    // DES-114: a short sticky label that stays on one line; the FPO is named in the hint above it.
    await expect(pill).toHaveText('Settle · ₹1,50,000.00');
    expect((await pill.boundingBox())!.height).toBeLessThanOrEqual(60);
    await expect(page.getByText(`The ledger checks all three conditions again before it pays ${seeded.ready.fpoName}.`)).toBeVisible();
    await pill.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t settle.' })).toContainText('nothing moved and the conditions were not judged');
    await expect(page.locator('.d-title .vchip')).toHaveText('Ready to settle');
    await expect(page.locator('[data-outcome]')).toHaveCount(0);
    await checkSurface(page);
    await page.goto(`/admin/agreements/${seeded.ready.id}?state=working`);
    await expect(page.getByText('Settling: sending the three conditions to the ledger…')).toBeVisible();
    await expect(page.getByTestId('action-pill')).toHaveText('Settling…');
    await checkSurface(page);
  });

  test('ready: the ledger turns the settle away → its own words, nothing judged, chip stays Ready to settle', async ({ page }) => {
    await asAdmin(page, seeded.ready.adminEmail);
    await page.goto(`/admin/agreements/${seeded.ready.id}?state=turned-away`);
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t settle.' })).toContainText(
      'The ledger turned the request away before judging the conditions, so nothing moved. Try again; if it happens again, tell the Udgam team.',
    );
    await expect(page.locator('.d-title .vchip')).toHaveText('Ready to settle');
    await expect(page.getByTestId('action-pill')).toHaveText('Try again');
    await expect(page.locator('[data-outcome]')).toHaveCount(0);
    await checkSurface(page);
  });

  test('T3: a batch delivered under an agreement shows its card before it is graded', async ({ page }) => {
    await asAdmin(page, seeded.toGrade.adminEmail);
    await page.goto(`/admin/batches/${seeded.toGrade.batchId}`);
    await expect(page.getByTestId('agreement-card')).toContainText(`${seeded.toGrade.id} with ${seeded.buyerOrgName}`);
    await expect(page.getByTestId('agreement-card')).toContainText('Waiting for the grade');
    await checkSurface(page);
  });

  test('released (--ok) and not released (--check naming the condition)', async ({ page }) => {
    await asAdmin(page, seeded.released.adminEmail);
    await page.goto(`/admin/agreements/${seeded.released.id}`);
    const rel = page.locator('[data-outcome="released"]');
    await expect(rel).toContainText('Payment released');
    await expect(rel).toContainText('₹1,50,000.00');
    await expect(rel).toContainText('All three conditions were met.');
    await expect(rel.locator('.vchip')).toHaveAttribute('data-status', 'ok');
    await checkSurface(page);
    // T3: the batch detail links to its agreement
    await page.goto(`/admin/batches/${seeded.released.batchId}`);
    await expect(page.getByTestId('agreement-card')).toContainText(`${seeded.released.id} with ${seeded.buyerOrgName}`);
    await expect(page.getByTestId('agreement-card')).toContainText('Payment released');
    await checkSurface(page);

    await page.context().clearCookies();
    await asAdmin(page, seeded.notReleased.adminEmail);
    await page.goto(`/admin/agreements/${seeded.notReleased.id}`);
    const not = page.locator('[data-outcome="not_released"]');
    await expect(not).toContainText('Not released');
    await expect(not.locator('.vchip')).toHaveAttribute('data-status', 'check');
    await expect(not).toContainText('delivered quantity (598.5 kg of 600.0 kg)');
    await expect(not).toContainText('The ₹1,50,000.00 (mock INR) stays in escrow.');
    await checkSurface(page);
  });

  test("another FPO's agreement is not found (EVAL-080)", async ({ page }) => {
    await asAdmin(page, seeded.ready.adminEmail);
    const res = await page.goto(`/admin/agreements/${seeded.released.id}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText(`There’s no agreement ${seeded.released.id} for your account.`)).toBeVisible();
    await checkSurface(page);
  });
});
