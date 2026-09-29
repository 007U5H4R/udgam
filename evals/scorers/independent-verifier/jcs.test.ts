// TSK-18.2 · RFC 8785 canonical JSON and SHA-256 in the clean-room checker, checked against the shared
// vectors (evals/fixtures/crypto-vectors.json) and the proof-feed example (docs/proof-feed.vectors.json).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jcs } from './src/jcs';
import { sha256, sha256Hex } from './src/hash';

type JcsVector = { name: string; input: string; canonical: string; sha256: string };
const vectors = JSON.parse(readFileSync(resolve(process.cwd(), 'evals/fixtures/crypto-vectors.json'), 'utf8')) as {
  jcs: JcsVector[];
};
const feedVectors = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/proof-feed.vectors.json'), 'utf8')) as {
  example: {
    entry: { payloadJcs: string; payloadHash: string; entryHashInput: string; entryHash: string };
    checkpoint: { statement: string; statementSha256: string };
  };
};

describe('clean-room JCS (RFC 8785)', () => {
  it('has the shared vectors', () => {
    expect(vectors.jcs.length).toBeGreaterThanOrEqual(30);
  });

  for (const v of vectors.jcs) {
    it(`vector ${v.name}: canonical form and SHA-256`, async () => {
      const canonical = jcs(JSON.parse(v.input));
      expect(canonical).toBe(v.canonical);
      expect(await sha256Hex(canonical)).toBe(v.sha256);
    });
  }

  it('sorts keys by UTF-16 code units, not code points', () => {
    // U+FB33 (one unit 0xFB33) sorts after U+1F600 (surrogates 0xD83D 0xDE00) by code unit.
    expect(jcs({ 'דּ': 1, '\u{1F600}': 2 })).toBe('{"\u{1F600}":2,"דּ":1}');
  });

  it('writes -0 as 0, small and large magnitudes in exponent form, 0.1 as 0.1', () => {
    expect(jcs([-0, 1e21, 1e-7, 0.1, 100, 1e20, 0.000001])).toBe('[0,1e+21,1e-7,0.1,100,100000000000000000000,0.000001]');
  });

  it('escapes only the characters RFC 8785 names, with lowercase \\u00XX', () => {
    expect(jcs('"\\\b\t\n\f\r\u0001\u001f/ \u007f')).toBe('"\\"\\\\\\b\\t\\n\\f\\r\\u0001\\u001f/ \u007f"');
  });

  it('rejects NaN, Infinity, lone surrogates and non-JSON values', () => {
    expect(() => jcs(Number.NaN)).toThrow();
    expect(() => jcs(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => jcs('\uD800')).toThrow();
    expect(() => jcs({ a: '\uDC00x' })).toThrow();
    expect(() => jcs(undefined)).toThrow();
    expect(() => jcs({ a: () => 1 })).toThrow();
    expect(() => jcs(BigInt(10))).toThrow();
  });

  it('keeps an own "__proto__" member produced by JSON.parse', () => {
    expect(jcs(JSON.parse('{"__proto__":{"a":1},"b":2}'))).toBe('{"__proto__":{"a":1},"b":2}');
  });

  it('reproduces the proof-feed example payload, entry-hash input and checkpoint statement hashes', async () => {
    const { entry, checkpoint } = feedVectors.example;
    expect(jcs(JSON.parse(entry.payloadJcs))).toBe(entry.payloadJcs);
    expect(await sha256Hex(entry.payloadJcs)).toBe(entry.payloadHash);
    expect(await sha256Hex(entry.entryHashInput)).toBe(entry.entryHash);
    expect(await sha256Hex(checkpoint.statement)).toBe(checkpoint.statementSha256);
  });

  it('hashes raw bytes (empty input is the SHA-256 of nothing)', async () => {
    const empty = await sha256(new Uint8Array(0));
    expect(Buffer.from(empty).toString('hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
