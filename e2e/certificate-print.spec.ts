import { expect, test, type Page } from '@playwright/test';
import { TAMPER_VARIANTS } from '../src/lib/ledger/testing/tamper';
import { certificateUrl, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// TSK-17.4 · TC-071 · @eval EVAL-087 (print) · Design.md §12 print row: printed, the certificate is a light
// document. White ground and #111 ink; the warning colours (--check #7a4b00, --bad #9b2217) at 7.4:1 or
// more on white; no buttons, downloads or "check again"; no glow or blur on any element; the one lit word
// still printed in ink; fixture evidence keeps its "(demo data)" label (EXE12). The print view raises no
// CSP violation, and the screen view is unchanged (every rule sits under @media print).

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 2 });
});

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  return violations;
}

/** Elements (and pseudo-elements) that still glow or blur: box-shadow, text-shadow, filter or backdrop-filter. */
async function glowOrBlur(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after'] as const) {
        const s = getComputedStyle(el, pseudo);
        if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
        for (const p of ['box-shadow', 'text-shadow', 'filter', 'backdrop-filter', '-webkit-backdrop-filter']) {
          const v = s.getPropertyValue(p);
          if (v && v !== 'none') hits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${pseudo ?? ''} ${p}: ${v}`);
        }
      }
    }
    return hits;
  });
}

const displayOf = (page: Page, selector: string) => page.locator(selector).evaluateAll((els) => els.map((e) => getComputedStyle(e).display));

test.describe('printed certificate (TC-071, @eval EVAL-087 print)', () => {
  test('light ground, #111 ink, warnings at 7.4:1, no controls, no glow or blur, lit word in ink', async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto(certificateUrl(seeded));
    expect(await proofFinalState(page)).toBe('verified');
    // on screen: the dark ground and the controls (print rules must not leak)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 14, 12)');
    await expect(page.locator('#print')).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    const body = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, html: getComputedStyle(document.documentElement).backgroundColor }));
    expect(body).toEqual({ bg: 'rgb(255, 255, 255)', color: 'rgb(17, 17, 17)', html: 'rgb(255, 255, 255)' });

    // the warning colours, as the page's parts read them (on the certificate's root element)
    const tokens = await page.evaluate(() => {
      const root = document.querySelector('div:has(> #proof-feed)')!;
      const s = getComputedStyle(root);
      return { check: s.getPropertyValue('--check').trim(), bad: s.getPropertyValue('--bad').trim(), ok: s.getPropertyValue('--ok').trim(), ink: s.getPropertyValue('--ink').trim() };
    });
    expect(tokens).toEqual({ check: '#7a4b00', bad: '#9b2217', ok: '#14532d', ink: '#111' });
    expect(contrast(tokens.check, '#ffffff')).toBeGreaterThanOrEqual(7.4);
    expect(contrast(tokens.bad, '#ffffff')).toBeGreaterThanOrEqual(7.4);

    // no controls on paper
    expect(await displayOf(page, '#dl-block')).toEqual(['none']);
    expect(await displayOf(page, '#print')).toEqual(['none']);
    expect(new Set(await displayOf(page, 'button'))).toEqual(new Set(['none']));
    await expect(page.locator('#geojson')).toBeHidden();

    expect(await glowOrBlur(page)).toEqual([]);

    // the one lit word ("Verified", gradient text on screen) prints as plain ink, not as transparent text
    // (print.css finds it by its stable data-lit hook, not by its CSS-module class name)
    const lit = await page.locator('.proof [data-lit]').evaluate((span) => {
      const s = getComputedStyle(span);
      return { text: span.textContent, color: s.color, image: s.backgroundImage };
    });
    expect(lit).toEqual({ text: 'Verified', color: 'rgb(17, 17, 17)', image: 'none' });

    // the map's words in ink on white; the entries as the table
    expect(new Set(await page.locator('#origin-map text').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill)))).toEqual(new Set(['rgb(17, 17, 17)']));
    expect(await displayOf(page, '.e-list')).toEqual(['none']);
    expect(await displayOf(page, '.e-table-wrap')).toEqual(['block']);

    // fixture evidence keeps its label on paper (EXE12, CF-11)
    expect(await page.locator('body').innerText()).toContain('(demo data)');
    expect(violations).toEqual([]);
  });

  test('a failed proof prints without "Check again"', async ({ page }) => {
    await page.goto(certificateUrl(seeded, `&__tamper=${TAMPER_VARIANTS[0]}`));
    expect(await proofFinalState(page)).toBe('mismatch');
    await expect(page.locator('#check-again')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    expect(await displayOf(page, '#check-again')).toEqual(['none']);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.proof')!).backgroundColor)).toBe('rgb(255, 255, 255)');
    await expect(page.locator('.proof')).toContainText('Does not match');
    expect(await glowOrBlur(page)).toEqual([]);
  });
});
