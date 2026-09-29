import { z } from 'zod';
import { hexToBytes, bytesToHex, jcs, jwkThumbprint, sha256Hex, verify } from '../crypto';
import { rootFromPath } from './merkle';

// Proof feed v1: its shape and its verifier (technical-plan §8.3; the byte-level rules are in
// docs/proof-feed.md). ISOMORPHIC: the certificate page runs this in the browser (TKT-16), so it
// imports only lib/crypto, merkle.ts and zod — never node:*, the database or env (tested).

export const PROOF_FEED_FORMAT = 'udgam-proof-feed/1';
export const LEDGER_KEY_URL = '/.well-known/udgam-ledger-key';

/** Kinds whose payload carries its own signature: { …statement, kid, publicJwk, signature }. */
export const SIGNED_KINDS = ['batch_created', 'custody_transfer', 'admin_override'] as const;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const b64u = z.string().regex(/^[A-Za-z0-9_-]+$/);
const seqNo = z.number().int().min(1);

// Unknown members are ignored (stripped), so later additive fields (M-002 `evm`) keep format /1.
export const FeedCheckpointSchema = z.object({
  id: seqNo,
  fromSeq: seqNo,
  toSeq: seqNo,
  merkleRoot: hex64,
  prevCheckpointHash: hex64,
  ts: z.string(),
  kid: z.string().min(1),
  signature: b64u,
});

export const FeedEntrySchema = z.object({
  seq: seqNo,
  prevHash: hex64,
  kind: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  payloadHash: hex64,
  ts: z.string(),
  entryHash: hex64,
  checkpointId: seqNo,
  leafIndex: z.number().int().min(0),
  path: z.array(hex64),
});

export const ProofFeedV1Schema = z.object({
  format: z.literal(PROOF_FEED_FORMAT),
  batchId: z.string().min(1),
  shortHash: z.string().regex(/^[0-9a-f]{12}$/),
  ledgerKey: z.object({ kid: z.string().min(1), url: z.string().min(1) }),
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
export type FeedOutcome = { ok: true; entries: number; checkpoints: { id: number; kid: string }[] } | VerifyFailure;

/** jcs of the checkpoint statement that the ledger key signs. */
export function checkpointStatementOf(cp: Pick<FeedCheckpoint, 'id' | 'fromSeq' | 'toSeq' | 'merkleRoot' | 'prevCheckpointHash' | 'ts'>): string {
  const { id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts } = cp;
  return jcs({ v: 1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts });
}

/** entryHash = sha256Hex(jcs({ seq, prev_hash, kind, payload_hash, ts })) (§8.1). */
export function entryHashFor(e: Pick<FeedEntry, 'seq' | 'prevHash' | 'kind' | 'payloadHash' | 'ts'>): Promise<string> {
  return sha256Hex(jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }));
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

async function checkPayloadSignature(entry: FeedEntry): Promise<boolean> {
  const { kid, publicJwk, signature } = entry.payload as { kid?: unknown; publicJwk?: unknown; signature?: unknown };
  if (typeof kid !== 'string' || typeof signature !== 'string' || typeof publicJwk !== 'object' || publicJwk === null) return false;
  try {
    if ((await jwkThumbprint(publicJwk as JsonWebKey)) !== kid) return false;
    return await verify(publicJwk as JsonWebKey, payloadStatement(entry.payload), signature);
  } catch {
    return false;
  }
}

/** Steps 3–6 for one entry against its (already verified) checkpoint. */
async function checkEntry(entry: FeedEntry, cp: FeedCheckpoint | undefined): Promise<VerifyFailure | null> {
  const seq = entry.seq;
  let payloadHash: string;
  try {
    payloadHash = await sha256Hex(jcs(entry.payload));
  } catch {
    return fail('payload-hash', { seq });
  }
  if (payloadHash !== entry.payloadHash) return fail('payload-hash', { seq });
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
  const entry = FeedEntrySchema.safeParse(proof?.entry);
  const cp = FeedCheckpointSchema.safeParse(proof?.checkpoint);
  if (!entry.success || !cp.success || entry.data.checkpointId !== cp.data.id) return fail('format');
  return (await checkCheckpoint(cp.data, keys)) ?? (await checkEntry(entry.data, cp.data)) ?? { ok: true };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Every event listed in batch_created has its harvest_event and ≥ 1 verification_run; custody chains from the batch. */
function closureComplete(feed: ProofFeedV1, batch: FeedEntry): boolean {
  const events = batch.payload.events;
  if (!Array.isArray(events) || events.length === 0) return false;
  const harvested = new Set<string>();
  const verified = new Set<string>();
  for (const e of feed.entries) {
    const eventId = str(e.payload.eventId);
    if (!eventId) continue;
    if (e.kind === 'harvest_event') harvested.add(eventId);
    if (e.kind === 'verification_run') verified.add(eventId);
  }
  for (const ev of events) {
    const eventId = str((ev as { eventId?: unknown } | null)?.eventId);
    if (!eventId || !harvested.has(eventId) || !verified.has(eventId)) return false;
  }
  let holder = str(batch.payload.orgId);
  for (const c of feed.entries.filter((e) => e.kind === 'custody_transfer')) {
    if (c.seq < batch.seq || c.payload.batchId !== feed.batchId || str(c.payload.fromOrg) !== holder) return false;
    holder = str(c.payload.toOrg);
  }
  return true;
}

/**
 * Verify a whole proof feed and name the first failing step: format; per checkpoint its key and
 * signature; per entry (seq order) payloadHash, entryHash, Merkle path, payload signature; shortHash;
 * closure completeness. Keys must come from /.well-known/udgam-ledger-key, never from the feed.
 */
export async function verifyFeed(feed: unknown, keys: VerifierKey[]): Promise<FeedOutcome> {
  const parsed = ProofFeedV1Schema.safeParse(feed);
  if (!parsed.success) return fail('format');
  const f = parsed.data;
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
  for (const entry of f.entries) {
    const bad = await checkEntry(entry, byId.get(entry.checkpointId));
    if (bad) return bad;
  }

  const batches = f.entries.filter((e) => e.kind === 'batch_created' && e.payload.batchId === f.batchId);
  if (batches.length !== 1) return fail('closure-incomplete');
  const batch = batches[0]!;
  if (batch.entryHash.slice(0, 12) !== f.shortHash) return fail('short-hash', { seq: batch.seq });
  if (!closureComplete(f, batch)) return fail('closure-incomplete');

  return { ok: true, entries: f.entries.length, checkpoints: f.checkpoints.map((c) => ({ id: c.id, kid: c.kid })) };
}
