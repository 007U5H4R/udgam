import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, CONFIG_HASH } from '../../src/lib/verification/config';
import { REGISTRY, type Check } from '../../src/lib/verification/registry';
import { CHECK_IDS, type CheckId, type VerifyResult } from '../../src/lib/verification/types';
import { verifyWith } from '../../src/lib/verification/verify';
import { assertCase, type CaseResult } from '../scorers/case-assertions';
import { criticalConditions, type FiredCondition, type RunFacts } from '../scorers/critical-conditions';
import { detectionRate, type Detection } from '../scorers/detection-rate';
import { falsePositiveRate, type FalsePositives } from '../scorers/false-positive-rate';
import { HARNESS_SUITES, inScope, integrity, type Integrity } from '../scorers/harness-integrity';
import { rate, type Rate } from '../scorers/wilson';
import { fixtureFiles, generateDeviceKeys, loadHarnessInputs, type DeviceKeys, type HarnessInputs } from './context';
import { loadDataset, type EvalCase, type Suite } from './dataset';
import { mulberry32 } from './fixtures';
import { liveAgreement, missingLiveVars, renderAgreement } from './live-agreement';
import { buildCase as realBuildCase, type BuiltCase } from './mutate';
import { runProofSuite, type ProofCaseResult, type ProofSuiteOptions } from './suites/proof';
import { gitFacts, provenance, REPO_ROOT, type Provenance } from './provenance';
import { renderReportFromResults } from './report';
import { isFileStem, REPORTS_DIR, RESULTS_DIR, reportPathFor, writeReport, writeResults, type Out } from './results';

// The evaluation harness runner (technical-plan §13, §22 TSK-03.6; evaluation-plan §4.7, §12).
// `pnpm eval`: load + validate the dataset → for every harness case, in a seeded shuffled order,
// build (Submission, VerifyContext) → the REAL verify() → case-assertions → scorers → provenance →
// write the results file → render the report from that file. Offline: fetch is stubbed for the run.
// Every in-scope case appears in the results: a check the registry lacks → not_yet_implemented
// (a failure); a setup throw → errored; a case that does not settle within its limit (30 s, or the
// case's own max_latency_ms) → errored with a timeout; nothing is skipped (EVAL-092, CF-12).
// Earlier results files fail closed: a baseline or formal run that exists but cannot be read, parsed
// or lacks its config hash is an integrity problem (S7, CF-12), and for baseline-v1 also CF-13.
// Files are never overwritten: results and reports take the next free -rN.
//
// Exit codes: 0 = every gate passes; 1 = the run completed and a gate failed or a critical condition
// fired; 2 = bad usage (an invalid flag) or a harness crash (the run did not complete).
// `--provider=live` (TSK-07.7) runs no gate: it compares live GFW / Sentinel Hub answers for P01–P10
// with the fixtures in an agreement report (live-agreement.ts; `--record` saves the answers). It needs
// GFW_API_KEY, CDSE_CLIENT_ID and CDSE_CLIENT_SECRET and exits 2 naming the missing ones; never in CI.

export type ConfigMode = 'full' | 'ledger-only';
export type ProviderMode = 'fixture' | 'live';

/**
 * Milestone scoping (EXE, carry-forward TKT-18): `--milestone=M1` scopes the gates to cases of
 * milestones up to and including M1. M1 is the default only until M-002 starts: when it does
 * (TSK-24.x), the default MUST move to M2 (DEFAULT_MILESTONE below). Cases of a later milestone are still
 * built and run where possible and appear in `cases`, but are REPORTED in a separate "Out of milestone
 * scope" section, never pooled into that milestone's gates or critical conditions, and never dropped
 * (CF-12, EVAL-092).
 */
export const MILESTONES = ['M1', 'M2', 'M3'] as const;
export type Milestone = (typeof MILESTONES)[number];
/** The default scope. Move to 'M2' when M-002 starts, or M2 cases stay out of every gate. */
export const DEFAULT_MILESTONE: Milestone = 'M1';
/** Whether a case counts in the gates. Fails closed: an unknown or missing milestone is in scope. */
export const inMilestone = (caseMilestone: string | undefined, scope: Milestone): boolean => {
  const rank = MILESTONES.indexOf(caseMilestone as Milestone);
  return rank === -1 || rank <= MILESTONES.indexOf(scope);
};

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
  /** The run's milestone scope; out-of-scope cases are in `cases` but outside every gate (absent in older files). */
  scope?: { milestone: Milestone; outOfScope: { id: string; suite: string; milestone: string; outcome: string; notes: string[] }[] };
  cases: CaseResult[];
  runtime: { networkCalls: string[]; executionOrder: string[] };
};

