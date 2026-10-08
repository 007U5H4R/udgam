import { expect, test } from '@playwright/test';
import { mockGeolocation, stubTiles } from './helpers/stubs';

test('home renders the h1 with no console errors and no horizontal scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Udgam' })).toBeVisible();

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, 'no horizontal scroll').toBe(true);
  expect(errors).toEqual([]);
});

test('health endpoint answers 200 with the database ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ db: 'ok', providers: { gfw: 'fixture', sentinelHub: 'fixture' } });
});

test('tile hosts are stubbed and geolocation is pinned', async ({ page, context }) => {
  await stubTiles(page);
  await mockGeolocation(context, { lat: 12.42, lng: 75.74, accuracy: 8 });
  // The app's CSP (connect-src 'self', TKT-19) refuses cross-origin fetches from its pages, so the stub
  // is probed from a blank page; the geolocation pin is checked on the app's origin.
  await page.goto('about:blank');
  const tile = await page.evaluate(async () => {
    const r = await fetch('https://server.arcgisonline.com/tile/1/2/3');
    return { status: r.status, type: r.headers.get('content-type') };
  });
  expect(tile).toEqual({ status: 200, type: 'image/png' });
  await page.goto('/');
  const fix = await page.evaluate(
    () =>
      new Promise<{ lat: number; lng: number; accuracy: number }>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          (e) => reject(new Error(e.message)),
        ),
      ),
  );
  expect(fix).toEqual({ lat: 12.42, lng: 75.74, accuracy: 8 });
});
