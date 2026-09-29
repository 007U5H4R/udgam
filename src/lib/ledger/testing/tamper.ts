import { generateKeyPair, jcs, jwkThumbprint, publicMembers, sign } from '../../crypto';
import { checkpointStatementOf, entryHashFor, type FeedEntry, type ProofFeedV1, type VerifierKey, type VerifyStep } from '../proof';

// Proof-feed tamper variants (technical-plan TSK-18.5), shared by the harness proof suite
// (EVAL-059–063), the documented vectors (docs/proof-feed.vectors.json, scripts/proof-vectors.ts)
// and the certificate test mode (TKT-16, src/lib/certificate/test-mode.ts). Each variant makes one
// forgery an attacker could attempt on a feed and names the verification step that must catch it
// (docs/proof-feed.md §10, which is authoritative: a dropped member entry is `closure-incomplete`).
// Test-only: eslint forbids importing this folder from src/app and src/components. Isomorphic (no
// node:*), so the certificate test mode can run it in the browser.

/** The S6 tamper suite: one forgery per EVAL-059–063 variant. */
export const TAMPER_VARIANTS = ['payload-field', 'merkle-sibling', 'checkpoint-signature', 'other-key', 'dropped-entry', 'reordered-entries', 'wrong-short-hash'] as const;
export type TamperVariant = (typeof TAMPER_VARIANTS)[number];

/** Every feed-level forgery in docs/proof-feed.vectors.json, by its documented name (§10, §11). */
export const VECTOR_TAMPERS = [
  'entry_payload',
  'entry_field',
  'merkle_sibling',
  'checkpoint_signature',
  'signing_key',
  'drop_entry',
  'swap_adjacent',
  'short_hash',
  'payload_proto_member',
  'drop_device_enrolled',
  'drop_plot_registered',
  'merkle_checkpoint_id',
  'merkle_leaf_index',
  'merkle_path_length',
  'payload_constructor_member',
  'payload_prototype_member',
  'drop_batch_created',
  'duplicate_kid_first_wins',
  'published_key_not_p256',
  'checkpoint_signature_trailing_bits',
  'checkpoint_signature_length',
  'step_order_interleave',
  'empty_feed',
  'unsafe_integer',
  'array_in_object_slot',
] as const;
export type VectorTamper = (typeof VECTOR_TAMPERS)[number];

/**
 * Vectors no outside forger can make with one change to a feed: genuine ledgers sealed by the ledger
 * key that hold one wrong signed payload (scripts/proof-vectors.ts builds them after VECTOR_TAMPERS).
 */
export const INSIDER_VECTORS = [
  'batch_event_hash',
  'payload_signature',
  'payload_wrong_kid',
  'payload_jwk_extra_member',
  'payload_jwk_off_curve',
  'custody_chain',
  'custody_org_missing',
  'custody_org_nonstring',
  'empty_plot_id',
  'duplicate_event_highest_seq',
] as const;

/** The suite variants as documented vectors. */
export const SUITE_VECTOR: Record<TamperVariant, VectorTamper> = {
  'payload-field': 'entry_payload',
  'merkle-sibling': 'merkle_sibling',
  'checkpoint-signature': 'checkpoint_signature',
  'other-key': 'signing_key',
  'dropped-entry': 'drop_entry',
  'reordered-entries': 'swap_adjacent',
  'wrong-short-hash': 'short_hash',
};

export const EXPECTED_STEP: Record<VectorTamper, VerifyStep> = {
  entry_payload: 'payload-hash',
  entry_field: 'entry-hash',
  merkle_sibling: 'merkle-path',
  checkpoint_signature: 'checkpoint-signature',
  signing_key: 'unknown-key',
  drop_entry: 'closure-incomplete',
  swap_adjacent: 'merkle-path',
  short_hash: 'short-hash',
  payload_proto_member: 'format',
  drop_device_enrolled: 'closure-incomplete',
  drop_plot_registered: 'closure-incomplete',
  merkle_checkpoint_id: 'merkle-path',
  merkle_leaf_index: 'merkle-path',
  merkle_path_length: 'merkle-path',
  payload_constructor_member: 'format',
  payload_prototype_member: 'format',
  drop_batch_created: 'closure-incomplete',
  duplicate_kid_first_wins: 'unknown-key',
  published_key_not_p256: 'unknown-key',
  checkpoint_signature_trailing_bits: 'checkpoint-signature',
  checkpoint_signature_length: 'checkpoint-signature',
  step_order_interleave: 'checkpoint-signature',
  empty_feed: 'closure-incomplete',
  unsafe_integer: 'format',
  array_in_object_slot: 'format',
};

