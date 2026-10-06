// Renders the certificate's link-preview images (DES-202, EXE43) from the frozen artwork,
// .design/exploration/og/index.html, with only the words changed: one 1200 × 630 PNG per variant in
// src/lib/certificate/og-image.ts, written to public/og/verify-<slug>.png. Deterministic HTML/CSS in
// headless Chromium; no generated imagery (og-image-guidelines §5). The fonts are the self-hosted Figtree
// files (src/app/fonts) and the cherry is public/brand/cherry.svg, both inlined, so nothing is fetched.
//
// Long words: the headline keeps the artwork's 74 px, two lines ("<District> <crop>," / "verified at
// origin"). When the first line is wider than the copy column it splits after the district (three lines),
// and only when a line still does not fit does the whole headline step down 1 px at a time until it does.
//
// Run and commit the output: `pnpm og:render`. e2e/og-image.spec.ts re-renders every variant and compares.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import { OG_SIZE, OG_VARIANTS, type OgVariant } from '../../src/lib/certificate/og-image';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FROZEN_HTML = join(ROOT, '.design/exploration/og/index.html');
const FROZEN_HEADLINE = '<span class="line">Kodagu Arabica,</span>';
const FROZEN_WORDS = 'Kodagu Arabica, verified at origin';

/** Same resolution as playwright.config.ts: PW_CHROMIUM_PATH, else the VM's preinstalled build outside CI. */
const PRE_INSTALLED = '/opt/pw-browsers/chromium';
export function chromiumPath(): string | undefined {
  return process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function replaceOnce(html: string, from: string | RegExp, to: string): string {
  const count = typeof from === 'string' ? html.split(from).length - 1 : (html.match(new RegExp(from.source, `${from.flags.replace('g', '')}g`)) ?? []).length;
  if (count !== 1) throw new Error(`og render: expected one ${String(from)} in the frozen artwork, found ${count}`);
  return html.replace(from, () => to);
}

const dataUrl = (path: string, mime: string) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;

/** The frozen page with self-hosted fonts and the cherry inlined, and the variant's words in the headline. */
export function ogHtml(v: OgVariant): string {
  let html = readFileSync(FROZEN_HTML, 'utf8');
  html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '');
  const faces = [500, 600, 800]
    .map((w) => `@font-face{font-family:"Figtree";font-style:normal;font-weight:${w};src:url(${dataUrl(join(ROOT, `src/app/fonts/figtree-latin-${w}-normal.woff2`), 'font/woff2')}) format("woff2")}`)
    .join('');
  html = replaceOnce(html, /<link href="https:\/\/fonts\.googleapis\.com\/[^"]*" rel="stylesheet">/, `<style>${faces}</style>`);
  html = replaceOnce(html, '../final/cherry.svg', dataUrl(join(ROOT, 'public/brand/cherry.svg'), 'image/svg+xml'));
  html = replaceOnce(html, FROZEN_HEADLINE, `<span class="line">${esc(v.subject)},</span>`);
  html = replaceOnce(html, FROZEN_WORDS, esc(v.words));
  return html;
}

export type OgLayout = { lines: string[]; fontSize: number };

/**
 * Fit the headline into the copy column (see the header) and report the layout used. Plain JavaScript run
 * in the page, kept as source text so the TypeScript loader's helpers (esbuild's __name) never reach it.
 */
const FIT_HEADLINE = `(subject) => {
  const h1 = document.querySelector('#og h1');
  const last = h1.querySelector('.line:last-child').outerHTML;
  const column = h1.clientWidth;
  const width = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
  const lines = () => [...h1.querySelectorAll('.line')];
  const fits = () => lines().every((l) => width(l) <= column);
  const words = subject.split(' ');
  const crop = words.length > 1 ? words.pop() : null;
  if (!fits() && crop) {
    h1.innerHTML = '<span class="line"></span><span class="line"></span>' + last;
    const [district, cropLine] = lines();
    district.textContent = words.join(' ');
    cropLine.textContent = crop + ',';
  }
  let size = parseFloat(getComputedStyle(h1).fontSize);
  while (!fits() && size > 40) h1.style.fontSize = --size + 'px';
  if (!fits()) throw new Error('og render: "' + subject + '" does not fit');
  return { lines: lines().map((l) => l.textContent), fontSize: size };
}`;

async function fitHeadline(page: Page, v: OgVariant): Promise<OgLayout> {
  return page.evaluate(`(${FIT_HEADLINE})(${JSON.stringify(v.subject)})`) as Promise<OgLayout>;
}

/** One variant as PNG bytes (RGB, 1200 × 630). */
export async function renderOg(browser: Browser, v: OgVariant): Promise<{ png: Buffer; layout: OgLayout }> {
  const page = await browser.newPage({ viewport: { width: 1248, height: 800 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(ogHtml(v), { waitUntil: 'load' });
    await page.evaluate(`Promise.all(['500 26px Figtree', '800 34px Figtree', '800 74px Figtree'].map((f) => document.fonts.load(f))).then(() => document.fonts.ready).then(() => undefined)`);
    const layout = await fitHeadline(page, v);
    const shot = await page.locator('#og').screenshot({ animations: 'disabled' });
    const png = await sharp(shot).removeAlpha().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const m = await sharp(png).metadata();
    if (m.width !== OG_SIZE.width || m.height !== OG_SIZE.height) throw new Error(`og render: ${v.url} is ${m.width} × ${m.height}`);
    return { png, layout };
  } finally {
    await page.close();
  }
}

export async function launchOgBrowser(): Promise<Browser> {
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { executablePath } : {});
}

async function main(): Promise<void> {
  mkdirSync(join(ROOT, 'public/og'), { recursive: true });
  const browser = await launchOgBrowser();
  try {
    for (const v of OG_VARIANTS) {
      const { png, layout } = await renderOg(browser, v);
      if (png.length >= 500 * 1024) throw new Error(`og render: ${v.url} is ${png.length} B (budget 500 KB)`);
      writeFileSync(join(ROOT, 'public', v.url), png);
      console.log(`wrote public${v.url} · ${png.length} B · ${layout.fontSize}px · ${layout.lines.join(' / ')}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
