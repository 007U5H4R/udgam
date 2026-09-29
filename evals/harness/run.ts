import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, CONFIG_HASH } from '../../src/lib/verification/config';
import { REGISTRY, type Check } from '../../src/lib/verification/registry';
import { CHECK_IDS, type CheckId, type VerifyResult } from '../../src/lib/verification/types';
import { verifyWith } from '../../src/lib/verification/verify';
import { assertCase, type CaseResult } from '../scorers/case-assertions';
import { criticalConditions, type FiredCondition } from '../scorers/critical-conditions';
import { detectionRate, type Detection } from '../scorers/detection-rate';
import { falsePositiveRate, type FalsePositives } from '../scorers/false-positive-rate';
import { HARNESS_SUITES, inScope, integrity, type Integrity } from '../scorers/harness-integrity';
import { rate, type Rate } from '../scorers/wilson';
import { fixtureFiles, generateDeviceKeys, loadHarnessInputs, type DeviceKeys, type HarnessInputs } from './context';
import { loadDataset, type EvalCase, type Suite } from './dataset';
import { mulberry32 } from './fixtures';
import { buildCase as realBuildCase, type BuiltCase } from './mutate';
import { provenance, REPO_ROOT, type Provenance } from './provenance';
import { renderReportFromResults } from './report';
import { REPORTS_DIR, RESULTS_DIR, reportPathFor, writeResults, type Out } from './results';

// The evaluation harness runner (technical-plan §13, §22 TSK-03.6; evaluation-plan §4.7, §12).
// `pnpm eval`: load + validate the dataset → for every harness case, in a seeded shuffled order,
// build (Submission, VerifyContext) → the REAL verify() → case-assertions → scorers → provenance →
// write the results file → render the report from that file. Offline: fetch is stubbed for the run.
// Every in-scope case appears in the results: a check the registry lacks → not_yet_implemented
// (a failure); a setup throw → errored; nothing is skipped (EVAL-092, CF-12).

export type ConfigMode = 'full' | 'ledger-only';
export type ProviderMode = 'fixture' | 'live';

export type Gate = {
  id: string;
  name: string;
  value: number | boolean | null;
  display: string;
  target: string;
  pass: boolean;
  detail: string;
};

export type Pair = { ids: [string, string]; cases: { id: string; caseClass: string | null; outcome: string; verdict: string | null; score: number | null; checks: Partial<Record<CheckId, string>> }[] };

export type Comparison = {
  previous: { file: string; timestampUtc: string } | null;
  regressions: string[];
  improvements: string[];
  baseline: { name: string; file: string; gates: { id: string; display: string }[] } | null;
};

export type ResultsFile = {
  schema: 'udgam-eval-results/1';
  provenance: Provenance;
  summary: { overall: 'PASS' | 'FAIL'; exitCode: 0 | 1; recommendation: string; blockers: string[] };
  totals: Integrity;
  gates: Gate[];
  categoryGates: Gate[];
  detection: Detection;
  falsePositives: FalsePositives;
  criticalConditions: FiredCondition[];
  knownLimitations: { id: string; scenario: number | null; outcome: string; verdict: string | null; behavior: string | null }[];
  pairs: Pair[];
  comparison: Comparison;
  cases: CaseResult[];
  runtime: { networkCalls: string[]; executionOrder: string[] };
};

export type RunOptions = {
  config?: ConfigMode;
  provider?: ProviderMode;
  suites?: Suite[];
  seed?: number;
  out?: Out;
  name?: string;
  reportName?: string;
  datasetPath?: string;
  /** Test hooks (TC-015): a registry with a check removed; a case builder that throws for one case. */
  registry?: readonly Check[];
  buildCase?: (c: EvalCase, inputs: HarnessInputs, keys: DeviceKeys) => Promise<BuiltCase>;
  resultsDir?: string;
  reportsDir?: string;
};

const LEDGER_ONLY: CheckId[] = ['signature_valid'];
const S1_POOLED_MIN = 0.95;
const S1_SCENARIO_MIN = 0.9;
const S2_MAX = 0.05;

