import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { certificateUrl, proofFinalState, seedCertificate } from './helpers/certificate';
import { stubTiles } from './helpers/stubs';

// TSK-19.5 · TC-076 (technical-plan §16): pages carry the nonce CSP and the static security headers,
// and no page violates its policy (the console and `securitypolicyviolation` events are both watched).

let cert: ReturnType<typeof seedCertificate>;
test.beforeAll(() => {
  seedAccounts();
  cert = seedCertificate({ events: 3, plots: 3 });
});

/** Collect CSP violations from the console and from the page's securitypolicyviolation events. */
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return violations;
}

async function visit(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res, path).not.toBeNull();
  await page.waitForLoadState('networkidle');
  return res!;
}

async function expectSecureHeaders(page: Page, path: string, tileHost?: string) {
  const res = await visit(page, path);
  const h = await res.allHeaders();
  const csp = h['content-security-policy'] ?? '';
  expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp, path).toContain("default-src 'self'");
  expect(csp, path).toContain("frame-ancestors 'none'");
  if (tileHost) expect(csp, path).toContain(tileHost);
  else expect(csp, path).not.toMatch(/arcgis|maptiler/);
  expect(h['x-content-type-options'], path).toBe('nosniff');
  expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy'], path).toBe('camera=(self), geolocation=(self), microphone=()');
  expect(h['strict-transport-security'], path).toBeUndefined(); // SEC-007: production only, never on http://localhost
  // Next put this response's nonce on its bootstrap scripts (chunks they load later need none under
  // 'strict-dynamic'); no script carries any other nonce
  const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
  const nonces = await page.locator('script').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce).filter((n) => n !== ''));
  expect(nonces.length, path).toBeGreaterThan(0);
  expect(new Set(nonces), path).toEqual(new Set([nonce]));
}

