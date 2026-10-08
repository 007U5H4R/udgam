import { b64uDecode, b64uEncode } from './base64url';
import { sha256Bytes, utf8 } from './hash';
import { jcs } from './jcs';

// ECDSA P-256 with SHA-256 over WebCrypto (technical-plan §5.1). Signatures are WebCrypto's native
// IEEE P1363 form (r‖s, 64 bytes), base64url without padding. DER is never accepted.

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
const P1363_BYTES = 64;

export type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };

/** A P-256 key pair. The public key is always exportable; `extractable` governs the private key. */
export async function generateKeyPair(extractable: boolean): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(ALG, extractable, ['sign', 'verify']);
}

/** The phone's device key: the private key can never leave the browser (§9). */
export function generateDeviceKey(): Promise<CryptoKeyPair> {
  return generateKeyPair(false);
}

/** The public members {kty,crv,x,y} of a P-256 JWK; throws TypeError on any other key. */
export function publicMembers(jwk: JsonWebKey): PublicJwk {
  if (
    !jwk ||
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    jwk.x.length === 0 ||
    jwk.y.length === 0
  ) {
    throw new TypeError('not a P-256 public JWK');
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/** Import only the public members of a JWK as a verify key (a private `d` is ignored). */
export function importPublicJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('jwk', publicMembers(jwk), ALG, true, ['verify']);
}

/** Sign the UTF-8 bytes of a canonical string. */
export async function sign(privateKey: CryptoKey, jcsString: string): Promise<string> {
  const sig = await globalThis.crypto.subtle.sign(SIGN, privateKey, utf8(jcsString));
  return b64uEncode(new Uint8Array(sig));
}

/** Verify a P1363 base64url signature over the exact string. Never throws: malformed input is `false`. */
export async function verify(publicJwk: JsonWebKey, jcsString: string, sigB64u: string): Promise<boolean> {
  try {
    const sig = b64uDecode(sigB64u);
    if (sig.length !== P1363_BYTES) return false;
    const key = await importPublicJwk(publicJwk);
    return await globalThis.crypto.subtle.verify(SIGN, key, sig, utf8(jcsString));
  } catch {
    return false;
  }
}

/** RFC 7638 JWK thumbprint (SHA-256, base64url) over the required members {crv,kty,x,y}. */
export async function jwkThumbprint(publicJwk: JsonWebKey): Promise<string> {
  const { crv, kty, x, y } = publicMembers(publicJwk);
  return b64uEncode(await sha256Bytes(jcs({ crv, kty, x, y })));
}