// ── Suites ────────────────────────────────────────────────────────────────────────────────────────

type SuiteEnv = {
  inputs: HarnessInputs;
  keys: DeviceKeys;
  registry: readonly Check[];
  enabled: CheckId[];
  buildCase: NonNullable<RunOptions['buildCase']>;
};
export type SuiteRunner = (c: EvalCase, env: SuiteEnv) => Promise<Omit<CaseResult, keyof CaseMeta | 'durationMs'>>;
type CaseMeta = Pick<CaseResult, 'id' | 'suite' | 'datasetStatus' | 'caseClass' | 'scenario' | 'priority' | 'criticalConditions' | 'pair' | 'tags' | 'expected' | 'faultInjected'>;

function errorOf(e: unknown): { class: string; message: string } {
  return e instanceof Error ? { class: e.constructor.name, message: e.message } : { class: typeof e, message: String(e) };
}

/** Checks a case's assertions depend on; a legitimate case asserts that every check stays quiet. */
export function requiredChecks(c: EvalCase): CheckId[] {
  const e = c.expected;
  const ids = new Set<CheckId>([
    ...(Object.keys(e.check_status ?? {}) as CheckId[]),
    ...(e.catching_checks ?? []),
    ...(e.hard_fail_checks ?? []),
    ...(Object.keys(e.evidence_substrings ?? {}) as CheckId[]),
    ...(c.case_class === 'legitimate' ? CHECK_IDS : []),
  ]);
  return CHECK_IDS.filter((id) => ids.has(id));
}

/** A copy of `check` that throws `errorName` (EVAL-018 `check_throws`), for verify() to contain. */
function throwing(check: Check, errorName: string): Check {
  const Builtin = (globalThis as Record<string, unknown>)[errorName];
  const make = (): Error =>
    typeof Builtin === 'function' && (Builtin === Error || (Builtin as { prototype?: unknown }).prototype instanceof Error)
      ? new (Builtin as ErrorConstructor)('injected by check_throws')
      : new ({ [errorName]: class extends Error {} } as Record<string, ErrorConstructor>)[errorName]!('injected by check_throws');
  return {
    ...check,
    async run() {
      throw make();
    },
  };
}

const verifierSuite: SuiteRunner = async (c, env) => {
  const have = new Set(env.registry.map((x) => x.id));
  const missingChecks = requiredChecks(c).filter((id) => env.enabled.includes(id) && !have.has(id));
  let built: BuiltCase;
  try {
    built = await env.buildCase(c, env.inputs, env.keys);
  } catch (e) {
    return { outcome: 'errored', missingChecks, result: null, assertions: [], detected: null, error: errorOf(e), notes: [] };
  }
  const t = built.throwCheck;
  const registry = t ? env.registry.map((x) => (x.id === t.check ? throwing(x, t.error) : x)) : env.registry;
  let result: VerifyResult;
  try {
    result = await verifyWith(registry, built.submission, built.context, { enabled: env.enabled }, CONFIG);
  } catch (e) {
    return { outcome: 'errored', missingChecks, result: null, assertions: [], detected: null, error: errorOf(e), notes: built.notes };
  }
  const a = assertCase(c, result);
  const outcome = missingChecks.length > 0 ? 'not_yet_implemented' : a.pass ? 'passed' : 'failed';
  const notes = [...built.notes, ...(missingChecks.length > 0 ? [`needs ${missingChecks.join(', ')}, not in the registry yet`] : [])];
  return { outcome, missingChecks, result, assertions: a.assertions, detected: c.case_class === 'attack' ? (a.detected ?? false) : null, error: null, notes };
};

const notBuilt =
  (why: string): SuiteRunner =>
  async () => ({ outcome: 'not_yet_implemented', missingChecks: [], result: null, assertions: [], detected: null, error: null, notes: [why] });

/** Suite runners by name. TKT-18 replaces harness-proof with the real proof suite. */
export const SUITES: Record<'harness-verifier' | 'harness-proof', SuiteRunner> = {
  'harness-verifier': verifierSuite,
  'harness-proof': notBuilt('the harness-proof suite is registered but not built yet (TKT-15/TKT-18)'),
};

