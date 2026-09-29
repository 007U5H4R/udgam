// Proof-feed verification, steps 1–9 of docs/proof-feed.md §10, in that order, stopping at the first failure.
import { webcrypto } from 'node:crypto';
import { fromHex, sha256Hex, toHex, utf8 } from './hash';
import { jcs } from './jcs';
import { rootFromPath } from './merkle';
import { importP256, isBase64url, jwkThumbprint, verifyEs256 } from './signature';

export type Step =
  | 'format'
  | 'unknown-key'
  | 'checkpoint-signature'
  | 'payload-hash'
  | 'entry-hash'
  | 'merkle-path'
  | 'payload-signature'
  | 'short-hash'
  | 'closure-incomplete';

export type CheckResult = {
  ok: boolean;
  verified: number;
  total: number;
  failure?: { step: Step; seq?: number; checkpointId?: number; kid?: string };
};

type Obj = Record<string, unknown>;
type Checkpoint = {
  id: number;
  fromSeq: number;
  toSeq: number;
  merkleRoot: string;
  prevCheckpointHash: string;
  ts: string;
  kid: string;
  signature: string;
};
type Entry = {
  seq: number;
  prevHash: string;
  kind: string;
  payload: Obj;
  payloadHash: string;
  ts: string;
  entryHash: string;
  checkpointId: number;
  leafIndex: number;
  path: string[];
};

const FORMAT = 'udgam-proof-feed/1';
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const HEX64 = /^[0-9a-f]{64}$/;
const HEX12 = /^[0-9a-f]{12}$/;
const SIGNED_KINDS = new Set(['batch_created', 'custody_transfer', 'admin_override']);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isHex64 = (v: unknown): v is string => isStr(v) && HEX64.test(v);
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

function hasForbiddenKey(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasForbiddenKey);
  if (!isObj(v)) return false;
  for (const k of Object.keys(v)) {
    if (FORBIDDEN.has(k)) return true;
    if (hasForbiddenKey(own(v, k))) return true;
  }
  return false;
}

function parseCheckpoint(v: unknown): Checkpoint | null {
  if (!isObj(v)) return null;
  const c = {
    id: own(v, 'id'),
    fromSeq: own(v, 'fromSeq'),
    toSeq: own(v, 'toSeq'),
    merkleRoot: own(v, 'merkleRoot'),
    prevCheckpointHash: own(v, 'prevCheckpointHash'),
    ts: own(v, 'ts'),
    kid: own(v, 'kid'),
    signature: own(v, 'signature'),
  };
  if (!isInt(c.id, 1) || !isInt(c.fromSeq, 1) || !isInt(c.toSeq, 1) || c.fromSeq > c.toSeq) return null;
  if (!isHex64(c.merkleRoot) || !isHex64(c.prevCheckpointHash) || !isStr(c.ts) || !isStr(c.kid)) return null;
  if (!isBase64url(c.signature)) return null;
  return c as Checkpoint;
}

function parseEntry(v: unknown): Entry | null {
  if (!isObj(v)) return null;
  const e = {
    seq: own(v, 'seq'),
    prevHash: own(v, 'prevHash'),
    kind: own(v, 'kind'),
    payload: own(v, 'payload'),
    payloadHash: own(v, 'payloadHash'),
    ts: own(v, 'ts'),
    entryHash: own(v, 'entryHash'),
    checkpointId: own(v, 'checkpointId'),
    leafIndex: own(v, 'leafIndex'),
    path: own(v, 'path'),
  };
  if (!isInt(e.seq, 1) || !isHex64(e.prevHash) || !isStr(e.kind) || !isObj(e.payload)) return null;
  if (!isHex64(e.payloadHash) || !isStr(e.ts) || !isHex64(e.entryHash)) return null;
  if (!isInt(e.checkpointId, Number.MIN_SAFE_INTEGER) || !isInt(e.leafIndex, 0)) return null;
  if (!Array.isArray(e.path) || !e.path.every(isHex64)) return null;
  return e as Entry;
}

