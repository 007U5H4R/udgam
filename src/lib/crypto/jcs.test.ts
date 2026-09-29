import { describe, expect, it } from 'vitest';
import vectors from '../../../evals/fixtures/crypto-vectors.json';
import { b64uDecode, b64uEncode, bytesToHex, hexToBytes, jcs, sha256Hex } from './index';

// TC-006 / EVAL-066 (Node half). The browser half runs the same file in e2e/crypto-vectors.spec.ts.
describe('jcs + sha256Hex against the shared vectors (TC-006)', () => {
  it.each(vectors.jcs.map((v) => [v.name, v] as const))('%s', async (_name, v) => {
    const canonical = jcs(JSON.parse(v.input));
    expect(canonical).toBe(v.canonical);
    expect(await sha256Hex(canonical)).toBe(v.sha256);
  });

  it('covers the cases the plan names', () => {
    const names = vectors.jcs.map((v) => v.name);
    for (const n of ['key-order-ascii', 'key-order-euro-after-ascii', 'number-1e21', 'number-1e-7', 'number-negative-zero', 'number-0.1', 'number-100', 'string-escapes', 'emoji-and-names']) {
      expect(names).toContain(n);
    }
  });
});

describe('jcs rejects values JSON cannot represent exactly (TC-006)', () => {
  class Point {
    constructor(public x = 1) {}
  }
  const loneSurrogate = String.fromCharCode(0xd800);
  it.each([
    ['undefined', undefined],
    ['a nested undefined', { a: undefined }],
    ['undefined in an array', [1, undefined]],
    ['NaN', { a: NaN }],
    ['Infinity', { a: Infinity }],
    ['-Infinity', [-Infinity]],
    ['a Date', new Date(0)],
    ['a nested Date', { at: new Date(0) }],
    ['a Map', new Map()],
    ['a class instance', new Point()],
    ['a function', { f: () => 1 }],
    ['a bigint', { n: BigInt(1) }],
    ['a symbol', { s: Symbol('x') }],
    ['a lone surrogate', { s: loneSurrogate }],
    ['a lone surrogate key', { [loneSurrogate]: 1 }],
  ])('throws on %s', (_label, value) => {
    expect(() => jcs(value)).toThrow(TypeError);
  });

  it('accepts null-prototype objects and nested arrays', () => {
    const o = Object.assign(Object.create(null) as Record<string, unknown>, { b: [1, { d: null }], a: 'x' });
    expect(jcs(o)).toBe('{"a":"x","b":[1,{"d":null}]}');
  });
});

describe('sha256Hex', () => {
  it('hashes strings as UTF-8 and bytes as-is', async () => {
    // FIPS 180-2 "abc"
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await sha256Hex('abc')).toBe(abc);
    expect(await sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(abc);
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes a view into a larger buffer by its own bytes only', async () => {
    const big = new Uint8Array([0, 0x61, 0x62, 0x63, 0]);
    expect(await sha256Hex(big.subarray(1, 4))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('hex and base64url', () => {
  it('round-trips hex and rejects malformed input', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
    expect(Array.from(hexToBytes('000fFF'))).toEqual([0, 15, 255]);
    expect(() => hexToBytes('abc')).toThrow(TypeError);
    expect(() => hexToBytes('zz')).toThrow(TypeError);
  });

  it('encodes base64url without padding (RFC 4648 section 10 vectors)', () => {
    const enc = (s: string) => b64uEncode(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg');
    expect(enc('fo')).toBe('Zm8');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foob')).toBe('Zm9vYg');
    expect(enc('fooba')).toBe('Zm9vYmE');
    expect(enc('foobar')).toBe('Zm9vYmFy');
    expect(b64uEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });

  it('decodes base64url and rejects padding, standard-alphabet and impossible lengths', () => {
    expect(Array.from(b64uDecode('-_8'))).toEqual([0xfb, 0xff]);
    expect(new TextDecoder().decode(b64uDecode('Zm9vYmFy'))).toBe('foobar');
    expect(() => b64uDecode('Zg==')).toThrow(TypeError);
    expect(() => b64uDecode('+/8')).toThrow(TypeError);
    expect(() => b64uDecode('Z')).toThrow(TypeError);
    expect(() => b64uDecode('Zm 9')).toThrow(TypeError);
  });

  it('accepts exactly one encoding per byte string: non-zero pad bits are refused (RFC 4648 §3.5)', () => {
    expect(Array.from(b64uDecode('Zg'))).toEqual([0x66]);
    for (const alt of ['Zh', 'Zv', 'Zm9', 'Zm+']) expect(() => b64uDecode(alt), alt).toThrow(TypeError);
    expect(Array.from(b64uDecode('Zm8'))).toEqual([0x66, 0x6f]);
    expect(() => b64uDecode('Zm9=')).toThrow(TypeError);
    expect(() => b64uDecode('Zm9')).toThrow(TypeError); // 'o' needs pad bits 00; '9' ends in 01
  });
});
