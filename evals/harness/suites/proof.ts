import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { jcs, jwkThumbprint, sha256Hex, verify } from '../../../src/lib/crypto';
import { checkFeedAnchors } from '../../../src/lib/ledger/evm/verify-anchors';
import { verifyFeed, type VerifierKey } from '../../../src/lib/ledger/proof';
import { applyTamper, TAMPER_VARIANTS, type TamperVariant } from '../../../src/lib/ledger/testing/tamper';
import { scoreProofRun, type ProofScore, type VerifierOutcome } from '../../scorers/proof-verifier';
import { buildProofFixture } from '../proof-fixture';

// The harness proof suite `harness-proof` (technical-plan TSK-15.8, TSK-18.6; evaluation-plan §4.6
// S6-lib, EV11): EVAL-058 (intact batch, coverage), EVAL-059–063 (tampers, first failing step) and
// EVAL-066 (Node half of the crypto vectors). Every feed goes to BOTH verifiers: the library verifier
// (verifyFeed, which the certificate page runs) in-process, and the clean-room checker
// (evals/scorers/independent-verifier) as a child process (`tsx cli.ts`), so no module state is
// shared. A case passes only when both agree with the documented step.
//
// The batch is proof-fixture.ts: a temporary libSQL file and a throwaway ledger key in a temp
// directory (never ./data). The seven tamper variants come from src/lib/ledger/testing/tamper.ts.
//
// With `evm` (pnpm eval --ledger=evm, TSK-24.8) the same batch is built on the EVM ledger adapter against
// a local chain, so EVAL-058–063 run on a feed whose entries carry `evm` anchors, and EVAL-103 also
// passes only when every one of them did and every closure entry's txHash / blockNumber match the chain.

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLEAN_ROOM_CLI = join(ROOT, 'evals', 'scorers', 'independent-verifier', 'cli.ts');
/** The cases runProofSuite produces a result for (the readiness check reads it, TSK-21.1). */
export const PROOF_CASES = ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066'] as const;
/** EVAL-103 re-runs these on the EVM adapter (TC-083). */
const EVM_RERUN = ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063'] as const;
const execFileAsync = promisify(execFile);
/**
 * The clean-room child's time limit. The whole suite runs inside the first harness-proof case's 30 s
 * watchdog (run.ts CASE_TIMEOUT_MS), so the child is killed before that fires and never outlives the run.
 */
export const CLEAN_ROOM_TIMEOUT_MS = 25_000;

type DatasetCase = { id: string; title: string; suite: string; status: string; input: { mutations?: { op: string; target?: string; variants?: string[] }[] } };

export type VerifierVerdict = { rejected: boolean; step: string | null };
export type VariantResult = { variant: TamperVariant; expectedStep: string; lib: VerifierVerdict; cleanRoom: VerifierVerdict; stepMatches: boolean };

export type ProofCaseResult = {
  id: string;
  title: string;
  suite: 'harness-proof';
  status: 'passed' | 'failed';
  /** EVAL-058: closure coverage by each verifier. */
  metrics?: {
    closureEntries: number;
    feedEntries: number;
    verified: number;
    coverage: number;
    cleanRoomVerified: number;
    cleanRoomCoverage: number;
    checkpoints: number;
    uncheckpointedBeforeFeed: number;
  };
  /** EVAL-058: the proof-verifier score over the intact feed and all seven variants. */
  score?: ProofScore;
  variants: VariantResult[];
  /** The independent checker (TKT-18): it ran for this case, and what it said. */
  cleanRoom: { status: 'ran'; detail: string };
  detail?: string;
};

export type ProofSuiteOptions = {
  datasetPath?: string;
  cryptoVectorsPath?: string;
  proofVectorsPath?: string;
  events?: number;
  plots?: number;
  /** Build the batch on the EVM ledger adapter against this chain, and add EVAL-103 (TSK-24.8). */
  evm?: { rpcUrl: string };
};

/** Dataset `proof_tamper` targets (and chain_order variants) → the S6 tamper variants. */
const TARGET_VARIANT: Record<string, TamperVariant> = {
  entry_payload: 'payload-field',
  merkle_sibling: 'merkle-sibling',
  checkpoint_signature: 'checkpoint-signature',
  signing_key: 'other-key',
  drop_entry: 'dropped-entry',
  swap_adjacent: 'reordered-entries',
  short_hash: 'wrong-short-hash',
};