export type RunOptions = {
  config?: ConfigMode;
  provider?: ProviderMode;
  suites?: Suite[];
  seed?: number;
  /** Gates cover cases of milestones up to this one (default M1). */
  milestone?: Milestone;
  out?: Out;
  name?: string;
  reportName?: string;
  datasetPath?: string;
  /** Test hooks (TC-015): a registry with a check removed; a case builder that throws for one case. */
  registry?: readonly Check[];
  buildCase?: (c: EvalCase, inputs: HarnessInputs, keys: DeviceKeys) => Promise<BuiltCase>;
  resultsDir?: string;
  reportsDir?: string;
  /** Per-case watchdog when the case sets no max_latency_ms of its own (default CASE_TIMEOUT_MS). */
  caseTimeoutMs?: number;
  /** The harness-proof suite (default runProofSuite, TKT-15); run at most once per evaluate(). */
  proofSuite?: (o: ProofSuiteOptions) => Promise<ProofCaseResult[]>;
};

/** A case that has not settled after this long is recorded as errored (reason: timeout). */
export const CASE_TIMEOUT_MS = 30_000;

/** The case's own limit (expected.max_latency_ms) if it has one, else `fallback`. */
export function caseLimitMs(c: EvalCase, fallback: number = CASE_TIMEOUT_MS): number {
  return c.expected.max_latency_ms ?? fallback;
}

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
  /** The proof suite's results, computed on first use and shared by every harness-proof case. */
  proofResults: () => Promise<ProofCaseResult[]>;
};
export type SuiteRunner = (c: EvalCase, env: SuiteEnv) => Promise<Omit<CaseResult, keyof CaseMeta | 'durationMs'>>;
type CaseMeta = Pick<CaseResult, 'id' | 'suite' | 'datasetStatus' | 'caseClass' | 'scenario' | 'priority' | 'criticalConditions' | 'pair' | 'tags' | 'expected' | 'milestone' | 'inMilestoneScope' | 'faultInjected'>;

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

type SuiteBody = Awaited<ReturnType<SuiteRunner>>;

