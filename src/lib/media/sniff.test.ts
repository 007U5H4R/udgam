import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mimeMatches, sniffImage } from './sniff';

// technical-plan §22 TSK-08.1 (Produces) and TSK-19.1 (TC-074, EVAL-081): images are recognised by
// magic bytes, not by name or MIME (review focus 8). Camera captures are JPEG or HEIC/HEIF only.

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode(`ftyp${brand}`), 0, 0, 0, 0]);
/** A whole ftyp box: size, 'ftyp', major brand, minor version 0, then the compatible brands. */
const ftypBox = (major: string, ...compatible: string[]) => {
  const body = new TextEncoder().encode(`ftyp${major}\0\0\0\0${compatible.join('')}`);
  return new Uint8Array([0, 0, 0, 4 + body.length, ...body]);
};
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

  it('HEIC with its compatible brands (as phones write it: mif1 heic, heic mif1 miaf)', () => {
    expect(sniffImage(ftypBox('mif1', 'mif1', 'heic'))).toBe('image/heic');
    expect(sniffImage(ftypBox('heic', 'mif1', 'heic', 'miaf'))).toBe('image/heic');
    expect(sniffImage(ftypBox('msf1', 'msf1', 'hevc'))).toBe('image/heic');
  });

  it('refuses AVIF under a generic HEIF major brand (mif1/msf1 + avif/avis compatible) (fix round 1)', () => {
    expect(sniffImage(ftypBox('mif1', 'mif1', 'avif'))).toBeNull();
    expect(sniffImage(ftypBox('mif1', 'avif', 'mif1', 'miaf', 'MA1B'))).toBeNull();
    expect(sniffImage(ftypBox('msf1', 'msf1', 'avis'))).toBeNull();
    expect(sniffImage(ftypBox('avif', 'mif1', 'avif'))).toBeNull();
    expect(sniffImage(ftypBox('avis', 'msf1', 'avis'))).toBeNull();
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

  it('the HEIC fixture sniffs as HEIC from its first SNIFF_BYTES bytes (fix round 1; 4 KB since fix round 2)', async () => {
    const { SNIFF_BYTES } = await import('./sniff');
    expect(SNIFF_BYTES).toBe(4096);
    expect(sniffImage(new Uint8Array(readFileSync('evals/fixtures/photos/sample.heic')).subarray(0, SNIFF_BYTES))).toBe('image/heic');
  });
});

describe('sniffImage: the ftyp box edge cases (TASK-20 fix round 2, N5)', () => {
  /** An ftyp box whose size field says `size`, whatever its real length. */
  const withSize = (size: number, box: Uint8Array) => {
    const out = new Uint8Array(box);
    new DataView(out.buffer).setUint32(0, size);
    return out;
  };
  /** 'mif1' major, then `n` filler brands, then `last` (so `last` sits at byte 16 + 4n). */
  const longBox = (n: number, last: string) => {
    const box = ftypBox('mif1', ...Array<string>(n).fill('miaf'), last);
    return withSize(box.length, box); // ftypBox writes a one-byte size
  };

  it('size 0 ("to end of file") and size 1 (a 64-bit size follows) are refused: a phone never writes them', () => {
    expect(sniffImage(withSize(0, ftypBox('mif1', 'mif1', 'heic')))).toBeNull();
    expect(sniffImage(withSize(0, ftypBox('mif1', 'mif1', 'avif')))).toBeNull();
    // size 1: the 64-bit size sits where the major brand would, and can be made to spell one
    const large = new Uint8Array([0, 0, 0, 1, ...text('ftypmif1'), 0, 0, 0, 40, ...text('mif1\0\0\0\0mif1avif')]);
    expect(sniffImage(large)).toBeNull();
    expect(sniffImage(withSize(1, ftypBox('heic', 'mif1', 'heic')))).toBeNull();
  });

  it('a size smaller than an ftyp header (16 bytes) is refused', () => {
    for (const n of [2, 8, 12, 15]) expect(sniffImage(withSize(n, ftypBox('heic', 'mif1', 'heic'))), String(n)).toBeNull();
    expect(sniffImage(withSize(16, ftypBox('heic', 'mif1', 'heic')))).toBe('image/heic'); // no compatible brands at all
  });

  it('the compatible brands are read across the whole box, not only its first 64 bytes', () => {
    expect(sniffImage(longBox(20, 'heic'))).toBe('image/heic');
    expect(sniffImage(longBox(20, 'avif'))).toBeNull(); // avif at byte 96
    expect(sniffImage(longBox(1000, 'avif'))).toBeNull(); // avif at byte 4016, the box is 4020 bytes
    expect(longBox(1019, 'avif').length).toBe(4096);
    expect(sniffImage(longBox(1019, 'avif'))).toBeNull(); // the last brand of a 4 KB box
  });

  it('only as far as the box goes: bytes after it are not brands', () => {
    const box = ftypBox('mif1', 'mif1', 'heic');
    const next = new Uint8Array([...box, 0, 0, 0, 12, ...text('metaavif')]);
    expect(sniffImage(next)).toBe('image/heic');
  });

  it('a box larger than 4 KB is refused (its brands could not all be read)', () => {
    expect(longBox(1020, 'heic').length).toBe(4100);
    expect(sniffImage(longBox(1020, 'heic'))).toBeNull();
  });

  it('the server sees what the phone sees: the first SNIFF_BYTES bytes give the same answer as the whole file', async () => {
    const { SNIFF_BYTES } = await import('./sniff');
    const photo = (box: Uint8Array) => new Uint8Array([...box, ...new Uint8Array(20_000).fill(7)]);
    for (const box of [longBox(3, 'heic'), longBox(20, 'avif'), longBox(1000, 'avif'), longBox(1019, 'avif'), longBox(1019, 'heic'), longBox(1020, 'heic')]) {
      const whole = photo(box);
      expect(sniffImage(whole.subarray(0, SNIFF_BYTES)), `${box.length}`).toBe(sniffImage(whole));
    }
  });
});

describe('mimeMatches (fix round 1)', () => {
  it('a signed MIME type must describe the sniffed bytes', () => {
    expect(mimeMatches('image/jpeg', 'image/jpeg')).toBe(true);
    for (const m of ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']) expect(mimeMatches('image/heic', m), m).toBe(true);
    for (const m of ['image/png', 'image/heic', 'image/webp', 'image/avif']) expect(mimeMatches('image/jpeg', m), m).toBe(false);
    for (const m of ['image/jpeg', 'image/avif', 'image/png']) expect(mimeMatches('image/heic', m), m).toBe(false);
  });
});
