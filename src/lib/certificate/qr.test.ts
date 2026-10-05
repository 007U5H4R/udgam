import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProofFeedV1 } from '../ledger/proof';
import { certificateUrl, qrPng, qrSvg } from './qr';

// TSK-16.7 · TC-069: decoding the generated QR yields `${PUBLIC_BASE_URL}/verify/<batchId>?h=<12 hex>`,
// and the short hash is the batch_created entry hash prefix.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;

async function decode(png: Buffer): Promise<string | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)?.data ?? null;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('certificate QR (TSK-16.7, TC-069)', () => {
  it('decodes to the absolute certificate URL with h (PUBLIC_BASE_URL=https://udgam.test)', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_BASE_URL', 'https://udgam.test');
    const qr = await import('./qr');
    const url = qr.certificateUrl('B-7K2M9Q4D', '3f9a1c0b7e2d');
    expect(url).toBe('https://udgam.test/verify/B-7K2M9Q4D?h=3f9a1c0b7e2d');
    expect(await decode(await qr.qrPng(url))).toBe('https://udgam.test/verify/B-7K2M9Q4D?h=3f9a1c0b7e2d');
  });

  it('an explicit base wins and a trailing slash is not doubled', () => {
    expect(certificateUrl('B-7K2M9Q4D', '3f9a1c0b7e2d', 'https://udgamtrace.in/')).toBe('https://udgamtrace.in/verify/B-7K2M9Q4D?h=3f9a1c0b7e2d');
  });

  it("a seeded batch's short hash is the first 12 hex of its batch_created entry hash", async () => {
    const created = FEED.entries.find((e) => e.kind === 'batch_created')!;
    expect(FEED.shortHash).toBe(created.entryHash.slice(0, 12));
    const url = certificateUrl(FEED.batchId, created.entryHash.slice(0, 12), 'https://udgam.test');
    expect(await decode(await qrPng(url))).toBe(`https://udgam.test/verify/${FEED.batchId}?h=${FEED.shortHash}`);
  });

  it('the SVG is a scalable QR image with a quiet zone', async () => {
    const svg = await qrSvg('https://udgam.test/verify/B-7K2M9Q4D?h=3f9a1c0b7e2d');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1"/);
    expect(svg).not.toMatch(/<script/i);
  });
});
