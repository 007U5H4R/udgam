import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { stubTiles } from './helpers/stubs';

// TKT-06 admin plot screens: the list (farmer, producer ID, crop, area, registration status) and its
// four states, the new-plot form (upload path), the detail (area in ha, "Registration checks pending"),
// with TC-080 (no horizontal scroll) and TC-081 (axe) on /admin/plots*. Each Playwright project is one
// viewport (320, 375, 768, 1440).

const GEOMETRY = fileURLToPath(new URL('../evals/fixtures/geometry', import.meta.url));

test.beforeAll(() => seedAccounts());

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function noSeriousAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const uniqueName = (label: string) => `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Register a plot through the upload path; returns its ID (from the detail URL). */
async function uploadPlot(page: Page, farmer: string, file = 'valid-polygon.geojson', crop: 'Arabica' | 'Robusta' = 'Arabica'): Promise<string> {
  await page.goto('/admin/plots/new');
  await page.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
  await page.getByLabel('New farmer’s name').fill(farmer);
  await page.getByRole('radio', { name: crop }).check();
  await page.getByLabel(/Boundary file/).setInputFiles(join(GEOMETRY, file));
  await page.getByRole('button', { name: 'Save plot' }).click();
  await expect(page).toHaveURL(/\/admin\/plots\/PL-[0-9A-Z]{8}$/);
  return page.url().split('/').at(-1)!;
}

test.describe('TKT-06 admin plots', () => {
  test.beforeEach(async ({ page }) => {
    await stubTiles(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
  });

  test('new plot by upload: the detail shows the area in ha and "Registration checks pending"; the list row has farmer, producer ID, crop, area and status (TC-026, TC-027)', async ({ page }) => {
    const farmer = uniqueName('Kaveri');
    const plotId = await uploadPlot(page, farmer, 'one-placemark.kml', 'Robusta');
    const detail = page.getByRole('region', { name: 'Plot detail' });
    await expect(detail.getByRole('heading', { level: 2, name: plotId })).toBeVisible();
    await expect(detail.getByText(/^Area \d+\.\d{2} ha$/)).toBeVisible();
    await expect(detail.getByText('Registration checks pending').first()).toBeVisible();
    await expect(detail.getByRole('img', { name: new RegExp(`Outline of plot ${plotId}`) })).toBeVisible();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);

    await page.goto('/admin/plots');
    const row = page.getByRole('link', { name: new RegExp(`${farmer} · ${plotId}`) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/PR-[0-9A-Z]{8} · Robusta/);
    await expect(row).toContainText(/\d+\.\d{2} ha/);
    await expect(row).toContainText('Registration checks pending');
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test('an invalid upload is refused with a plain reason and nothing is saved (TC-026)', async ({ page }) => {
    await page.goto('/admin/plots/new');
    await page.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
    await page.getByLabel('New farmer’s name').fill(uniqueName('Refused'));
    await page.getByLabel(/Boundary file/).setInputFiles(join(GEOMETRY, 'bowtie.geojson'));
    await page.getByRole('button', { name: 'Save plot' }).click();
    await expect(page.locator('#plot-error')).toHaveText('The boundary crosses itself. Move the points so the lines do not cross.');
    await expect(page.locator('#plot-error')).toHaveRole('alert');
    await expect(page).toHaveURL(/\/admin\/plots\/new$/);
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  for (const state of ['loading', 'empty', 'error'] as const) {
    test(`the list's ${state} state (TC-080, TC-081)`, async ({ page }) => {
      await page.goto(`/admin/plots?state=${state}`);
      if (state === 'loading') await expect(page.getByText('Loading the plots…')).toBeVisible();
      if (state === 'empty') await expect(page.getByRole('heading', { name: 'No plots yet.' })).toBeVisible();
      if (state === 'error') {
        const alert = page.getByRole('alert', { name: 'Couldn’t load the plots.' });
        await expect(alert).toContainText('Nothing was changed.');
        await expect(alert.getByRole('link', { name: 'Try again' })).toBeVisible();
      }
      await noHorizontalScroll(page);
      await noSeriousAxeViolations(page);
    });
  }

  test('the working list and the new-plot screen: no horizontal scroll, no serious axe violations (TC-080, TC-081)', async ({ page }) => {
    await uploadPlot(page, uniqueName('Listed'));
    await page.goto('/admin/plots');
    await expect(page.getByRole('heading', { level: 1, name: /Registered plots?/ })).toBeVisible();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
    await page.goto('/admin/plots/new');
    await expect(page.getByRole('heading', { name: 'Add a plot', level: 2 })).toBeVisible();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test("another FPO's plot is a 404 (TC-019)", async ({ page, browser }) => {
    const plotId = await uploadPlot(page, uniqueName('Private'));
    const other = await browser.newPage();
    await signIn(other, DEMO_ACCOUNTS.adminB.email, SEED_PASSWORD);
    const res = await other.goto(`/admin/plots/${plotId}`);
    expect(res?.status()).toBe(404);
    await other.close();
  });
});
