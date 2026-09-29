import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sniffImage } from './sniff';

// technical-plan §22 TSK-08.1 (Produces) and TSK-19.1 (TC-074, EVAL-081): images are recognised by
// magic bytes, not by name or MIME (review focus 8). Camera captures are JPEG or HEIC/HEIF only.

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode(`ftyp${brand}`), 0, 0, 0, 0]);
const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffImage', () => {
  it('JPEG: FF D8 FF', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe1))).toBe('image/jpeg');
    expect(sniffImage(bytes(0xff, 0xd8, 0xfe, 0xe0))).toBeNull();
  });

  it('HEIC: ftyp at offset 4 with brand heic, heix, heif, mif1 or msf1', () => {
    for (const b of ['heic', 'heix', 'heif', 'mif1', 'msf1']) expect(sniffImage(ftyp(b)), b).toBe('image/heic');
  });

  it('refuses other ISO-BMFF brands', () => {
    expect(sniffImage(ftyp('avif'))).toBeNull();
    expect(sniffImage(ftyp('isom'))).toBeNull();
    expect(sniffImage(ftyp('mp42'))).toBeNull();
  });

  it('TSK-19.1 refuses PNG, WebP, GIF, PDF and text', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d))).toBeNull(); // PNG
    expect(sniffImage(text('RIFF\x24\x00\x00\x00WEBPVP8 '))).toBeNull(); // WebP
    expect(sniffImage(text('GIF89a\x01\x00\x01\x00\x80\x00'))).toBeNull(); // GIF
    expect(sniffImage(text('GIF87a\x01\x00\x01\x00\x80\x00'))).toBeNull();
    expect(sniffImage(text('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'))).toBeNull(); // PDF
    expect(sniffImage(text('just a text file labelled photo.jpg\n'))).toBeNull();
  });

  it('TSK-19.1 refuses empty and 3-byte inputs (a JPEG marker alone is not a photo)', () => {
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes(0xff))).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8, 0xff))).toBeNull();
    expect(sniffImage(ftyp('heic').subarray(0, 11))).toBeNull();
  });

  it('TSK-19.1 the fixture photos sniff as their type', () => {
    const dir = 'evals/fixtures/photos';
    const files = readdirSync(dir).filter((f) => /\.(jpe?g|heic)$/i.test(f));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const expected = f.toLowerCase().endsWith('.heic') ? 'image/heic' : 'image/jpeg';
      expect(sniffImage(new Uint8Array(readFileSync(join(dir, f)))), f).toBe(expected);
    }
  });
});