function metaOf(c: EvalCase): CaseMeta {
  return {
    id: c.id,
    suite: c.suite,
    datasetStatus: c.status,
    caseClass: c.case_class ?? null,
    scenario: c.scenario ?? null,
    priority: c.priority,
    criticalConditions: c.critical_conditions ?? [],
    pair: c.pair ?? null,
    tags: c.tags ?? [],
    expected: c.expected,
    faultInjected: (c.input.mutations ?? []).some((m) => m.op === 'provider_fault' || m.op === 'check_throws'),
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────────────────────────

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);
const rateDisplay = (r: Rate) => `${pct(r.rate)} (${r.k}/${r.n})`;

function gatesOf(results: CaseResult[], suites: Suite[], detection: Detection, fp: FalsePositives, integ: Integrity, cfs: FiredCondition[]): Gate[] {
  const verifier = suites.includes('harness-verifier');
  const proof = suites.includes('harness-proof');
  const notRun = (id: string, name: string, target: string): Gate => ({ id, name, value: null, display: 'not run', target, pass: false, detail: 'suite not selected' });

  const scen = (['1', '2', '3', '4'] as const).map((s) => detection.perScenario[s]);
  const floor = scen.some((r) => r.rate === null) ? null : Math.min(...scen.map((r) => r.rate!));
  const proofCases = results.filter((r) => r.suite === 'harness-proof' && r.datasetStatus === 'active');
  const proofRate = rate(proofCases.filter((r) => r.outcome === 'passed').length, proofCases.length);

  return [
    verifier
      ? {
          id: 'S1',
          name: 'Detection, scenarios 1–4 (pooled)',
          value: detection.pooled.rate,
          display: rateDisplay(detection.pooled),
          target: `≥ ${pct(S1_POOLED_MIN)}`,
          pass: detection.pooled.rate !== null && detection.pooled.rate >= S1_POOLED_MIN,
          detail: `${detection.undetected.length} undetected`,
        }
      : notRun('S1', 'Detection, scenarios 1–4 (pooled)', `≥ ${pct(S1_POOLED_MIN)}`),
    verifier
      ? {
          id: 'S1-floor',
          name: 'Detection, lowest scenario (EV5)',
          value: floor,
          display: pct(floor),
          target: `≥ ${pct(S1_SCENARIO_MIN)} each`,
          pass: floor !== null && floor >= S1_SCENARIO_MIN,
          detail: scen.map((r, i) => `scenario ${i + 1}: ${rateDisplay(r)}`).join('; '),
        }
      : notRun('S1-floor', 'Detection, lowest scenario (EV5)', `≥ ${pct(S1_SCENARIO_MIN)} each`),
    verifier
      ? {
          id: 'S2',
          name: 'False positives, legitimate set',
          value: fp.rate,
          display: rateDisplay(fp),
          target: `≤ ${pct(S2_MAX)}`,
          pass: fp.rate !== null && fp.rate <= S2_MAX,
          detail: fp.fps.map((x) => x.id).join(', ') || 'none',
        }
      : notRun('S2', 'False positives, legitimate set', `≤ ${pct(S2_MAX)}`),
    proof
      ? {
          id: 'S6-lib',
          name: 'Proof suite (library side)',
          value: proofRate.rate,
          display: rateDisplay(proofRate),
          target: '100.0 %',
          pass: proofRate.rate === 1,
          detail: `${proofCases.filter((r) => r.outcome === 'not_yet_implemented').length} not yet implemented`,
        }
      : notRun('S6-lib', 'Proof suite (library side)', '100.0 %'),
    {
      id: 'S7',
      name: 'Harness integrity (one command, nothing skipped)',
      value: integ.ok,
      display: integ.ok ? 'Yes' : 'No',
      target: 'Yes',
      pass: integ.ok,
      detail: integ.problems.join('; ') || `${integ.active} cases, ${integ.skipped} skipped`,
    },
    {
      id: 'CF',
      name: 'Critical failures',
      value: cfs.length,
      display: String(cfs.length),
      target: '0',
      pass: cfs.length === 0,
      detail: cfs.map((f) => f.id).join(', ') || 'none',
    },
  ];
}

function categoryGatesOf(results: CaseResult[]): Gate[] {
  const critical = results.filter((r) => r.suite === 'harness-verifier' && r.datasetStatus === 'active' && r.priority === 'critical' && r.caseClass !== 'attack' && r.caseClass !== 'known_limitation');
  const f = rate(critical.filter((r) => r.outcome === 'passed').length, critical.length);
  const reliability = results.filter((r) => ['EVAL-015', 'EVAL-016', 'EVAL-017', 'EVAL-018'].includes(r.id));
  const rel = rate(reliability.filter((r) => r.outcome === 'passed').length, reliability.length);
  return [
    { id: 'Functional', name: 'Critical non-attack cases pass every assertion', value: f.rate, display: rateDisplay(f), target: '100.0 %', pass: f.rate === 1, detail: 'evaluation-plan §6' },
    { id: 'Reliability', name: 'EVAL-015 to EVAL-018 (harness part)', value: rel.rate, display: rateDisplay(rel), target: '100.0 %', pass: rel.rate === 1, detail: 'evaluation-plan §6' },
  ];
}

function pairsOf(results: CaseResult[]): Pair[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const r of results) {
    if (!r.pair || !byId.has(r.pair)) continue;
    const ids = [r.id, r.pair].sort() as [string, string];
    const key = ids.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      ids,
      cases: ids.map((id) => {
        const x = byId.get(id)!;
        return {
          id,
          caseClass: x.caseClass,
          outcome: x.outcome,
          verdict: x.result?.verdict ?? null,
          score: x.result?.score ?? null,
          checks: Object.fromEntries((x.result?.checks ?? []).map((ch) => [ch.id, ch.status])),
        };
      }),
    });
  }
  return pairs.sort((a, b) => a.ids[0].localeCompare(b.ids[0]));
}

