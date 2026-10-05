import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { b64uDecode, b64uEncode, bytesToHex, generateKeyPair, hexToBytes, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../crypto';
import { merkleTree } from './merkle';
import { verifyFeed, verifyProof, type FeedEntry, type Proof, type ProofFeedV1, type VerifierKey } from './proof';

// TSK-15.4: verifyFeed names the first failing step; the feed here is built from a small in-test
// ledger with lib/crypto only (hash formulas from technical-plan §8.1–§8.3).

type Key = { pair: CryptoKeyPair; jwk: JsonWebKey; kid: string };
async function newKey(): Promise<Key> {
  const pair = await generateKeyPair(true);
  const jwk = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
  return { pair, jwk, kid: await jwkThumbprint(jwk) };
}
const published = (k: Key): VerifierKey => ({ ...k.jwk, kid: k.kid, use: 'sig', alg: 'ES256' });

async function signed(admin: Key, statement: Record<string, unknown>) {
  return { ...statement, kid: admin.kid, publicJwk: admin.jwk, signature: await sign(admin.pair.privateKey, jcs(statement)) };
}

type Raw = { kind: string; payload: Record<string, unknown> };
const TS = (i: number) => `2026-10-01T00:00:${String(i).padStart(2, '0')}.000Z`;

async function chain(raws: Raw[]) {
  const out: Omit<FeedEntry, 'checkpointId' | 'leafIndex' | 'path'>[] = [];
  let prevHash = '0'.repeat(64);
  for (const [i, r] of raws.entries()) {
    const seq = i + 1;
    const payloadHash = await sha256Hex(jcs(r.payload));
    const ts = TS(seq);
    const entryHash = await sha256Hex(jcs({ seq, prev_hash: prevHash, kind: r.kind, payload_hash: payloadHash, ts }));
    out.push({ seq, prevHash, kind: r.kind, payload: r.payload, payloadHash, ts, entryHash });
    prevHash = entryHash;
  }
  return out;
}

/** Seal ranges under checkpoints signed by `ledger`, returning a feed of the listed seqs. */
async function feedOf(entries: Awaited<ReturnType<typeof chain>>, ranges: [number, number][], ledger: Key, batchId: string): Promise<ProofFeedV1> {
  const checkpoints: ProofFeedV1['checkpoints'] = [];
  const out: FeedEntry[] = [];
  let prev = '0'.repeat(64);
  for (const [i, [from, to]] of ranges.entries()) {
    const slice = entries.filter((e) => e.seq >= from && e.seq <= to);
    const tree = await merkleTree(slice.map((e) => hexToBytes(e.entryHash)));
    const fields = { id: i + 1, fromSeq: from, toSeq: to, merkleRoot: bytesToHex(tree.root), prevCheckpointHash: prev, ts: TS(50 + i) };
    const statement = jcs({ v: 1, ...fields });
    checkpoints.push({ ...fields, kid: ledger.kid, signature: await sign(ledger.pair.privateKey, statement) });
    prev = await sha256Hex(statement);
    slice.forEach((e, j) => out.push({ ...e, checkpointId: i + 1, leafIndex: j, path: tree.path(j).map(bytesToHex) }));
  }
  const batch = out.find((e) => e.kind === 'batch_created')!;
  return {
    format: 'udgam-proof-feed/1',
    batchId,
    shortHash: batch.entryHash.slice(0, 12),
    ledgerKey: { kid: ledger.kid, url: '/.well-known/udgam-ledger-key' },
    checkpoints,
    entries: out,
  };
}

type WorldOptions = {
  badBatchSignature?: boolean;
  /** The payloadHash batch_created lists for HE-2 (default: HE-2's own capture hash). */
  listedHashHe2?: string;
  /** Replace the admin publicJwk embedded in batch_created (the signature stays the admin's). */
  batchJwk?: (jwk: JsonWebKey) => unknown;
  /** Replace entries at these positions (0-based) before chaining. */
  replace?: Record<number, Raw>;
};

const HASH_HE1 = 'a'.repeat(64);
const HASH_HE2 = 'b'.repeat(64);

async function world(opts: WorldOptions = {}) {
  const ledger = await newKey();
  const admin = await newKey();
  const batchId = 'B-TEST0001';
  const events = [
    { eventId: 'HE-1', payloadHash: HASH_HE1 },
    { eventId: 'HE-2', payloadHash: opts.listedHashHe2 ?? HASH_HE2 },
  ];
  const statement = { v: 1, batchId, orgId: 'ORG-FPO', crop: 'arabica', events, quantityKg: 72.5, integrityScore: 0.91, adminId: 'AD-1', ts: TS(7) };
  const batch: Record<string, unknown> = await signed(admin, statement);
  if (opts.badBatchSignature) batch.signature = (await signed(admin, { ...statement, quantityKg: 1 })).signature;
  if (opts.batchJwk) batch.publicJwk = opts.batchJwk(admin.jwk);
  const raws: Raw[] = [
    { kind: 'plot_registered', payload: { plotId: 'PL-1', producerId: 'PR-1', crop: 'arabica' } },
    { kind: 'device_enrolled', payload: { deviceId: 'DV-1' } },
    { kind: 'harvest_event', payload: { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: HASH_HE1, cherryKg: 42.5 } },
    { kind: 'verification_run', payload: { runId: 'VR-1', eventId: 'HE-1', verdict: 'Verified' } },
    { kind: 'harvest_event', payload: { eventId: 'HE-2', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: HASH_HE2, cherryKg: 30 } },
    { kind: 'verification_run', payload: { runId: 'VR-2', eventId: 'HE-2', verdict: 'Verified' } },
    { kind: 'batch_created', payload: batch },
    { kind: 'custody_transfer', payload: await signed(admin, { v: 1, batchId, fromOrg: 'ORG-FPO', toOrg: 'ORG-BUY', ts: TS(8), adminId: 'AD-1' }) },
  ].map((r, i) => opts.replace?.[i] ?? r);
  const entries = await chain(raws);
  const feed = await feedOf(entries, [[1, 5], [6, 8]], ledger, batchId);
  return { feed, keys: [published(ledger)], ledger, admin, entries };
}

const clone = <T>(v: T): T => structuredClone(v);
const bySeq = (f: ProofFeedV1, seq: number) => f.entries.find((e) => e.seq === seq)!;

describe('verifyFeed (TSK-15.4)', () => {
  it('accepts an intact feed and reports the entry count, the checkpoints and the verified feed', async () => {
    const { feed, keys, ledger } = await world();
    const received = JSON.parse(JSON.stringify(feed)) as ProofFeedV1;
    expect(await verifyFeed(received, keys)).toEqual({ ok: true, entries: 8, checkpoints: [{ id: 1, kid: ledger.kid }, { id: 2, kid: ledger.kid }], feed });
  });

  it('returns the verified feed without unknown members, as its own copy (nit)', async () => {
    const { feed, keys } = await world();
    const received = JSON.parse(JSON.stringify({ ...feed, evm: { chainId: 31337 } })) as { entries: FeedEntry[] };
    const out = await verifyFeed(received, keys);
    if (!out.ok) throw new Error(`expected ok, got ${out.step}`);
    expect(out.feed).toEqual(feed);
    expect('evm' in out.feed).toBe(false);
    received.entries[2]!.payload.cherryKg = 1;
    expect(bySeq(out.feed, 3).payload.cherryKg).toBe(42.5); // later changes to the input do not reach it
  });

  it('hashes the payload as received: an own "__proto__" member is refused at format (quality #1)', async () => {
    const { feed, keys } = await world();
    // Built as text, so JSON.parse gives an own "__proto__" key that schema parsing would drop unhashed.
    const text = JSON.stringify(feed).replace('"cherryKg":42.5', '"cherryKg":42.5,"__proto__":{"cherryKg":9999,"note":"forged"}');
    const received = JSON.parse(text) as { entries: { payload: object }[] };
    expect(Object.keys(received.entries[2]!.payload)).toContain('__proto__');
    expect(await verifyFeed(received, keys)).toEqual({ ok: false, step: 'format' });
  });

  it('refuses a "constructor" or "prototype" key anywhere in the feed at format (quality #1)', async () => {
    const { feed, keys } = await world();
    const nested = JSON.parse(JSON.stringify(feed).replace('"crop":"arabica"', '"crop":"arabica","polygon":{"constructor":{"x":1}}')) as unknown;
    expect(await verifyFeed(nested, keys)).toEqual({ ok: false, step: 'format' });
    const top = JSON.parse(JSON.stringify({ ...feed, ledgerKey: { ...feed.ledgerKey, prototype: 1 } })) as unknown;
    expect(await verifyFeed(top, keys)).toEqual({ ok: false, step: 'format' });
    const inArray = JSON.parse(JSON.stringify(feed).replace('"fromSeq":1,', '"fromSeq":1,"__proto__":{"id":7},')) as unknown;
    expect(await verifyFeed(inArray, keys)).toEqual({ ok: false, step: 'format' });
  });

  it('cherryKg changed → payload-hash', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    bySeq(f, 3).payload.cherryKg = 99;
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'payload-hash', seq: 3 });
  });

  it('entry ts changed (payloadHash still recomputes) → entry-hash', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    bySeq(f, 4).ts = '2026-10-02T00:00:00.000Z';
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'entry-hash', seq: 4 });
  });

  it('one path element changed → merkle-path', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    const e = bySeq(f, 2);
    e.path[0] = e.path[0]!.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'merkle-path', seq: 2, checkpointId: 1 });
  });

  it('checkpoint signature byte flipped → checkpoint-signature', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    const sig = b64uDecode(f.checkpoints[1]!.signature);
    sig[5] = sig[5]! ^ 0x01;
    f.checkpoints[1]!.signature = b64uEncode(sig);
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'checkpoint-signature', checkpointId: 2 });
  });

  it('checkpoint re-signed with a key that is not published → unknown-key (the feed cannot supply its own key)', async () => {
    const { feed, keys } = await world();
    const other = await newKey();
    const f = clone(feed);
    const cp = f.checkpoints[0]!;
    cp.kid = other.kid;
    cp.signature = await sign(other.pair.privateKey, jcs({ v: 1, id: cp.id, fromSeq: cp.fromSeq, toSeq: cp.toSeq, merkleRoot: cp.merkleRoot, prevCheckpointHash: cp.prevCheckpointHash, ts: cp.ts }));
    f.ledgerKey.kid = other.kid;
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'unknown-key', checkpointId: 1, kid: other.kid });
  });

  it('a published key whose kid is not its thumbprint is not trusted → unknown-key', async () => {
    const { feed, ledger } = await world();
    const other = await newKey();
    expect(await verifyFeed(feed, [{ ...other.jwk, kid: ledger.kid }])).toMatchObject({ ok: false, step: 'unknown-key' });
  });

  it('two adjacent entries swapped (hashes recomputed by the forger) → merkle-path', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    const a = bySeq(f, 3);
    const b = bySeq(f, 4);
    const swap = <K extends 'kind' | 'payload' | 'payloadHash' | 'ts'>(k: K) => {
      const t = a[k];
      a[k] = b[k];
      b[k] = t;
    };
    swap('kind');
    swap('payload');
    swap('payloadHash');
    swap('ts');
    // keep the chain self-consistent, as a forger would
    a.entryHash = await sha256Hex(jcs({ seq: a.seq, prev_hash: a.prevHash, kind: a.kind, payload_hash: a.payloadHash, ts: a.ts }));
    b.prevHash = a.entryHash;
    b.entryHash = await sha256Hex(jcs({ seq: b.seq, prev_hash: b.prevHash, kind: b.kind, payload_hash: b.payloadHash, ts: b.ts }));
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'merkle-path', seq: 3, checkpointId: 1 });
  });

  it('an entry dropped → closure-incomplete', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    f.entries = f.entries.filter((e) => e.seq !== 5); // HE-2's harvest_event
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a verification run dropped → closure-incomplete', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    f.entries = f.entries.filter((e) => e.seq !== 4);
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('shortHash altered → short-hash', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    f.shortHash = f.shortHash.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'short-hash', seq: 7 });
  });

  it('a signed payload whose signature does not match its statement → payload-signature', async () => {
    const { feed, keys } = await world({ badBatchSignature: true });
    expect(await verifyFeed(feed, keys)).toEqual({ ok: false, step: 'payload-signature', seq: 7 });
  });

  it('a custody transfer that does not chain from the batch → closure-incomplete', async () => {
    // Re-anchor a custody payload from another holder; every hash is consistent, only the chain is not.
    const w = await world();
    const raws = w.entries.map((e) => ({ kind: e.kind, payload: e.payload }));
    raws[7] = { kind: 'custody_transfer', payload: await signed(w.admin, { v: 1, batchId: 'B-TEST0001', fromOrg: 'ORG-ELSE', toOrg: 'ORG-BUY', ts: TS(8), adminId: 'AD-1' }) };
    const f = await feedOf(await chain(raws), [[1, 5], [6, 8]], w.ledger, 'B-TEST0001');
    expect(await verifyFeed(f, w.keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a harvest_event whose device has no device_enrolled in the feed → closure-incomplete (minor #2)', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    f.entries = f.entries.filter((e) => e.kind !== 'device_enrolled');
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a harvest_event whose plot has no plot_registered in the feed → closure-incomplete (minor #2)', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    f.entries = f.entries.filter((e) => e.kind !== 'plot_registered');
    expect(await verifyFeed(f, keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a device_enrolled or plot_registered for another id does not count (minor #2)', async () => {
    const devices = await world({ replace: { 1: { kind: 'device_enrolled', payload: { deviceId: 'DV-OTHER' } } } });
    expect(await verifyFeed(devices.feed, devices.keys)).toEqual({ ok: false, step: 'closure-incomplete' });
    const plots = await world({ replace: { 0: { kind: 'plot_registered', payload: { plotId: 'PL-OTHER' } } } });
    expect(await verifyFeed(plots.feed, plots.keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('batch_created listing a payloadHash its harvest_event does not carry → closure-incomplete (minor #2)', async () => {
    // Every hash, path and signature is consistent: only the listed member hash disagrees.
    const { feed, keys } = await world({ listedHashHe2: 'c'.repeat(64) });
    expect(await verifyFeed(feed, keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a custody_transfer for another batch in the feed is ignored by the custody chain (doc gap 1)', async () => {
    const admin = await newKey();
    const other = { kind: 'custody_transfer', payload: await signed(admin, { v: 1, batchId: 'B-OTHER001', fromOrg: 'ORG-X', toOrg: 'ORG-Y', ts: TS(9), adminId: 'AD-9' }) };
    const { feed, keys } = await world({ replace: { 7: other } });
    // It does not chain from ORG-FPO, but it is not this batch's transfer, so it is not in the chain.
    expect(await verifyFeed(feed, keys)).toMatchObject({ ok: true, entries: 8 });
  });

  it('a malformed or extra-member publicJwk in a signed payload → payload-signature (doc gap 2)', async () => {
    const variants: [string, (k: JsonWebKey) => unknown][] = [
      ['extra member d', (k) => ({ ...k, d: 'AAAA' })],
      ['extra member use', (k) => ({ ...k, use: 'sig' })],
      ['wrong crv', (k) => ({ ...k, crv: 'P-384' })],
      ['point not on the curve', (k) => ({ ...k, y: k.x })],
      ['not an object', () => 'jwk'],
    ];
    for (const [name, jwk] of variants) {
      const { feed, keys } = await world({ batchJwk: jwk });
      expect(await verifyFeed(feed, keys), name).toEqual({ ok: false, step: 'payload-signature', seq: 7 });
    }
  });

  it('malformed or out-of-order input → format', async () => {
    const { feed, keys } = await world();
    expect(await verifyFeed(null, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyFeed({ ...feed, format: 'udgam-proof-feed/2' }, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyFeed({ ...feed, entries: undefined }, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyFeed({ ...feed, evm: { chainId: 31337 } }, keys)).toMatchObject({ ok: true }); // unknown members are ignored
    const f = clone(feed);
    [f.entries[2], f.entries[3]] = [f.entries[3]!, f.entries[2]!];
    expect(await verifyFeed(f, keys)).toMatchObject({ ok: false, step: 'format' });
    const g = clone(feed);
    g.entries[0]!.path.push('XYZ');
    expect(await verifyFeed(g, keys)).toEqual({ ok: false, step: 'format' });
  });

  it('an entry pointing at a checkpoint that does not cover it → merkle-path', async () => {
    const { feed, keys } = await world();
    const f = clone(feed);
    bySeq(f, 2).checkpointId = 2;
    expect(await verifyFeed(f, keys)).toMatchObject({ ok: false, step: 'merkle-path', seq: 2 });
    const g = clone(feed);
    bySeq(g, 2).checkpointId = 9;
    expect(await verifyFeed(g, keys)).toMatchObject({ ok: false, step: 'merkle-path', seq: 2 });
  });
});

describe('verifyFeed: ids are non-empty strings, and it never throws (TASK-19 follow-up)', () => {
  const B = 'B-TEST0001';
  /** Re-anchor the world with its batch_created (index 6) and custody (index 7) statements replaced. */
  async function reanchored(batch: (s: Record<string, unknown>) => Record<string, unknown>, custody: Record<string, unknown>[] | null) {
    const w = await world();
    const raws = w.entries.map((e) => ({ kind: e.kind, payload: e.payload }));
    const baseBatch = { v: 1, batchId: B, orgId: 'ORG-FPO', events: [{ eventId: 'HE-1', payloadHash: HASH_HE1 }, { eventId: 'HE-2', payloadHash: HASH_HE2 }], adminId: 'AD-1', ts: TS(7) };
    raws[6] = { kind: 'batch_created', payload: await signed(w.admin, batch(baseBatch)) };
    const tail = await Promise.all((custody ?? []).map(async (c) => ({ kind: 'custody_transfer', payload: await signed(w.admin, { v: 1, batchId: B, ts: TS(8), adminId: 'AD-1', ...c }) })));
    const all = [...raws.slice(0, 7), ...tail];
    const f = await feedOf(await chain(all), [[1, 5], [6, all.length]], w.ledger, B);
    return verifyFeed(f, w.keys);
  }
  const without = (o: Record<string, unknown>, k: string) => Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));

  it('a chain that starts and ends with string org ids verifies', async () => {
    expect(await reanchored((s) => s, [{ fromOrg: 'ORG-FPO', toOrg: 'ORG-BUY' }, { fromOrg: 'ORG-BUY', toOrg: 'ORG-EXP' }])).toMatchObject({ ok: true });
  });

  it('a custody chain "from nobody" (orgId and fromOrg both missing, or both null) → closure-incomplete', async () => {
    expect(await reanchored((s) => without(s, 'orgId'), [{ toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    expect(await reanchored((s) => ({ ...s, orgId: null }), [{ fromOrg: null, toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('non-string or empty org ids → closure-incomplete, even when they are equal', async () => {
    expect(await reanchored((s) => ({ ...s, orgId: 5 }), [{ fromOrg: 5, toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    expect(await reanchored((s) => ({ ...s, orgId: 5 }), [{ fromOrg: 7, toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    expect(await reanchored((s) => ({ ...s, orgId: 5 }), [{ toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    expect(await reanchored((s) => ({ ...s, orgId: '' }), [{ fromOrg: '', toOrg: 'ORG-BUY' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    // A transfer whose toOrg is missing cannot hand over to a next transfer whose fromOrg is missing.
    expect(await reanchored((s) => s, [{ fromOrg: 'ORG-FPO' }, { toOrg: 'ORG-EXP' }])).toEqual({ ok: false, step: 'closure-incomplete' });
    // The batch's own organisation is required even with no transfer.
    expect(await reanchored((s) => without(s, 'orgId'), null)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('empty-string event, plot and device ids → closure-incomplete', async () => {
    for (const [i, raw] of [
      [2, { kind: 'harvest_event', payload: { eventId: 'HE-1', plotId: '', deviceId: 'DV-1', payloadHash: HASH_HE1 } }],
      [2, { kind: 'harvest_event', payload: { eventId: 'HE-1', plotId: 'PL-1', deviceId: '', payloadHash: HASH_HE1 } }],
    ] as [number, Raw][]) {
      const w = await world({ replace: { [i]: raw, 0: { kind: 'plot_registered', payload: { plotId: (raw.payload.plotId as string) || '' } }, 1: { kind: 'device_enrolled', payload: { deviceId: (raw.payload.deviceId as string) || '' } } } });
      expect(await verifyFeed(w.feed, w.keys)).toEqual({ ok: false, step: 'closure-incomplete' });
    }
    // An event listed and harvested under the empty id, with a run for it.
    const w = await world();
    const raws = w.entries.map((e) => ({ kind: e.kind, payload: e.payload }));
    raws[2] = { kind: 'harvest_event', payload: { eventId: '', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: HASH_HE1 } };
    raws[3] = { kind: 'verification_run', payload: { eventId: '' } };
    raws[6] = { kind: 'batch_created', payload: await signed(w.admin, { v: 1, batchId: B, orgId: 'ORG-FPO', events: [{ eventId: '', payloadHash: HASH_HE1 }, { eventId: 'HE-2', payloadHash: HASH_HE2 }] }) };
    raws[7] = { kind: 'custody_transfer', payload: await signed(w.admin, { v: 1, batchId: B, fromOrg: 'ORG-FPO', toOrg: 'ORG-BUY' }) };
    const f = await feedOf(await chain(raws), [[1, 5], [6, 8]], w.ledger, B);
    expect(await verifyFeed(f, w.keys)).toEqual({ ok: false, step: 'closure-incomplete' });
  });

  it('a payload nested 10 000 levels deep fails at payload-hash, without throwing', async () => {
    const { feed, keys } = await world();
    const text = JSON.stringify(feed).replace('"payload":{', `"payload":{"deep":${'{"a":'.repeat(10_000)}1${'}'.repeat(10_000)},`);
    expect(await verifyFeed(JSON.parse(text), keys)).toMatchObject({ ok: false, step: 'payload-hash', seq: 1 });
    const deeper = JSON.stringify(feed).replace('"payload":{', `"payload":{"deep":${'['.repeat(200_000)}${']'.repeat(200_000)},`);
    expect(await verifyFeed(JSON.parse(deeper), keys)).toMatchObject({ ok: false, step: 'payload-hash', seq: 1 });
  });
});

describe('verifyProof (TSK-15.4)', () => {
  it('verifies one entry against its checkpoint and names the failing step', async () => {
    const { feed, keys } = await world();
    const entry = bySeq(feed, 3);
    const checkpoint = feed.checkpoints[0]!;
    expect(await verifyProof({ entry, checkpoint }, keys)).toEqual({ ok: true });
    expect(await verifyProof({ entry: { ...entry, payload: { ...entry.payload, cherryKg: 1 } }, checkpoint }, keys)).toEqual({ ok: false, step: 'payload-hash', seq: 3 });
    expect(await verifyProof({ entry, checkpoint: feed.checkpoints[1]! }, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyProof({ entry, checkpoint }, [])).toMatchObject({ ok: false, step: 'unknown-key' });
  });

  it('hashes the entry payload as received and refuses a "__proto__" member at format', async () => {
    const { feed, keys } = await world();
    const text = JSON.stringify({ entry: bySeq(feed, 3), checkpoint: feed.checkpoints[0] }).replace('"cherryKg":42.5', '"cherryKg":42.5,"__proto__":{"cherryKg":1}');
    expect(await verifyProof(JSON.parse(text) as Proof, keys)).toEqual({ ok: false, step: 'format' });
  });
});

describe('proof.ts and merkle.ts are isomorphic', () => {
  const specifiers = (file: string) =>
    [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);

  it('import only lib/crypto, merkle.ts and zod/mini (no node:*, db, env or keys)', () => {
    expect(specifiers('./proof.ts').sort()).toEqual(['../crypto', './merkle', 'zod/mini']);
    expect(specifiers('./merkle.ts')).toEqual(['../crypto']);
  });
});
