import { expect, test } from '@playwright/test';
import { seedCertificate, type SeededCertificate } from './helpers/certificate';

// TSK-16.2 · @eval EVAL-064 · TP8 (GAP-6): /verify/{id} with an unknown batch, a missing `h` or a wrong
// `h` is a 404 with the plain "batch not found" message and no batch data, and the three answers are
// the same page.
// What "the same" can mean for a streamed page: the proof feed route's 404 bodies are compared raw, byte
// for byte (src/app/api/verify/[batchId]/route.int.test.ts). A page response carries its own CSP nonce,
// echoes the requested path and query in Next's router payload, and streams its metadata row whenever it
// resolves (so even two identical requests can order their flight rows differently). So here the three
// raw responses are checked for the absence of any batch data, and the pages they render are compared
// byte for byte (the rendered <html> without its scripts and stylesheet links, whose order also
// follows the stream).

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 2, plots: 1 });
});

test.describe('certificate not found (@eval EVAL-064)', () => {
  test('unknown batch, missing h and wrong h: 404, no batch data, the same rendered page', async ({ page }) => {
    const wrong = seeded.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    const cases = [`/verify/B-UNKNOWN0?h=000000000000`, `/verify/${seeded.batchId}`, `/verify/${seeded.batchId}?h=${wrong}`];
    const rendered: string[] = [];
    for (const url of cases) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(404);
      const raw = await res!.text();
      expect(raw, url).not.toContain('proof-feed');
      expect(raw, url).not.toContain(seeded.shortHash);
      for (const p of [...seeded.producerIds, ...seeded.plotIds, ...seeded.eventIds]) expect(raw, url).not.toContain(p);

      await expect(page.getByRole('heading', { level: 1, name: 'Batch not found' })).toBeVisible();
      await expect(page.getByText('This link does not match any sealed batch.')).toBeVisible();
      await expect(page.locator('#proof-feed')).toHaveCount(0);
      rendered.push(
        await page.evaluate(() => {
          const html = document.documentElement.cloneNode(true) as HTMLElement;
          for (const s of Array.from(html.querySelectorAll('script, link[rel="preload"], link[rel="stylesheet"]'))) s.remove();
          return html.outerHTML;
        }),
      );
    }
    expect(rendered[1]).toBe(rendered[0]);
    expect(rendered[2]).toBe(rendered[0]);
  });

  test('the right h serves the certificate (control)', async ({ page }) => {
    const res = await page.goto(`/verify/${seeded.batchId}?h=${seeded.shortHash}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('#proof-feed')).toHaveCount(1);
  });
});
