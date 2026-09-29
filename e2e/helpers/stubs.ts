import type { BrowserContext, Page } from '@playwright/test';

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Route every map-tile host to a 1x1 PNG so e2e runs need no network and no tile key. */
export async function stubTiles(page: Page): Promise<void> {
  await page.route('**/{server.arcgisonline.com,api.maptiler.com,*.arcgis.com}/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: PIXEL,
    }),
  );
}

/** Grant geolocation and pin the phone to a fixed fix. */
export async function mockGeolocation(
  context: BrowserContext,
  { lat, lng, accuracy }: { lat: number; lng: number; accuracy: number },
): Promise<void> {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat, longitude: lng, accuracy });
}
