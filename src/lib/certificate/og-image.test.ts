import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_OG, OG_VARIANTS, ogVariant } from './og-image';
import { cropLabel } from './view-model';

// DES-202 (EXE43) · TC-072 · EVAL-090 · web-deliverables §4: the certificate's link-preview image says the
// batch's own words, "<District> <crop>, verified at origin", as the certificate title does; a batch whose
// district or crop is not one of the listed ones gets the neutral "Coffee, verified at origin". Each variant
// is a pre-rendered 1200 × 630 PNG under public/og/ (scripts/og/render.ts), under 500 KB, from the frozen
// artwork .design/exploration/og/index.html with only the words changed. The re-render check is in
// e2e/og-image.spec.ts (it needs Chromium).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FROZEN = join(ROOT, '.design/exploration/og/verify.png');

describe('og image variants (DES-202)', () => {
  it('one variant per district districtOf() can name × crop, plus the neutral one', () => {
    expect(OG_VARIANTS.map((v) => v.words)).toEqual([
      'Kodagu Arabica, verified at origin',
      'Kodagu Robusta, verified at origin',
      'Chikkamagaluru Arabica, verified at origin',
      'Chikkamagaluru Robusta, verified at origin',
      'Hassan Arabica, verified at origin',
      'Hassan Robusta, verified at origin',
      'Dakshina Kannada Arabica, verified at origin',
      'Dakshina Kannada Robusta, verified at origin',
      'Karnataka Arabica, verified at origin',
      'Karnataka Robusta, verified at origin',
      'Coffee, verified at origin',
    ]);
    expect(OG_VARIANTS.map((v) => v.url)).toEqual([
      '/og/verify-kodagu-arabica.png',
      '/og/verify-kodagu-robusta.png',
      '/og/verify-chikkamagaluru-arabica.png',
      '/og/verify-chikkamagaluru-robusta.png',
      '/og/verify-hassan-arabica.png',
      '/og/verify-hassan-robusta.png',
      '/og/verify-dakshina-kannada-arabica.png',
      '/og/verify-dakshina-kannada-robusta.png',
      '/og/verify-karnataka-arabica.png',
      '/og/verify-karnataka-robusta.png',
      '/og/verify-coffee.png',
    ]);
  });

  it('picks the batch’s district and crop, as the view model words them', () => {
    expect(ogVariant('Kodagu', cropLabel('arabica')).url).toBe('/og/verify-kodagu-arabica.png');
    expect(ogVariant('Chikkamagaluru', cropLabel('arabica')).url).toBe('/og/verify-chikkamagaluru-arabica.png');
    expect(ogVariant('Dakshina Kannada', cropLabel('robusta')).url).toBe('/og/verify-dakshina-kannada-robusta.png');
    expect(ogVariant('Karnataka', 'Robusta').words).toBe('Karnataka Robusta, verified at origin');
  });

  it('an unknown crop, an unknown district or two districts get the neutral variant', () => {
    for (const [district, crop] of [
      ['Kodagu', ''],
      ['Kodagu', 'Liberica'],
      ['Kodagu and Chikkamagaluru', 'Arabica'],
      ['Wayanad', 'Robusta'],
      ['', ''],
    ] as const) {
      expect(ogVariant(district, crop), `${district}/${crop}`).toBe(NEUTRAL_OG);
    }
    expect(NEUTRAL_OG).toMatchObject({ url: '/og/verify-coffee.png', words: 'Coffee, verified at origin' });
  });

  it('the alt text says the image’s words', () => {
    for (const v of OG_VARIANTS) expect(v.alt).toBe(`The Udgam coffee-cherry mark beside the words “${v.words}”`);
  });

  it('every variant is a 1200 × 630 PNG under 500 KB, and public/og holds nothing else', async () => {
    const files = readdirSync(join(ROOT, 'public/og')).sort();
    expect(files).toEqual(OG_VARIANTS.map((v) => v.url.replace('/og/', '')).sort());
    for (const v of OG_VARIANTS) {
      const path = join(ROOT, 'public', v.url);
      const m = await sharp(path).metadata();
      expect({ file: v.url, format: m.format, width: m.width, height: m.height }).toEqual({ file: v.url, format: 'png', width: 1200, height: 630 });
      expect(statSync(path).size, v.url).toBeLessThan(500 * 1024);
    }
  });

  it('the Kodagu Arabica variant matches the approved artwork (pixel diff)', async () => {
    const raw = (p: string) => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [mine, frozen] = await Promise.all([raw(join(ROOT, 'public/og/verify-kodagu-arabica.png')), raw(FROZEN)]);
    expect(mine.info).toMatchObject({ width: 1200, height: 630, channels: 3 });
    expect(frozen.info).toMatchObject({ width: 1200, height: 630, channels: 3 });
    let sum = 0;
    let off = 0;
    for (let i = 0; i < mine.data.length; i += 3) {
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(mine.data[i + c]! - frozen.data[i + c]!));
      sum += d;
      if (d > 32) off++;
    }
    const pixels = mine.data.length / 3;
    // The frozen PNG was rendered on another machine with the Google Fonts build of Figtree; this one with the
    // self-hosted woff2 on Linux Chromium. Only antialiased edges may differ: mean under 2/255, and under 1 %
    // of pixels more than 32/255 apart.
    expect(sum / pixels).toBeLessThan(2);
    expect(off / pixels).toBeLessThan(0.01);
  });
});
