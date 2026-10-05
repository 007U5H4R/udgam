import * as z from 'zod/mini';
import { hexToBytes, bytesToHex, jcs, jwkThumbprint, sha256Hex, verify } from '../crypto';
import { rootFromPath } from './merkle';

// Proof feed v1: its shape and its verifier (technical-plan §8.3; the byte-level rules are in
// docs/proof-feed.md). ISOMORPHIC: the certificate page runs this in the browser (TKT-16), so it
// imports only lib/crypto, merkle.ts and zod/mini (the tree-shakeable build: the certificate's bundle
// budget, technical-plan §18, TKT-16) — never node:*, the database or env (tested).

export const PROOF_FEED_FORMAT = 'udgam-proof-feed/1';
export const LEDGER_KEY_URL = '/.well-known/udgam-ledger-key';

/** Kinds whose payload carries its own signature: { …statement, kid, publicJwk, signature }. */
export const SIGNED_KINDS = ['batch_created', 'custody_transfer', 'admin_override', 'processing_step'] as const;

const hex64 = z.string().check(z.regex(/^[0-9a-f]{64}$/));
const b64u = z.string().check(z.regex(/^[A-Za-z0-9_-]+$/));
const seqNo = z.int().check(z.minimum(1));

// Unknown members are ignored (stripped), so later additive fields (M-002 `evm`) keep format /1.
export const FeedCheckpointSchema = z.object({
  id: seqNo,
  fromSeq: seqNo,
  toSeq: seqNo,
  merkleRoot: hex64,
  prevCheckpointHash: hex64,
  ts: z.string(),
  kid: z.string().check(z.minLength(1)),
  signature: b64u,
});

export const FeedEntrySchema = z.object({
  seq: seqNo,
  prevHash: hex64,
  kind: z.string().check(z.minLength(1)),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: hex64,
  ts: z.string(),
  entryHash: hex64,
  checkpointId: seqNo,
  leafIndex: z.int().check(z.minimum(0)),
  path: z.array(hex64),
});

export const ProofFeedV1Schema = z.object({
  format: z.literal(PROOF_FEED_FORMAT),
  batchId: z.string().check(z.minLength(1)),
  shortHash: z.string().check(z.regex(/^[0-9a-f]{12}$/)),
  ledgerKey: z.object({ kid: z.string().check(z.minLength(1)), url: z.string().check(z.minLength(1)) }),
  checkpoints: z.array(FeedCheckpointSchema),
  entries: z.array(FeedEntrySchema),
});

export type FeedCheckpoint = z.infer<typeof FeedCheckpointSchema>;
export type FeedEntry = z.infer<typeof FeedEntrySchema>;
export type ProofFeedV1 = z.infer<typeof ProofFeedV1Schema>;

/** A key as published at /.well-known/udgam-ledger-key (public members + kid). */
export type VerifierKey = JsonWebKey & { kid: string };

/** One entry with the checkpoint that seals it. */
export type Proof = { entry: FeedEntry; checkpoint: FeedCheckpoint };

export type VerifyStep =
  | 'format'
  | 'unknown-key'
  | 'checkpoint-signature'
  | 'payload-hash'
  | 'entry-hash'
  | 'merkle-path'
  | 'payload-signature'
  | 'short-hash'
  | 'closure-incomplete';

/** The failing step, in the order checked (docs/proof-feed.md, "Verification steps"). */
export type VerifyFailure = { ok: false; step: VerifyStep; seq?: number; checkpointId?: number; kid?: string };
export type VerifyOutcome = { ok: true } | VerifyFailure;
/** On ok, `feed` is the verified feed: unknown members removed, every payload exactly the bytes that were hashed. */
export type FeedOutcome = { ok: true; entries: number; checkpoints: { id: number; kid: string }[]; feed: ProofFeedV1 } | VerifyFailure;

/** jcs of the checkpoint statement that the ledger key signs. */
export function checkpointStatementOf(cp: Pick<FeedCheckpoint, 'id' | 'fromSeq' | 'toSeq' | 'merkleRoot' | 'prevCheckpointHash' | 'ts'>): string {
  const { id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts } = cp;
  return jcs({ v: 1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts });
}

