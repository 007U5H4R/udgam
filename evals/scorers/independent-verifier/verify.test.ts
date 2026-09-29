// TSK-18.4 · The clean-room feed checker (TC-073): a hand-built feed, the published vectors and CLI.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './src/hash';
import { jcs } from './src/jcs';
import { checkFeed } from './src/verify';
import { buildFeed, buildLedger, keyDocument, newSigner, sampleFeed, signedPayload } from './test-feed';

type Json = Record<string, unknown>;
type Entry = Json & { seq: number; kind: string; payload: Json; path: string[]; entryHash: string; ts: string };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const entriesOf = (feed: Json) => feed.entries as Entry[];
const checkpointsOf = (feed: Json) => feed.checkpoints as (Json & { signature: string; kid: string })[];
const flipHex = (h: string, at = 0) => h.slice(0, at) + (h[at] === '0' ? '1' : '0') + h.slice(at + 1);

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/proof-feed.vectors.json'), 'utf8')) as {
  keys: { keys: Json[] };
  feed: Json;
  expected: { ok: boolean; entries: number };
  tampers: { variant: string; expectedStep: string; feed: Json }[];
};

describe('checkFeed on a feed built by hand from docs/proof-feed.md', () => {
  it('accepts the intact feed: ok, every entry verified', async () => {
    const { feed, keys } = await sampleFeed();
    const r = await checkFeed(feed, keys);
    expect(r).toEqual({ ok: true, verified: 9, total: 9 });
  });

  it('a changed payload fails at payload-hash', async () => {
    const { feed, keys } = await sampleFeed();
    const e = entriesOf(feed).find((x) => x.kind === 'harvest_event')!;
    (e.payload.capture as Json).cherryKg = 99;
    const r = await checkFeed(feed, keys);
    expect(r.ok).toBe(false);
    expect(r.failure).toMatchObject({ step: 'payload-hash', seq: e.seq });
  });

  it('a changed entry field fails at entry-hash', async () => {
    const { feed, keys } = await sampleFeed();
    const e = entriesOf(feed).find((x) => x.kind === 'verification_run')!;
    e.ts = '2027-01-01T00:00:00.000Z';
    expect((await checkFeed(feed, keys)).failure).toMatchObject({ step: 'entry-hash', seq: e.seq });
  });

  it('a changed Merkle sibling fails at merkle-path', async () => {
    const { feed, keys } = await sampleFeed();
    const e = entriesOf(feed)[0]!;
    e.path[0] = flipHex(e.path[0]!);
    const r = await checkFeed(feed, keys);
    expect(r.failure).toMatchObject({ step: 'merkle-path', seq: e.seq });
    expect(r.verified).toBe(0);
  });

  it('merkle-path also catches a wrong leafIndex, checkpointId, path length and a seq outside the checkpoint', async () => {
    for (const mutate of [
      (e: Entry) => { e.leafIndex = (e.leafIndex as number) + 1; },
      (e: Entry) => { e.checkpointId = 99; },
      (e: Entry) => { e.path = e.path.slice(1); },
      (e: Entry) => { e.path = [...e.path, e.path[0]!]; },
    ]) {
      const { feed, keys } = await sampleFeed();
      const e = entriesOf(feed)[1]!;
      mutate(e);
      expect((await checkFeed(feed, keys)).failure).toMatchObject({ step: 'merkle-path', seq: e.seq });
    }
    // An entry pointed at the other checkpoint, whose range does not contain its seq.
    const { feed, keys } = await sampleFeed();
    const e = entriesOf(feed)[0]!;
    e.checkpointId = 2;
    expect((await checkFeed(feed, keys)).failure).toMatchObject({ step: 'merkle-path', seq: e.seq });
  });

  it('a changed checkpoint signature fails at checkpoint-signature', async () => {
    const { feed, keys } = await sampleFeed();
    const cp = checkpointsOf(feed)[1]!;
    cp.signature = (cp.signature[0] === 'A' ? 'B' : 'A') + cp.signature.slice(1);
    const r = await checkFeed(feed, keys);
    expect(r.failure).toMatchObject({ step: 'checkpoint-signature', checkpointId: cp.id });
    expect(r.verified).toBe(0);
  });

  it('a checkpoint statement field changed fails at checkpoint-signature', async () => {
    const { feed, keys } = await sampleFeed();
    checkpointsOf(feed)[0]!.ts = '2027-01-01T00:00:00.000Z';
    expect((await checkFeed(feed, keys)).failure).toMatchObject({ step: 'checkpoint-signature' });
  });

  it('a kid that is not in the keys fails at unknown-key', async () => {
    const { feed } = await sampleFeed();
    const other = await newSigner();
    expect((await checkFeed(feed, keyDocument(other))).failure).toMatchObject({ step: 'unknown-key' });
    // A published key whose kid member claims the checkpoint's kid but whose thumbprint differs.
    const { feed: f2, keys: k2, signer } = await sampleFeed();
    const forged = { keys: [{ ...(keyDocument(other).keys[0] as Json), kid: signer.kid }] };
    expect((await checkFeed(f2, forged)).failure).toMatchObject({ step: 'unknown-key', kid: signer.kid });
    expect((await checkFeed(f2, k2)).ok).toBe(true);
  });

  it('a wrong shortHash fails at short-hash', async () => {
    const { feed, keys } = await sampleFeed();
    feed.shortHash = flipHex(feed.shortHash as string);
    expect((await checkFeed(feed, keys)).failure).toMatchObject({ step: 'short-hash' });
  });

  it('a forbidden key anywhere fails at format before any hash', async () => {
    const { feed, keys } = await sampleFeed();
    const text = JSON.stringify(feed).replace('"payload":{', '"payload":{"__proto__":{"cherryKg":1},');
    expect((await checkFeed(JSON.parse(text), keys)).failure).toMatchObject({ step: 'format' });
    for (const k of ['constructor', 'prototype']) {
      const f = clone(feed);
      (entriesOf(f)[2]!.payload as Json)[k] = 1;
      expect((await checkFeed(f, keys)).failure).toMatchObject({ step: 'format' });
    }
  });

  it('malformed documents fail at format', async () => {
    const { feed, keys } = await sampleFeed();
    const cases: ((f: Json) => void)[] = [
      (f) => { f.format = 'udgam-proof-feed/2'; },
      (f) => { f.shortHash = (f.shortHash as string).toUpperCase().replace(/[0-9]/g, 'A'); },
      (f) => { entriesOf(f)[0]!.entryHash = entriesOf(f)[0]!.entryHash.toUpperCase(); },
      (f) => { entriesOf(f)[1]!.seq = entriesOf(f)[0]!.seq; },
      (f) => { checkpointsOf(f)[1]!.id = checkpointsOf(f)[0]!.id; },
      (f) => { checkpointsOf(f)[0]!.signature = checkpointsOf(f)[0]!.signature + '='; },
      (f) => { checkpointsOf(f)[0]!.fromSeq = 50; },
      (f) => { delete f.entries; },
      (f) => { entriesOf(f)[0]!.payload = [] as unknown as Json; },
    ];
    for (const mutate of cases) {
      const f = clone(feed);
      mutate(f);
      expect((await checkFeed(f, keys)).failure?.step).toBe('format');
    }
    expect((await checkFeed(null, keys)).failure?.step).toBe('format');
    expect((await checkFeed([], keys)).failure?.step).toBe('format');
  });

  it('a signed payload with a bad signature, wrong kid or malformed publicJwk fails at payload-signature', async () => {
    // Build fresh ledgers so every hash and checkpoint is genuine and only the payload signature is bad.
    const admin = await newSigner();
    const other = await newSigner();
    const signer = await newSigner();
    const good = await signedPayload(admin, { batchId: 'B-1', orgId: 'O', events: [], v: 1 });
    const variants: Json[] = [
      { ...good, signature: await other.sign(jcs({ batchId: 'B-1', orgId: 'O', events: [], v: 1 })) },
      { ...good, kid: other.kid },
      { ...good, publicJwk: { ...(good.publicJwk as Json), d: 'x' } },
      { ...good, publicJwk: { ...(good.publicJwk as Json), kty: 'OKP' } },
      { ...good, publicJwk: 'not-an-object' },
      { ...good, publicJwk: { ...(good.publicJwk as Json), y: (good.publicJwk as Json).x } },
      { ...good, kid: 7 },
      Object.fromEntries(Object.entries(good).filter(([k]) => k !== 'signature')),
    ];
    for (const payload of variants) {
      const ledger = await buildLedger([['admin_override', { ...payload, eventId: 'HE-1' }]], 1);
      const feed = await buildFeed({ ledger, cuts: [2], select: () => true, batchId: 'B-1', signer });
      expect((await checkFeed(feed, keyDocument(signer))).failure).toMatchObject({ step: 'payload-signature', seq: 2 });
    }
  });

  it('closure-incomplete: dropped member event, run, plot, device, wrong capture hash, broken custody, no batch', async () => {
    const drop = async (pred: (e: Entry) => boolean) => {
      const { feed, keys } = await sampleFeed();
      feed.entries = entriesOf(feed).filter((e) => !pred(e));
      return checkFeed(feed, keys);
    };
    expect((await drop((e) => e.kind === 'harvest_event' && e.payload.eventId === 'HE-1')).failure?.step).toBe('closure-incomplete');
    expect((await drop((e) => e.kind === 'verification_run' && e.payload.eventId === 'HE-2')).failure?.step).toBe('closure-incomplete');
    expect((await drop((e) => e.kind === 'plot_registered')).failure?.step).toBe('closure-incomplete');
    expect((await drop((e) => e.kind === 'device_enrolled')).failure?.step).toBe('closure-incomplete');
    expect((await drop((e) => e.kind === 'batch_created')).failure?.step).toBe('closure-incomplete');
    // Dropping the custody transfer is a trailing omission the format cannot detect (§1).
    expect((await drop((e) => e.kind === 'custody_transfer')).ok).toBe(true);
    // Dropping the override is undetectable too.
    expect((await drop((e) => e.kind === 'admin_override')).ok).toBe(true);
  });

  it('closure-incomplete on a genuine ledger whose batch lists a wrong capture hash or a broken custody chain', async () => {
    const signer = await newSigner();
    const admin = await newSigner();
    const build = async (batch: Json, custody: Json[]) => {
      const kinds: [string, Json][] = [
        ['plot_registered', { plotId: 'PL-1' }],
        ['device_enrolled', { deviceId: 'DV-1' }],
        ['harvest_event', { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: 'c'.repeat(64) }],
        ['verification_run', { eventId: 'HE-1' }],
        ['batch_created', await signedPayload(admin, batch)],
        ...(await Promise.all(custody.map(async (c) => ['custody_transfer', await signedPayload(admin, c)] as [string, Json]))),
      ];
      const ledger = await buildLedger(kinds, 0);
      const feed = await buildFeed({ ledger, cuts: [ledger.length], select: () => true, batchId: 'B-1', signer });
      return checkFeed(feed, keyDocument(signer));
    };
    const batch = { batchId: 'B-1', orgId: 'O1', events: [{ eventId: 'HE-1', payloadHash: 'c'.repeat(64) }] };
    expect((await build(batch, [])).ok).toBe(true);
    expect((await build(batch, [{ batchId: 'B-1', fromOrg: 'O1', toOrg: 'O2' }, { batchId: 'B-1', fromOrg: 'O2', toOrg: 'O3' }])).ok).toBe(true);
    const bad = (r: { failure?: { step: string } }) => r.failure?.step;
    expect(bad(await build({ ...batch, events: [{ eventId: 'HE-1', payloadHash: 'd'.repeat(64) }] }, []))).toBe('closure-incomplete');
    expect(bad(await build({ ...batch, events: [] }, []))).toBe('closure-incomplete');
    expect(bad(await build({ ...batch, events: ['HE-1'] }, []))).toBe('closure-incomplete');
    expect(bad(await build(batch, [{ batchId: 'B-1', fromOrg: 'O9', toOrg: 'O2' }]))).toBe('closure-incomplete');
    expect(bad(await build(batch, [{ batchId: 'B-1', fromOrg: 'O1', toOrg: 'O2' }, { batchId: 'B-1', fromOrg: 'O1', toOrg: 'O3' }]))).toBe('closure-incomplete');
    // A transfer for another batch id is ignored by the chain rule.
    expect((await build(batch, [{ batchId: 'B-OTHER', fromOrg: 'O7', toOrg: 'O8' }])).ok).toBe(true);
    // Two batch_created entries for the batch id: not exactly one.
    const twice = await (async () => {
      const kinds: [string, Json][] = [
        ['plot_registered', { plotId: 'PL-1' }],
        ['device_enrolled', { deviceId: 'DV-1' }],
        ['harvest_event', { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: 'c'.repeat(64) }],
        ['verification_run', { eventId: 'HE-1' }],
        ['batch_created', await signedPayload(admin, batch)],
        ['batch_created', await signedPayload(admin, { ...batch, v: 2 })],
      ];
      const ledger = await buildLedger(kinds, 0);
      const feed = await buildFeed({ ledger, cuts: [ledger.length], select: () => true, batchId: 'B-1', signer });
      return checkFeed(feed, keyDocument(signer));
    })();
    expect(bad(twice)).toBe('closure-incomplete');
  });

  it('§4 types: empty strings, a malformed ledgerKey and checkpointId 0 fail at format', async () => {
    const { feed, keys } = await sampleFeed();
    const cases: ((f: Json) => void)[] = [
      (f) => { f.batchId = ''; },
      (f) => { delete f.ledgerKey; },
      (f) => { f.ledgerKey = { kid: '', url: '/.well-known/udgam-ledger-key' }; },
      (f) => { f.ledgerKey = { kid: 'x' }; },
      (f) => { checkpointsOf(f)[0]!.kid = ''; },
      (f) => { checkpointsOf(f)[0]!.signature = ''; },
      (f) => { entriesOf(f)[0]!.kind = ''; },
      (f) => { entriesOf(f)[0]!.checkpointId = 0; },
    ];
    for (const [i, mutate] of cases.entries()) {
      const f = clone(feed);
      mutate(f);
      expect((await checkFeed(f, keys)).failure?.step, `case ${i}`).toBe('format');
    }
  });

  it('§4.2: a signature of base64url characters that does not decode strictly fails at checkpoint-signature', async () => {
    const { feed, keys } = await sampleFeed();
    const f = clone(feed);
    checkpointsOf(f)[0]!.signature = checkpointsOf(f)[0]!.signature.slice(0, 85); // 85 characters: an impossible length
    expect((await checkFeed(f, keys)).failure).toMatchObject({ step: 'checkpoint-signature' });
    const h = clone(feed);
    checkpointsOf(h)[0]!.signature = checkpointsOf(h)[0]!.signature.slice(0, 85) + 'B'; // non-zero unused bits
    expect((await checkFeed(h, keys)).failure).toMatchObject({ step: 'checkpoint-signature' });
    const g = clone(feed);
    checkpointsOf(g)[0]!.signature = checkpointsOf(g)[0]!.signature.slice(0, 84);
    expect((await checkFeed(g, keys)).failure).toMatchObject({ step: 'checkpoint-signature' });
  });

  it('§7.2: the first key whose kid matches is the one used; later keys with that kid are not tried', async () => {
    const { feed, keys, signer } = await sampleFeed();
    const good = keys.keys[0] as Json;
    const other = await newSigner();
    const impostor = { ...(keyDocument(other).keys[0] as Json), kid: signer.kid };
    expect((await checkFeed(feed, { keys: [impostor, good] })).failure).toMatchObject({ step: 'unknown-key', kid: signer.kid });
    expect((await checkFeed(feed, { keys: [good, impostor] })).ok).toBe(true);
    // Not a P-256 key → unknown-key; a P-256 key whose point is off the curve → checkpoint-signature.
    expect((await checkFeed(feed, { keys: [{ ...good, crv: 'P-384' }] })).failure?.step).toBe('unknown-key');
    const offCurve = { kty: 'EC', crv: 'P-256', x: good.x as string, y: good.x as string };
    const offKid = (await import('./src/signature')).jwkThumbprint(offCurve);
    const withOff = clone(feed);
    for (const c of checkpointsOf(withOff)) c.kid = await offKid;
    expect((await checkFeed(withOff, { keys: [{ ...offCurve, kid: await offKid }] })).failure?.step).toBe('checkpoint-signature');
  });

  it('§9.3: with two harvest_event entries for one eventId, the one with the highest seq is used', async () => {
    const signer = await newSigner();
    const admin = await newSigner();
    const build = async (first: string, second: string) => {
      const kinds: [string, Json][] = [
        ['plot_registered', { plotId: 'PL-1' }],
        ['device_enrolled', { deviceId: 'DV-1' }],
        ['harvest_event', { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: first }],
        ['harvest_event', { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: second }],
        ['verification_run', { eventId: 'HE-1' }],
        ['batch_created', await signedPayload(admin, { batchId: 'B-1', orgId: 'O1', events: [{ eventId: 'HE-1', payloadHash: 'c'.repeat(64) }] })],
      ];
      const ledger = await buildLedger(kinds, 0);
      return checkFeed(await buildFeed({ ledger, cuts: [ledger.length], select: () => true, batchId: 'B-1', signer }), keyDocument(signer));
    };
    expect((await build('d'.repeat(64), 'c'.repeat(64))).ok).toBe(true);
    expect((await build('c'.repeat(64), 'd'.repeat(64))).failure?.step).toBe('closure-incomplete');
  });

  it('entries recompute from the hand-built ledger (self-check of the helper against §5)', async () => {
    const { feed } = await sampleFeed();
    const e = entriesOf(feed)[0]!;
    expect(await sha256Hex(jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }))).toBe(e.entryHash);
  });
});

