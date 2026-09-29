import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { stubTiles } from './helpers/stubs';
import { query } from './helpers/tracer';

// TKT-06 admin plot screens: the list (farmer, producer ID, crop, area, registration status) and its
// four states, the new-plot form (upload path), the detail (area in ha, the registration checks that
// run right after a save — TKT-07, TC-034 — "Registration checks on record"),
// with TC-080 (no horizontal scroll) and TC-081 (axe) on /admin/plots*. Each Playwright project is one
// viewport (320, 375, 768, 1440).

const GEOMETRY = fileURLToPath(new URL('../evals/fixtures/geometry', import.meta.url));

test.beforeAll(() => seedAccounts());

/** TC-080: nothing wider than the viewport (compared with the viewport width, not innerWidth). */
async function noHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}

/** The admin rail (TKT-05's RailShell) is on the screen: four sections, Plots current. */
async function railPresent(page: Page) {
  const rail = page.getByRole('navigation', { name: 'Admin sections' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('link')).toHaveCount(4);
  await expect(rail.getByRole('link', { name: 'Plots' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toHaveCount(1);
}

/** Every plots screen: the rail, one main landmark, no horizontal scroll. */
async function screenChecks(page: Page) {
  await railPresent(page);
  await noHorizontalScroll(page);
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
  await page.getByLabel(/boundary file/i).setInputFiles(join(GEOMETRY, file));
  await page.getByRole('button', { name: 'Save plot' }).click();
  await expect(page).toHaveURL(/\/admin\/plots\/PL-[0-9A-Z]{8}$/);
  return page.url().split('/').at(-1)!;
}

test.describe('TKT-06 admin plots', () => {
  test.beforeEach(async ({ page }) => {
    await stubTiles(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
  });

  test('new plot by upload: the detail shows the area in ha and its registration checks on record; the list row has farmer, producer ID, crop, area and status (TC-026, TC-027, TC-034)', async ({ page }) => {
    // Upload, two pages and two axe scans; the shared e2e database's list grows every run.
    test.slow();
    const farmer = uniqueName('Kaveri');
    const plotId = await uploadPlot(page, farmer, 'one-placemark.kml', 'Robusta');
    const detail = page.getByRole('region', { name: 'Plot detail' });
    await expect(detail.getByRole('heading', { level: 2, name: plotId })).toBeVisible();
    await expect(detail.locator('#plot-area')).toHaveText(/^Area \d+\.\d{2} ha$/);
    await expect(detail.getByText('Registration checks on record').first()).toBeVisible();
    // TKT-07: forest loss and the 12-month NDVI history ran for this boundary (fixture provider).
    const checks = detail.getByTestId('registration-checks');
    await expect(checks.getByText('Forest map · Passed')).toBeVisible();
    await expect(checks.getByText('0.0% of plot area lost since 2021 (hard fail at 10.0%)')).toBeVisible();
    await expect(checks.getByText('Coffee grown here, 12 months · Passed')).toBeVisible();
    await expect(checks.getByText(/^Canopy all year: monthly NDVI 0\.62–0\.81 over 11 clear months/)).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Check again' })).toHaveCount(0);
    await expect(detail.getByRole('img', { name: new RegExp(`Outline of plot ${plotId}`) })).toBeVisible();
    await screenChecks(page);
    await noSeriousAxeViolations(page);

    await page.goto('/admin/plots');
    const row = page.getByRole('link', { name: new RegExp(`${farmer} · ${plotId}`) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/PR-[0-9A-Z]{8} · Robusta/);
    await expect(row).toContainText(/\d+\.\d{2} ha/);
    await expect(row).toContainText('Registration checks on record');
    await screenChecks(page);
    await noSeriousAxeViolations(page);
  });

  test('an invalid upload is refused with a plain reason and nothing is saved (TC-026)', async ({ page }) => {
    await page.goto('/admin/plots/new');
    await page.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
    await page.getByLabel('New farmer’s name').fill(uniqueName('Refused'));
    await page.getByLabel(/boundary file/i).setInputFiles(join(GEOMETRY, 'bowtie.geojson'));
    await page.getByRole('button', { name: 'Save plot' }).click();
    await expect(page.locator('#plot-error')).toHaveText('The boundary crosses itself. Move the points so the lines do not cross.');
    await expect(page.locator('#plot-error')).toHaveRole('alert');
    await expect(page).toHaveURL(/\/admin\/plots\/new$/);
    await screenChecks(page);
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
      await screenChecks(page);
      await noSeriousAxeViolations(page);
    });
  }

  test('the working list and the new-plot screen: no horizontal scroll, no serious axe violations (TC-080, TC-081)', async ({ page }) => {
    // Upload, two pages and two axe scans; the shared e2e database's list grows every run.
    test.slow();
    await uploadPlot(page, uniqueName('Listed'));
    await page.goto('/admin/plots');
    await expect(page.getByRole('heading', { level: 1, name: /Registered plots?/ })).toBeVisible();
    await screenChecks(page);
    await noSeriousAxeViolations(page);
    await page.goto('/admin/plots/new');
    await expect(page.getByRole('heading', { name: 'Add a plot', level: 2 })).toBeVisible();
    await screenChecks(page);
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

  test('TC-029: edit a boundary without dragging — select a point, move it with buttons and arrow keys, add and remove points; focus stays visible; the area updates; saving re-anchors (plot_edited)', async ({ page }) => {
    const tileRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('ibasemaps-api.arcgis.com')) tileRequests.push(r.url());
    });
    const plotId = await uploadPlot(page, uniqueName('Edited'));
    const editor = page.getByRole('region', { name: 'Edit the boundary' });
    await expect(editor).toBeVisible();
    // Satellite tiles come from the keyed Esri service (stubbed here), with its attribution.
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Powered by Esri');
    await expect.poll(() => tileRequests.length).toBeGreaterThan(0);

    const points = editor.getByRole('list', { name: 'Boundary points' }).getByRole('button');
    await expect(points).toHaveCount(4);
    const area = editor.locator('#editor-area');
    const areaBefore = await area.textContent();

    await points.nth(1).click();
    await expect(points.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const labelBefore = await points.nth(1).textContent();
    await editor.getByRole('button', { name: 'Move north 1 m' }).click();
    await expect(points.nth(1)).not.toHaveText(labelBefore!);
    await expect(area).not.toHaveText(areaBefore!);

    // Arrow keys move the focused point; focus is visible on it.
    await points.nth(1).focus();
    const beforeKey = await points.nth(1).textContent();
    await page.keyboard.press('ArrowRight');
    await expect(points.nth(1)).not.toHaveText(beforeKey!);
    await expect(points.nth(1)).toBeFocused();
    const outline = await points.nth(1).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await editor.getByRole('button', { name: 'Add point' }).click();
    await expect(points).toHaveCount(5);
    await expect(points.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'Remove point' }).click();
    await expect(points).toHaveCount(4);
    await expect(editor.locator('#editor-error')).toHaveText('');

    const liveArea = (await area.textContent())!.match(/^Area (\d+\.\d{2} ha) \(/)![1];
    await screenChecks(page);
    await noSeriousAxeViolations(page);
    await editor.getByRole('button', { name: 'Save boundary' }).click();
    const detail = page.getByRole('region', { name: 'Plot detail' });
    await expect(detail.locator('#plot-area')).toHaveText(`Area ${liveArea}`);
    // The edit is anchored, then the registration checks re-run for the new boundary right after the
    // save (TKT-07, TC-028): registered, its checks, the edit, the checks again.
    await expect(detail.getByText(/boundary changed/)).toBeVisible();
    await expect(detail.getByText('Registration checks on record').first()).toBeVisible();
    const kinds = async () =>
      (await query<{ kind: string }>("SELECT kind FROM ledger_entries WHERE json_extract(payload, '$.plotId') = ? ORDER BY seq", [plotId])).map((k) => k.kind);
    await expect.poll(kinds).toEqual(['plot_registered', 'plot_edited', 'plot_edited', 'plot_edited']);
  });

  test('TC-029: a crossing boundary is shown inline and cannot be saved', async ({ page }) => {
    await uploadPlot(page, uniqueName('Crossed'));
    const editor = page.getByRole('region', { name: 'Edit the boundary' });
    const points = editor.getByRole('list', { name: 'Boundary points' }).getByRole('button');
    // Pull point 1 (the south-west corner) 150 m east, past the south-east corner: the lines cross.
    await points.nth(0).focus();
    for (let i = 0; i < 150; i++) await page.keyboard.press('ArrowRight');
    await expect(editor.locator('#editor-error')).toHaveText('The boundary crosses itself. Move the points so the lines do not cross.');
    await expect(editor.getByRole('button', { name: 'Save boundary' })).toBeDisabled();
  });

  test('TC-029: draw a new plot by clicking points on the map, then save it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'leaflet-draw places points from mouse clicks; the touch projects cover the button path above');
    await page.goto('/admin/plots/new');
    await page.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
    await page.getByLabel('New farmer’s name').fill(uniqueName('Drawn'));
    const editor = page.getByRole('region', { name: 'Draw the boundary' });
    await editor.getByRole('button', { name: 'Draw on the map' }).click();
    const map = editor.locator('.leaflet-container');
    await map.scrollIntoViewIfNeeded();
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (const [dx, dy] of [
      [-60, -40],
      [60, -40],
      [70, 40],
      [-50, 50],
    ]) {
      await page.mouse.click(cx + dx!, cy + dy!);
      // leaflet-draw ignores a click within 50 ms of the last point (its double-click guard).
      await page.waitForTimeout(250);
    }
    await editor.getByRole('button', { name: 'Finish shape' }).click();
    const points = editor.getByRole('list', { name: 'Boundary points' }).getByRole('button');
    await expect(points).toHaveCount(4);
    const liveArea = (await editor.locator('#editor-area').textContent())!.match(/^Area (\d+\.\d{2} ha) \(/)?.[1];
    expect(liveArea).toBeDefined();
    await page.getByRole('button', { name: 'Save plot' }).click();
    await expect(page).toHaveURL(/\/admin\/plots\/PL-[0-9A-Z]{8}$/);
    await expect(page.locator('#plot-area')).toHaveText(`Area ${liveArea}`);
  });

  test('on a phone the floating tab bar never covers the Save pill (new plot and detail)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the rail is a floating tab bar only below 700 px');
    const plotId = await uploadPlot(page, uniqueName('Covered'));
    for (const [path, name] of [
      ['/admin/plots/new', 'Save plot'],
      [`/admin/plots/${plotId}`, 'Save boundary'],
    ] as const) {
      await page.goto(path);
      await railPresent(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const pill = (await page.getByRole('button', { name }).boundingBox())!;
      const bar = (await page.getByRole('navigation', { name: 'Admin sections' }).boundingBox())!;
      expect(pill.y + pill.height, `${name} ends above the tab bar`).toBeLessThanOrEqual(bar.y);
    }
  });
});
