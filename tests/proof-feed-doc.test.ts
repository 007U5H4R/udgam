import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TAMPER_VARIANTS } from '../evals/harness/tamper';
import { FeedCheckpointSchema, FeedEntrySchema, ProofFeedV1Schema, verifyFeed, type VerifierKey } from '../src/lib/ledger/proof';

// TSK-15.7 (GAP-9): docs/proof-feed.md specifies the feed well enough for an independent verifier,
// and docs/proof-feed.vectors.json holds an intact feed plus tampers with the step each must fail at.

const DOC = new URL('../docs/proof-feed.md', import.meta.url);
const VECTORS = new URL('../docs/proof-feed.vectors.json', import.meta.url);

type Vectors = {
  format: string;
  keys: { keys: VerifierKey[] };
  feed: unknown;
  tampers: { variant: string; description: string; expectedStep: string; feed: unknown }[];
};

const doc = () => readFileSync(DOC, 'utf8');
const vectors = () => JSON.parse(readFileSync(VECTORS, 'utf8')) as Vectors;

/** The ```json block that follows the "Feed example" heading, with // comments removed. */
function feedExample(): Record<string, unknown> {
  const text = doc();
  const at = text.indexOf('### Feed example');
  expect(at).toBeGreaterThan(-1);
  const block = /```json\n([\s\S]*?)```/.exec(text.slice(at));
  expect(block).not.toBeNull();
  return JSON.parse(block![1]!.replace(/\s\/\/.*$/gm, '')) as Record<string, unknown>;
}

const keysOf = (o: unknown) => Object.keys(o as object).sort();
const shape = (s: { shape: object }) => Object.keys(s.shape).sort();

describe('docs/proof-feed.md and its vectors (GAP-9)', () => {
  it('both files exist', () => {
    expect(existsSync(DOC)).toBe(true);
    expect(existsSync(VECTORS)).toBe(true);
  });

  it('the intact vector feed verifies with the vector keys', async () => {
    const v = vectors();
    expect(v.format).toBe('udgam-proof-feed/1');
    const out = await verifyFeed(v.feed, v.keys.keys);
    expect(out).toMatchObject({ ok: true });
    expect(v.keys.keys.every((k) => !('d' in k))).toBe(true);
  });

  it('every tamper vector fails at the step it names, and the doc names every step', async () => {
    const v = vectors();
    const text = doc();
    expect(v.tampers.length).toBeGreaterThanOrEqual(8);
    for (const t of v.tampers) {
      expect(await verifyFeed(t.feed, v.keys.keys), t.variant).toMatchObject({ ok: false, step: t.expectedStep });
      expect(text, t.expectedStep).toContain(`\`${t.expectedStep}\``);
    }
    for (const step of ['format', 'unknown-key', 'checkpoint-signature', 'payload-hash', 'entry-hash', 'merkle-path', 'payload-signature', 'short-hash', 'closure-incomplete']) {
      expect(text, step).toContain(`\`${step}\``);
    }
  });

  it('holds every tamper variant plus the insider vector for a misstated member hash (fix round 1)', () => {
    const v = vectors();
    expect(v.tampers.map((t) => t.variant)).toEqual([...TAMPER_VARIANTS, 'batch_event_hash']);
    const proto = v.tampers.find((t) => t.variant === 'payload_proto_member')!;
    const entries = (proto.feed as { entries: { kind: string; payload: object }[] }).entries;
    // JSON.parse of the vectors file gives an own "__proto__" member, as a verifier receives it.
    expect(Object.keys(entries.find((e) => e.kind === 'harvest_event')!.payload)).toContain('__proto__');
    expect(proto.expectedStep).toBe('format');
    expect(v.tampers.find((t) => t.variant === 'batch_event_hash')!.expectedStep).toBe('closure-incomplete');
  });

  it('documents the expected block and the result shape', () => {
    const v = vectors() as Vectors & { expected: { ok: boolean; entries: number; checkpoints: { id: number; kid: string }[] } };
    expect(Object.keys(v.expected).sort()).toEqual(['checkpoints', 'entries', 'ok']);
    for (const c of v.expected.checkpoints) expect(Object.keys(c).sort()).toEqual(['id', 'kid']);
    const text = doc();
    expect(text).toContain('"checkpoints": [{ "id": 1, "kid": "…" }');
    expect(text).toContain('{ "ok": false, "step": "…"');
  });

  it('the feed example names exactly the fields of the ProofFeedV1 schema', () => {
    const ex = feedExample();
    expect(keysOf(ex)).toEqual(shape(ProofFeedV1Schema));
    expect(keysOf(ex.ledgerKey)).toEqual(shape(ProofFeedV1Schema.shape.ledgerKey));
    expect(keysOf((ex.checkpoints as unknown[])[0])).toEqual(shape(FeedCheckpointSchema));
    expect(keysOf((ex.entries as unknown[])[0])).toEqual(shape(FeedEntrySchema));
  });
});