export const TAMPER_DESCRIPTIONS: Record<VectorTamper, string> = {
  entry_payload: 'cherryKg of the first harvest_event payload changed; payloadHash left as anchored',
  entry_field: 'ts of the first verification_run changed; entryHash left as anchored',
  merkle_sibling: 'one hex digit of the first path element of the first entry with a path changed',
  checkpoint_signature: 'one byte of the first checkpoint signature changed',
  signing_key: 'every checkpoint re-signed with a fresh key whose kid is not published (feed ledgerKey.kid updated to it)',
  drop_entry: "the first member event's harvest_event entry removed",
  swap_adjacent: 'two consecutive entries under one checkpoint swap places; the forger recomputes payloadHash, prevHash and entryHash so only the Merkle path can tell',
  short_hash: 'first hex digit of shortHash changed',
  payload_proto_member:
    'an own "__proto__" member {"cherryKg":9999,"note":"forged"} added to the first harvest_event payload; payloadHash left as anchored (a verifier that drops the member while parsing would hash the anchored bytes and accept it)',
  drop_device_enrolled: "the device_enrolled entry of the first harvest_event's device removed",
  drop_plot_registered: "the plot_registered entry of the first harvest_event's plot removed",
  merkle_checkpoint_id: "checkpointId of the first entry set to another checkpoint of the feed, whose range does not hold the entry's seq",
  merkle_leaf_index: 'leafIndex of the first entry with a path increased by one (path and root unchanged)',
  merkle_path_length: 'the last element of the path of the first entry with a path removed',
  payload_constructor_member: 'an own "constructor" member added to the first harvest_event payload; payloadHash left as anchored',
  payload_prototype_member: 'an own "prototype" member added to the first harvest_event payload; payloadHash left as anchored',
  drop_batch_created: "the batch's batch_created entry removed (the feed then has no batch_created for its batchId)",
  duplicate_kid_first_wins:
    "feed unchanged; the tamper's own key document lists first a different P-256 key whose kid member claims the ledger key's kid, then the real key: only the first match is used, and its thumbprint differs",
  published_key_not_p256: "feed unchanged; the tamper's own key document has the ledger key with crv \"P-384\"",
  checkpoint_signature_trailing_bits: "the last character of the first checkpoint signature changed so that its unused low bits are not zero (alphabet and length still valid)",
  checkpoint_signature_length: 'the first checkpoint signature cut to 84 characters (63 bytes)',
  step_order_interleave:
    "two changes: the first checkpoint's signature broken and the second checkpoint's kid set to an unpublished kid; steps 2 and 3 run per checkpoint in feed order, so checkpoint-signature (checkpoint 1) is reported, not unknown-key (checkpoint 2)",
  empty_feed: 'entries and checkpoints both empty arrays (well-formed, but no batch_created for the batchId)',
  unsafe_integer: 'leafIndex of the first entry set to 2^53 (9007199254740992), above the largest safe integer',
  array_in_object_slot: 'the payload of the first entry replaced by an empty array',
};

export type Tampered = { variant: TamperVariant | VectorTamper; feed: ProofFeedV1; keys: VerifierKey[]; expectedStep: VerifyStep };

const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const flipHex = (s: string, at = 0) => s.slice(0, at) + (s[at] === '0' ? '1' : '0') + s.slice(at + 1);

function first(feed: ProofFeedV1, pred: (e: FeedEntry) => boolean, what: string): FeedEntry {
  const e = feed.entries.find(pred);
  if (!e) throw new Error(`tamper: the feed has no ${what}`);
  return e;
}

