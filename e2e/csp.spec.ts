import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { stubTiles } from './helpers/stubs';

// TSK-19.5 · TC-076 (technical-plan §16): pages carry the nonce CSP and the static security headers,
// and no page violates its policy (the console and `securitypolicyviolation` events are both watched).

test.beforeAll(() => seedAccounts());

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
  // Next put this response's nonce on its bootstrap scripts (chunks they load later need none under
  // 'strict-dynamic'); no script carries any other nonce
  const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
  const nonces = await page.locator('script').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce).filter((n) => n !== ''));
  expect(nonces.length, path).toBeGreaterThan(0);
  expect(new Set(nonces), path).toEqual(new Set([nonce]));
}

test.describe('TC-076 security headers and CSP', () => {
  test('public pages: /sign-in and /verify/{id}?h=', async ({ page }) => {
    const violations = await watchViolations(page);
    await expectSecureHeaders(page, '/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await visit(page, '/verify/B-0000TEST?h=000000000000');
    expect(violations).toEqual([]);
  });

  test('the field app: /field', async ({ page }) => {
    const violations = await watchViolations(page);
    await signIn(page, DEMO_ACCOUNTS.agentA.email, SEED_PASSWORD);
    await expectSecureHeaders(page, '/field');
    expect(violations).toEqual([]);
  });

  test('the admin: /admin and /admin/plots/new (tile host allowed only there)', async ({ page }) => {
    await stubTiles(page);
    const violations = await watchViolations(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await expectSecureHeaders(page, '/admin');
    await expectSecureHeaders(page, '/admin/plots/new', 'https://ibasemaps-api.arcgis.com');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.locator('.leaflet-tile-loaded').first().waitFor();
    expect(violations).toEqual([]);
  });
});
