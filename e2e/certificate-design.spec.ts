import { expect, test, type Page } from '@playwright/test';
import { TAMPER_VARIANTS } from '../src/lib/ledger/testing/tamper';
import { certificateUrl, noSeriousAxeViolations, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// Stage 8 design critique, public surface (docs/exec/stage8/stage8-public.md, fixed under EXE40): the
// certificate's map marks, links, disclosures, unconfirmed states, long batches, public evidence words,
// organic and files lines, forced colours and the way home. Each Playwright project is one viewport
// (320, 375, 768, 1440).

let seeded: SeededCertificate;
let bare: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 3 });
  bare = seedCertificate({ events: 11, plots: 2, attestation: false });
});

async function openVerified(page: Page, s: SeededCertificate = seeded, extra = '') {
  await page.goto(certificateUrl(s, extra));
  expect(await proofFinalState(page)).toBe('verified');
}

test.describe('certificate design fixes (Stage 8)', () => {
  test('DES-200: every plot is marked, by its ID inside the outline or by a number shared with its farm row; none drawn too small to see', async ({ page }) => {
    await openVerified(page);
    const svg = page.locator('#origin-map svg');
    const rows = page.getByRole('list', { name: 'Farms in this batch' }).getByRole('listitem');
    for (const [i, plotId] of seeded.plotIds.entries()) {
      const full = svg.locator('text').filter({ hasText: seeded.producerIds[i]! });
      const badge = svg.locator(`[data-badge="${plotId}"]`);
      expect((await full.count()) + (await badge.count()), plotId).toBe(1);
      if ((await badge.count()) === 1) await expect(rows.nth(i)).toContainText(new RegExp(`^${await badge.locator('text').textContent()}Farm`));
      // the plot itself, or its ring marker, is at least 18 px across on screen
      const ring = svg.locator(`[data-ring="${plotId}"]`);
      const box = (await ((await ring.count()) ? ring : svg.locator(`g[data-plot="${plotId}"] path`).last()).boundingBox())!;
      expect(Math.max(box.width, box.height), plotId).toBeGreaterThanOrEqual(18);
    }
  });

  test('DES-205: links are underlined and the "See all checks" disclosure has a chevron; DES-218: it reads "Hide checks" when open', async ({ page }) => {
    await openVerified(page);
    const limits = page.locator('.proof a[href="#limits"]');
    expect(await limits.evaluate((a) => getComputedStyle(a).textDecorationLine)).toBe('underline');
    const more = page.locator('details').filter({ visible: true }).filter({ hasText: /See all checks \(\d+ more\)/ }).first();
    const summary = more.locator('summary');
    await expect(summary.locator('svg')).toBeVisible();
    await expect(summary).toHaveText(/^See all checks \(\d+ more\)$/, { useInnerText: true });
    await summary.click();
    await expect(summary).toHaveText('Hide checks', { useInnerText: true });
    await summary.click();
    await expect(summary).toHaveText(/^See all checks \(\d+ more\)$/, { useInnerText: true });
  });

  test('DES-211: in the desktop table the Cherry and Check headers are right-aligned over their values', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 760, 'the table shows from 760 px');
    await openVerified(page);
    const aligns = await page.locator('.e-table thead th').evaluateAll((ths) => ths.map((th) => getComputedStyle(th).textAlign));
    expect(aligns).toEqual(['left', 'left', 'left', 'right', 'right']);
  });

  test('DES-206: without JavaScript the proof card says why nothing is confirmed', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(certificateUrl(seeded));
    await expect(page.getByTestId('proof-noscript')).toHaveText('This page checks its records in your browser and needs JavaScript. Nothing here is confirmed until it runs.');
    // and nothing on the map or the journey looks confirmed (DES-210)
    expect(await page.locator('#journey svg').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length)).toBe(0);
    await context.close();
  });

  test('DES-210: while checking, no ✓ on the journey and no mint on the plots; once verified, both return', async ({ page }) => {
    await page.goto(certificateUrl(seeded, '&state=loading'));
    await expect(page.locator('.proof')).toContainText('Checking');
    const look = () =>
      page.evaluate(() => ({
        ticks: Array.from(document.querySelectorAll('#journey li svg')).filter((e) => e.checkVisibility()).length,
        stroke: getComputedStyle(document.querySelector('#origin-map g[data-plot] path:last-child')!).stroke,
      }));
    expect(await look()).toEqual({ ticks: 0, stroke: 'rgb(243, 246, 244)' });
    await openVerified(page);
    const after = await look();
    expect(after.ticks).toBe(4);
    expect(after.stroke).toBe('rgb(185, 245, 210)');
  });

  test('DES-207: a batch of more than 10 entries links from its headline down to the files', async ({ page }) => {
    await openVerified(page, bare);
    const skip = page.locator('section[aria-labelledby="h1"] a[href="#dl-block"]');
    await expect(skip).toHaveText('Go to the EUDR map file and what this can’t prove');
    await skip.click();
    await expect(page.locator('#geojson')).toBeInViewport();
    await openVerified(page); // 3 entries: no link
    await expect(page.locator('section[aria-labelledby="h1"] a[href="#dl-block"]')).toHaveCount(0);
  });

  test('DES-208 / DES-213: public evidence words: no phone sequence numbers, "limit" not "hard fail"', async ({ page }) => {
    await openVerified(page);
    // textContent: the closed "See all checks" lines count too
    const main = (await page.locator('main').textContent())!;
    expect(main).not.toMatch(/Entry \d+ follows entry \d+/);
    expect(main).not.toContain('hard fail');
    expect(main).toMatch(/First entry from this phone|Follows the previous entry from this phone/);
    expect(main).toContain('(limit 10.0%) (demo data)');
  });

  test('DES-214: with no organic certificate the section says so', async ({ page }) => {
    await openVerified(page, bare);
    await expect(page.getByTestId('organic-none')).toHaveText('No organic certificate on record for this batch.');
    await openVerified(page);
    await expect(page.getByTestId('organic-none')).toHaveCount(0);
  });

  test('DES-215 / DES-216: in mismatch the files carry an unconfirmed note, and "Does not match" reads at 7:1 or more', async ({ page }) => {
    await openVerified(page);
    await expect(page.getByTestId('files-unconfirmed')).toBeHidden();
    await page.goto(certificateUrl(seeded, `&__tamper=${TAMPER_VARIANTS[0]}`));
    expect(await proofFinalState(page)).toBe('mismatch');
    await expect(page.getByTestId('files-unconfirmed')).toBeVisible();
    await expect(page.getByTestId('files-unconfirmed')).toHaveText('These files come from this page as published, which did not match its seal. Do not rely on them.');
    const chip = page.locator('[data-flag] .vchip').filter({ visible: true }).first();
    await expect(chip).toHaveText('Does not match');
    // the chip's text against the row it sits on, sampled from the rendered pixels
    const ratio = await chip.evaluate((el) => {
      const lum = (rgb: number[]) => {
        const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      // color-mix() computes to `color(srgb r g b)` (0–1 channels); a plain colour to `rgb(r, g, b)` (0–255)
      const c = getComputedStyle(el).color;
      const n = c.match(/[\d.]+/g)!.map(Number).slice(0, 3);
      return lum(c.startsWith('color(') ? n.map((v) => v * 255) : n);
    });
    // (0.05 + L) / (0.05 + 0.0398) ≥ 7 against the chip's tint on the flagged row (luminance 0.0398, the
    // critique's 5.21:1 measurement with --bad-ink #FF8C7E), so the text luminance must be ≥ 0.579
    expect(ratio).toBeGreaterThanOrEqual(0.579);
  });

  test('DES-217: in forced colours the plot outlines use the system ink', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openVerified(page);
    const [line, text] = await page.evaluate(() => [
      getComputedStyle(document.querySelector('#origin-map g[data-plot] path:last-child')!).stroke,
      getComputedStyle(document.querySelector('#origin-map text')!).fill,
    ]);
    expect(line).toBe(text);
    expect(line).not.toBe('rgb(185, 245, 210)');
  });

  test('DES-220: the wordmark links home on the certificate and on its not-found page', async ({ page }) => {
    await openVerified(page);
    await expect(page.locator('header a[href="/"]')).toHaveText('Udgam');
    const res = await page.goto('/verify/B-UNKNOWN0?h=000000000000');
    expect(res?.status()).toBe(404);
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByTestId('certificate-hint')).toHaveText('Looking for a coffee certificate? Open the link or QR code you were given.');
  });

  test('axe: no serious violations on the touched states (verified, loading, mismatch, no organic)', async ({ page }) => {
    await openVerified(page);
    await noSeriousAxeViolations(page);
    await openVerified(page, bare);
    await noSeriousAxeViolations(page);
    await page.goto(certificateUrl(seeded, '&state=loading'));
    await noSeriousAxeViolations(page);
    await page.goto(certificateUrl(seeded, `&__tamper=${TAMPER_VARIANTS[0]}`));
    expect(await proofFinalState(page)).toBe('mismatch');
    await noSeriousAxeViolations(page);
  });
});
