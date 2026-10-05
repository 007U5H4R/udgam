import { expect, test, type BrowserContext } from '@playwright/test';
import { signIn } from './helpers/auth';
import { seedCaptureWorld } from './helpers/capture';
import { certificateUrl, seedCertificate, type SeededCertificate } from './helpers/certificate';

// DES-221 (EXE41): the `udgam_lang` cookie sets <html lang> only on the surfaces that speak Kannada (the
// field app, sign-in). The public certificate and its not-found are English-only, so under a Kannada
// cookie they still declare lang="en" (the certificate in its served HTML too, not only once rendered).

test.describe.configure({ timeout: 120_000 });

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 2, plots: 1 });
});

const kannada = (context: BrowserContext, baseURL: string | undefined) =>
  context.addCookies([{ name: 'udgam_lang', value: 'kn', url: baseURL ?? 'http://localhost:3100' }]);

/** The <html lang> of the document as the server sent it. */
const servedLang = (html: string) => /<html[^>]*\slang="([^"]*)"/.exec(html)?.[1];

test.describe('DES-221 <html lang> under a Kannada cookie', () => {
  test('the certificate and its 404 declare English', async ({ page, context, baseURL }) => {
    await kannada(context, baseURL);

    const res = await page.goto(certificateUrl(seeded));
    expect(res?.status()).toBe(200);
    expect(servedLang(await res!.text())).toBe('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    for (const url of [`/verify/B-UNKNOWN0?h=000000000000`, `/verify/${seeded.batchId}`]) {
      const nf = await page.goto(url);
      expect(nf?.status(), url).toBe(404);
      // Next serves this 404 as its error shell (<html id="__next_error__">, no lang) and the browser renders
      // the not-found card into it: never "kn" in the bytes, "en" once rendered.
      expect(servedLang(await nf!.text()), url).not.toBe('kn');
      await expect(page.getByTestId('certificate-not-found')).toBeVisible();
      await expect(page.locator('html'), url).toHaveAttribute('lang', 'en');
    }
  });

  test('sign-in and the field app keep Kannada', async ({ page, context, baseURL }) => {
    const seed = seedCaptureWorld();
    await kannada(context, baseURL);

    const res = await page.goto('/sign-in');
    expect(servedLang(await res!.text())).toBe('kn');
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');

    await signIn(page, seed.agentEmail, seed.testOnlyAgentPassword);
    await expect(page).toHaveURL(/\/field$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    const field = await page.goto('/field');
    expect(servedLang(await field!.text())).toBe('kn');
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  });
});
