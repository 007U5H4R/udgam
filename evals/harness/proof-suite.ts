import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jcs, jwkThumbprint, sha256Hex, verify } from '../../src/lib/crypto';
import { createDb } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { maybeCheckpoint } from '../../src/lib/ledger/checkpoint';
import { closureSeqs } from '../../src/lib/ledger/closure';
import { buildFeed } from '../../src/lib/ledger/feed';
import { setOnAppended } from '../../src/lib/ledger/hashchain';
import { loadLedgerKey, publishedKeys } from '../../src/lib/ledger/keys';
import { verifyFeed } from '../../src/lib/ledger/proof';
import { seedBatchWorld } from '../../tests/helpers/batch-world';
import { applyTamper, EXPECTED_STEP, TAMPER_VARIANTS, type TamperVariant } from './tamper';

// The harness proof suite `harness-proof` (technical-plan TSK-15.8, evaluation-plan §4.6 S6-lib):
// EVAL-058 (intact batch, coverage), EVAL-059–063 (tampers, first failing step) and EVAL-066 (Node
// half of the crypto vectors). The library verifier runs now; the clean-room checker column is
// TKT-18's and is reported as not_yet_implemented until then (never dropped, EVAL-092).
//
// The batch is built in a temporary libSQL file: plots, devices, captures and runs through the real
// writers (persistAccepted), kinds whose services arrive later (TKT-05/06/12/13/14) as ledger
// appends with their planned payloads (tests/helpers/batch-world.ts). The ledger key is a throwaway
// in the same temporary directory.

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PROOF_CASES = ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066'] as const;

type DatasetCase = { id: string; title: string; suite: string; status: string; input: { mutations?: { op: string; target?: string; variants?: string[] }[] } };

export type VariantResult = { variant: TamperVariant; expectedStep: string; lib: { rejected: boolean; step: string | null }; stepMatches: boolean };

export type ProofCaseResult = {
  id: string;
  title: string;
  suite: 'harness-proof';
  status: 'passed' | 'failed';
  /** EVAL-058: closure coverage by the library verifier. */
  metrics?: { closureEntries: number; feedEntries: number; verified: number; coverage: number; checkpoints: number };
  variants: VariantResult[];
  /** The independent checker (TKT-18). */
  cleanRoom: { status: 'not_yet_implemented' };
  detail?: string;
};

export type ProofSuiteOptions = { datasetPath?: string; cryptoVectorsPath?: string; events?: number; plots?: number };

/** Dataset `proof_tamper` targets → tamper variants (tamper.ts). */
const TARGET_VARIANT: Record<string, TamperVariant> = {
  entry_payload: 'entry_payload',
  merkle_sibling: 'merkle_sibling',
  checkpoint_signature: 'checkpoint_signature',
  signing_key: 'signing_key',
};

function variantsOf(c: DatasetCase): TamperVariant[] {
  const out: TamperVariant[] = [];
  for (const m of c.input.mutations ?? []) {
    if (m.op !== 'proof_tamper') continue;
    if (m.target === 'chain_order') out.push(...(m.variants ?? []).map((v) => v as TamperVariant));
    else if (m.target && TARGET_VARIANT[m.target]) out.push(TARGET_VARIANT[m.target]!);
    else throw new Error(`proof suite: unknown proof_tamper target ${m.target ?? '(none)'} in ${c.id}`);
  }
  for (const v of out) if (!(TAMPER_VARIANTS as readonly string[]).includes(v)) throw new Error(`proof suite: unknown variant ${v} in ${c.id}`);
  return out;
}

async function cryptoVectorsAgree(path: string): Promise<{ ok: boolean; detail: string }> {
  const v = JSON.parse(await readFile(path, 'utf8')) as {
    jcs: { name: string; input: string; canonical: string; sha256: string }[];
    ecdsa: { publicJwk: JsonWebKey; thumbprint: { sha256B64u: string }; signatures: { message: string; signature: string }[] };
  };
  const bad: string[] = [];
  for (const x of v.jcs) {
    const canonical = jcs(JSON.parse(x.input));
    if (canonical !== x.canonical || (await sha256Hex(canonical)) !== x.sha256) bad.push(x.name);
  }
  for (const [i, s] of v.ecdsa.signatures.entries()) if (!(await verify(v.ecdsa.publicJwk, s.message, s.signature))) bad.push(`signature ${i}`);
  if ((await jwkThumbprint(v.ecdsa.publicJwk)) !== v.ecdsa.thumbprint.sha256B64u) bad.push('thumbprint');
  const total = v.jcs.length + v.ecdsa.signatures.length + 1;
  return { ok: bad.length === 0, detail: bad.length === 0 ? `${total}/${total} vectors agree` : `disagree: ${bad.join(', ')}` };
}

