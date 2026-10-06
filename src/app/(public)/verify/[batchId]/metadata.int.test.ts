// @vitest-environment node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import type { CertificateWorld } from '../../../../lib/certificate/__fixtures__/world';

// TSK-17.5 · TC-072 · EVAL-090 (tags; the live unfurl is TC-091 in TKT-28) · web-deliverables §4: the
// certificate's generateMetadata gives a valid batch its title, description, canonical URL, Open Graph and
// Twitter tags, with the link-preview image for its own district and crop at 1200 × 630 (DES-202, EXE43:
// og/verify-<district>-<crop>.png, its alt saying the image's words), every URL absolute from PUBLIC_BASE_URL
// (https in a production configuration), and noindex, nofollow. An unknown batch, a missing h and a wrong h get the
// generic title and noindex, with no batch data. The served HTML is checked in e2e/certificate-metadata.spec.ts.

const BASE = 'https://udgam.test';
/** Seeded as the batch's farmers and office (EV16): none may reach a tag. */
const SENTINELS = { name: 'Zzsentinel Farmer', identifier: 'ID-SENTINEL-9999', phone: '9999988888' } as const;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

let t: TempDb;
let w: CertificateWorld;
/** A second world whose plots lie in Chikkamagaluru (around 75.64 E, 13.13 N; district.test.ts). */
let chikka: CertificateWorld;

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LEDGER_KEY_PATH', join(t.dir, 'keys', 'ledger.jwk'));
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('REMOTE_SENSING_PROVIDER', 'fixture');
  vi.stubEnv('PUBLIC_BASE_URL', BASE);
  const { seedCertificateWorld } = await import('../../../../lib/certificate/__fixtures__/world');
  w = await seedCertificateWorld(t.db, {
    events: 3,
    plots: 2,
    transfer: true,
    farmer: () => ({ name: SENTINELS.name, identifier: SENTINELS.identifier }),
    officePhone: SENTINELS.phone,
  });
  chikka = await seedCertificateWorld(t.db, { events: 2, plots: 1, plotShift: { lng: -0.0992, lat: 0.7089 } });
}, 120_000);

afterAll(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function metadataFor(batchId: string, h: string | undefined) {
  const { generateMetadata } = await import('./page');
  const meta = await generateMetadata({ params: Promise.resolve({ batchId }), searchParams: Promise.resolve(h === undefined ? {} : { h }) });
  return meta;
}

/** A URL as Next resolves it against metadataBase. */
const abs = (u: unknown, base: URL | null | undefined) => new URL(String(u instanceof URL ? u.href : u), base ?? undefined).href;

describe('certificate link-preview metadata (TC-072, EVAL-090)', () => {
  it('a valid batch: title, description, canonical, OG and Twitter tags with its own og image, absolute https URLs, noindex', async () => {
    const meta = await metadataFor(w.batchId, w.shortHash);
    const base = meta.metadataBase as URL;
    expect(base.href).toBe('https://udgam.test/');
    const title = 'Kodagu Arabica, verified at origin — Udgam';
    expect(meta.title).toEqual({ absolute: title });
    expect(meta.description).toBe(`${w.totalKg} kg of Arabica cherry from 2 farms in Kodagu. Every picking checked at the plot, and checked again in your browser.`);
    const page = `https://udgam.test/verify/${w.batchId}?h=${w.shortHash}`;
    expect(abs(meta.alternates?.canonical, base)).toBe(page);
    expect(meta.robots).toEqual({ index: false, follow: false });

    const og = meta.openGraph as { type: string; siteName: string; title: string; description: string; url: string; images: { url: string; width: number; height: number; alt: string }[] };
    expect(og).toMatchObject({ type: 'website', siteName: 'Udgam', title, description: meta.description });
    expect(abs(og.url, base)).toBe(page);
    expect(og.images).toHaveLength(1);
    expect(abs(og.images[0]!.url, base)).toBe('https://udgam.test/og/verify-kodagu-arabica.png');
    expect(og.images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(og.images[0]!.alt).toBe('The Udgam coffee-cherry mark beside the words “Kodagu Arabica, verified at origin”');

    const tw = meta.twitter as { card: string; title: string; description: string; images: { url: string; alt: string }[] };
    expect(tw).toMatchObject({ card: 'summary_large_image', title, description: meta.description });
    expect(abs(tw.images[0]!.url, base)).toBe('https://udgam.test/og/verify-kodagu-arabica.png');
    expect(tw.images[0]!.alt).toBe(og.images[0]!.alt);
  });

  it('a Chikkamagaluru batch: its own title, and the Chikkamagaluru image with matching alt text (DES-202)', async () => {
    const meta = await metadataFor(chikka.batchId, chikka.shortHash);
    const base = meta.metadataBase as URL;
    const title = 'Chikkamagaluru Arabica, verified at origin — Udgam';
    expect(meta.title).toEqual({ absolute: title });
    const og = meta.openGraph as { title: string; images: { url: string; width: number; height: number; alt: string }[] };
    expect(og.title).toBe(title);
    expect(og.images).toHaveLength(1);
    expect(abs(og.images[0]!.url, base)).toBe('https://udgam.test/og/verify-chikkamagaluru-arabica.png');
    expect(og.images[0]).toMatchObject({ width: 1200, height: 630, alt: 'The Udgam coffee-cherry mark beside the words “Chikkamagaluru Arabica, verified at origin”' });
    const tw = meta.twitter as { images: { url: string; alt: string }[] };
    expect(tw.images).toEqual([{ url: '/og/verify-chikkamagaluru-arabica.png', alt: og.images[0]!.alt }]);
    expect(JSON.stringify(meta)).not.toMatch(/Kodagu/);
  });

  it('a valid batch: no farmer name, identifier, office phone or producer ID in any tag (EV16)', async () => {
    const text = JSON.stringify(await metadataFor(w.batchId, w.shortHash));
    for (const sentinel of Object.values(SENTINELS)) expect(text).not.toContain(sentinel);
    expect(text).not.toMatch(/PR-[0-9A-Z]{8}/);
  });

  it('unknown batch, missing h and wrong h: the generic title and noindex, with no batch data', async () => {
    const wrong = w.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    const answers = [await metadataFor('B-UNKNOWN0', w.shortHash), await metadataFor(w.batchId, undefined), await metadataFor(w.batchId, wrong)];
    for (const meta of answers) {
      expect(meta).toEqual({ title: 'Certificate · Udgam', robots: { index: false, follow: false } });
      const text = JSON.stringify(meta);
      expect(text).not.toContain(w.batchId);
      expect(text).not.toContain(w.shortHash);
      expect(text).not.toMatch(/Kodagu|Arabica|PR-/);
    }
  });

  it('each batch’s og image is a 1200 × 630 PNG in public/ (TC-WEB-OG-ASSET)', async () => {
    for (const world of [w, chikka]) {
      const meta = await metadataFor(world.batchId, world.shortHash);
      const url = (meta.openGraph as { images: { url: string }[] }).images[0]!.url;
      const m = await sharp(join(ROOT, 'public', url)).metadata();
      expect({ url, format: m.format, width: m.width, height: m.height }).toEqual({ url, format: 'png', width: 1200, height: 630 });
    }
  });
});
