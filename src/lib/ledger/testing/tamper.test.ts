import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyFeed, type ProofFeedV1, type VerifierKey } from '../proof';
import { applyTamper, EXPECTED_STEP, SUITE_VECTOR, TAMPER_DESCRIPTIONS, TAMPER_VARIANTS, VECTOR_TAMPERS } from './tamper';

// TSK-18.5: one-change tamper variants of a proof feed. The input is the intact feed of
// docs/proof-feed.vectors.json (a real ledger's feed), so no database is needed here.

const vectors = JSON.parse(readFileSync(new URL('../../../../docs/proof-feed.vectors.json', import.meta.url), 'utf8')) as {
  feed: ProofFeedV1;
  keys: { keys: VerifierKey[] };
};
const feed = () => structuredClone(vectors.feed);
const keys = () => structuredClone(vectors.keys.keys);
const asReceived = (f: unknown) => JSON.parse(JSON.stringify(f)) as unknown;

/** Paths (a.b[0].c) where two JSON values differ; arrays compare by index. */
function diff(a: unknown, b: unknown, path = ''): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return [path];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  const out: string[] = [];
  for (const k of new Set([...ka, ...kb])) {
    const inA = ka.includes(k);
    const inB = kb.includes(k);
    const p = path ? `${path}.${k}` : k;
    if (inA !== inB) out.push(p);
    else out.push(...diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], p));
  }
  return out;
}

