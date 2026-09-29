// Test helper: builds a proof feed by hand from the rules of docs/proof-feed.md (§4–§9), so the
// checker's tests do not depend on the app. Never imported by the checker itself.
import { webcrypto } from 'node:crypto';
import { fromHex, sha256Hex, toHex, utf8 } from './src/hash';
import { jcs } from './src/jcs';
import { treeHash } from './src/merkle';
import { base64urlEncode, jwkThumbprint } from './src/signature';

type Json = Record<string, unknown>;
export type PublicJwk = { kty: string; crv: string; x: string; y: string };
export type Signer = { publicJwk: PublicJwk; kid: string; sign(message: string): Promise<string> };

export async function newSigner(): Promise<Signer> {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! };
  return {
    publicJwk,
    kid: await jwkThumbprint(publicJwk),
    async sign(message) {
      const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, utf8(message));
      return base64urlEncode(new Uint8Array(sig));
    },
  };
}

export async function signedPayload(signer: Signer, statement: Json): Promise<Json> {
  return { ...statement, kid: signer.kid, publicJwk: signer.publicJwk, signature: await signer.sign(jcs(statement)) };
}

/** RFC 6962 PATH(m, D[n]) over raw leaf data. */
export async function auditPath(m: number, leaves: Uint8Array[]): Promise<string[]> {
  if (leaves.length <= 1) return [];
  let k = 1;
  while (k * 2 < leaves.length) k *= 2;
  if (m < k) return [...(await auditPath(m, leaves.slice(0, k))), toHex(await treeHash(leaves.slice(k)))];
  return [...(await auditPath(m - k, leaves.slice(k))), toHex(await treeHash(leaves.slice(0, k)))];
}

type LedgerEntry = { seq: number; prevHash: string; kind: string; payload: Json; payloadHash: string; ts: string; entryHash: string };

/** A small ledger: `filler` unrelated entries, then the provided (kind, payload) entries. */
export async function buildLedger(kinds: [string, Json][], filler = 3): Promise<LedgerEntry[]> {
  const all: [string, Json][] = [
    ...Array.from({ length: filler }, (_, i) => ['plot_registered', { plotId: `PL-OTHER${i}`, producerId: 'PR-X' }] as [string, Json]),
    ...kinds,
  ];
  const out: LedgerEntry[] = [];
  let prevHash = '0'.repeat(64);
  for (const [i, [kind, payload]] of all.entries()) {
    const seq = i + 1;
    const ts = new Date(Date.UTC(2026, 9, 1, 4, 0, seq)).toISOString();
    const payloadHash = await sha256Hex(jcs(payload));
    const entryHash = await sha256Hex(jcs({ seq, prev_hash: prevHash, kind, payload_hash: payloadHash, ts }));
    out.push({ seq, prevHash, kind, payload, payloadHash, ts, entryHash });
    prevHash = entryHash;
  }
  return out;
}

/** Seals the ledger under checkpoints at the given `toSeq` cuts and returns a feed of the selected seqs. */
export async function buildFeed(opts: {
  ledger: LedgerEntry[];
  cuts: number[];
  select: (e: LedgerEntry) => boolean;
  batchId: string;
  signer: Signer;
}): Promise<Json> {
  const checkpoints: Json[] = [];
  const sealedBy = new Map<number, { id: number; fromSeq: number; leaves: Uint8Array[] }>();
  let fromSeq = 1;
  let prevCheckpointHash = '0'.repeat(64);
  for (const [i, toSeq] of opts.cuts.entries()) {
    const id = i + 1;
    const leaves = opts.ledger.filter((e) => e.seq >= fromSeq && e.seq <= toSeq).map((e) => fromHex(e.entryHash));
    const merkleRoot = toHex(await treeHash(leaves));
    const ts = new Date(Date.UTC(2026, 9, 1, 5, 0, id)).toISOString();
    const statement = jcs({ v: 1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts });
    checkpoints.push({ id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts, kid: opts.signer.kid, signature: await opts.signer.sign(statement) });
    for (let s = fromSeq; s <= toSeq; s++) sealedBy.set(s, { id, fromSeq, leaves });
    prevCheckpointHash = await sha256Hex(statement);
    fromSeq = toSeq + 1;
  }
  const entries: Json[] = [];
  const used = new Set<number>();
  for (const e of opts.ledger.filter(opts.select)) {
    const cp = sealedBy.get(e.seq)!;
    used.add(cp.id);
    const leafIndex = e.seq - cp.fromSeq;
    entries.push({ ...e, checkpointId: cp.id, leafIndex, path: await auditPath(leafIndex, cp.leaves) });
  }
  const batch = entries.find((e) => e.kind === 'batch_created') as { entryHash: string } | undefined;
  return {
    format: 'udgam-proof-feed/1',
    batchId: opts.batchId,
    shortHash: batch ? batch.entryHash.slice(0, 12) : '000000000000',
    ledgerKey: { kid: opts.signer.kid, url: '/.well-known/udgam-ledger-key' },
    checkpoints: checkpoints.filter((c) => used.has(c.id as number)),
    entries,
  };
}

export function keyDocument(...signers: Signer[]): { keys: Json[] } {
  return { keys: signers.map((s) => ({ ...s.publicJwk, kid: s.kid, use: 'sig', alg: 'ES256' })) };
}

/** A complete two-event batch with one custody transfer, sealed under two checkpoints. */
export async function sampleFeed(): Promise<{ feed: Json; keys: { keys: Json[] }; ledger: LedgerEntry[]; signer: Signer; admin: Signer }> {
  const signer = await newSigner();
  const admin = await newSigner();
  const capture1 = 'a'.repeat(64);
  const capture2 = 'b'.repeat(64);
  const batchId = 'B-TEST0001';
  const kinds: [string, Json][] = [
    ['plot_registered', { plotId: 'PL-1', producerId: 'PR-1', crop: 'arabica', areaHa: 2 }],
    ['device_enrolled', { deviceId: 'DV-1', agentId: 'AG-1', thumbprint: 'x' }],
    ['harvest_event', { eventId: 'HE-1', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: capture1, capture: { cherryKg: 42.5 } }],
    ['verification_run', { eventId: 'HE-1', verdict: 'verified', score: 0.9 }],
    ['harvest_event', { eventId: 'HE-2', plotId: 'PL-1', deviceId: 'DV-1', payloadHash: capture2, capture: { cherryKg: 30 } }],
    ['verification_run', { eventId: 'HE-2', verdict: 'flagged', score: 0.6 }],
    ['admin_override', await signedPayload(admin, { eventId: 'HE-2', reason: 'checked in person', v: 1 })],
    ['batch_created', await signedPayload(admin, {
      batchId, orgId: 'ORG-1', v: 1,
      events: [{ eventId: 'HE-1', payloadHash: capture1 }, { eventId: 'HE-2', payloadHash: capture2 }],
    })],
    ['custody_transfer', await signedPayload(admin, { batchId, fromOrg: 'ORG-1', toOrg: 'ORG-2', v: 1 })],
    ['plot_registered', { plotId: 'PL-UNRELATED', producerId: 'PR-9' }],
  ];
  const ledger = await buildLedger(kinds, 3);
  const feed = await buildFeed({
    ledger,
    cuts: [7, 13],
    select: (e) => e.seq >= 4 && e.seq <= 12,
    batchId,
    signer,
  });
  return { feed, keys: keyDocument(signer), ledger, signer, admin };
}
