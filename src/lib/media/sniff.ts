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

/**
 * How many leading bytes the server passes to sniffImage (the phone passes the whole file): a whole ftyp
 * box of up to 4 KB, so both read the same compatible brands (TASK-20 fix round 2, N5; a phone's is
 * under 100 bytes). A larger box is refused rather than read in part.
 */
export const SNIFF_BYTES = 4096;
/** The smallest ftyp box: size, 'ftyp', major brand, minor version. */
const FTYP_HEADER = 16;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/**
 * The compatible brands of the ftyp box at the start of `bytes` (the whole box, as far as `bytes` holds
 * it), or null when its size field is one a phone never writes: 0 ("to end of file"), 1 (a 64-bit size
 * follows, which would move the major brand), less than the 16-byte header, or more than SNIFF_BYTES.
 */
function compatibleBrands(bytes: Uint8Array): string[] | null {
  const boxSize = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  if (boxSize < FTYP_HEADER || boxSize > SNIFF_BYTES) return null;
  const end = Math.min(bytes.length, boxSize);
  const brands: string[] = [];
  for (let i = FTYP_HEADER; i + 4 <= end; i += 4) brands.push(ascii(bytes, i, i + 4));
  return brands;
}

/**
 * JPEG (`FF D8 FF` then a marker byte) or HEIC (`ftyp` at offset 4 with a HEIC brand at offset 8, a box
 * size a phone writes, and no AVIF compatible brand), else null. A bare 3-byte JPEG start is refused:
 * nothing that short is a photo (TSK-19.1). Pass at least SNIFF_BYTES bytes when the file has them.
 */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 12))) {
    const brands = compatibleBrands(bytes);
    return brands === null || brands.some((b) => AVIF_BRANDS.has(b)) ? null : 'image/heic';
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