describe('TAMPER_VARIANTS (the S6 suite, EVAL-059–063)', () => {
  it('names the seven forgeries of the plan', () => {
    expect([...TAMPER_VARIANTS]).toEqual(['payload-field', 'merkle-sibling', 'checkpoint-signature', 'other-key', 'dropped-entry', 'reordered-entries', 'wrong-short-hash']);
  });

  it('names the step docs/proof-feed.md gives for each (a dropped member entry → closure-incomplete, a swap → merkle-path)', async () => {
    const want = {
      'payload-field': 'payload-hash',
      'merkle-sibling': 'merkle-path',
      'checkpoint-signature': 'checkpoint-signature',
      'other-key': 'unknown-key',
      'dropped-entry': 'closure-incomplete',
      'reordered-entries': 'merkle-path',
      'wrong-short-hash': 'short-hash',
    } as const;
    for (const v of TAMPER_VARIANTS) {
      const t = await applyTamper(feed(), keys(), v);
      expect(t.expectedStep, v).toBe(want[v]);
      expect(EXPECTED_STEP[SUITE_VECTOR[v]], v).toBe(want[v]);
    }
  });

  it('never modifies its input', async () => {
    const input = feed();
    const before = JSON.stringify(input);
    for (const v of [...TAMPER_VARIANTS, ...VECTOR_TAMPERS]) await applyTamper(input, keys(), v);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('each variant changes exactly one thing', async () => {
    const base = feed();
    const one = async (v: (typeof TAMPER_VARIANTS)[number]) => {
      const t = await applyTamper(base, keys(), v);
      return { t, paths: diff(base, t.feed) };
    };

    const payload = await one('payload-field');
    expect(payload.paths).toHaveLength(1);
    expect(payload.paths[0]).toMatch(/^entries\[\d+\]\.payload\.capture\.cherryKg$/);

    const sibling = await one('merkle-sibling');
    expect(sibling.paths).toHaveLength(1);
    expect(sibling.paths[0]).toMatch(/^entries\[\d+\]\.path\[0\]$/);

    const sig = await one('checkpoint-signature');
    expect(sig.paths).toEqual(['checkpoints[0].signature']);

    const short = await one('wrong-short-hash');
    expect(short.paths).toEqual(['shortHash']);

    // other-key: the substituted key's kid and re-signed checkpoints; the published keys are unchanged.
    const other = await one('other-key');
    const allowed = /^(ledgerKey\.kid|checkpoints\[\d+\]\.(kid|signature))$/;
    expect(other.paths.length).toBeGreaterThan(0);
    expect(other.paths.every((p) => allowed.test(p)), other.paths.join(', ')).toBe(true);
    expect(other.t.keys).toEqual(keys());
    const newKids = new Set(other.t.feed.checkpoints.map((c) => c.kid));
    expect(newKids.size).toBe(1);
    expect(keys().some((k) => newKids.has(k.kid))).toBe(false);

    // dropped-entry: exactly one entry removed, nothing else touched.
    const dropped = await one('dropped-entry');
    expect(dropped.t.feed.entries).toHaveLength(base.entries.length - 1);
    const gone = base.entries.filter((e) => !dropped.t.feed.entries.some((x) => x.seq === e.seq));
    expect(gone).toHaveLength(1);
    expect(gone[0]!.kind).toBe('harvest_event');
    expect(diff({ ...base, entries: base.entries.filter((e) => e !== gone[0]) }, dropped.t.feed)).toEqual([]);

    // reordered-entries: two adjacent entries under one checkpoint trade places (content and all);
    // the forger recomputes their hashes, so only those two entries differ.
    const swapped = await one('reordered-entries');
    const changed = new Set(swapped.paths.map((p) => /^entries\[(\d+)\]/.exec(p)?.[1]));
    expect([...changed].every((x) => x !== undefined)).toBe(true);
    const [i, j] = [...changed].map(Number).sort((a, b) => a - b) as [number, number];
    expect(changed.size).toBe(2);
    expect(j).toBe(i + 1);
    const [a, b] = [base.entries[i]!, base.entries[j]!];
    const [x, y] = [swapped.t.feed.entries[i]!, swapped.t.feed.entries[j]!];
    expect([x.seq, y.seq]).toEqual([a.seq, b.seq]);
    expect([x.kind, x.payload, y.kind, y.payload]).toEqual([b.kind, b.payload, a.kind, a.payload]);
  });

  it('the library verifier rejects every variant at its expected step', async () => {
    for (const v of TAMPER_VARIANTS) {
      const t = await applyTamper(feed(), keys(), v);
      expect(await verifyFeed(asReceived(t.feed), t.keys), v).toMatchObject({ ok: false, step: t.expectedStep });
    }
  });
});

describe('VECTOR_TAMPERS (docs/proof-feed.vectors.json forgeries)', () => {
  it('extends the documented set with the merkle-path sub-cases, forbidden keys and a missing batch_created', () => {
    for (const v of ['merkle_checkpoint_id', 'merkle_leaf_index', 'merkle_path_length', 'payload_constructor_member', 'payload_prototype_member', 'drop_batch_created'] as const) {
      expect(VECTOR_TAMPERS).toContain(v);
    }
    for (const v of VECTOR_TAMPERS) expect(TAMPER_DESCRIPTIONS[v].length, v).toBeGreaterThan(10);
  });

  it('every vector tamper fails the library verifier at its documented step', async () => {
    for (const v of VECTOR_TAMPERS) {
      const t = await applyTamper(feed(), keys(), v);
      expect(await verifyFeed(asReceived(t.feed), t.keys), v).toMatchObject({ ok: false, step: EXPECTED_STEP[v] });
    }
  });

  it('the merkle-path sub-cases and forbidden members each change one field', async () => {
    const base = feed();
    const paths = async (v: (typeof VECTOR_TAMPERS)[number]) => diff(base, (await applyTamper(base, keys(), v)).feed);
    expect(await paths('merkle_checkpoint_id')).toEqual([expect.stringMatching(/^entries\[\d+\]\.checkpointId$/)]);
    expect(await paths('merkle_leaf_index')).toEqual([expect.stringMatching(/^entries\[\d+\]\.leafIndex$/)]);
    expect(await paths('merkle_path_length')).toEqual([expect.stringMatching(/^entries\[\d+\]\.path\[\d+\]$/)]);
    expect(await paths('payload_constructor_member')).toEqual([expect.stringMatching(/^entries\[\d+\]\.payload\.constructor$/)]);
    expect(await paths('payload_prototype_member')).toEqual([expect.stringMatching(/^entries\[\d+\]\.payload\.prototype$/)]);
  });
});
