import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { stubTiles } from './helpers/stubs';

// TKT-13 / TC-058 (e2e half), EVAL-079, DISC4: an admin attaches an organic certificate (a PDF) to a plot
// and the plot page shows "Certified by <issuer> — certificate on record" with its validity and a download
// link, admin only. No text on the page says the plot is verified organic. TC-080 (no horizontal scroll)
// and TC-081 (axe) on the plot page with the certificate card.

const GEOMETRY = fileURLToPath(new URL('../evals/fixtures/geometry', import.meta.url));
const PDF_TEXT = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n';
/** A validity end inside the accepted range (at most 10 years past today). */
const TO_YEAR = new Date().getUTCFullYear() + 5;
const TO = `${TO_YEAR}-12-31`;
const MIB10 = 10 * 1024 * 1024;

test.beforeAll(() => seedAccounts());

const uniqueName = (label: string) => `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** TC-080: nothing wider than the viewport (compared with the viewport width, not innerWidth). */
async function noHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function noSeriousAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Register a plot through the upload path; returns its ID (from the detail URL). */
async function uploadPlot(page: Page, farmer: string): Promise<string> {
  await page.goto('/admin/plots/new');
  await page.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
  await page.getByLabel('New farmer’s name').fill(farmer);
  await page.getByLabel(/boundary file/i).setInputFiles(join(GEOMETRY, 'valid-polygon.geojson'));
  await page.getByRole('button', { name: 'Save plot' }).click();
  await expect(page).toHaveURL(/\/admin\/plots\/PL-[0-9A-Z]{8}$/);
  return page.url().split('/').at(-1)!;
}

async function fillForm(page: Page, opts: { issuer: string; from: string; to: string; file: { name: string; mimeType: string; buffer: Buffer } }) {
  await page.getByLabel('Issued by').fill(opts.issuer);
  await page.getByLabel('Valid from').fill(opts.from);
  await page.getByLabel('Valid until').fill(opts.to);
  await page.getByLabel(/^Certificate/).setInputFiles(opts.file);
}

test.describe('TKT-13 organic certificate as an attestation', () => {
  test.beforeEach(async ({ page }) => {
    await stubTiles(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
  });

  test('attach a PDF: the plot shows "Certified by … — certificate on record" with validity and a download; never "verified organic" (TC-058, EVAL-079)', async ({ page, playwright, baseURL }) => {
    test.slow();
    const plotId = await uploadPlot(page, uniqueName('Organic'));
    const card = page.getByRole('region', { name: 'Organic certificate' });
    await expect(card.getByTestId('attestation-empty')).toHaveText('No certificate on record for this plot.');

    await fillForm(page, { issuer: 'INDOCERT', from: '2020-01-01', to: TO, file: { name: 'npop.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF_TEXT) } });
    await card.getByRole('button', { name: 'Attach certificate' }).click();

    const line = card.getByTestId('attestation-line');
    await expect(line).toHaveText(`Certified by INDOCERT — certificate on record · valid 1 Jan 2020–31 Dec ${TO_YEAR}`);
    await expect(line.locator('bdi')).toHaveText('INDOCERT'); // the issuer is isolated from the words around it
    await expect(card.getByTestId('attestation-empty')).toHaveCount(0);

    // the download link returns the exact file to a signed-in admin, and never to a signed-out visitor
    const link = card.getByRole('link', { name: 'Download certificate (PDF)' });
    await expect(link).toHaveCSS('text-decoration-line', 'underline'); // reads as a link without colour
    const href = await link.getAttribute('href');
    expect(href).toMatch(new RegExp(`^/admin/plots/${plotId}/attestation/AT-[0-9A-Z]{8}$`));
    const file = await page.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('application/pdf');
    expect((await file.body()).toString()).toBe(PDF_TEXT);
    // a fresh request context has no session cookie (the `request` fixture shares the page's cookies)
    const anonymous = await playwright.request.newContext({ baseURL });
    // signed out, the proxy sends the browser to sign-in; the route's own guard answers 401 (route.int.test.ts)
    const denied = await anonymous.get(href!, { maxRedirects: 0 });
    expect(denied.status()).toBe(307);
    expect(new URL(denied.headers()['location']!, baseURL).pathname).toBe('/sign-in');
    await anonymous.dispose();

    // wording: the page never claims organic status is verified; the fingerprint is shown
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toMatch(/verified\s+organic|organic\s+verified|organically\s+verified/);
    await expect(card.getByText(/fingerprint [0-9a-f]{12}/)).toBeVisible();

    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test('an expired certificate says "expired" with its end date', async ({ page }) => {
    test.slow();
    await uploadPlot(page, uniqueName('Expired'));
    const card = page.getByRole('region', { name: 'Organic certificate' });
    await fillForm(page, { issuer: 'NPOP body', from: '2019-01-01', to: '2020-12-31', file: { name: 'old.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF_TEXT) } });
    await card.getByRole('button', { name: 'Attach certificate' }).click();
    await expect(card.getByTestId('attestation-line')).toHaveText('Certified by NPOP body — certificate on record · expired 31 Dec 2020');
  });

  test('a file that is not a PDF is refused with a plain reason and nothing is recorded', async ({ page }) => {
    test.slow();
    await uploadPlot(page, uniqueName('Refused'));
    const card = page.getByRole('region', { name: 'Organic certificate' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    await fillForm(page, { issuer: 'INDOCERT', from: '2020-01-01', to: TO, file: { name: 'renamed.pdf', mimeType: 'application/pdf', buffer: png } });
    await card.getByRole('button', { name: 'Attach certificate' }).click();
    await expect(card.locator('#att-error')).toHaveText('That file is not a PDF. Choose the certificate as a PDF file.');
    await expect(card.locator('#att-error')).toHaveRole('alert');
    await expect(card.getByTestId('attestation-empty')).toBeVisible();

    // dates the wrong way round
    await card.getByLabel('Valid from').fill('2030-01-01');
    await card.getByLabel('Valid until').fill('2029-01-01');
    await card.getByLabel(/^Certificate/).setInputFiles({ name: 'npop.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF_TEXT) });
    await card.getByRole('button', { name: 'Attach certificate' }).click();
    await expect(card.locator('#att-error')).toContainText('cannot be before');
    await expect(card.getByTestId('attestation-empty')).toBeVisible();
  });

  test('a signed-out submit says to sign in again, not to fill in the form', async ({ page, context }) => {
    test.slow();
    await uploadPlot(page, uniqueName('Expired session'));
    const card = page.getByRole('region', { name: 'Organic certificate' });
    await fillForm(page, { issuer: 'INDOCERT', from: '2020-01-01', to: TO, file: { name: 'npop.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF_TEXT) } });
    await context.clearCookies();
    await card.getByRole('button', { name: 'Attach certificate' }).click();
    await expect(card.locator('#att-error')).toHaveText('Your session has ended. Sign in again, then attach the certificate.');
    await expect(card.getByTestId('attestation-empty')).toBeVisible();
  });

  test('a certificate of exactly 10 MiB reaches the route whole and is recorded; one byte more is too large (the proxy never cuts the body)', async ({ page }) => {
    test.slow();
    const plotId = await uploadPlot(page, uniqueName('Near cap'));
    const pdfOf = (size: number) => {
      const b = Buffer.alloc(size, 0x20);
      b.write('%PDF-1.7\n', 0, 'latin1');
      return b;
    };
    const send = (buffer: Buffer) =>
      page.request.post(`/admin/plots/${plotId}/attestation`, {
        multipart: { issuer: 'INDOCERT', validFrom: '2020-01-01', validTo: TO, file: { name: 'big.pdf', mimeType: 'application/pdf', buffer } },
        timeout: 60_000,
      });
    const over = await send(pdfOf(MIB10 + 1));
    expect([over.status(), await over.json()]).toEqual([413, { ok: false, reason: 'too_large' }]);
    const edge = await send(pdfOf(MIB10));
    expect(edge.status()).toBe(201);
    const { id } = (await edge.json()) as { id: string };
    const back = await page.request.get(`/admin/plots/${plotId}/attestation/${id}`);
    expect(back.status()).toBe(200);
    expect((await back.body()).length).toBe(MIB10);
  });

  test('the registration checks card and the admin rail stay on the plot page beside the certificate card', async ({ page }) => {
    test.slow();
    await uploadPlot(page, uniqueName('Neighbour'));
    await expect(page.getByRole('region', { name: 'Registration checks' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Organic certificate' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
  });
});
