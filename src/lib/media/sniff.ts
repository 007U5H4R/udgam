// Image type by magic bytes (technical-plan §22 TSK-08.1; review focus 8): a phone's file name and
// declared MIME are not trusted. TKT-19 uses this at the capture boundary
// (TSK-19.1): camera captures are JPEG or HEIC/HEIF and nothing else.

export type SniffedImage = 'image/jpeg' | 'image/heic';

/** HEIF major brands a phone camera writes (iOS: heic/mif1; bursts and sequences: heix/msf1). */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heif', 'mif1', 'msf1']);
/**
 * AVIF brands. mif1/msf1 are generic HEIF brands that AVIF encoders use as the major brand too; such a
 * file lists avif/avis among its compatible brands, and is refused (TASK-20 fix round 1).
 */
const AVIF_BRANDS = new Set(['avif', 'avis']);

/** How many leading bytes sniffImage needs to see a whole typical ftyp box, compatible brands included. */
export const SNIFF_BYTES = 64;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** The compatible brands of the ftyp box at the start of `bytes`, as far as `bytes` holds them. */
function compatibleBrands(bytes: Uint8Array): string[] {
  const boxSize = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  const end = Math.min(bytes.length, boxSize);
  const brands: string[] = [];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(bytes, i, i + 4));
  return brands;
}

/**
 * JPEG (`FF D8 FF` then a marker byte) or HEIC (`ftyp` at offset 4 with a HEIC brand at offset 8 and no
 * AVIF compatible brand), else null. A bare 3-byte JPEG start is refused: nothing that short is a photo
 * (TSK-19.1). Pass at least SNIFF_BYTES bytes when the file has them.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 12))) {
    return compatibleBrands(bytes).some((b) => AVIF_BRANDS.has(b)) ? null : 'image/heic';
  }
  return null;
}

/** The signed MIME types that describe each sniffed type (a phone may call HEIC `image/heif`). */
const SIGNED_MIMES: Record<SniffedImage, ReadonlySet<string>> = {
  'image/jpeg': new Set(['image/jpeg']),
  'image/heic': new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']),
};

/** Does a photo's signed MIME type agree with what its bytes are? */
export function mimeMatches(sniffed: SniffedImage, signedMime: string): boolean {
  return SIGNED_MIMES[sniffed].has(signedMime.toLowerCase());
}
