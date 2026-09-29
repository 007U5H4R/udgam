import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashFile } from './hash-file';

// TSK-10.7: each photo is hashed when "Use this photo" is tapped (S1: the original bytes; Submit then
// only canonicalises and signs). The MIME type comes from the magic bytes, not the file name or the
// type the browser guessed (review focus 8: iOS may hand over HEIC).

// Recorded SHA-256 values: assets/demo-photos/manifest.json and evals/fixtures/photos/README.md.
const manifest = JSON.parse(readFileSync('assets/demo-photos/manifest.json', 'utf8')) as { photos: { file: string; sha256: string; bytes: number }[] };
const branch01 = manifest.photos.find((p) => p.file === 'branch-01.jpg')!;
const HEIC_SHA = '00d9e0636b645036f77b3809fcd26a29df71b9ee66f2865fd8729b894aeabf59';

describe('hashFile', () => {
  it("hashes a JPEG's exact bytes to its recorded SHA-256 and reads the type from the bytes", async () => {
    const bytes = readFileSync('assets/demo-photos/branch-01.jpg');
    const r = await hashFile(new Blob([bytes], { type: '' }));
    expect(r).toEqual({ sha256: branch01.sha256, size: branch01.bytes, mime: 'image/jpeg' });
  });

  it('a HEIC named .jpg is still image/heic, with its recorded SHA-256', async () => {
    const bytes = readFileSync('evals/fixtures/photos/sample.heic');
    const r = await hashFile(new File([bytes], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    expect(r).toEqual({ sha256: HEIC_SHA, size: 293_608, mime: 'image/heic' });
  });

  it('a PNG is image/png; unknown bytes fall back to the browser-declared type', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect((await hashFile(new Blob([png]))).mime).toBe('image/png');
    expect((await hashFile(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }))).mime).toBe('image/webp');
  });
});
