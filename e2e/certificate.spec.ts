import { expect, test, type Page } from '@playwright/test';
import { certificateUrl, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// The public certificate (TKT-16), ported from .design/exploration/final/verify.html. Each Playwright
// project is one viewport (320, 375, 768, 1440). One batch is seeded per worker: 3 Verified pickings
// (38 + 41.5 + 45 = 124.5 kg) on 3 farms in Kodagu, an organic attestation, a transfer.

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 3 });
});

const width = (page: Page) => page.viewportSize()!.width;

async function openVerified(page: Page) {
  const res = await page.goto(certificateUrl(seeded));
  expect(res?.status()).toBe(200);
  expect(await proofFinalState(page)).toBe('verified');
}

test.describe('certificate hero, origin map and journey (TSK-16.4, @eval EVAL-087, TC-066)', () => {
  test('the h1 names the kilograms, crop, farms and district from the feed', async ({ page }) => {
    await openVerified(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('124.5 kg of Arabica cherry from 3 farms in Kodagu');
    await expect(page.getByText(`Batch ${seeded.batchId}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Kodagu, Karnataka, India · harvested 2–6 Sep 2026')).toBeVisible();
  });

  test('proof first on phones; map and journey side by side from 1000 px', async ({ page }) => {
    await openVerified(page);
    const proof = (await page.locator('.proof').boundingBox())!;
    const map = (await page.locator('#origin-map').boundingBox())!;
    const journey = (await page.locator('#journey').boundingBox())!;
    if (width(page) < 1000) {
      expect(proof.y).toBeLessThan(map.y);
      expect(journey.y).toBeGreaterThanOrEqual(map.y + map.height); // single column
    } else {
      // side by side: their boxes overlap vertically and the journey is to the right of the map
      expect(journey.y).toBeLessThan(map.y + map.height);
      expect(map.y).toBeLessThan(journey.y + journey.height);
      expect(journey.x).toBeGreaterThan(map.x + map.width);
    }
  });

  test('the map draws each plot from its anchored polygon, with its forest-loss line verbatim (demo data kept)', async ({ page }) => {
    await openVerified(page);
    const svg = page.locator('#origin-map svg');
    await expect(svg).toHaveAttribute('role', 'img');
    for (const plotId of seeded.plotIds) await expect(svg.locator(`g[data-plot="${plotId}"] path`).first()).toHaveAttribute('d', /^M[\d.]+ [\d.]+ L/);
    const farms = page.getByRole('list', { name: 'Farms in this batch' }).getByRole('listitem');
    await expect(farms).toHaveCount(3);
    for (const [i, producerId] of seeded.producerIds.entries()) {
      await expect(farms.nth(i)).toContainText(`Farm ${producerId} · 2.0 ha`);
      await expect(farms.nth(i)).toContainText('1 picking');
      // EXE12 / CF-11: fixture satellite data is labelled, and the label is shown as recorded
      await expect(farms.nth(i).getByTestId('forest-line')).toHaveText('0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)');
    }
  });

  test('the journey: harvested, checked, batched, handed to the buyer', async ({ page }) => {
    await openVerified(page);
    const steps = page.locator('#journey li');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText('Harvested2–6 Sep 20263 farms in Kodagu');
    await expect(steps.nth(1)).toContainText('Checked3 pickings');
    await expect(steps.nth(2)).toContainText('Batched');
    await expect(steps.nth(3)).toContainText('Handed to buyer');
  });

  test('the origin table', async ({ page }) => {
    await openVerified(page);
    const table = page.locator('table.origin-table');
    await expect(table.locator('td[data-label="Region"]')).toHaveText('Kodagu, Karnataka, India');
    await expect(table.locator('td[data-label="Variety"]')).toHaveText('Arabica');
    await expect(table.locator('td[data-label="Farms"]')).toHaveText('3');
    await expect(table.locator('td[data-label="Harvest window"]')).toHaveText('2–6 Sep 2026');
    await expect(table.locator('td[data-label="Quantity"]')).toHaveText('124.5 kg cherry');
  });

  test('TC-068: the embedded #proof-feed is the /api/verify response, byte for byte as JSON', async ({ page }) => {
    await openVerified(page);
    const embedded = JSON.parse((await page.locator('#proof-feed').textContent())!) as unknown;
    const api = await page.request.get(`/api/verify/${seeded.batchId}?h=${seeded.shortHash}`);
    expect(api.status()).toBe(200);
    expect(embedded).toEqual(await api.json());
  });
});
