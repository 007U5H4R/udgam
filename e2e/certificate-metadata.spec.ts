import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { certificateUrl, seedCertificate, type SeededCertificate } from './helpers/certificate';

// TSK-17.5 · TC-072 · @eval EVAL-090 (tags; the live unfurl is TC-091 in TKT-28) · web-deliverables §4: the
// certificate's link-preview tags are in the server-rendered HTML, fetched without JavaScript, both as a
// browser gets it and as a link-preview crawler does (in <head>); og:image is absolute and is served as a
// 1200 × 630 PNG. An unknown batch gets the generic title and noindex, with no batch data.

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 2 });
});

/** <meta property|name=… content=…> and <link rel=canonical> of an HTML string (attribute order as React writes it). */
function tags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)) out.set(m[1]!, m[2]!);
  const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/.exec(html);
  if (canonical) out.set('canonical', canonical[1]!);
  const title = /<title>([^<]*)<\/title>/.exec(html);
  if (title) out.set('title', title[1]!);
  return out;
}
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const CRAWLERS = { browser: undefined, 'link-preview crawler': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' } as const;

test.describe('certificate link-preview tags (TC-072, @eval EVAL-090)', () => {
  for (const [who, ua] of Object.entries(CRAWLERS)) {
    test(`server-rendered tags for a ${who}`, async ({ request }) => {
      const res = await request.get(certificateUrl(seeded), { headers: ua ? { 'user-agent': ua } : {} });
      expect(res.status()).toBe(200);
      const html = await res.text();
      const t = tags(html);
      const title = 'Kodagu Arabica, verified at origin — Udgam';
      expect(unescape(t.get('title') ?? '')).toBe(title);
      expect(unescape(t.get('og:title') ?? '')).toBe(title);
      expect(unescape(t.get('twitter:title') ?? '')).toBe(title);
      expect(unescape(t.get('description') ?? '')).toMatch(/ kg of Arabica cherry from 2 farms in Kodagu\. /);
      expect(t.get('og:description')).toBe(t.get('description'));
      expect(t.get('og:type')).toBe('website');
      expect(t.get('og:site_name')).toBe('Udgam');
      expect(t.get('og:image:width')).toBe('1200');
      expect(t.get('og:image:height')).toBe('630');
      expect(t.get('og:image:alt')?.length).toBeGreaterThan(0);
      expect(t.get('twitter:card')).toBe('summary_large_image');
      expect(t.get('robots')).toBe('noindex, nofollow');
      // absolute URLs (PUBLIC_BASE_URL; https in production, TKT-27/28)
      const image = t.get('og:image')!;
      expect(image).toMatch(/^https?:\/\/[^/]+\/og\/verify\.png$/);
      expect(t.get('twitter:image')).toBe(image);
      const page = unescape(t.get('og:url')!);
      expect(page).toMatch(new RegExp(`^https?://[^/]+/verify/${seeded.batchId}\\?h=${seeded.shortHash}$`));
      expect(unescape(t.get('canonical')!)).toBe(page);
      if (ua) {
        // a crawler that runs no script gets them in <head>
        const head = html.slice(0, html.indexOf('</head>'));
        for (const k of ['og:title', 'og:image', 'twitter:card', 'description']) expect(head, k).toContain(`"${k}"`);
      }
    });
  }

  test('og:image is served as a 1200 × 630 PNG', async ({ request }) => {
    const res = await request.get('/og/verify.png');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
    const m = await sharp(await res.body()).metadata();
    expect({ format: m.format, width: m.width, height: m.height }).toEqual({ format: 'png', width: 1200, height: 630 });
  });

  test('an unknown batch: generic title, noindex, no batch data in the tags', async ({ request }) => {
    const res = await request.get(`/verify/B-0000TEST?h=${seeded.shortHash}`);
    expect(res.status()).toBe(404);
    const html = await res.text();
    const t = tags(html);
    // Next adds its own "noindex" to a 404; every robots tag says noindex
    const robots = [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]*)"/g)].map((m) => m[1]!);
    expect(robots.length).toBeGreaterThan(0);
    for (const r of robots) expect(r).toMatch(/^noindex/);
    expect(t.has('og:title')).toBe(false);
    expect(t.has('og:image')).toBe(false);
    for (const v of t.values()) expect(v).not.toMatch(/Kodagu|Arabica|B-0000TEST/);
  });
});
