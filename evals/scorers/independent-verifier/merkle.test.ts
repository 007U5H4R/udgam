// TSK-18.3 · RFC 6962 Merkle paths and ES256 checkpoint signatures in the clean-room checker.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { concat, fromHex, sha256, toHex, utf8 } from './src/hash';
import { leafHash, nodeHash, rootFromPath, treeHash } from './src/merkle';
import { base64urlDecode, base64urlEncode, importP256, jwkThumbprint, verifyEs256 } from './src/signature';

type Jwk = { kty: string; crv: string; x: string; y: string };
const crypto = JSON.parse(readFileSync(resolve(process.cwd(), 'evals/fixtures/crypto-vectors.json'), 'utf8')) as {
  ecdsa: {
    publicJwk: Jwk;
    thumbprint: { input: string; sha256B64u: string };
    signatures: { name: string; message: string; signature: string }[];
  };
};
const feedVectors = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/proof-feed.vectors.json'), 'utf8')) as {
  keys: { keys: (Jwk & { kid: string })[] };
  example: {
    entry: { entryHash: string; leafHash: string; treeSize: number; leafIndex: number; path: string[]; merkleRoot: string };
    checkpoint: { statement: string; signature: string };
    key: { thumbprintInput: string; kid: string };
  };
};

// RFC 6962 §2.1.1 PATH(m, D[n]), built here in the test from the RFC, independently of rootFromPath.
async function auditPath(m: number, leaves: Uint8Array[]): Promise<Uint8Array[]> {
  const n = leaves.length;
  if (n <= 1) return [];
  let k = 1;
  while (k * 2 < n) k *= 2;
  if (m < k) return [...(await auditPath(m, leaves.slice(0, k))), await treeHash(leaves.slice(k))];
  return [...(await auditPath(m - k, leaves.slice(k))), await treeHash(leaves.slice(0, k))];
}

describe('clean-room Merkle (RFC 6962 / RFC 9162)', () => {
  it('uses 0x00 leaf and 0x01 node prefixes', async () => {
    const d = fromHex('11'.repeat(32));
    expect(toHex(await leafHash(d))).toBe(toHex(await sha256(concat(new Uint8Array([0]), d))));
    const l = await leafHash(d);
    expect(toHex(await nodeHash(l, l))).toBe(toHex(await sha256(concat(new Uint8Array([1]), l, l))));
    // Two leaves: MTH = H(0x01 ‖ H(0x00‖a) ‖ H(0x00‖b)); odd nodes are not duplicated for three.
    const a = fromHex('aa'.repeat(32));
    const b = fromHex('bb'.repeat(32));
    const c = fromHex('cc'.repeat(32));
    const ab = await nodeHash(await leafHash(a), await leafHash(b));
    expect(toHex(await treeHash([a, b]))).toBe(toHex(ab));
    expect(toHex(await treeHash([a, b, c]))).toBe(toHex(await nodeHash(ab, await leafHash(c))));
  });

  it('recomputes the root of a 7-leaf tree from every leaf path; a flipped sibling fails', async () => {
    const leaves = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => sha256(`leaf-${i}`)));
    const root = toHex(await treeHash(leaves));
    for (let i = 0; i < 7; i++) {
      const path = await auditPath(i, leaves);
      const got = await rootFromPath(leaves[i]!, i, 7, path);
      expect(got && toHex(got)).toBe(root);
      for (let j = 0; j < path.length; j++) {
        const flipped = path.map((p) => new Uint8Array(p));
        flipped[j]![0] = flipped[j]![0]! ^ 1;
        const bad = await rootFromPath(leaves[i]!, i, 7, flipped);
        expect(bad && toHex(bad)).not.toBe(root);
      }
      // Wrong index, too short, too long, or an index past the tree all fail.
      const wrongIndex = await rootFromPath(leaves[i]!, (i + 1) % 7, 7, path);
      expect(wrongIndex && toHex(wrongIndex)).not.toBe(root);
      expect(await rootFromPath(leaves[i]!, i, 7, path.slice(0, -1))).toBeNull();
      expect(await rootFromPath(leaves[i]!, i, 7, [...path, path[0]!])).toBeNull();
    }
    expect(await rootFromPath(leaves[0]!, 7, 7, [])).toBeNull();
  });

  it('a one-leaf tree has an empty path', async () => {
    const d = fromHex('01'.repeat(32));
    const got = await rootFromPath(d, 0, 1, []);
    expect(got && toHex(got)).toBe(toHex(await treeHash([d])));
  });

  it('reproduces the proof-feed example path under a 100-leaf tree', async () => {
    const e = feedVectors.example.entry;
    expect(toHex(await leafHash(fromHex(e.entryHash)))).toBe(e.leafHash);
    const got = await rootFromPath(fromHex(e.entryHash), e.leafIndex, e.treeSize, e.path.map(fromHex));
    expect(got && toHex(got)).toBe(e.merkleRoot);
  });
});