test.describe('TC-076 security headers and CSP', () => {
  test('public pages: /sign-in and /verify/{id}?h= (a verified certificate and a not-found one)', async ({ page }) => {
    const violations = await watchViolations(page);
    await expectSecureHeaders(page, '/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    // TASK-17 fix round 1: a real certificate, verified in the browser under its nonce CSP
    await expectSecureHeaders(page, certificateUrl(cert));
    expect(await proofFinalState(page)).toBe('verified');
    await visit(page, '/verify/B-0000TEST?h=000000000000');
    expect(violations).toEqual([]);
  });

  test('the field app: /field', async ({ page }) => {
    const violations = await watchViolations(page);
    await signIn(page, DEMO_ACCOUNTS.agentA.email, SEED_PASSWORD);
    await expectSecureHeaders(page, '/field');
    expect(violations).toEqual([]);
  });

  test('the admin: /admin and /admin/plots/new (tile host allowed on admin pages only)', async ({ page }) => {
    await stubTiles(page);
    const violations = await watchViolations(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await expectSecureHeaders(page, '/admin', 'https://ibasemaps-api.arcgis.com');
    await expectSecureHeaders(page, '/admin/plots/new', 'https://ibasemaps-api.arcgis.com');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.locator('.leaflet-tile-loaded').first().waitFor();
    expect(violations).toEqual([]);
  });

  test('the admin tiles survive client navigation: an admin page → Rail Plots → Add a plot (fix round 1)', async ({ page }) => {
    // The Rail and "Add a plot" are soft navigations, which keep the CSP of the first admin document.
    // Sign-in lands on /admin; its placeholder has no Rail yet (TKT-12 ports it), so the Rail is taken
    // from /admin/phones, an admin document whose policy used to lack the tile host.
    await stubTiles(page);
    const violations = await watchViolations(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await expectSecureHeaders(page, '/admin', 'https://ibasemaps-api.arcgis.com');
    await expectSecureHeaders(page, '/admin/phones', 'https://ibasemaps-api.arcgis.com');
    // Survives only while no new document loads: proves both steps below are client navigations.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });
    const tiles: string[] = [];
    page.on('requestfinished', (r) => {
      if (r.url().includes('arcgis.com')) tiles.push(r.url());
    });
    await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Plots' }).click();
    await expect(page).toHaveURL(/\/admin\/plots$/);
    await page.getByRole('link', { name: 'Add a plot' }).click();
    await expect(page).toHaveURL(/\/admin\/plots\/new$/);
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.locator('.leaflet-tile-loaded').first().waitFor();
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
    expect(tiles.length).toBeGreaterThan(0); // the stub tile was fetched, not blocked
    expect(violations).toEqual([]);
  });
});

type MarkedWindow = { __doc?: string; next: { router: { push: (href: string) => void } } };
const TILE_HOST = 'https://ibasemaps-api.arcgis.com';

/** Mark the current document; the mark survives client navigations and is gone after any new document load. */
const markDocument = (page: Page, name: string) => page.evaluate((n) => void ((window as unknown as MarkedWindow).__doc = n), name);
const documentMark = (page: Page) => page.evaluate(() => (window as unknown as MarkedWindow).__doc);
/** A client navigation, exactly what a next/link click does (the admin Rail and "Add a plot" are Links). */
const clientNavigate = (page: Page, href: string) => page.evaluate((h) => (window as unknown as MarkedWindow).next.router.push(h), href);

/** Record each document response's path and img-src, and every tile request that completed. */
function watchDocumentsAndTiles(page: Page) {
  const documents: { path: string; imgSrc: string }[] = [];
  const tiles: string[] = [];
  page.on('response', async (r) => {
    if (r.request().resourceType() !== 'document') return;
    const csp = (await r.allHeaders())['content-security-policy'] ?? '';
    documents.push({ path: new URL(r.url()).pathname, imgSrc: /img-src[^;]*/.exec(csp)?.[0] ?? '' });
  });
  page.on('requestfinished', (r) => {
    if (r.url().includes('arcgis.com')) tiles.push(r.url());
  });
  return { documents, tiles };
}

test.describe('TC-076 the admin map tiles after a real sign-in (TASK-20 fix round 2, review N1)', () => {
  test('from the sign-in FORM: the admin is a new document with the tile host; Rail → Plots → Add a plot loads tiles, no violation', async ({ page }) => {
    await stubTiles(page);
    const violations = await watchViolations(page);
    const seen = watchDocumentsAndTiles(page);
    // No /admin page is ever loaded by the test itself: the only way in is the form.
    await page.goto('/sign-in');
    await markDocument(page, 'sign-in');
    await page.getByLabel('Email').fill(DEMO_ACCOUNTS.adminA.email);
    await page.getByLabel('Password').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.waitForLoadState('load');
    // Sign-in ended in a full load of /admin, served with the admin policy (a client redirect would have
    // kept the sign-in document, whose img-src has no tile host).
    expect(await documentMark(page)).toBeUndefined();
    expect(seen.documents.map((d) => d.path)).toEqual(['/sign-in', '/admin']);
    expect(seen.documents[0]!.imgSrc).toBe("img-src 'self' data: blob:");
    expect(seen.documents[1]!.imgSrc).toBe(`img-src 'self' data: blob: ${TILE_HOST}`);
    await markDocument(page, 'admin');
    // /admin is still a placeholder without the Rail (TKT-12 ports it): reach a Rail page the way its
    // Link would, then use the real Rail and the real "Add a plot" link.
    await clientNavigate(page, '/admin/phones');
    await expect(page).toHaveURL(/\/admin\/phones$/);
    await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Plots' }).click();
    await expect(page).toHaveURL(/\/admin\/plots$/);
    await page.getByRole('link', { name: 'Add a plot' }).click();
    await expect(page).toHaveURL(/\/admin\/plots\/new$/);
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.locator('.leaflet-tile-loaded').first().waitFor();
    expect(await documentMark(page)).toBe('admin'); // all client navigations, in the document sign-in loaded
    expect(seen.documents.map((d) => d.path)).toEqual(['/sign-in', '/admin']);
    expect(await page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
    expect(seen.tiles.length).toBeGreaterThan(0); // the stub tile was fetched, not blocked
    expect(violations).toEqual([]);
  });

  test('any other client navigation into the admin from a non-admin document reloads it as an admin document', async ({ page }) => {
    await stubTiles(page);
    const violations = await watchViolations(page);
    const seen = watchDocumentsAndTiles(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    // A public document, whose policy has no tile host, with the admin still signed in.
    await page.goto('/verify/B-0000TEST?h=000000000000');
    await page.waitForLoadState('networkidle');
    await markDocument(page, 'public');
    const before = seen.documents.length;
    await clientNavigate(page, '/admin/plots/new');
    await expect(page).toHaveURL(/\/admin\/plots\/new$/);
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.locator('.leaflet-tile-loaded').first().waitFor();
    expect(await documentMark(page)).toBeUndefined(); // reloaded as its own document
    expect(seen.documents.slice(before)).toEqual([{ path: '/admin/plots/new', imgSrc: `img-src 'self' data: blob: ${TILE_HOST}` }]);
    expect(seen.tiles.length).toBeGreaterThan(0);
    expect(violations).toEqual([]); // the map never started inside the public document
  });
});
