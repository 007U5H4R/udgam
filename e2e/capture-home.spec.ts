import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { distanceToEdgeM } from '../src/lib/geo/distance';
import type { Polygon } from '../src/lib/geo/types';
import { expectNoHorizontalScroll, openField, seedCaptureWorld } from './helpers/capture';

// TSK-10.5 · Home (final/index.html #s1) with the plot card as the hero: where you are relative to the
// preselected plot (the live GPS fix), the facts line, the one record pill and the last three pickings.
// Design.md §18 states: "Finding your location…" while there is no fix; "No pickings recorded yet".

// Each test seeds its own world through a tsx child process; under parallel agents that alone can take
// many seconds, so the budget is wider than Playwright's 30 s default.
test.describe.configure({ timeout: 120_000 });

test.use({ viewport: { width: 375, height: 812 } });

const P01 = (JSON.parse(readFileSync('evals/fixtures/plots/P01.geojson', 'utf8')) as { geometry: Polygon }).geometry;

/** A point due north of P01's northernmost vertex, whose distance to the plot edge rounds to 120 m. */
function north120(): { lat: number; lng: number } {
  const top = P01.coordinates[0]!.reduce((a, b) => (b[1]! > a[1]! ? b : a));
  let lat = top[1]! + 120 / 111_320;
  for (let i = 0; i < 20 && Math.round(distanceToEdgeM({ lat, lng: top[0]! }, P01)) !== 120; i++) {
    lat += (120 - distanceToEdgeM({ lat, lng: top[0]! }, P01)) / 111_320;
  }
  return { lat: Number(lat.toFixed(7)), lng: top[0]! };
}

test('inside P01: "You\'re inside Plot 1" with the plot lit, the facts, the record pill and three rows', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Needs Review', '51:Verified'] });
  await openField(page, context, seed);

  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText("You're inside Plot 1");
  await expect(h1.locator('.lit')).toHaveText('Plot 1');
  await expect(page.locator('.plot-card .facts')).toHaveText(/^2\.0 ha · Arabica · last picked \d{1,2} [A-Z][a-z]{2}$/);
  await expect(page.locator('.plot-card .where')).toHaveText(seed.farmerName);
  await expect(page.getByTestId('you-dot')).toHaveCount(1);
  await expect(page.getByRole('button', { name: "Record today's picking" })).toBeVisible();
  const rows = page.getByTestId('home-rows').locator('li');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.r-kg')).toHaveText(['51.0 kg', '44.0 kg', '38.5 kg']);
  await expect(rows.first().locator('.r-date')).toHaveText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} [A-Z][a-z]{2}$/);
  await expect(page.locator('.greet')).toHaveText(/^Good (morning|afternoon|evening) · (Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day, \d{1,2} [A-Z][a-z]+$/);
  await expectNoHorizontalScroll(page);
});

test('120 m north of P01: "You\'re 120 m from Plot 1"', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed, { ...north120(), accuracy: 8 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're 120 m from Plot 1");
  await expect(page.getByTestId('home-empty')).toHaveText('No pickings recorded yet');
  await expectNoHorizontalScroll(page);
});

test('while there is no fix yet: "Finding your location…"', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  // A phone still searching for satellites: the watch never reports.
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => 1;
  });
  await openField(page, context, seed);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finding your location…');
  await expect(page.getByTestId('you-dot')).toHaveCount(0);
});

test('loading and error states (Design.md §18)', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto('/field?state=error');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Couldn't load your entries.");
  await expect(page.getByText('Your saved pickings are safe on this phone.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/field');
  await page.goto('/field?state=loading');
  await expect(page.locator('main[aria-busy="true"] .skel').first()).toBeVisible();
});