describe('clean-room base64url, thumbprint and ES256', () => {
  it('decodes strictly: no padding, alphabet only, no length 1 mod 4, zero trailing bits', () => {
    expect(base64urlEncode(base64urlDecode('_-8'))).toBe('_-8');
    expect(Array.from(base64urlDecode('AQID'))).toEqual([1, 2, 3]);
    expect(() => base64urlDecode('AQ==')).toThrow();
    expect(() => base64urlDecode('A+/B')).toThrow();
    expect(() => base64urlDecode('AQIDB')).toThrow();
    expect(() => base64urlDecode('AR')).toThrow(); // 'R' leaves non-zero unused bits
    expect(Array.from(base64urlDecode('AQ'))).toEqual([1]);
  });

  it('computes the RFC 7638 thumbprint', async () => {
    const { publicJwk, thumbprint } = crypto.ecdsa;
    expect(await jwkThumbprint(publicJwk)).toBe(thumbprint.sha256B64u);
    const k = feedVectors.keys.keys[0]!;
    expect(await jwkThumbprint(k)).toBe(feedVectors.example.key.kid);
    expect(k.kid).toBe(feedVectors.example.key.kid);
  });

  it('verifies every shared ECDSA vector over P1363 bytes; a changed byte or message fails', async () => {
    const key = await importP256(crypto.ecdsa.publicJwk);
    for (const s of crypto.ecdsa.signatures) {
      expect(await verifyEs256(key, s.signature, utf8(s.message)), s.name).toBe(true);
      expect(await verifyEs256(key, s.signature, utf8(s.message + ' '))).toBe(false);
      const bytes = base64urlDecode(s.signature);
      bytes[10] = bytes[10]! ^ 0xff;
      expect(await verifyEs256(key, base64urlEncode(bytes), utf8(s.message))).toBe(false);
    }
  });

  it('verifies the proof-feed checkpoint statement signature with the published key', async () => {
    const key = await importP256(feedVectors.keys.keys[0]!);
    const { statement, signature } = feedVectors.example.checkpoint;
    expect(await verifyEs256(key, signature, utf8(statement))).toBe(true);
    expect(await verifyEs256(key, signature, utf8(statement.replace('"v":1', '"v":2')))).toBe(false);
  });

  it('rejects a DER or wrong-length signature and a malformed key', async () => {
    const key = await importP256(crypto.ecdsa.publicJwk);
    const s = crypto.ecdsa.signatures[0]!;
    expect(await verifyEs256(key, base64urlEncode(base64urlDecode(s.signature).slice(0, 63)), utf8(s.message))).toBe(false);
    expect(await verifyEs256(key, 'not base64url!', utf8(s.message))).toBe(false);
    await expect(importP256({ ...crypto.ecdsa.publicJwk, y: crypto.ecdsa.publicJwk.x })).rejects.toThrow();
  });
});
