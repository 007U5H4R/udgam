// base64url (RFC 4648 §5) without padding, strict on decode. No Buffer: this runs in the browser too.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b64uEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/** Decode unpadded, canonical base64url. Throws TypeError on padding, foreign characters, an impossible length or non-zero trailing bits. */
export function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  if (s.length % 4 === 1) throw new TypeError('b64uDecode: impossible length');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new TypeError('b64uDecode: not base64url');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
    acc &= 0xff; // keep only bits not yet emitted
  }
  // Canonical only (RFC 4648 §3.5): the unused trailing bits must be zero, so every byte string has
  // exactly one accepted encoding and a signature cannot be re-spelled.
  if ((acc & ((1 << bits) - 1)) !== 0) throw new TypeError('b64uDecode: non-canonical trailing bits');
  return out;
}
