import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { proofFinalState } from './helpers/certificate';
import type { SeededProcessing } from './helpers/seed-processing';
import { E2E_DATA_DIR } from './helpers/tracer';

// TKT-26 (TSK-26.5, TC-086, @eval EVAL-100–102 through the screens, EVAL-105 processor part): the processor
// records a step, sees the flag, hands the batch on; the certificate shows the step and still verifies.
// Ported from contract.html screen 6 and 7. Each Playwright project is one viewport (320, 375, 768,
// 1440); every screen is checked for no horizontal scroll and axe (no serious or critical violations).
// The demo processor (ORG-PROC-C03, "Processor C-03") is seeded by scripts/seed-accounts.ts; each test
// seeds its own FPO and batch, so parallel workers never share a batch.

const PROCESSOR = DEMO_ACCOUNTS.processorA;
const PROCESSOR_ORG = PROCESSOR.orgId;

test.beforeAll(() => seedAccounts());

function seed(toProcessor: boolean): SeededProcessing {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  delete env.LEDGER_KEY_PATH;
  const args = ['e2e/helpers/seed-processing.ts', ...(toProcessor ? ['--to-processor', PROCESSOR_ORG] : [])];
  const out = execFileSync('./node_modules/.bin/tsx', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededProcessing;
}

async function checkSurface(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test.describe('processor hop (TSK-26.5, TC-086)', () => {
  test('@eval EVAL-101 record a step, see the flag, hand on; the certificate shows the step and still verifies', async ({ page }) => {
    test.setTimeout(120_000);
    const s = seed(true);
    await signIn(page, PROCESSOR.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/processor$/);

    // the list: the batch is with this processor, ready for a step
    const row = page.locator(`a.q-item[data-batch="${s.batchId}"]`);
    await expect(row).toContainText('Ready for a processing step');
    await expect(page.getByRole('heading', { level: 1, name: /Batches with you/ }).first()).toBeAttached();
    await checkSurface(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/processor/batches/${s.batchId}$`));
    await expect(page.getByRole('heading', { level: 2, name: s.batchId })).toBeVisible();
    await expect(page.getByTestId('batch-chip')).toHaveText('With you');

    // field checks on submit (§28.7): messages under the fields, aria-invalid, focus on the first
    const form = page.getByRole('form', { name: 'Record a processing step' });
    await form.getByRole('button', { name: 'Sign and record step' }).click();
    await expect(form.getByText('Choose the process you did.')).toBeVisible();
    await expect(form.getByLabel('Input (kg)')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByText('Enter the output weight in kg, for example 480.0.')).toBeVisible();
    await expect(form.getByRole('radio', { name: /^Pulping/ })).toBeFocused();
    await checkSurface(page);

    // hulling parchment, 600.0 → 420.0 kg: 70.0%, below 75–85% → flagged, recorded
    await form.getByRole('radio', { name: /^Hulling parchment/ }).check();
    await expect(form.getByText('For hulling parchment (Arabica), output is usually 75–85% of input.', { exact: false })).toBeVisible();
    await form.getByLabel('Input (kg)').fill('600.0');
    await form.getByLabel('Output (kg)').fill('420.0');
    await expect(form.getByLabel('Input (kg)')).not.toHaveAttribute('aria-invalid', 'true');
    await form.getByRole('button', { name: 'Sign and record step' }).click();

    const result = page.getByTestId('step-result');
    await expect(result).toContainText('Flagged');
    await expect(result).toContainText('Output 420.0 kg is 70.0% of input 600.0 kg (expected 75–85% for hulling parchment).');
    await expect(result).toContainText('Nothing is refused.');
    await expect(page.getByTestId('batch-chip')).toHaveText('Flagged');
    await checkSurface(page);

    // hand on to a buyer
    const hand = page.getByRole('form', { name: 'Hand on to a buyer' });
    await hand.getByRole('button', { name: 'Sign and hand on' }).click();
    await expect(hand.getByText('Choose a buyer from the list.')).toBeVisible();
    await hand.getByLabel('Buyer').selectOption({ label: 'Demo Buyer A' });
    await hand.getByRole('button', { name: 'Sign and hand on' }).click();
    await expect(page.getByTestId('handed-on')).toContainText('Handed on to Demo Buyer A');
    await expect(page.getByTestId('handed-on')).toContainText('This batch is no longer with you.');
    await checkSurface(page);

    // the certificate: the step in the journey with its flag, and the proof still verifies (TP16)
    await page.goto(`/verify/${s.batchId}?h=${s.shortHash}`);
    expect(await proofFinalState(page)).toBe('verified');
    const journey = page.locator('#journey');
    await expect(journey).toContainText('Hulled');
    await expect(journey).toContainText('At Processor C-03 · 600.0 kg in, 420.0 kg out (70.0%)');
    await expect(journey).toContainText('Flagged: 75–85% is expected for hulling parchment');
    await expect(journey).toContainText('Handed to buyer');
    await expect(journey.locator('[data-flag="true"]')).toHaveCount(1);
    await checkSurface(page);
  });

  test('@eval EVAL-100 a step within range shows Within range and a plain journey step', async ({ page }) => {
    test.setTimeout(90_000);
    const s = seed(true);
    await signIn(page, PROCESSOR.email, SEED_PASSWORD);
    await page.goto(`/processor/batches/${s.batchId}`);
    const form = page.getByRole('form', { name: 'Record a processing step' });
    await form.getByRole('radio', { name: /^Hulling parchment/ }).check();
    await form.getByLabel('Input (kg)').fill('600');
    await form.getByLabel('Output (kg)').fill('480');
    await form.getByRole('button', { name: 'Sign and record step' }).click();
    await expect(page.getByTestId('step-result')).toContainText('Within range');
    await expect(page.getByTestId('batch-chip')).toHaveText('Within range');
    await page.goto(`/verify/${s.batchId}?h=${s.shortHash}`);
    expect(await proofFinalState(page)).toBe('verified');
    await expect(page.locator('#journey')).toContainText('At Processor C-03 · 600.0 kg in, 480.0 kg out (80.0%)');
    await expect(page.locator('#journey [data-flag="true"]')).toHaveCount(0);
  });

  test('a batch never handed to this processor is a 404; other roles are sent home (TC-018)', async ({ page }) => {
    const s = seed(false);
    await signIn(page, PROCESSOR.email, SEED_PASSWORD);
    const res = await page.goto(`/processor/batches/${s.batchId}`);
    expect(res?.status()).toBe(404);
    await page.context().clearCookies();
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await page.goto('/processor');
    await expect(page).toHaveURL(/\/buyer$/);
  });

  test('loading, empty and error states (§28.6, EVAL-105)', async ({ page }) => {
    await signIn(page, PROCESSOR.email, SEED_PASSWORD);
    await page.goto('/processor?state=loading');
    await expect(page.getByText('Loading your batches…')).toBeVisible();
    await checkSurface(page);
    await page.goto('/processor?state=empty');
    await expect(page.getByText('No batches with you right now.')).toBeVisible();
    await checkSurface(page);
    await page.goto('/processor?state=error');
    await expect(page.getByText('Couldn’t load your batches.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
    await checkSurface(page);
  });
});

test.describe('admin hands a batch to a processor (T4)', () => {
  test('the Hand to list groups buyers and processors; the processor then holds the batch', async ({ page }) => {
    test.setTimeout(90_000);
    const s = seed(false);
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/batches/${s.batchId}`);
    const form = page.getByRole('form', { name: 'Transfer custody' });
    const select = form.getByLabel('Hand to');
    await expect(select.locator('optgroup[label="Buyers"] option', { hasText: 'Demo Buyer A' })).toHaveCount(1);
    await expect(select.locator('optgroup[label="Processors"] option', { hasText: 'Processor C-03' })).toHaveCount(1);
    await expect(form.getByText('A processor records a processing step and then hands the batch on to a buyer.')).toBeVisible();
    await checkSurface(page);
    await select.selectOption({ label: 'Processor C-03' });
    await form.getByRole('button', { name: 'Sign and transfer' }).click();
    await expect(page.getByTestId('custody-line')).toContainText(`${s.orgName} → Processor C-03`);
  });
});
