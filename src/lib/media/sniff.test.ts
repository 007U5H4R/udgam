import { describe, expect, it } from 'vitest';
import { sniffImage } from './sniff';

// technical-plan §22 TSK-08.1 (Produces): images are recognised by magic bytes, not by name or MIME
// (review focus 8). TKT-19 extends these tests and uses sniffImage at the capture boundary.

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode(`ftyp${brand}`), 0, 0, 0, 0]);

describe('sniffImage', () => {
  it('JPEG: FF D8 FF', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xfe]))).toBeNull();
  });

  it('HEIC: ftyp at offset 4 with brand heic, heix, heif, mif1 or msf1', () => {
    for (const b of ['heic', 'heix', 'heif', 'mif1', 'msf1']) expect(sniffImage(ftyp(b)), b).toBe('image/heic');
  });

  it('refuses other ISO-BMFF brands, other formats, and short input', () => {
    expect(sniffImage(ftyp('avif'))).toBeNull();
    expect(sniffImage(ftyp('isom'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('\x89PNG\r\n\x1a\n'))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