/** Step 1. Returns the typed feed, or null when anything is malformed. */
function parseFeed(feed: unknown): { batchId: string; shortHash: string; checkpoints: Checkpoint[]; entries: Entry[] } | null {
  if (!isObj(feed) || hasForbiddenKey(feed)) return null;
  if (own(feed, 'format') !== FORMAT) return null;
  const batchId = own(feed, 'batchId');
  const shortHash = own(feed, 'shortHash');
  const ledgerKey = own(feed, 'ledgerKey');
  const rawCheckpoints = own(feed, 'checkpoints');
  const rawEntries = own(feed, 'entries');
  if (!isStr(batchId) || !isStr(shortHash) || !HEX12.test(shortHash) || !isObj(ledgerKey)) return null;
  if (!Array.isArray(rawCheckpoints) || !Array.isArray(rawEntries)) return null;
  const checkpoints = rawCheckpoints.map(parseCheckpoint);
  const entries = rawEntries.map(parseEntry);
  if (checkpoints.some((c) => c === null) || entries.some((e) => e === null)) return null;
  const cps = checkpoints as Checkpoint[];
  const ens = entries as Entry[];
  if (new Set(cps.map((c) => c.id)).size !== cps.length) return null;
  for (let i = 1; i < ens.length; i++) if (ens[i]!.seq <= ens[i - 1]!.seq) return null;
  return { batchId, shortHash, checkpoints: cps, entries: ens };
}

type PublishedKey = { kid: string; key: webcrypto.CryptoKey | null };

/** The published keys whose `kid` member equals their recomputed RFC 7638 thumbprint. */
async function publishedKeys(keys: unknown): Promise<PublishedKey[]> {
  const list = isObj(keys) ? own(keys, 'keys') : undefined;
  if (!Array.isArray(list)) return [];
  const out: PublishedKey[] = [];
  for (const k of list) {
    if (!isObj(k)) continue;
    const kid = own(k, 'kid');
    const x = own(k, 'x');
    const y = own(k, 'y');
    if (own(k, 'kty') !== 'EC' || own(k, 'crv') !== 'P-256' || !isStr(kid) || !isStr(x) || !isStr(y)) continue;
    if (!isBase64url(x) || !isBase64url(y)) continue;
    if ((await jwkThumbprint({ x, y })) !== kid) continue;
    let key: webcrypto.CryptoKey | null = null;
    try {
      key = await importP256({ x, y });
    } catch {
      key = null; // present and matching, but not a usable P-256 key: its signatures cannot verify
    }
    out.push({ kid, key });
  }
  return out;
}

function checkpointStatement(c: Checkpoint): string {
  return jcs({
    v: 1,
    id: c.id,
    fromSeq: c.fromSeq,
    toSeq: c.toSeq,
    merkleRoot: c.merkleRoot,
    prevCheckpointHash: c.prevCheckpointHash,
    ts: c.ts,
  });
}

/** Step 7 for one payload of a signed kind (§9.2). */
async function payloadSignatureOk(payload: Obj): Promise<boolean> {
  const kid = own(payload, 'kid');
  const signature = own(payload, 'signature');
  const jwk = own(payload, 'publicJwk');
  if (!isStr(kid) || !isStr(signature) || !isObj(jwk)) return false;
  const members = Object.keys(jwk).sort();
  if (members.join(',') !== 'crv,kty,x,y') return false;
  const x = own(jwk, 'x');
  const y = own(jwk, 'y');
  if (own(jwk, 'kty') !== 'EC' || own(jwk, 'crv') !== 'P-256' || !isStr(x) || !isStr(y)) return false;
  try {
    if ((await jwkThumbprint({ x, y })) !== kid) return false;
    const key = await importP256({ x, y });
    const statement: Obj = {};
    for (const k of Object.keys(payload)) {
      if (k !== 'kid' && k !== 'publicJwk' && k !== 'signature') statement[k] = own(payload, k);
    }
    return await verifyEs256(key, signature, utf8(jcs(statement)));
  } catch {
    return false;
  }
}

