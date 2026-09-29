import { createPublicKey, createPrivateKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import vectors from '../../../evals/fixtures/crypto-vectors.json';
import { b64uDecode, b64uEncode } from './base64url';
import { generateDeviceKey, generateKeyPair, importPublicJwk, jwkThumbprint, sign, verify } from './ecdsa';

const { publicJwk, testOnlyPrivateJwk, thumbprint, signatures } = vectors.ecdsa;
const MESSAGE = signatures[0]!.message;

async function exportPublic(pair: CryptoKeyPair): Promise<JsonWebKey> {
  return globalThis.crypto.subtle.exportKey('jwk', pair.publicKey);
}

describe('ECDSA P-256 sign/verify (TC-006 Node half)', () => {
  it('round-trips and produces a 64-byte P1363 signature in unpadded base64url', async () => {
    const pair = await generateKeyPair(true);
    const sig = await sign(pair.privateKey, MESSAGE);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(b64uDecode(sig)).toHaveLength(64);
    expect(await verify(await exportPublic(pair), MESSAGE, sig)).toBe(true);
  });

  it('returns false when one byte of the message or the signature changes', async () => {
    const pair = await generateKeyPair(true);
    const jwk = await exportPublic(pair);
    const sig = await sign(pair.privateKey, MESSAGE);
    expect(await verify(jwk, MESSAGE.replace('42.5', '43.5'), sig)).toBe(false);
    const bytes = b64uDecode(sig);
    bytes[10] = bytes[10]! ^ 0x01;
    expect(await verify(jwk, MESSAGE, b64uEncode(bytes))).toBe(false);
  });

  it('refuses the same signature bytes in a second encoding (last character changed only in its pad bits)', async () => {
    const good = signatures[0]!.signature;
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = ALPHABET.indexOf(good.at(-1)!);
    const alt = good.slice(0, -1) + ALPHABET[last ^ 1]; // 64 bytes = 86 chars: the last char carries 2 pad bits
    expect(alt).not.toBe(good);
    expect(await verify(publicJwk, signatures[0]!.message, good)).toBe(true);
    expect(await verify(publicJwk, signatures[0]!.message, alt)).toBe(false);
  });

  it('rejects a DER-encoded signature (P1363 only)', async () => {
    const priv = createPrivateKey({ key: testOnlyPrivateJwk, format: 'jwk' });
    let der: Buffer | undefined;
    for (let i = 0; i < 200 && der?.length !== 70; i++) der = nodeSign('sha256', Buffer.from(MESSAGE), priv);
    expect(der).toHaveLength(70);
    // A DER signature over the right message with the right key is still refused.
    expect(nodeVerify('sha256', Buffer.from(MESSAGE), createPublicKey({ key: publicJwk, format: 'jwk' }), der!)).toBe(true);
    expect(await verify(publicJwk, MESSAGE, b64uEncode(der!))).toBe(false);
  });

  it('never throws on malformed input', async () => {
    const good = signatures[0]!.signature;
    expect(await verify(publicJwk, MESSAGE, 'not base64url!')).toBe(false);
    expect(await verify(publicJwk, MESSAGE, '')).toBe(false);
    expect(await verify({ kty: 'EC', crv: 'P-384', x: publicJwk.x, y: publicJwk.y }, MESSAGE, good)).toBe(false);
    expect(await verify({ kty: 'RSA' }, MESSAGE, good)).toBe(false);
    expect(await verify({ ...publicJwk, x: 'AAAA' }, MESSAGE, good)).toBe(false);
    expect(await verify(null as unknown as JsonWebKey, MESSAGE, good)).toBe(false);
  });

  it('verifies the Node-made vector signatures and refuses them over other messages', async () => {
    for (const v of signatures) {
      expect(await verify(publicJwk, v.message, v.signature)).toBe(true);
      expect(await verify(publicJwk, v.message + ' ', v.signature)).toBe(false);
    }
  });

  it('ignores private members of a JWK passed as the public key', async () => {
    expect(await verify(testOnlyPrivateJwk, signatures[0]!.message, signatures[0]!.signature)).toBe(true);
  });

  it('agrees with node:crypto in both directions', async () => {
    // WebCrypto signs with the test-only key, node:crypto verifies.
    const priv = await globalThis.crypto.subtle.importKey('jwk', testOnlyPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = await sign(priv, MESSAGE);
    const ok = nodeVerify(
      'sha256',
      Buffer.from(MESSAGE, 'utf8'),
      { key: createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
    // node:crypto signs, WebCrypto verifies.
    const nodeSig = nodeSign('sha256', Buffer.from(MESSAGE, 'utf8'), { key: createPrivateKey({ key: testOnlyPrivateJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
    expect(await verify(publicJwk, MESSAGE, nodeSig.toString('base64url'))).toBe(true);
  });
});

describe('keys', () => {
  it('generateDeviceKey makes a non-extractable private key', async () => {
    const pair = await generateDeviceKey();
    expect(pair.privateKey.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('jwk', pair.privateKey)).rejects.toThrow();
    expect((await exportPublic(pair)).crv).toBe('P-256');
  });

  it('importPublicJwk imports only {kty,crv,x,y} as a verify key', async () => {
    const key = await importPublicJwk(testOnlyPrivateJwk);
    expect(key.type).toBe('public');
    expect(key.usages).toEqual(['verify']);
  });

  it('jwkThumbprint is the RFC 7638 SHA-256 thumbprint over {crv,kty,x,y}', async () => {
    expect(await jwkThumbprint(publicJwk)).toBe(thumbprint.sha256B64u);
    // Extra members (d, alg, kid, key order) do not change it.
    const noisy: JsonWebKey & { kid: string } = { alg: 'ES256', kid: 'k1', ...testOnlyPrivateJwk };
    expect(await jwkThumbprint(noisy)).toBe(thumbprint.sha256B64u);
  });

  it('jwkThumbprint refuses a non-P-256 key', async () => {
    await expect(jwkThumbprint({ kty: 'RSA', n: 'x', e: 'AQAB' })).rejects.toThrow(TypeError);
  });
});
