// Image type by magic bytes (technical-plan §22 TSK-08.1; review focus 8): a phone's file name and
// declared MIME are not trusted. TKT-19 uses this at the capture boundary.

export type SniffedImage = 'image/jpeg' | 'image/heic';

/** HEIF major brands a phone camera writes (iOS: heic/mif1; bursts and sequences: heix/msf1). */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heif', 'mif1', 'msf1']);

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** JPEG (`FF D8 FF`) or HEIC (`ftyp` at offset 4 with a HEIC brand at offset 8), else null. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 12))) return 'image/heic';
  return null;
}