describe('checkFeed on the published vectors (docs/proof-feed.vectors.json)', () => {
  it('accepts the intact feed with the expected entry count', async () => {
    const r = await checkFeed(vectors.feed, vectors.keys);
    expect(r).toEqual({ ok: true, verified: vectors.expected.entries, total: vectors.expected.entries });
  });

  for (const t of vectors.tampers) {
    it(`rejects tamper ${t.variant} at ${t.expectedStep}`, async () => {
      const r = await checkFeed(t.feed, vectors.keys);
      expect(r.ok).toBe(false);
      expect(r.failure?.step).toBe(t.expectedStep);
    });
  }
});

describe('CLI', () => {
  const cli = resolve(process.cwd(), 'evals/scorers/independent-verifier/cli.ts');
  const tsx = resolve(process.cwd(), 'node_modules/.bin/tsx');
  const run = (args: string[]) => {
    try {
      return { code: 0, out: execFileSync(tsx, [cli, ...args], { encoding: 'utf8' }) };
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };

  it('prints the result JSON and exits 0 for an intact feed, 1 for a tampered one, 2 on usage errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanroom-cli-'));
    try {
      const feedPath = join(dir, 'feed.json');
      const keysPath = join(dir, 'keys.json');
      writeFileSync(feedPath, JSON.stringify(vectors.feed));
      writeFileSync(keysPath, JSON.stringify(vectors.keys));
      const ok = run([feedPath, keysPath]);
      expect(ok.code).toBe(0);
      expect(JSON.parse(ok.out)).toEqual({ ok: true, verified: 16, total: 16 });

      const tampered = vectors.tampers.find((t) => t.variant === 'merkle_sibling')!;
      writeFileSync(feedPath, JSON.stringify(tampered.feed));
      const bad = run([feedPath, keysPath]);
      expect(bad.code).toBe(1);
      expect(JSON.parse(bad.out).failure.step).toBe('merkle-path');

      writeFileSync(feedPath, '{not json');
      const notJson = run([feedPath, keysPath]);
      expect(notJson.code).toBe(1);
      expect(JSON.parse(notJson.out).failure.step).toBe('format');

      expect(run([feedPath]).code).toBe(2);
      expect(run([join(dir, 'missing.json'), keysPath]).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('--batch checks many feeds in one process, in order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanroom-cli-'));
    try {
      const keysPath = join(dir, 'keys.json');
      writeFileSync(keysPath, JSON.stringify(vectors.keys));
      const jobs = [vectors.feed, ...vectors.tampers.map((t) => t.feed)].map((f, i) => {
        const feedPath = join(dir, `feed-${i}.json`);
        writeFileSync(feedPath, JSON.stringify(f));
        return { feed: feedPath, keys: keysPath };
      });
      const jobsPath = join(dir, 'jobs.json');
      writeFileSync(jobsPath, JSON.stringify(jobs));
      const out = run(['--batch', jobsPath]);
      expect(out.code).toBe(0);
      const results = JSON.parse(out.out) as { ok: boolean; failure?: { step: string } }[];
      expect(results).toHaveLength(jobs.length);
      expect(results[0]!.ok).toBe(true);
      expect(results.slice(1).map((r) => r.failure?.step)).toEqual(vectors.tampers.map((t) => t.expectedStep));
      writeFileSync(jobsPath, '{"not":"a list"}');
      expect(run(['--batch', jobsPath]).code).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('--vectors checks the shared JCS, SHA-256 and ECDSA vectors with the checker\'s own code', () => {
    const out = run(['--vectors', resolve(process.cwd(), 'evals/fixtures/crypto-vectors.json')]);
    expect(out.code).toBe(0);
    expect(JSON.parse(out.out)).toMatchObject({ ok: true, failed: [] });
    expect(JSON.parse(out.out).total).toBeGreaterThanOrEqual(37);
  }, 30_000);
});