/** Add an own enumerable member (as JSON.parse makes it), even for names such as "__proto__". */
function ownMember(target: Record<string, unknown>, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, enumerable: true, writable: true, configurable: true });
}

const toVector = (v: TamperVariant | VectorTamper): VectorTamper => (v in SUITE_VECTOR ? SUITE_VECTOR[v as TamperVariant] : (v as VectorTamper));

/** Apply one variant to a deep copy of `feed` (and `keys`). The input is never modified. */
export async function applyTamper(input: ProofFeedV1, inputKeys: VerifierKey[], variant: TamperVariant | VectorTamper): Promise<Tampered> {
  const feed = structuredClone(input);
  const keys = structuredClone(inputKeys);
  const kind = toVector(variant);
  if (!(VECTOR_TAMPERS as readonly string[]).includes(kind)) throw new Error(`tamper: unknown variant ${variant}`);
  switch (kind) {
    case 'entry_payload': {
      const e = first(feed, (x) => x.kind === 'harvest_event' && typeof (x.payload.capture as { cherryKg?: unknown } | undefined)?.cherryKg === 'number', 'harvest_event with a capture');
      (e.payload.capture as { cherryKg: number }).cherryKg += 10;
      break;
    }
    case 'entry_field': {
      const e = first(feed, (x) => x.kind === 'verification_run', 'verification_run');
      e.ts = new Date(Date.parse(e.ts) + 1000).toISOString();
      break;
    }
    case 'merkle_sibling': {
      const e = first(feed, (x) => x.path.length > 0, 'entry with a Merkle path');
      e.path[0] = flipHex(e.path[0]!);
      break;
    }
    case 'checkpoint_signature': {
      const cp = feed.checkpoints[0];
      if (!cp) throw new Error('tamper: the feed has no checkpoint');
      // Change a middle character's low bit (the last character also carries padding bits).
      const i = 10;
      cp.signature = cp.signature.slice(0, i) + B64U[B64U.indexOf(cp.signature[i]!) ^ 1] + cp.signature.slice(i + 1);
      break;
    }
    case 'signing_key': {
      const pair = await generateKeyPair(false);
      const kid = await jwkThumbprint(publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)));
      for (const cp of feed.checkpoints) {
        cp.kid = kid;
        cp.signature = await sign(pair.privateKey, checkpointStatementOf(cp));
      }
      feed.ledgerKey.kid = kid;
      break;
    }
    case 'drop_entry': {
      const batch = first(feed, (x) => x.kind === 'batch_created', 'batch_created');
      const member = (batch.payload.events as { eventId: string }[])[0]!.eventId;
      const e = first(feed, (x) => x.kind === 'harvest_event' && x.payload.eventId === member, 'member harvest_event');
      feed.entries = feed.entries.filter((x) => x !== e);
      break;
    }
    case 'swap_adjacent': {
      const i = feed.entries.findIndex((a, k) => {
        const b = feed.entries[k + 1];
        return b !== undefined && b.seq === a.seq + 1 && b.checkpointId === a.checkpointId && jcs(a.payload) !== jcs(b.payload);
      });
      if (i < 0) throw new Error('tamper: the feed has no two consecutive entries under one checkpoint');
      const a = feed.entries[i]!;
      const b = feed.entries[i + 1]!;
      const [ka, pa, ha, ta] = [a.kind, a.payload, a.payloadHash, a.ts];
      [a.kind, a.payload, a.payloadHash, a.ts] = [b.kind, b.payload, b.payloadHash, b.ts];
      [b.kind, b.payload, b.payloadHash, b.ts] = [ka, pa, ha, ta];
      a.entryHash = await entryHashFor(a);
      b.prevHash = a.entryHash;
      b.entryHash = await entryHashFor(b);
      if (b.kind === 'batch_created' || a.kind === 'batch_created') {
        feed.shortHash = feed.entries.find((x) => x.kind === 'batch_created')!.entryHash.slice(0, 12);
      }
      break;
    }
    case 'short_hash':
      feed.shortHash = flipHex(feed.shortHash);
      break;
    case 'payload_proto_member':
      ownMember(first(feed, (x) => x.kind === 'harvest_event', 'harvest_event').payload, '__proto__', { cherryKg: 9999, note: 'forged' });
      break;
    case 'payload_constructor_member':
      ownMember(first(feed, (x) => x.kind === 'harvest_event', 'harvest_event').payload, 'constructor', { cherryKg: 9999 });
      break;
    case 'payload_prototype_member':
      ownMember(first(feed, (x) => x.kind === 'harvest_event', 'harvest_event').payload, 'prototype', { cherryKg: 9999 });
      break;
    case 'drop_device_enrolled': {
      const deviceId = first(feed, (x) => x.kind === 'harvest_event', 'harvest_event').payload.deviceId;
      feed.entries = feed.entries.filter((x) => !(x.kind === 'device_enrolled' && x.payload.deviceId === deviceId));
      break;
    }
    case 'drop_plot_registered': {
      const plotId = first(feed, (x) => x.kind === 'harvest_event', 'harvest_event').payload.plotId;
      feed.entries = feed.entries.filter((x) => !(x.kind === 'plot_registered' && x.payload.plotId === plotId));
      break;
    }
    case 'merkle_checkpoint_id': {
      const e = feed.entries[0];
      if (!e) throw new Error('tamper: the feed has no entries');
      const other = feed.checkpoints.find((c) => c.id !== e.checkpointId && (e.seq < c.fromSeq || e.seq > c.toSeq));
      e.checkpointId = other ? other.id : Math.max(0, ...feed.checkpoints.map((c) => c.id)) + 1;
      break;
    }
    case 'merkle_leaf_index': {
      const e = first(feed, (x) => x.path.length > 0, 'entry with a Merkle path');
      e.leafIndex += 1;
      break;
    }
    case 'merkle_path_length': {
      const e = first(feed, (x) => x.path.length > 0, 'entry with a Merkle path');
      e.path.pop();
      break;
    }
    case 'drop_batch_created':
      feed.entries = feed.entries.filter((x) => !(x.kind === 'batch_created' && x.payload.batchId === feed.batchId));
      break;
    case 'duplicate_kid_first_wins': {
      const real = keys[0];
      if (!real) throw new Error('tamper: no published key');
      const pair = await generateKeyPair(false);
      const impostor = publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
      keys.unshift({ ...impostor, kid: real.kid, use: 'sig', alg: 'ES256' } as VerifierKey);
      break;
    }
    case 'published_key_not_p256':
      for (const k of keys) k.crv = 'P-384';
      break;
    case 'checkpoint_signature_trailing_bits': {
      const cp = feed.checkpoints[0];
      if (!cp || cp.signature.length !== 86) throw new Error('tamper: the first checkpoint has no 86-character signature');
      // 86 characters carry 516 bits for 512: the last character's 4 low bits must be zero.
      const last = B64U.indexOf(cp.signature[85]!);
      cp.signature = cp.signature.slice(0, 85) + B64U[(last & 0b110000) | 0b0001];
      break;
    }
    case 'checkpoint_signature_length': {
      const cp = feed.checkpoints[0];
      if (!cp) throw new Error('tamper: the feed has no checkpoint');
      cp.signature = cp.signature.slice(0, 84);
      break;
    }
    case 'step_order_interleave': {
      const [c1, c2] = feed.checkpoints;
      if (!c1 || !c2) throw new Error('tamper: the feed needs two checkpoints');
      c1.signature = c1.signature.slice(0, 10) + B64U[B64U.indexOf(c1.signature[10]!) ^ 1] + c1.signature.slice(11);
      c2.kid = 'A'.repeat(43);
      break;
    }
    case 'empty_feed':
      feed.entries = [];
      feed.checkpoints = [];
      break;
    case 'unsafe_integer': {
      const e = feed.entries[0];
      if (!e) throw new Error('tamper: the feed has no entries');
      e.leafIndex = 2 ** 53;
      break;
    }
    case 'array_in_object_slot': {
      const e = feed.entries[0];
      if (!e) throw new Error('tamper: the feed has no entries');
      (e as { payload: unknown }).payload = [];
      break;
    }
  }
  return { variant, feed, keys, expectedStep: EXPECTED_STEP[kind] };
}