/** Step 9 (§9.3). */
function closureComplete(batchId: string, b: Entry, entries: Entry[]): boolean {
  const of = (kind: string) => entries.filter((e) => e.kind === kind);
  const harvests = of('harvest_event');
  const runs = of('verification_run');
  const events = own(b.payload, 'events');
  if (!Array.isArray(events) || events.length === 0) return false;
  for (const ev of events) {
    if (!isObj(ev)) return false;
    const eventId = own(ev, 'eventId');
    const payloadHash = own(ev, 'payloadHash');
    if (!isStr(eventId) || !isStr(payloadHash)) return false;
    const hasHarvest = harvests.some(
      (h) => own(h.payload, 'eventId') === eventId && own(h.payload, 'payloadHash') === payloadHash,
    );
    if (!hasHarvest) return false;
    if (!runs.some((r) => own(r.payload, 'eventId') === eventId)) return false;
  }
  const plots = new Set(of('plot_registered').map((e) => own(e.payload, 'plotId')));
  const devices = new Set(of('device_enrolled').map((e) => own(e.payload, 'deviceId')));
  for (const h of harvests) {
    const plotId = own(h.payload, 'plotId');
    const deviceId = own(h.payload, 'deviceId');
    if (!isStr(plotId) || !isStr(deviceId)) return false;
    if (!plots.has(plotId) || !devices.has(deviceId)) return false;
  }
  const transfers = of('custody_transfer').filter((e) => own(e.payload, 'batchId') === batchId);
  let holder = own(b.payload, 'orgId');
  for (const t of transfers) {
    if (t.seq <= b.seq) return false;
    if (own(t.payload, 'fromOrg') !== holder) return false;
    holder = own(t.payload, 'toOrg');
  }
  return true;
}

/** Verifies a proof feed against a key document `{ keys: [...] }`. Never throws. */
export async function checkFeed(feed: unknown, keys: unknown): Promise<CheckResult> {
  const parsed = parseFeed(feed);
  if (!parsed) return { ok: false, verified: 0, total: totalOf(feed), failure: { step: 'format' } };
  const { batchId, shortHash, checkpoints, entries } = parsed;
  const total = entries.length;
  const fail = (verified: number, failure: CheckResult['failure']): CheckResult => ({ ok: false, verified, total, failure });

  // Steps 2–3, for every checkpoint in feed order.
  const published = await publishedKeys(keys);
  for (const c of checkpoints) {
    const match = published.find((k) => k.kid === c.kid);
    if (!match) return fail(0, { step: 'unknown-key', checkpointId: c.id, kid: c.kid });
    const ok = match.key !== null && (await verifyEs256(match.key, c.signature, utf8(checkpointStatement(c))));
    if (!ok) return fail(0, { step: 'checkpoint-signature', checkpointId: c.id });
  }

  // Steps 4–7, one entry at a time in seq order.
  const byId = new Map(checkpoints.map((c) => [c.id, c] as const));
  let verified = 0;
  for (const e of entries) {
    let canonical: string;
    try {
      canonical = jcs(e.payload);
    } catch {
      return fail(verified, { step: 'payload-hash', seq: e.seq });
    }
    if ((await sha256Hex(canonical)) !== e.payloadHash) return fail(verified, { step: 'payload-hash', seq: e.seq });

    const entryHash = await sha256Hex(
      jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }),
    );
    if (entryHash !== e.entryHash) return fail(verified, { step: 'entry-hash', seq: e.seq });

    const c = byId.get(e.checkpointId);
    const inRange = c !== undefined && c.fromSeq <= e.seq && e.seq <= c.toSeq && e.leafIndex === e.seq - c.fromSeq;
    const root = inRange
      ? await rootFromPath(fromHex(e.entryHash), e.leafIndex, c.toSeq - c.fromSeq + 1, e.path.map(fromHex))
      : null;
    if (!c || !root || toHex(root) !== c.merkleRoot) {
      return fail(verified, { step: 'merkle-path', seq: e.seq, checkpointId: e.checkpointId });
    }

    if (SIGNED_KINDS.has(e.kind) && !(await payloadSignatureOk(e.payload))) {
      return fail(verified, { step: 'payload-signature', seq: e.seq });
    }
    verified++;
  }

  // Step 8.
  const batches = entries.filter((e) => e.kind === 'batch_created' && own(e.payload, 'batchId') === batchId);
  if (batches.length !== 1) return fail(verified, { step: 'closure-incomplete' });
  const b = batches[0]!;
  if (b.entryHash.slice(0, 12) !== shortHash) return fail(verified, { step: 'short-hash', seq: b.seq });

  // Step 9.
  if (!closureComplete(batchId, b, entries)) return fail(verified, { step: 'closure-incomplete' });

  return { ok: true, verified, total };
}

function totalOf(feed: unknown): number {
  const entries = isObj(feed) ? own(feed, 'entries') : undefined;
  return Array.isArray(entries) ? entries.length : 0;
}