/** Run one case under a watchdog: if it does not settle within `ms`, it is errored with a timeout. */
async function withWatchdog(body: Promise<SuiteBody>, ms: number): Promise<SuiteBody> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<SuiteBody>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          outcome: 'errored',
          missingChecks: [],
          result: null,
          assertions: [],
          detected: null,
          error: { class: 'CaseTimeout', message: `timeout: the case did not settle within ${ms} ms` },
          notes: [],
        }),
      ms,
    );
  });
  try {
    return await Promise.race([body, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

const notBuilt = (why: string): SuiteBody => ({ outcome: 'not_yet_implemented', missingChecks: [], result: null, assertions: [], detected: null, error: null, notes: [why] });

/** harness-proof cases whose runner arrives with a later ticket: reported as not_yet_implemented, never dropped. */
const PROOF_LATER: Record<string, string> = {
  'EVAL-103': 'EVM anchoring (M-002) arrives with TKT-23 (TSK-24.8); the harness-proof suite does not run it yet',
};

/** One proof case's assertions: EVAL-058 coverage by both verifiers, each tamper variant's step by both, EVAL-066's vectors. */
function proofAssertions(r: ProofCaseResult): CaseResult['assertions'] {
  if (r.metrics) {
    const m = r.metrics;
    return [
      { name: 'both verifiers accept the intact feed', pass: r.status === 'passed', detail: r.detail ?? '' },
      { name: 'library closure coverage = 100 %', pass: m.coverage === 1, detail: `${m.verified}/${m.closureEntries} closure entries verified under ${m.checkpoints} checkpoints` },
      { name: 'clean-room closure coverage = 100 %', pass: m.cleanRoomCoverage === 1, detail: `${m.cleanRoomVerified}/${m.closureEntries} closure entries verified` },
    ];
  }
  if (r.variants.length > 0) {
    return r.variants.map((v) => ({
      name: `${v.variant} rejected at ${v.expectedStep} by both verifiers`,
      pass: v.lib.rejected && v.cleanRoom.rejected && v.stepMatches,
      detail: `library: ${v.lib.rejected ? `rejected at ${v.lib.step}` : 'ACCEPTED'}; clean-room: ${v.cleanRoom.rejected ? `rejected at ${v.cleanRoom.step}` : 'ACCEPTED'}`,
    }));
  }
  return [{ name: r.title, pass: r.status === 'passed', detail: r.detail ?? '' }];
}

/**
 * harness-proof (TSK-15.8, TSK-18.6, evaluation-plan §4.6 S6-lib): runProofSuite runs once per
 * evaluate() in a temporary ledger with a throwaway key (never ./data), and each case reads its own
 * result. A case passes only when the library verifier and the clean-room checker both agree with the
 * documented step (both columns are kept in `proof`).
 */
const proofSuite: SuiteRunner = async (c, env) => {
  const later = PROOF_LATER[c.id];
  if (later) return notBuilt(later);
  let results: ProofCaseResult[];
  try {
    results = await env.proofResults();
  } catch (e) {
    return { outcome: 'errored', missingChecks: [], result: null, assertions: [], detected: null, error: errorOf(e), notes: ['the harness-proof suite failed before it produced results'] };
  }
  const r = results.find((x) => x.id === c.id);
  if (!r) return notBuilt(`${c.id} has no harness-proof runner yet`);
  return {
    outcome: r.status === 'passed' ? 'passed' : 'failed',
    missingChecks: [],
    result: null,
    assertions: proofAssertions(r),
    detected: null,
    error: null,
    notes: [...(r.detail ? [`library: ${r.detail}`] : []), `clean-room checker: ${r.cleanRoom.detail}`],
    proof: { metrics: r.metrics ?? null, variants: r.variants, cleanRoom: r.cleanRoom, ...(r.score ? { score: r.score } : {}) },
  };
};

/** Suite runners by name. */
export const SUITES: Record<'harness-verifier' | 'harness-proof', SuiteRunner> = {
  'harness-verifier': verifierSuite,
  'harness-proof': proofSuite,
};

function metaOf(c: EvalCase, milestone: Milestone): CaseMeta {
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
    milestone: c.milestone,
    inMilestoneScope: inMilestone(c.milestone, milestone),
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
  const score = proofCases.find((r) => r.proof?.score)?.proof?.score;
  const both = (x: { lib: number; cleanRoom: number }) => `library ${pct(x.lib)}, clean-room ${pct(x.cleanRoom)}`;
  const proofDetail = [
    ...(score ? [`coverage ${both(score.coverage)}`, `tampers rejected ${both(score.tamperRejected)} (${score.perVariant.length} variants)`] : []),
    `${proofCases.filter((r) => r.outcome === 'not_yet_implemented').length} not yet implemented`,
  ].join('; ');

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
          detail: proofDetail,
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
  // Named by ID on purpose: the dataset's `reliability` category also holds EVAL-067–069, which are
  // integration-suite cases the harness does not run; evaluation-plan §6 names these four as its part.
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

type Read = { state: 'absent' } | { state: 'ok'; data: ResultsFile } | { state: 'bad'; problem: string };

/**
 * Read an earlier results file. Only a missing file is "absent". A file that exists but cannot be read,
 * is not JSON, or lacks `provenance.config.hash` (or the fields `need` names) is `bad`: the caller
 * must surface it, never treat it as absent (fail closed).
 */
function readResultsFile(path: string, need: ('timestampUtc' | 'cases' | 'gates')[]): Read {
  const rel = relative(REPO_ROOT, path);
  const file = rel.startsWith('..') ? path : rel;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { state: 'absent' };
    return { state: 'bad', problem: `results file ${file} exists but cannot be read (${code ?? errorOf(e).message})` };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { state: 'bad', problem: `results file ${file} is not valid JSON (${errorOf(e).message})` };
  }
  const r = (data ?? {}) as { provenance?: { timestampUtc?: unknown; config?: { hash?: unknown } }; cases?: unknown; gates?: unknown };
  const missing = [
    typeof r.provenance?.config?.hash === 'string' ? null : 'provenance.config.hash',
    need.includes('timestampUtc') && typeof r.provenance?.timestampUtc !== 'string' ? 'provenance.timestampUtc' : null,
    need.includes('cases') && !Array.isArray(r.cases) ? 'cases' : null,
    need.includes('gates') && !Array.isArray(r.gates) ? 'gates' : null,
  ].filter((x): x is string => x !== null);
  if (missing.length > 0) return { state: 'bad', problem: `results file ${file} lacks ${missing.join(', ')}` };
  return { state: 'ok', data: data as ResultsFile };
}

/** Whether decisions.md names `hash` (an EV/TP decision authorising a config change). Unreadable → no. */
function decisionsName(hash: string): boolean {
  try {
    return readFileSync(join(REPO_ROOT, 'decisions.md'), 'utf8').includes(hash);
  } catch {
    return false; // no decisions file: nothing authorises a drift (fails closed)
  }
}

type PriorRuns = { comparison: Comparison; configDrift: RunFacts['configDrift']; problems: string[] };

/** Compare with the latest formal run and the newest baseline, and check config drift against baseline-v1. */
function priorRunsOf(results: CaseResult[], resultsDir: string): PriorRuns {
  const problems: string[] = [];
  const formal = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => /^eval-run-.*\.json$/.test(f)) : [];
  let previous: { file: string; data: ResultsFile } | null = null;
  for (const f of formal.sort()) {
    const read = readResultsFile(join(resultsDir, f), ['timestampUtc', 'cases']);
    if (read.state === 'bad') problems.push(read.problem);
    if (read.state !== 'ok') continue;
    if (!previous || read.data.provenance.timestampUtc > previous.data.provenance.timestampUtc) previous = { file: f, data: read.data };
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

  // baseline-v1 freezes cfg-1 (EV13): CF-13 fires on an unauthorised drift, or when it cannot be checked.
  const v1 = readResultsFile(join(resultsDir, 'baseline-v1.json'), ['gates']);
  let configDrift: RunFacts['configDrift'];
  if (v1.state === 'bad') {
    problems.push(v1.problem);
    configDrift = { error: v1.problem };
  } else if (v1.state === 'ok') {
    configDrift = { baselineHash: v1.data.provenance.config.hash, currentHash: CONFIG_HASH, authorised: decisionsName(CONFIG_HASH) };
  }

  // The newest baseline that exists is the comparison point; an unreadable one is a problem, never a
  // silent fall-back to an older baseline.
  let baseline: Comparison['baseline'] = null;
  for (const [name, file] of [
    ['baseline-v1', 'baseline-v1.json'],
    ['baseline-v0 (ledger only)', 'baseline-v0-ledger-only.json'],
  ] as const) {
    const read = file === 'baseline-v1.json' ? v1 : readResultsFile(join(resultsDir, file), ['gates']);
    if (read.state === 'absent') continue;
    if (read.state === 'ok') baseline = { name, file, gates: read.data.gates.map((g) => ({ id: g.id, display: g.display })) };
    else if (file !== 'baseline-v1.json') problems.push(read.problem); // v1's problem is already recorded
    break;
  }
  return {
    comparison: {
      previous: previous ? { file: previous.file, timestampUtc: previous.data.provenance.timestampUtc } : null,
      regressions: regressions.sort(),
      improvements: improvements.sort(),
      baseline,
    },
    configDrift,
    problems,
  };
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
  const milestone = opts.milestone ?? DEFAULT_MILESTONE;
  const seed = opts.seed ?? Date.now() % 2 ** 31;
  const registry = opts.registry ?? REGISTRY;
  const enabled = mode === 'ledger-only' ? LEDGER_ONLY : [...CHECK_IDS];

  const dataset = loadDataset(opts.datasetPath);
  const inputs = loadHarnessInputs(dataset);
  const keys = await generateDeviceKeys(dataset);
  const runProof = opts.proofSuite ?? runProofSuite;
  let proofRun: Promise<ProofCaseResult[]> | undefined;
  const proofResults = () => (proofRun ??= runProof({ datasetPath: opts.datasetPath }));
  const env: SuiteEnv = { inputs, keys, registry, enabled, buildCase: opts.buildCase ?? realBuildCase, proofResults };

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
        ? await withWatchdog(run(c, env), caseLimitMs(c, opts.caseTimeoutMs))
        : { outcome: 'errored' as const, missingChecks: [], result: null, assertions: [], detected: null, error: { class: 'Error', message: `no runner for suite ${c.suite}` }, notes: [] };
      cases.push({ ...metaOf(c, milestone), ...body, durationMs: Math.round((performance.now() - started) * 100) / 100 });
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
  const prior = priorRunsOf(cases, resultsDir);
  if (prior.problems.length > 0) {
    integ.ok = false;
    integ.problems.push(...prior.problems);
  }
  // Gates and critical conditions see only the cases inside the milestone scope; the rest are reported.
  const scoped = cases.filter((c) => c.inMilestoneScope);
  const outOfScope = cases.filter((c) => !c.inMilestoneScope);
  const detection = detectionRate(scoped);
  const fp = falsePositiveRate(scoped);
  const cfs = criticalConditions(scoped, { integrity: integ, configDrift: prior.configDrift }).fired;
  const gates = gatesOf(scoped, suites, detection, fp, integ, cfs);
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
    categoryGates: categoryGatesOf(scoped),
    detection,
    falsePositives: fp,
    criticalConditions: cfs,
    knownLimitations: scoped
      .filter((r) => r.caseClass === 'known_limitation')
      .map((r) => ({ id: r.id, scenario: r.scenario, outcome: r.outcome, verdict: r.result?.verdict ?? null, behavior: r.expected.behavior ?? null })),
    pairs: pairsOf(cases),
    comparison: prior.comparison,
    scope: { milestone, outOfScope: outOfScope.map((c) => ({ id: c.id, suite: c.suite, milestone: c.milestone ?? '—', outcome: c.outcome, notes: c.notes })) },
    cases,
    runtime: { networkCalls, executionOrder: order.map((c) => c.id) },
  };
}

/** Run, write the versioned results file, render its report from that file, and return the paths. */
export async function runHarness(opts: RunOptions = {}): Promise<{ results: ResultsFile; resultsPath: string; reportPath: string; exitCode: 0 | 1 }> {
  const results = await evaluate(opts);
  const out = opts.out ?? 'local';
  const resultsPath = writeResults(results, { out, dir: opts.resultsDir ?? RESULTS_DIR, name: opts.name });
  const wanted = reportPathFor(resultsPath, { out, reportsDir: opts.reportsDir ?? REPORTS_DIR, reportName: opts.reportName });
  const fromDisk = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile;
  const reportPath = writeReport(wanted, renderReportFromResults(fromDisk, resultsPath));
  return { results, resultsPath, reportPath, exitCode: results.summary.exitCode };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(
  argv: string[],
): Required<Pick<RunOptions, 'config' | 'provider' | 'suites' | 'out' | 'milestone'>> & Pick<RunOptions, 'seed' | 'name' | 'reportName'> & { record: boolean } {
  const o = { config: 'full' as ConfigMode, provider: 'fixture' as ProviderMode, suites: [...HARNESS_SUITES] as Suite[], out: 'local' as Out, milestone: DEFAULT_MILESTONE, record: false } as ReturnType<typeof parseArgs>;
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    const [flag, value] = m ? [m[1], m[2]!] : arg === '--record' ? ['record', ''] : [arg, ''];
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
      case 'milestone':
        if (!(MILESTONES as readonly string[]).includes(value)) throw new Error(`--milestone must be ${MILESTONES.join(', ')}; got ${value}`);
        o.milestone = value as Milestone;
        break;
      case 'seed':
        if (!/^\d+$/.test(value)) throw new Error(`--seed must be a non-negative integer, got ${value}`);
        o.seed = Number(value);
        break;
      case 'out':
        if (value !== 'local' && value !== 'formal') throw new Error(`--out must be local or formal, got ${value}`);
        o.out = value;
        break;
      case 'name':
        if (!isFileStem(value)) throw new Error(`--name must be a plain file stem (letters, digits, . _ -), got "${value}"`);
        o.name = value;
        break;
      case 'record':
        if (m) throw new Error('--record takes no value');
        o.record = true;
        break;
      case 'report-name':
        if (!isFileStem(value)) throw new Error(`--report-name must be a plain file stem (letters, digits, . _ -), got "${value}"`);
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
    ...(r.scope ? [`milestone scope ${r.scope.milestone}: ${r.scope.outOfScope.length === 0 ? 'every case in scope' : `${r.scope.outOfScope.map((c) => `${c.id} (${c.milestone}, ${c.outcome})`).join(', ')} out of scope, reported separately and not in any gate`}`] : []),
    ...r.gates.map((g) => `  ${g.pass ? 'PASS' : 'FAIL'}  ${g.id.padEnd(8)} ${g.display} (target ${g.target})`),
    ...(r.criticalConditions.length > 0 ? [`critical conditions: ${r.criticalConditions.map((f) => `${f.id} [${f.caseIds.join(', ')}]`).join('; ')}`] : []),
    `results: ${relative(process.cwd(), resultsPath)}`,
    `report:  ${relative(process.cwd(), reportPath)}`,
  ];
}

type Runner = (o: RunOptions) => Promise<{ results: ResultsFile; resultsPath: string; reportPath: string; exitCode: 0 | 1 }>;

export type LiveRun = { reportPath: string; agreed: number; total: number; recorded: string[] };
type LiveRunner = (o: { record: boolean; env: Record<string, string | undefined> }) => Promise<LiveRun>;

/** `--provider=live`: the agreement report under evals/results/local (not committed), never a gate. */
export async function runLiveAgreement(o: { record: boolean; env: Record<string, string | undefined> }): Promise<LiveRun> {
  const inputs = loadHarnessInputs(loadDataset());
  const { rows, recorded } = await liveAgreement({ inputs, env: o.env, record: o.record });
  const ranAt = new Date().toISOString();
  const dir = join(RESULTS_DIR, 'local');
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `live-agreement-${ranAt.replace(/[:.]/g, '-')}.md`);
  writeFileSync(reportPath, renderAgreement(rows, { ranAt, commit: gitFacts().shortSha }));
  return { reportPath, agreed: rows.filter((r) => r.agree).length, total: rows.length, recorded };
}

/** The CLI: 0 pass, 1 gate failure, 2 bad usage or harness crash (see the header). */
export async function main(
  argv: string[],
  run: Runner = runHarness,
  io: Pick<Console, 'log' | 'error'> = console,
  deps: { env?: Record<string, string | undefined>; live?: LiveRunner } = {},
): Promise<0 | 1 | 2> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.error((e as Error).message);
    return 2;
  }
  if (args.record && args.provider !== 'live') {
    io.error('--record needs --provider=live (it saves live provider answers as recorded fixtures).');
    return 2;
  }
  if (args.provider === 'live') {
    const env = deps.env ?? process.env;
    const missing = missingLiveVars(env);
    if (missing.length > 0) {
      io.error(`--provider=live needs ${missing.join(', ')} in the environment; nothing was run. The fixture provider needs no keys (pnpm eval). Never run live in CI.`);
      return 2;
    }
    try {
      const r = await (deps.live ?? runLiveAgreement)({ record: args.record, env });
      io.log(`pnpm eval --provider=live — agreement ${r.agreed}/${r.total} (no gate)`);
      if (r.recorded.length > 0) io.log(`recorded ${r.recorded.length} provider answers under evals/fixtures/remote-sensing/recorded`);
      io.log(`report:  ${relative(process.cwd(), r.reportPath)}`);
      return 0;
    } catch (e) {
      io.error(`pnpm eval --provider=live crashed (exit 2): ${e instanceof Error ? e.message : String(e)}`);
      return 2;
    }
  }
  let r: Awaited<ReturnType<Runner>>;
  try {
    r = await run(args);
  } catch (e) {
    io.error(`pnpm eval crashed (exit 2, not a gate result): ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return 2;
  }
  for (const line of summaryLines(r.results, r.resultsPath, r.reportPath)) io.log(line);
  return r.exitCode;
}

/**
 * Point DATA_DIR, DATABASE_URL and LEDGER_KEY_PATH at a fresh temporary directory, so `pnpm eval` never
 * reads or writes ./data (or an operator's DATA_DIR), and default LOG_LEVEL to warn so library info
 * lines do not interleave with the summary. Call before anything reads the environment. Returns the dir.
 */
export function isolateDataDir(vars: Record<string, string | undefined> = process.env): string {
  const dir = mkdtempSync(join(tmpdir(), 'udgam-eval-data-'));
  vars.DATA_DIR = dir;
  vars.DATABASE_URL = `file:${join(dir, 'udgam.db')}`;
  vars.LEDGER_KEY_PATH = join(dir, 'keys', 'ledger.jwk');
  vars.LOG_LEVEL ??= 'warn';
  return dir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scratch = isolateDataDir();
  main(process.argv.slice(2))
    .then(
      (code) => {
        process.exitCode = code;
      },
      (e: unknown) => {
        console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
        process.exitCode = 2;
      },
    )
    .finally(() => rmSync(scratch, { recursive: true, force: true }));
}