/** entryHash = sha256Hex(jcs({ seq, prev_hash, kind, payload_hash, ts })) (§8.1). */
export function entryHashFor(e: Pick<FeedEntry, 'seq' | 'prevHash' | 'kind' | 'payloadHash' | 'ts'>): Promise<string> {
  return sha256Hex(jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }));
}

/**
 * Keys a feed may not contain at any depth (docs/proof-feed.md §3.1). A JSON parser gives an own
 * "__proto__" member, but schema parsing and object spreads drop or reinterpret it, so what is shown
 * could differ from what was hashed. Refused at step `format`.
 */
export const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

function hasForbiddenKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v !== 'object' || v === null || seen.has(v)) continue;
    seen.add(v);
    if (Array.isArray(v)) {
      stack.push(...(v as unknown[]));
      continue;
    }
    for (const key of Object.keys(v)) {
      if ((FORBIDDEN_KEYS as readonly string[]).includes(key)) return true;
      stack.push((v as Record<string, unknown>)[key]);
    }
  }
  return false;
}

/** The payload as received: its JCS (what is hashed) and a copy parsed back from exactly those bytes. */
function received(payload: unknown): { canonical: string; payload: Record<string, unknown> } | null {
  try {
    const canonical = jcs(payload);
    return { canonical, payload: JSON.parse(canonical) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** The statement a signed payload's signature covers: the payload without kid, publicJwk, signature. */
export function payloadStatement(payload: Record<string, unknown>): string {
  const statement: Record<string, unknown> = { ...payload };
  delete statement.kid;
  delete statement.publicJwk;
  delete statement.signature;
  return jcs(statement);
}

const fail = (step: VerifyStep, extra: Omit<VerifyFailure, 'ok' | 'step'> = {}): VerifyFailure => ({ ok: false, step, ...extra });

async function checkCheckpoint(cp: FeedCheckpoint, keys: VerifierKey[]): Promise<VerifyFailure | null> {
  const key = keys.find((k) => k.kid === cp.kid);
  if (!key) return fail('unknown-key', { checkpointId: cp.id, kid: cp.kid });
  // The key must really be the one its kid names (RFC 7638), whoever supplied the list.
  let thumb: string | null = null;
  try {
    thumb = await jwkThumbprint(key);
  } catch {
    thumb = null;
  }
  if (thumb !== cp.kid) return fail('unknown-key', { checkpointId: cp.id, kid: cp.kid });
  if (!(await verify(key, checkpointStatementOf(cp), cp.signature))) return fail('checkpoint-signature', { checkpointId: cp.id });
  return null;
}

/** A payload's embedded key: exactly { kty: "EC", crv: "P-256", x, y } — no other member (docs §9.2). */
function isPublicP256Jwk(jwk: unknown): jwk is JsonWebKey {
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) return false;
  const o = jwk as Record<string, unknown>;
  return Object.keys(o).sort().join(',') === 'crv,kty,x,y' && o.kty === 'EC' && o.crv === 'P-256' && typeof o.x === 'string' && typeof o.y === 'string';
}

async function checkPayloadSignature(entry: FeedEntry): Promise<boolean> {
  const { kid, publicJwk, signature } = entry.payload as { kid?: unknown; publicJwk?: unknown; signature?: unknown };
  if (typeof kid !== 'string' || typeof signature !== 'string' || !isPublicP256Jwk(publicJwk)) return false;
  try {
    if ((await jwkThumbprint(publicJwk as JsonWebKey)) !== kid) return false;
    return await verify(publicJwk as JsonWebKey, payloadStatement(entry.payload), signature);
  } catch {
    return false;
  }
}

/**
 * Steps 3–7 for one entry against its (already verified) checkpoint. `entry.payload` must already be
 * the payload as received (see `received`); the payload hash is over its canonical bytes (null: the
 * payload has no canonical form, which fails like a hash mismatch).
 */
async function checkEntry(entry: FeedEntry, canonical: string | null, cp: FeedCheckpoint | undefined): Promise<VerifyFailure | null> {
  const seq = entry.seq;
  if (canonical === null || (await sha256Hex(canonical)) !== entry.payloadHash) return fail('payload-hash', { seq });
  if ((await entryHashFor(entry)) !== entry.entryHash) return fail('entry-hash', { seq });

  if (!cp || seq < cp.fromSeq || seq > cp.toSeq || entry.leafIndex !== seq - cp.fromSeq) return fail('merkle-path', { seq });
  try {
    const root = await rootFromPath(hexToBytes(entry.entryHash), entry.leafIndex, cp.toSeq - cp.fromSeq + 1, entry.path.map(hexToBytes));
    if (bytesToHex(root) !== cp.merkleRoot) return fail('merkle-path', { seq, checkpointId: cp.id });
  } catch {
    return fail('merkle-path', { seq, checkpointId: cp.id });
  }

  if ((SIGNED_KINDS as readonly string[]).includes(entry.kind) && !(await checkPayloadSignature(entry))) {
    return fail('payload-signature', { seq });
  }
  return null;
}

/** Verify one entry's proof: its checkpoint (key, signature), then the entry (hashes, path, payload signature). */
export async function verifyProof(proof: Proof, keys: VerifierKey[]): Promise<VerifyOutcome> {
  if (hasForbiddenKey(proof)) return fail('format');
  const entry = FeedEntrySchema.safeParse(proof?.entry);
  const cp = FeedCheckpointSchema.safeParse(proof?.checkpoint);
  if (!entry.success || !cp.success || entry.data.checkpointId !== cp.data.id) return fail('format');
  const got = received(proof.entry.payload);
  const asReceived = { ...entry.data, payload: got?.payload ?? entry.data.payload };
  return (await checkCheckpoint(cp.data, keys)) ?? (await checkEntry(asReceived, got?.canonical ?? null, cp.data)) ?? { ok: true };
}

/** A non-empty string id, or undefined (docs/proof-feed.md §9.3: every id the closure compares is a non-empty string). */
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * Closure completeness (docs/proof-feed.md §9.3): every event listed in batch_created has its
 * harvest_event, carrying the listed payloadHash, and ≥ 1 verification_run; every harvest_event in the
 * feed has the plot_registered of its plotId and the device_enrolled of its deviceId; this batch's
 * custody transfers chain from the batch's organisation (transfers of other batches are ignored).
 * Every id compared (eventId, plotId, deviceId, orgId, fromOrg, toOrg) must be a non-empty string: a
 * missing, empty or non-string id never matches anything, not even another missing one.
 */
function closureComplete(feed: ProofFeedV1, batch: FeedEntry): boolean {
  const events = batch.payload.events;
  if (!Array.isArray(events) || events.length === 0) return false;
  const harvested = new Map<string, FeedEntry>();
  const verified = new Set<string>();
  const plots = new Set<string>();
  const devices = new Set<string>();
  for (const e of feed.entries) {
    const plotId = str(e.payload.plotId);
    const deviceId = str(e.payload.deviceId);
    if (e.kind === 'plot_registered' && plotId) plots.add(plotId);
    if (e.kind === 'device_enrolled' && deviceId) devices.add(deviceId);
    const eventId = str(e.payload.eventId);
    if (!eventId) continue;
    if (e.kind === 'harvest_event') harvested.set(eventId, e);
    if (e.kind === 'verification_run') verified.add(eventId);
  }
  for (const ev of events) {
    const listed = (ev ?? {}) as { eventId?: unknown; payloadHash?: unknown };
    const eventId = str(listed.eventId);
    const harvest = eventId ? harvested.get(eventId) : undefined;
    if (!eventId || !harvest || !verified.has(eventId)) return false;
    if (typeof listed.payloadHash !== 'string' || listed.payloadHash !== harvest.payload.payloadHash) return false;
  }
  for (const h of feed.entries.filter((e) => e.kind === 'harvest_event')) {
    const plotId = str(h.payload.plotId);
    const deviceId = str(h.payload.deviceId);
    if (!plotId || !deviceId || !plots.has(plotId) || !devices.has(deviceId)) return false;
  }
  let holder = str(batch.payload.orgId);
  if (!holder) return false;
  for (const c of feed.entries.filter((e) => e.kind === 'custody_transfer' && e.payload.batchId === feed.batchId)) {
    const fromOrg = str(c.payload.fromOrg);
    const toOrg = str(c.payload.toOrg);
    if (c.seq < batch.seq || !fromOrg || !toOrg || fromOrg !== holder) return false;
    holder = toOrg;
  }
  return true;
}

/**
 * Verify a whole proof feed and name the first failing step: format; per checkpoint its key and
 * signature; per entry (seq order) payloadHash, entryHash, Merkle path, payload signature; shortHash;
 * closure completeness. Keys must come from /.well-known/udgam-ledger-key, never from the feed.
 */
/** Entries checked concurrently in verifyFeed (bounded so a very large feed does not start every digest at once). */
const ENTRY_WINDOW = 32;

export type VerifyFeedOptions = {
  /** Called after each entry passes steps 4–7 (`done` of `total` entries); the certificate's progress line (TKT-16). */
  onProgress?: (done: number, total: number) => void;
};

export async function verifyFeed(feed: unknown, keys: VerifierKey[], opts: VerifyFeedOptions = {}): Promise<FeedOutcome> {
  if (hasForbiddenKey(feed)) return fail('format');
  const parsed = ProofFeedV1Schema.safeParse(feed);
  if (!parsed.success) return fail('format');
  // Hash each payload as received (the input's own members), never the schema-parsed copy.
  const rawEntries = (feed as { entries: { payload: unknown }[] }).entries;
  const canonical: (string | null)[] = [];
  const f: ProofFeedV1 = { ...parsed.data, entries: [] };
  for (const [i, e] of parsed.data.entries.entries()) {
    const got = received(rawEntries[i]!.payload);
    canonical.push(got?.canonical ?? null);
    f.entries.push({ ...e, payload: got?.payload ?? e.payload });
  }
  for (let i = 1; i < f.entries.length; i++) if (f.entries[i]!.seq <= f.entries[i - 1]!.seq) return fail('format', { seq: f.entries[i]!.seq });
  const byId = new Map<number, FeedCheckpoint>();
  for (const cp of f.checkpoints) {
    if (byId.has(cp.id) || cp.fromSeq > cp.toSeq) return fail('format', { checkpointId: cp.id });
    byId.set(cp.id, cp);
  }

  for (const cp of f.checkpoints) {
    const bad = await checkCheckpoint(cp, keys);
    if (bad) return bad;
  }
  // Steps 4–7 per entry, ENTRY_WINDOW entries at a time: WebCrypto answers asynchronously, so checking a
  // window concurrently overlaps its digests instead of waiting on each in turn (S4, TKT-16). The result is
  // the same as one entry after another: within a window the first failure in feed order is reported, and
  // no later window is started after a failure.
  let done = 0;
  for (let start = 0; start < f.entries.length; start += ENTRY_WINDOW) {
    const window = f.entries.slice(start, start + ENTRY_WINDOW);
    const results = await Promise.all(
      window.map(async (entry, k) => {
        const bad = await checkEntry(entry, canonical[start + k] ?? null, byId.get(entry.checkpointId));
        if (!bad) opts.onProgress?.(++done, f.entries.length);
        return bad;
      }),
    );
    const bad = results.find((r) => r !== null);
    if (bad) return bad;
  }

  const batches = f.entries.filter((e) => e.kind === 'batch_created' && e.payload.batchId === f.batchId);
  if (batches.length !== 1) return fail('closure-incomplete');
  const batch = batches[0]!;
  if (batch.entryHash.slice(0, 12) !== f.shortHash) return fail('short-hash', { seq: batch.seq });
  if (!closureComplete(f, batch)) return fail('closure-incomplete');

  return { ok: true, entries: f.entries.length, checkpoints: f.checkpoints.map((c) => ({ id: c.id, kid: c.kid })), feed: structuredClone(f) };
}