/** Run EVAL-058–063 and EVAL-066 and return one result per case (never skipping a case). */
export async function runProofSuite(opts: ProofSuiteOptions = {}): Promise<ProofCaseResult[]> {
  const dataset = JSON.parse(await readFile(opts.datasetPath ?? join(ROOT, 'evals/eval-dataset.json'), 'utf8')) as { cases: DatasetCase[] };
  const cases = PROOF_CASES.map((id) => {
    const c = dataset.cases.find((x) => x.id === id);
    if (!c) throw new Error(`proof suite: ${id} is not in the dataset`);
    return c;
  });

  const dir = await mkdtemp(join(tmpdir(), 'udgam-proof-suite-'));
  const { db, client, ready } = createDb(`file:${join(dir, 'ledger.db')}`);
  const keyPath = join(dir, 'keys', 'ledger.jwk');
  try {
    await ready;
    await runMigrations(db, join(ROOT, 'src/lib/db/migrations'));
    const key = await loadLedgerKey(keyPath);
    setOnAppended((tx, seq) => maybeCheckpoint(tx, seq, { key }));

    const w = await seedBatchWorld(db, { events: opts.events ?? 50, plots: opts.plots ?? 5, devices: 2, override: true, attestation: true, editPlot: true, transfer: true, revokeDevice: true });
    const feed = await buildFeed(db, w.batchId, { key });
    const keys = (await publishedKeys(keyPath)).keys;
    const closure = await closureSeqs(db, w.batchId);

    const results: ProofCaseResult[] = [];
    for (const c of cases) {
      const base = { id: c.id, title: c.title, suite: 'harness-proof' as const, variants: [] as VariantResult[], cleanRoom: { status: 'not_yet_implemented' as const } };
      if (c.id === 'EVAL-058') {
        const out = await verifyFeed(feed, keys);
        const inFeed = new Set(feed.entries.map((e) => e.seq));
        const verified = out.ok ? closure.filter((s) => inFeed.has(s)).length : 0;
        const coverage = closure.length === 0 ? 0 : verified / closure.length;
        results.push({
          ...base,
          status: out.ok && coverage === 1 && out.entries === closure.length ? 'passed' : 'failed',
          metrics: { closureEntries: closure.length, feedEntries: feed.entries.length, verified, coverage, checkpoints: feed.checkpoints.length },
          detail: out.ok ? `verified ${verified}/${closure.length} closure entries under ${feed.checkpoints.length} checkpoints` : `intact feed failed at ${out.step}`,
        });
        continue;
      }
      if (c.id === 'EVAL-066') {
        const agree = await cryptoVectorsAgree(opts.cryptoVectorsPath ?? join(ROOT, 'evals/fixtures/crypto-vectors.json'));
        results.push({ ...base, status: agree.ok ? 'passed' : 'failed', detail: `Node half: ${agree.detail}; browser half is e2e/crypto-vectors.spec.ts (TC-006)` });
        continue;
      }
      for (const variant of variantsOf(c)) {
        const t = await applyTamper(feed, keys, variant);
        const out = await verifyFeed(t.feed, t.keys);
        const lib = { rejected: !out.ok, step: out.ok ? null : out.step };
        base.variants.push({ variant, expectedStep: EXPECTED_STEP[variant], lib, stepMatches: lib.step === EXPECTED_STEP[variant] });
      }
      const pass = base.variants.length > 0 && base.variants.every((v) => v.lib.rejected && v.stepMatches);
      results.push({ ...base, status: pass ? 'passed' : 'failed', detail: base.variants.map((v) => `${v.variant}: ${v.lib.step ?? 'ACCEPTED'}`).join('; ') });
    }
    return results;
  } finally {
    setOnAppended(maybeCheckpoint);
    client.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// `pnpm tsx evals/harness/proof-suite.ts` — a standalone run until TKT-03's runner registers the suite.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.env.LOG_LEVEL ??= 'silent';
  const results = await runProofSuite();
  for (const r of results) console.log(`${r.status === 'passed' ? 'PASS' : 'FAIL'} ${r.id} ${r.title} — ${r.detail ?? ''} [clean-room: ${r.cleanRoom.status}]`);
  process.exitCode = results.every((r) => r.status === 'passed') ? 0 : 1;
}
