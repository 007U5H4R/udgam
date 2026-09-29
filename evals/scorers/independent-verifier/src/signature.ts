// base64url (RFC 4648 §5, strict), the RFC 7638 kid and ES256 over P1363 bytes, from docs/proof-feed.md §3 and §7.
import { webcrypto } from 'node:crypto';
import { sha256 } from './hash';

type CryptoKey = webcrypto.CryptoKey;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i] as const));

export function base64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 !== undefined) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 !== undefined) out += ALPHABET[b2 & 63]!;
  }
  return out;
}

/** Strict decoder: no padding, alphabet only, length not 1 mod 4, zero unused trailing bits. */
export function base64urlDecode(text: string): Uint8Array {
  if (typeof text !== 'string' || text.length % 4 === 1) throw new Error('bad base64url length');
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of text) {
    const v = VALUE.get(c);
    if (v === undefined) throw new Error('bad base64url character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) throw new Error('non-zero unused base64url bits');
  return new Uint8Array(out);
}

export function isBase64url(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  try {
    base64urlDecode(text);
    return true;
  } catch {
    return false;
  }
}

/** RFC 7638 thumbprint of a P-256 public key: base64url(SHA-256('{"crv":"P-256","kty":"EC","x":…,"y":…}')). */
export async function jwkThumbprint(jwk: { x: string; y: string }): Promise<string> {
  const input = `{"crv":"P-256","kty":"EC","x":${JSON.stringify(jwk.x)},"y":${JSON.stringify(jwk.y)}}`;
  return base64urlEncode(await sha256(input));
}

/** Imports a P-256 public JWK for ES256 verification; throws on an invalid key or off-curve point. */
export function importP256(jwk: { x: string; y: string }): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/** ES256 over `message` with a 64-byte P1363 r ‖ s signature in base64url; false on any error. */
export async function verifyEs256(key: CryptoKey, signature: string, message: Uint8Array): Promise<boolean> {
  try {
    const sig = base64urlDecode(signature);
    if (sig.length !== 64) return false;
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, message);
  } catch {
    return false;
  }
}
