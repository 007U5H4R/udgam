// The clean-room half of EVAL-066 (Node): the checker's own JCS, SHA-256, thumbprint and ES256 code
// agree with every shared vector in evals/fixtures/crypto-vectors.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCryptoVectors } from './src/vectors';

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), 'evals/fixtures/crypto-vectors.json'), 'utf8')) as {
  jcs: { name: string; canonical: string; sha256: string }[];
  ecdsa: { signatures: { name: string; signature: string }[]; thumbprint: { sha256B64u: string } };
};

describe('checkCryptoVectors', () => {
  it('agrees with every shared vector', async () => {
    const r = await checkCryptoVectors(vectors);
    expect(r).toEqual({ ok: true, total: vectors.jcs.length + vectors.ecdsa.signatures.length + 1, failed: [] });
  });

  it('names the vectors it disagrees with', async () => {
    const bad = structuredClone(vectors);
    bad.jcs[0]!.sha256 = '0'.repeat(64);
    bad.ecdsa.signatures[1]!.signature = bad.ecdsa.signatures[0]!.signature;
    bad.ecdsa.thumbprint.sha256B64u = 'x';
    const r = await checkCryptoVectors(bad);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual([`jcs ${bad.jcs[0]!.name}`, `ecdsa ${bad.ecdsa.signatures[1]!.name}`, 'thumbprint']);
  });

  it('a malformed vectors document is a failure, not a throw', async () => {
    expect(await checkCryptoVectors({})).toMatchObject({ ok: false });
    expect(await checkCryptoVectors(null)).toMatchObject({ ok: false });
  });
});
