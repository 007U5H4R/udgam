import { createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { verify as libVerify } from '../src/lib/crypto/ecdsa';

// TC-006 / EVAL-066 (browser half): the same vectors as src/lib/crypto/*.test.ts, run against
// src/lib/crypto as bundled for Chromium, plus signatures crossing between the browser and Node.

type Jwk = { kty: string; crv: string; x: string; y: string; d?: string };
type Vectors = {
  jcs: { name: string; input: string; canonical: string; sha256: string }[];
  ecdsa: {
    publicJwk: Jwk;
    testOnlyPrivateJwk: Jwk;
    thumbprint: { sha256B64u: string };
    signatures: { name: string; message: string; signature: string }[];
  };
};
const vectors = JSON.parse(readFileSync('evals/fixtures/crypto-vectors.json', 'utf8')) as Vectors;

test.beforeEach(async ({ page }) => {
  await page.goto('/__test__/crypto');
  await page.waitForFunction(() => window.udgamCrypto !== undefined);
});

test('TC-006 EVAL-066 canonical JSON and SHA-256 match every vector in Chromium', async ({ page }) => {
  const results = await page.evaluate(async (jcsVectors) => {
    const c = window.udgamCrypto!;
    const out: { name: string; canonical: string; sha256: string }[] = [];
    for (const v of jcsVectors) {
      const canonical = c.jcs(JSON.parse(v.input));
      out.push({ name: v.name, canonical, sha256: await c.sha256Hex(canonical) });
    }
    return out;
  }, vectors.jcs);
  expect(results).toEqual(vectors.jcs.map(({ name, canonical, sha256 }) => ({ name, canonical, sha256 })));
});

test('TC-006 EVAL-066 jcs throws in Chromium on undefined, NaN and Infinity', async ({ page }) => {
  const thrown = await page.evaluate(() => {
    const c = window.udgamCrypto!;
    return [undefined, { a: NaN }, { a: Infinity }, { a: new Date(0) }].map((v) => {
      try {
        c.jcs(v);
        return 'no throw';
      } catch (e) {
        return (e as Error).constructor.name;
      }
    });
  });
  expect(thrown).toEqual(['TypeError', 'TypeError', 'TypeError', 'TypeError']);
});

test('TC-006 EVAL-066 Node-made signatures and thumbprint verify in Chromium', async ({ page }) => {
  const out = await page.evaluate(async (e) => {
    const c = window.udgamCrypto!;
    const ok = [];
    for (const s of e.signatures) ok.push(await c.verify(e.publicJwk, s.message, s.signature));
    const tampered = await c.verify(e.publicJwk, e.signatures[0]!.message.replace('42.5', '43.5'), e.signatures[0]!.signature);
    return { ok, tampered, thumbprint: await c.jwkThumbprint(e.publicJwk) };
  }, vectors.ecdsa);
  expect(out).toEqual({ ok: vectors.ecdsa.signatures.map(() => true), tampered: false, thumbprint: vectors.ecdsa.thumbprint.sha256B64u });

  // A fresh node:crypto signature (not one stored in the file) also verifies in the browser.
  const message = vectors.jcs.find((v) => v.name === 'kannada-name')!.canonical;
  const sig = nodeSign('sha256', Buffer.from(message, 'utf8'), {
    key: createPrivateKey({ key: vectors.ecdsa.testOnlyPrivateJwk, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const fresh = await page.evaluate(
    ([jwk, m, s]) => window.udgamCrypto!.verify(jwk, m, s),
    [vectors.ecdsa.publicJwk, message, sig] as const,
  );
  expect(fresh).toBe(true);
});

test('TC-006 EVAL-066 a browser-made signature verifies in Node', async ({ page }) => {
  const messages = vectors.jcs.filter((v) => ['capture-payload-permuted', 'emoji-and-names', 'rfc8785-3.2.2-structure'].includes(v.name));
  const signed = await page.evaluate(async (inputs) => {
    const c = window.udgamCrypto!;
    const pair = await c.generateDeviceKey();
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const sigs = [];
    for (const v of inputs) {
      const canonical = c.jcs(JSON.parse(v.input));
      sigs.push({ canonical, signature: await c.sign(pair.privateKey, canonical) });
    }
    return { publicJwk, sigs, extractable: pair.privateKey.extractable };
  }, messages);

  expect(signed.extractable).toBe(false);
  const pub = createPublicKey({ key: signed.publicJwk as Jwk, format: 'jwk' });
  for (const [i, s] of signed.sigs.entries()) {
    expect(s.canonical).toBe(messages[i]!.canonical);
    const sigBytes = Buffer.from(s.signature, 'base64url');
    expect(sigBytes).toHaveLength(64);
    expect(nodeVerify('sha256', Buffer.from(s.canonical, 'utf8'), { key: pub, dsaEncoding: 'ieee-p1363' }, sigBytes)).toBe(true);
    expect(await libVerify(signed.publicJwk, s.canonical, s.signature)).toBe(true);
  }
});