function variantsOf(c: DatasetCase): TamperVariant[] {
  const out: TamperVariant[] = [];
  for (const m of c.input.mutations ?? []) {
    if (m.op !== 'proof_tamper') continue;
    const names = m.target === 'chain_order' ? (m.variants ?? []) : [m.target ?? '(none)'];
    for (const name of names) {
      const v = TARGET_VARIANT[name];
      if (!v) throw new Error(`proof suite: unknown proof_tamper target ${name} in ${c.id}`);
      out.push(v);
    }
  }
  return out;
}

/** The library half of EVAL-066: lib/crypto agrees with every shared vector. */
async function libVectorsAgree(path: string): Promise<{ ok: boolean; detail: string }> {
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
  return { ok: bad.length === 0, detail: bad.length === 0 ? `${total}/${total}` : `disagrees on ${bad.join(', ')}` };
}

type CleanRoomResult = { ok: boolean; verified: number; total: number; failure?: { step: string } };

/** Run the clean-room checker in a child process (never imported: no shared module state). */
export async function cleanRoom(args: string[], opts: { timeoutMs?: number; cli?: string } = {}): Promise<unknown> {
  const run = () =>
    execFileAsync(TSX, [opts.cli ?? CLEAN_ROOM_CLI, ...args], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, timeout: opts.timeoutMs ?? CLEAN_ROOM_TIMEOUT_MS, killSignal: 'SIGKILL' });
  let stdout: string;
  try {
    ({ stdout } = await run());
  } catch (e) {
    // Only --vectors may exit 1 with a result on stdout (a vector disagrees). Anything else, or
    // output that is not JSON, rethrows the original error (with its stderr), never a SyntaxError.
    const out = (e as { stdout?: string; code?: unknown }).stdout;
    if (args[0] !== '--vectors' || (e as { code?: unknown }).code !== 1 || !out) throw e;
    try {
      return JSON.parse(out) as unknown;
    } catch {
      throw e;
    }
  }
  try {
    return JSON.parse(stdout) as unknown;
  } catch (parseError) {
    throw new Error(`the clean-room checker printed non-JSON output: ${stdout.slice(0, 200)}`, { cause: parseError });
  }
}

const libOutcome = (out: Awaited<ReturnType<typeof verifyFeed>>): VerifierOutcome =>
  out.ok ? { ok: true, verified: out.entries, step: null } : { ok: false, verified: 0, step: out.step };
const cleanOutcome = (r: CleanRoomResult): VerifierOutcome => ({ ok: r.ok, verified: r.verified, step: r.ok ? null : (r.failure?.step ?? null) });
const said = (o: VerifierOutcome) => (o.ok ? `accepted (${o.verified} entries)` : `rejected at ${o.step}`);

/** Serialised and parsed, as a verifier receives a feed. */
const asReceived = (f: unknown) => JSON.parse(JSON.stringify(f)) as unknown;

