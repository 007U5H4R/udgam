import { generateKeyPair, jcs, jwkThumbprint, publicMembers, sha256Hex, sign } from '../../src/lib/crypto';
import { checkpointStatementOf, type FeedEntry, type ProofFeedV1, type VerifierKey, type VerifyStep } from '../../src/lib/ledger/proof';

// Proof-feed tamper variants for the harness proof suite (EVAL-059–063) and the documented vectors
// (docs/proof-feed.vectors.json). Each variant makes one forgery an attacker could attempt and names
// the verification step that must catch it (docs/proof-feed.md, "Verification steps").

export const TAMPER_VARIANTS = [
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
] as const;
export type TamperVariant = (typeof TAMPER_VARIANTS)[number];

export const EXPECTED_STEP: Record<TamperVariant, VerifyStep> = {
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
};

export const TAMPER_DESCRIPTIONS: Record<TamperVariant, string> = {
  entry_payload: "cherryKg of the first harvest_event payload changed; payloadHash left as anchored",
  entry_field: "ts of the first verification_run changed; entryHash left as anchored",
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
};

export type Tampered = { variant: TamperVariant; feed: ProofFeedV1; keys: VerifierKey[]; expectedStep: VerifyStep };

const flipHex = (s: string, at = 0) => s.slice(0, at) + (s[at] === '0' ? '1' : '0') + s.slice(at + 1);
const entryHash = (e: Pick<FeedEntry, 'seq' | 'prevHash' | 'kind' | 'payloadHash' | 'ts'>) =>
  sha256Hex(jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }));

function first(feed: ProofFeedV1, pred: (e: FeedEntry) => boolean, what: string): FeedEntry {
  const e = feed.entries.find(pred);
  if (!e) throw new Error(`tamper: the feed has no ${what}`);
  return e;
}

/** Apply one variant to a deep copy of `feed` (and `keys`). The input is never modified. */
export async function applyTamper(input: ProofFeedV1, inputKeys: VerifierKey[], variant: TamperVariant): Promise<Tampered> {
  const feed = structuredClone(input);
  const keys = structuredClone(inputKeys);
  switch (variant) {
    case 'entry_payload': {
      const e = first(feed, (x) => x.kind === 'harvest_event' && typeof (x.payload.capture as { cherryKg?: unknown } | undefined)?.cherryKg === 'number', 'harvest_event with a capture');
      const capture = e.payload.capture as { cherryKg: number };
      capture.cherryKg += 10;
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
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      cp.signature = cp.signature.slice(0, i) + alphabet[alphabet.indexOf(cp.signature[i]!) ^ 1] + cp.signature.slice(i + 1);
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
      a.entryHash = await entryHash(a);
      b.prevHash = a.entryHash;
      b.entryHash = await entryHash(b);
      if (b.kind === 'batch_created' || a.kind === 'batch_created') {
        feed.shortHash = feed.entries.find((x) => x.kind === 'batch_created')!.entryHash.slice(0, 12);
      }
      break;
    }
    case 'short_hash':
      feed.shortHash = flipHex(feed.shortHash);
      break;
    case 'payload_proto_member': {
      const e = first(feed, (x) => x.kind === 'harvest_event', 'harvest_event');
      // An own member (as JSON.parse makes it), not the prototype: it survives JSON.stringify.
      Object.defineProperty(e.payload, '__proto__', { value: { cherryKg: 9999, note: 'forged' }, enumerable: true, writable: true, configurable: true });
      break;
    }
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
  }
  return { variant, feed, keys, expectedStep: EXPECTED_STEP[variant] };
}
