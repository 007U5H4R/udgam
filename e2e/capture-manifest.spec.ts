import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { openField, seedCaptureWorld } from './helpers/capture';

// TSK-10.12 / TC-049: the capture app is installable — the manifest names Udgam, starts at /field,
// is standalone in the token colours with 192 and 512 px icons, and Chromium reports no
// installability errors on /field.

test.describe.configure({ timeout: 120_000 });

test('GET /manifest.webmanifest carries the name, start URL, display, colours and the three icons', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({
    name: 'Udgam',
    short_name: 'Udgam',
    start_url: '/field',
    display: 'standalone',
    background_color: '#0A0E0C',
    theme_color: '#0A0E0C',
  });
  expect(m.icons).toEqual([
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
  for (const icon of m.icons as { src: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});

test('Chromium reports no installability errors on /field', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'CDP is Chromium-only');
  // Playwright's own contexts are incognito, and Chromium never offers installation there
  // ("in-incognito"): use a persistent profile, like a phone's browser.
  const dir = mkdtempSync(join(tmpdir(), 'udgam-install-'));
  const launch = test.info().project.use.launchOptions ?? {};
  const context = await chromium.launchPersistentContext(dir, { ...launch, baseURL, viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    const seed = seedCaptureWorld();
    await openField(page, context, seed);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
    const cdp = await context.newCDPSession(page);
    await expect
      .poll(async () => ((await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] }).installabilityErrors.map((e) => e.errorId), {
        timeout: 20_000,
      })
      .toEqual([]);
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