function readJson(path: string): ResultsFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
  } catch {
    return null;
  }
}

function comparisonOf(results: CaseResult[], resultsDir: string): Comparison {
  const formal = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => /^eval-run-.*\.json$/.test(f)) : [];
  let previous: { file: string; data: ResultsFile } | null = null;
  for (const f of formal) {
    const data = readJson(join(resultsDir, f));
    if (!data?.provenance?.timestampUtc) continue;
    if (!previous || data.provenance.timestampUtc > previous.data.provenance.timestampUtc) previous = { file: f, data };
  }
  const regressions: string[] = [];
  const improvements: string[] = [];
  if (previous) {
    const before = new Map(previous.data.cases.map((c) => [c.id, c.outcome]));
    for (const r of results) {
      const was = before.get(r.id);
      if (was === 'passed' && r.outcome !== 'passed') regressions.push(r.id);
      if (was !== undefined && was !== 'passed' && r.outcome === 'passed') improvements.push(r.id);
    }
  }
  let baseline: Comparison['baseline'] = null;
  for (const [name, file] of [
    ['baseline-v1', 'baseline-v1.json'],
    ['baseline-v0 (ledger only)', 'baseline-v0-ledger-only.json'],
  ] as const) {
    const data = readJson(join(resultsDir, file));
    if (data?.gates) {
      baseline = { name, file, gates: data.gates.map((g) => ({ id: g.id, display: g.display })) };
      break;
    }
  }
  return {
    previous: previous ? { file: previous.file, timestampUtc: previous.data.provenance.timestampUtc } : null,
    regressions: regressions.sort(),
    improvements: improvements.sort(),
    baseline,
  };
}

