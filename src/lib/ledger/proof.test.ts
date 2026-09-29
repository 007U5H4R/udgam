import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { b64uDecode, b64uEncode, bytesToHex, generateKeyPair, hexToBytes, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../crypto';
import { merkleTree } from './merkle';
import { verifyFeed, verifyProof, type FeedEntry, type ProofFeedV1, type VerifierKey } from './proof';

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

async function world(opts: { badBatchSignature?: boolean } = {}) {
  const ledger = await newKey();
  const admin = await newKey();
  const batchId = 'B-TEST0001';
  const statement = { v: 1, batchId, orgId: 'ORG-FPO', crop: 'arabica', events: [{ eventId: 'HE-1', payloadHash: 'a'.repeat(64) }, { eventId: 'HE-2', payloadHash: 'b'.repeat(64) }], quantityKg: 72.5, integrityScore: 0.91, adminId: 'AD-1', ts: TS(7) };
  const batch = await signed(admin, statement);
  if (opts.badBatchSignature) batch.signature = (await signed(admin, { ...statement, quantityKg: 1 })).signature;
  const raws: Raw[] = [
    { kind: 'plot_registered', payload: { plotId: 'PL-1', producerId: 'PR-1', crop: 'arabica' } },
    { kind: 'device_enrolled', payload: { deviceId: 'DV-1' } },
    { kind: 'harvest_event', payload: { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', cherryKg: 42.5 } },
    { kind: 'verification_run', payload: { runId: 'VR-1', eventId: 'HE-1', verdict: 'Verified' } },
    { kind: 'harvest_event', payload: { eventId: 'HE-2', plotId: 'PL-1', deviceId: 'DV-1', cherryKg: 30 } },
    { kind: 'verification_run', payload: { runId: 'VR-2', eventId: 'HE-2', verdict: 'Verified' } },
    { kind: 'batch_created', payload: batch },
    { kind: 'custody_transfer', payload: await signed(admin, { v: 1, batchId, fromOrg: 'ORG-FPO', toOrg: 'ORG-BUY', ts: TS(8), adminId: 'AD-1' }) },
  ];
  const entries = await chain(raws);
  const feed = await feedOf(entries, [[1, 5], [6, 8]], ledger, batchId);
  return { feed, keys: [published(ledger)], ledger, admin, entries };
}

const clone = <T>(v: T): T => structuredClone(v);
const bySeq = (f: ProofFeedV1, seq: number) => f.entries.find((e) => e.seq === seq)!;

describe('verifyFeed (TSK-15.4)', () => {
  it('accepts an intact feed and reports the entry count and checkpoints', async () => {
    const { feed, keys, ledger } = await world();
    expect(await verifyFeed(feed, keys)).toEqual({ ok: true, entries: 8, checkpoints: [{ id: 1, kid: ledger.kid }, { id: 2, kid: ledger.kid }] });
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

  it('malformed or out-of-order input → format', async () => {
    const { feed, keys } = await world();
    expect(await verifyFeed(null, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyFeed({ ...feed, format: 'udgam-proof-feed/2' }, keys)).toEqual({ ok: false, step: 'format' });
    expect(await verifyFeed({ ...feed, extra: 1 }, keys)).toEqual({ ok: false, step: 'format' });
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
});

describe('proof.ts and merkle.ts are isomorphic', () => {
  const specifiers = (file: string) =>
    [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);

  it('import only lib/crypto, merkle.ts and zod (no node:*, db, env or keys)', () => {
    expect(specifiers('./proof.ts').sort()).toEqual(['../crypto', './merkle', 'zod']);
    expect(specifiers('./merkle.ts')).toEqual(['../crypto']);
  });
});