/** Run EVAL-058–063 and EVAL-066 and return one result per case (never skipping a case). */
export async function runProofSuite(opts: ProofSuiteOptions = {}): Promise<ProofCaseResult[]> {
  const dataset = JSON.parse(await readFile(opts.datasetPath ?? join(ROOT, 'evals/eval-dataset.json'), 'utf8')) as { cases: DatasetCase[] };
  const cases = [...PROOF_CASES, ...(opts.evm ? (['EVAL-103'] as const) : [])].map((id) => {
    const c = dataset.cases.find((x) => x.id === id);
    if (!c) throw new Error(`proof suite: ${id} is not in the dataset`);
    return c;
  });
  const cryptoVectorsPath = opts.cryptoVectorsPath ?? join(ROOT, 'evals/fixtures/crypto-vectors.json');
  const proofVectors = JSON.parse(await readFile(opts.proofVectorsPath ?? join(ROOT, 'docs/proof-feed.vectors.json'), 'utf8')) as {
    keys: { keys: VerifierKey[] };
    feed: unknown;
    tampers: { variant: string; expectedStep: string; keys?: { keys: VerifierKey[] }; feed: unknown }[];
  };

  const fx = await buildProofFixture({ events: opts.events, plots: opts.plots, evm: opts.evm });
  try {
    const keys = fx.keyDocument.keys as VerifierKey[];

    // Every feed the suite checks: the intact batch, its seven variants, then the documented vectors.
    const tampered = await Promise.all(TAMPER_VARIANTS.map((v) => applyTamper(fx.feed, keys, v)));
    type Job = { feed: unknown; keys: VerifierKey[] };
    const jobs: Job[] = [
      { feed: fx.feed, keys },
      ...tampered.map((t) => ({ feed: t.feed, keys: t.keys })),
      { feed: proofVectors.feed, keys: proofVectors.keys.keys },
      ...proofVectors.tampers.map((t) => ({ feed: t.feed, keys: (t.keys ?? proofVectors.keys).keys })),
    ];
    const files = await Promise.all(
      jobs.map(async (j, i) => {
        const feed = join(fx.dir, `feed-${i}.json`);
        const keyFile = join(fx.dir, `keys-${i}.json`);
        await writeFile(feed, JSON.stringify(j.feed));
        await writeFile(keyFile, JSON.stringify({ keys: j.keys }));
        return { feed, keys: keyFile };
      }),
    );
    const jobsPath = join(fx.dir, 'jobs.json');
    await writeFile(jobsPath, JSON.stringify(files));
    const [cleanResults, cleanVectors, libResults, libVectors] = await Promise.all([
      cleanRoom(['--batch', jobsPath]) as Promise<CleanRoomResult[]>,
      cleanRoom(['--vectors', cryptoVectorsPath]) as Promise<{ ok: boolean; total: number; failed: string[] }>,
      Promise.all(jobs.map((j) => verifyFeed(asReceived(j.feed), j.keys))),
      libVectorsAgree(cryptoVectorsPath),
    ]);
    if (!Array.isArray(cleanResults) || cleanResults.length !== jobs.length) throw new Error('proof suite: the clean-room checker returned no result per feed');

    const lib = libResults.map(libOutcome);
    const clean = cleanResults.map(cleanOutcome);
    const n = TAMPER_VARIANTS.length;
    const score = scoreProofRun({
      closureEntries: fx.closure.length,
      intact: { lib: lib[0]!, cleanRoom: clean[0]! },
      variants: tampered.map((t, i) => ({ variant: t.variant, expectedStep: t.expectedStep, lib: lib[i + 1]!, cleanRoom: clean[i + 1]! })),
    });
    const byVariant = new Map(score.perVariant.map((v) => [v.variant, v]));

    // The documented vectors: both verifiers accept the intact feed and reject each tamper at its step.
    const vectorOffset = 1 + n;
    const vectorDisagreements: string[] = [];
    if (!lib[vectorOffset]!.ok || !clean[vectorOffset]!.ok) vectorDisagreements.push('intact vector feed');
    proofVectors.tampers.forEach((t, i) => {
      const [l, c] = [lib[vectorOffset + 1 + i]!, clean[vectorOffset + 1 + i]!];
      if (l.step !== t.expectedStep || c.step !== t.expectedStep) vectorDisagreements.push(`${t.variant} (library ${l.step ?? 'ok'}, clean-room ${c.step ?? 'ok'})`);
    });

    const results: ProofCaseResult[] = [];
    for (const c of cases) {
      const base = { id: c.id, title: c.title, suite: 'harness-proof' as const };
      if (c.id === 'EVAL-058') {
        const inFeed = new Set(fx.feed.entries.map((e) => e.seq));
        const allInFeed = fx.closure.every((s) => inFeed.has(s)) && fx.feed.entries.length === fx.closure.length;
        const verified = lib[0]!.ok && allInFeed ? lib[0]!.verified : 0;
        const cleanVerified = clean[0]!.ok && allInFeed ? clean[0]!.verified : 0;
        const pass = allInFeed && score.coverage.lib === 1 && score.coverage.cleanRoom === 1 && verified === fx.closure.length && cleanVerified === fx.closure.length;
        results.push({
          ...base,
          status: pass ? 'passed' : 'failed',
          metrics: {
            closureEntries: fx.closure.length,
            feedEntries: fx.feed.entries.length,
            verified,
            coverage: score.coverage.lib,
            cleanRoomVerified: cleanVerified,
            cleanRoomCoverage: score.coverage.cleanRoom,
            checkpoints: fx.feed.checkpoints.length,
            uncheckpointedBeforeFeed: fx.uncheckpointedBeforeFeed,
          },
          score,
          variants: [],
          cleanRoom: { status: 'ran', detail: said(clean[0]!) },
          detail: `library ${said(lib[0]!)}, clean-room ${said(clean[0]!)}; ${fx.closure.length} closure entries under ${fx.feed.checkpoints.length} checkpoints`,
        });
        continue;
      }
      if (c.id === 'EVAL-103') {
        // Every other case has been pushed already (EVAL-103 is last in `cases`).
        const rerun = EVM_RERUN.map((id) => results.find((r) => r.id === id));
        const rerunOk = rerun.every((r) => r?.status === 'passed');
        const anchors = fx.evm ? await checkFeedAnchors(fx.feed, fx.evm.registry) : { ok: false, checked: 0, anchored: 0, problems: ['the fixture was not built on the EVM adapter'] };
        const closureAnchored = anchors.ok && anchors.checked === fx.closure.length;
        const where = fx.evm ? `chain ${fx.evm.deployment.chainId}, registry ${fx.evm.deployment.registry}` : 'no chain';
        results.push({
          ...base,
          status: rerunOk && closureAnchored ? 'passed' : 'failed',
          variants: rerun.flatMap((r) => r?.variants ?? []),
          cleanRoom: { status: 'ran', detail: `clean-room on the EVM feed: ${said(clean[0]!)}` },
          detail: [
            `EVAL-058–063 on the EVM adapter: ${rerun.map((r, i) => `${EVM_RERUN[i]} ${r?.status ?? 'missing'}`).join(', ')}`,
            `${anchors.anchored}/${fx.closure.length} closure entries anchored with txHash and blockNumber matching the chain (${where})`,
            ...anchors.problems.slice(0, 5),
          ].join('; '),
        });
        continue;
      }
      if (c.id === 'EVAL-066') {
        const pass = libVectors.ok && cleanVectors.ok && vectorDisagreements.length === 0;
        const cleanDetail = cleanVectors.ok ? `${cleanVectors.total}/${cleanVectors.total}` : `disagrees on ${cleanVectors.failed.join(', ')}`;
        const feedDetail =
          vectorDisagreements.length === 0
            ? `both verifiers accept docs/proof-feed.vectors.json and reject its ${proofVectors.tampers.length} tampers at the documented step`
            : `proof-feed vectors disagree: ${vectorDisagreements.join('; ')}`;
        results.push({
          ...base,
          status: pass ? 'passed' : 'failed',
          variants: [],
          cleanRoom: { status: 'ran', detail: `crypto vectors ${cleanDetail}` },
          detail: `Node half: library crypto vectors ${libVectors.detail}, clean-room ${cleanDetail}; ${feedDetail}; browser half is e2e/crypto-vectors.spec.ts (TC-006)`,
        });
        continue;
      }
      const variants: VariantResult[] = variantsOf(c).map((v) => {
        const s = byVariant.get(v)!;
        return { variant: v, expectedStep: s.expectedStep, lib: s.lib, cleanRoom: s.cleanRoom, stepMatches: s.stepMatches };
      });
      const pass = variants.length > 0 && variants.every((v) => v.lib.rejected && v.cleanRoom.rejected && v.stepMatches);
      const line = (side: 'lib' | 'cleanRoom') => variants.map((v) => `${v.variant}: ${v[side].step ?? 'ACCEPTED'}`).join('; ');
      results.push({ ...base, status: pass ? 'passed' : 'failed', variants, cleanRoom: { status: 'ran', detail: line('cleanRoom') }, detail: line('lib') });
    }
    return results;
  } finally {
    await fx.close();
  }
}

// `pnpm tsx evals/harness/suites/proof.ts` — the suite alone; `pnpm eval` runs it as harness-proof (run.ts).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.env.LOG_LEVEL ??= 'silent';
  const results = await runProofSuite();
  for (const r of results) console.log(`${r.status === 'passed' ? 'PASS' : 'FAIL'} ${r.id} ${r.title} — library: ${r.detail ?? ''} [clean-room: ${r.cleanRoom.detail}]`);
  process.exitCode = results.every((r) => r.status === 'passed') ? 0 : 1;
}