function configDriftOf(resultsDir: string) {
  const v1 = readJson(join(resultsDir, 'baseline-v1.json'));
  if (!v1?.provenance?.config?.hash) return undefined;
  let decisions = '';
  try {
    decisions = readFileSync(join(REPO_ROOT, 'decisions.md'), 'utf8');
  } catch {
    // no decisions file: nothing authorises a drift
  }
  return { baselineHash: v1.provenance.config.hash, currentHash: CONFIG_HASH, authorised: decisions.includes(CONFIG_HASH) };
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Run the harness and return the results object (no files written). */
export async function evaluate(opts: RunOptions = {}): Promise<ResultsFile> {
  const startedAt = new Date();
  const t0 = performance.now();
  const mode = opts.config ?? 'full';
  const provider = opts.provider ?? 'fixture';
  if (provider !== 'fixture') throw new Error('--provider=live arrives with TKT-07 (TSK-07.7); pnpm eval runs on the fixture provider');
  const suites = opts.suites ?? [...HARNESS_SUITES];
  const seed = opts.seed ?? Date.now() % 2 ** 31;
  const registry = opts.registry ?? REGISTRY;
  const enabled = mode === 'ledger-only' ? LEDGER_ONLY : [...CHECK_IDS];

  const dataset = loadDataset(opts.datasetPath);
  const inputs = loadHarnessInputs(dataset);
  const keys = await generateDeviceKeys(dataset);
  const env: SuiteEnv = { inputs, keys, registry, enabled, buildCase: opts.buildCase ?? realBuildCase };

  // Offline by construction (S7, EVAL-091): any fetch during the run is refused and recorded.
  const networkCalls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    networkCalls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    throw new Error('network access is disabled during pnpm eval');
  }) as typeof fetch;

  const order = shuffled(
    dataset.cases.filter((c) => inScope(c, suites)),
    seed,
  );
  const cases: CaseResult[] = [];
  try {
    for (const c of order) {
      const started = performance.now();
      const run = SUITES[c.suite as keyof typeof SUITES];
      const body = run
        ? await run(c, env)
        : { outcome: 'errored' as const, missingChecks: [], result: null, assertions: [], detected: null, error: { class: 'Error', message: `no runner for suite ${c.suite}` }, notes: [] };
      cases.push({ ...metaOf(c), ...body, durationMs: Math.round((performance.now() - started) * 100) / 100 });
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));

  const resultsDir = opts.resultsDir ?? RESULTS_DIR;
  const integ = integrity(dataset, cases, { suites });
  if (networkCalls.length > 0) {
    integ.ok = false;
    integ.problems.push(`${networkCalls.length} network call(s) attempted during the run`);
  }
  const detection = detectionRate(cases);
  const fp = falsePositiveRate(cases);
  const cfs = criticalConditions(cases, { integrity: integ, configDrift: configDriftOf(resultsDir) }).fired;
  const gates = gatesOf(cases, suites, detection, fp, integ, cfs);
  const pass = gates.every((g) => g.pass);
  const blockers = [...gates.filter((g) => !g.pass).map((g) => `${g.id} ${g.name}: ${g.display} (target ${g.target})`), ...cfs.map((f) => `${f.id}: ${f.reason}`)];
  const nyi = integ.notYetImplemented;

  const prov = provenance({
    dataset,
    fixtureFiles: fixtureFiles(dataset),
    mode,
    enabledChecks: enabled,
    registryChecks: registry.map((c) => c.id),
    provider,
    suites,
    seed,
    startedAt,
    durationMs: Math.round(performance.now() - t0),
  });

  return {
    schema: 'udgam-eval-results/1',
    provenance: prov,
    summary: {
      overall: pass ? 'PASS' : 'FAIL',
      exitCode: pass ? 0 : 1,
      recommendation: pass
        ? 'Every gate the harness owns passes and no critical condition fired.'
        : `Do not release: ${blockers.length} blocker(s)${nyi > 0 ? `; ${nyi} case(s) wait on checks or suites not built yet` : ''}.`,
      blockers,
    },
    totals: integ,
    gates,
    categoryGates: categoryGatesOf(cases),
    detection,
    falsePositives: fp,
    criticalConditions: cfs,
    knownLimitations: cases
      .filter((r) => r.caseClass === 'known_limitation')
      .map((r) => ({ id: r.id, scenario: r.scenario, outcome: r.outcome, verdict: r.result?.verdict ?? null, behavior: r.expected.behavior ?? null })),
    pairs: pairsOf(cases),
    comparison: comparisonOf(cases, resultsDir),
    cases,
    runtime: { networkCalls, executionOrder: order.map((c) => c.id) },
  };
}

