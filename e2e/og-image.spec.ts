import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { OG_VARIANTS } from '../src/lib/certificate/og-image';
import { launchOgBrowser, renderOg } from '../scripts/og/render';

// DES-202 (EXE43) · TC-072 · @eval EVAL-090: every committed link-preview image under public/og/ is what
// scripts/og/render.ts makes today from the frozen artwork (.design/exploration/og/index.html) with that
// variant's words: re-rendered here in Chromium, it is 1200 × 630, under 500 KB, and the same picture. It
// renders with the script's own browser (launchOgBrowser), not the project's: that launch pins the glyph
// rasteriser (scripts/og/fonts.conf, no hinting, grayscale antialiasing), so the host's fontconfig and the
// Chromium binary (full Chrome here, the headless shell in CI) do not change the pixels. Another Chromium
// build may still move antialiased edges, so the check allows a mean difference under 1/255 with under
// 0.5 % of pixels more than 32/255 apart. The headline wraps after the district only when the line is too
// wide, and steps down from 74 px only when that is not enough. Needs no server; runs once (desktop project).

test.describe('link-preview images match their render (DES-202, @eval EVAL-090)', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'renders once, in the desktop project');
  test.setTimeout(120_000);

  test('every variant re-renders to the committed picture', async () => {
    const browser = await launchOgBrowser();
    try {
      const layouts: Record<string, string> = {};
      for (const v of OG_VARIANTS) {
        const { png, layout } = await renderOg(browser, v);
        layouts[v.subject] = `${layout.fontSize}px ${layout.lines.join(' / ')}`;
        expect(png.length, v.url).toBeLessThan(500 * 1024);
        const raw = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const [fresh, committed] = await Promise.all([raw(png), raw(readFileSync(join('public', v.url)))]);
        expect(fresh.info, v.url).toMatchObject({ width: 1200, height: 630, channels: 3 });
        expect(committed.info, v.url).toMatchObject({ width: 1200, height: 630, channels: 3 });
        let sum = 0;
        let off = 0;
        for (let i = 0; i < fresh.data.length; i += 3) {
          let d = 0;
          for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(fresh.data[i + c]! - committed.data[i + c]!));
          sum += d;
          if (d > 32) off++;
        }
        const pixels = fresh.data.length / 3;
        expect(sum / pixels, `${v.url} mean difference`).toBeLessThan(1);
        expect(off / pixels, `${v.url} pixels far apart`).toBeLessThan(0.005);
      }
      expect(layouts).toEqual({
        'Kodagu Arabica': '74px Kodagu Arabica, / verified at origin',
        'Kodagu Robusta': '74px Kodagu Robusta, / verified at origin',
        'Chikkamagaluru Arabica': '74px Chikkamagaluru / Arabica, / verified at origin',
        'Chikkamagaluru Robusta': '74px Chikkamagaluru / Robusta, / verified at origin',
        'Hassan Arabica': '74px Hassan Arabica, / verified at origin',
        'Hassan Robusta': '74px Hassan Robusta, / verified at origin',
        'Dakshina Kannada Arabica': '70px Dakshina Kannada / Arabica, / verified at origin',
        'Dakshina Kannada Robusta': '70px Dakshina Kannada / Robusta, / verified at origin',
        'Karnataka Arabica': '74px Karnataka / Arabica, / verified at origin',
        'Karnataka Robusta': '74px Karnataka / Robusta, / verified at origin',
        Coffee: '74px Coffee, / verified at origin',
      });
    } finally {
      await browser.close();
    }
  });
});
