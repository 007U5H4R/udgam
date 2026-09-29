import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyFeed, type ProofFeedV1, type VerifierKey } from './proof';

// TSK-16.3: verifyFeed's optional progress callback (additive; the result is unchanged). It reports each
// entry that passed steps 4–7, so the certificate can say "Checking k of n records…" truthfully.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;
const KEYS = (JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.keys.json'), 'utf8')) as { keys: VerifierKey[] }).keys;

describe('verifyFeed onProgress (TSK-16.3)', () => {
  it('reports 1..n of n for an intact feed; the outcome is the same with or without it', async () => {
    const seen: [number, number][] = [];
    const out = await verifyFeed(FEED, KEYS, { onProgress: (done, total) => seen.push([done, total]) });
    expect(seen).toEqual(Array.from({ length: 16 }, (_, i) => [i + 1, 16]));
    expect(out).toEqual(await verifyFeed(FEED, KEYS));
  });

  it('stops at the entry that fails', async () => {
    const f = structuredClone(FEED);
    const i = f.entries.findIndex((e) => e.kind === 'harvest_event');
    (f.entries[i]!.payload.capture as { cherryKg: number }).cherryKg += 1;
    const seen: number[] = [];
    const out = await verifyFeed(f, KEYS, { onProgress: (done) => seen.push(done) });
    expect(out).toMatchObject({ ok: false, step: 'payload-hash', seq: f.entries[i]!.seq });
    expect(seen.at(-1)).toBe(i);
  });
});