/** Run, write the versioned results file, render its report from that file, and return the paths. */
export async function runHarness(opts: RunOptions = {}): Promise<{ results: ResultsFile; resultsPath: string; reportPath: string; exitCode: 0 | 1 }> {
  const results = await evaluate(opts);
  const out = opts.out ?? 'local';
  const resultsPath = writeResults(results, { out, dir: opts.resultsDir ?? RESULTS_DIR, name: opts.name });
  const reportPath = reportPathFor(resultsPath, { out, reportsDir: opts.reportsDir ?? REPORTS_DIR, reportName: opts.reportName });
  mkdirSync(dirname(reportPath), { recursive: true });
  const fromDisk = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile;
  writeFileSync(reportPath, renderReportFromResults(fromDisk, resultsPath));
  return { results, resultsPath, reportPath, exitCode: results.summary.exitCode };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): Required<Pick<RunOptions, 'config' | 'provider' | 'suites' | 'out'>> & Pick<RunOptions, 'seed' | 'name' | 'reportName'> {
  const o = { config: 'full' as ConfigMode, provider: 'fixture' as ProviderMode, suites: [...HARNESS_SUITES] as Suite[], out: 'local' as Out } as ReturnType<typeof parseArgs>;
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    const [flag, value] = m ? [m[1], m[2]!] : [arg, ''];
    switch (flag) {
      case 'config':
        if (value !== 'full' && value !== 'ledger-only') throw new Error(`--config must be full or ledger-only, got ${value}`);
        o.config = value;
        break;
      case 'provider':
        if (value !== 'fixture' && value !== 'live') throw new Error(`--provider must be fixture or live, got ${value}`);
        o.provider = value;
        break;
      case 'suite': {
        const list = value.split(',').filter(Boolean);
        const bad = list.filter((s) => !(HARNESS_SUITES as readonly string[]).includes(s));
        if (list.length === 0 || bad.length > 0) throw new Error(`--suite takes ${HARNESS_SUITES.join(',')}; got ${value}`);
        o.suites = list as Suite[];
        break;
      }
      case 'seed':
        if (!/^\d+$/.test(value)) throw new Error(`--seed must be a non-negative integer, got ${value}`);
        o.seed = Number(value);
        break;
      case 'out':
        if (value !== 'local' && value !== 'formal') throw new Error(`--out must be local or formal, got ${value}`);
        o.out = value;
        break;
      case 'name':
        o.name = value;
        break;
      case 'report-name':
        o.reportName = value;
        break;
      default:
        throw new Error(`unknown flag ${arg}`);
    }
  }
  return o;
}

function summaryLines(r: ResultsFile, resultsPath: string, reportPath: string): string[] {
  const t = r.totals;
  return [
    `pnpm eval — ${r.summary.overall} (config ${r.provenance.config.mode}, seed ${r.provenance.seed}, ${r.provenance.durationMs} ms)`,
    `cases: ${t.active} active · ${t.passed} passed · ${t.failed} failed (${t.notYetImplemented} not yet implemented) · ${t.errored} errored · ${t.skipped} skipped`,
    ...r.gates.map((g) => `  ${g.pass ? 'PASS' : 'FAIL'}  ${g.id.padEnd(8)} ${g.display} (target ${g.target})`),
    ...(r.criticalConditions.length > 0 ? [`critical conditions: ${r.criticalConditions.map((f) => `${f.id} [${f.caseIds.join(', ')}]`).join('; ')}`] : []),
    `results: ${relative(process.cwd(), resultsPath)}`,
    `report:  ${relative(process.cwd(), reportPath)}`,
  ];
}

async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  if (args.provider === 'live') {
    console.error('--provider=live arrives with TKT-07 (TSK-07.7); pnpm eval runs on the fixture provider.');
    return 2;
  }
  const r = await runHarness(args);
  for (const line of summaryLines(r.results, r.resultsPath, r.reportPath)) console.log(line);
  return r.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
      process.exitCode = 1;
    },
  );
}
