import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from '../../src/lib/verification/registry';
import { S4_THRESHOLD_MS } from '../perf/s4-certificate';
import type { RunFacts } from '../scorers/critical-conditions';
import { releaseIntegrity } from '../scorers/harness-integrity';
import { loadDataset, type Dataset, type EvalCase, type Suite } from './dataset';
import { REPO_ROOT, type Provenance } from './provenance';
import { checkReadiness, readinessLines } from './readiness';
import { REPORTS_DIR, RESULTS_DIR, reportPathFor, writeReport, writeResults, type Out } from './results';
import { configDriftOf, DEFAULT_MILESTONE, isolateDataDir, MILESTONES, regate, runHarness, type Gate, type Milestone, type ResultsFile } from './run';
import { runSuite, sidecarPath, SUITE_REPORTS, type SuiteReport, type SuiteRunRecord } from './test-suites';
import { treeState, type TreeState } from './tree-state';

// The release evaluation (technical-plan §13 and §22 TSK-21.4; evaluation-plan §9, §12; TP20).
//
//   pnpm eval:release --milestone=M1 [--harness=<results.json>] [--perf=<perf-s4.json>] [--out=local|formal]
//                     [--dir=<dir>] [--reuse]
//
// --dir (local runs only) puts the suite reports, the release result and its report under <dir>/local/
// instead of evals/results/local/; formal output always goes to evals/results/ and evals/reports/.
//
// 1. Runs `pnpm eval:integration` and `pnpm eval:e2e` (test-suites.ts), unless --reuse reads their last
//    JSON reports from the suite directory instead.
// 2. Takes the harness results from --harness (the formal run of this commit) or runs the harness itself.
// 3. Maps every test whose title names an EVAL ID to that case, and reconciles the dataset: every case has
//    one status. In scope (milestone ≤ --milestone, active or stretch): passed | failed | skipped | missing
//    (no evidence at all, which fails S7). Later milestones: `deferred` (M3, with the ticket that measures
//    it) or `out_of_scope` (M2). pending_decision cases are reported, outside the gates; retired cases are
//    listed as retired.
// 4. Writes eval-run-v1-release-{sha}.json (formal: evals/results/; local: evals/results/local/) and the
//    report eval-report-v1.md rendered from that file only (CF-12). Never overwrites: -rN instead.
//
// Evidence rules: harness-verifier and harness-proof cases need the harness result, and the perf case
// EVAL-071 needs a perf results file (--perf): a unit test of the scorer is not a measurement. Other
// cases take any EVAL-titled test; when no test ran under the runner the dataset names (integration →
// vitest, e2e → playwright), the case is flagged "evidence outside its suite". Any failed piece of
// evidence fails the case. EVAL-091/092 also take the harness's own integrity result as evidence.
//
// Fail closed on stale or altered inputs (TASK-22 fix round 1; docs/exec/m-001-formal-run.md):
// - The release's own tree must be clean apart from untracked formal outputs (tree-state.ts). A formal
//   release refuses otherwise (exit 2, nothing run); a local one records a problem.
// - Every input must come from this commit on such a tree: the harness file's provenance.git, the perf
//   file's provenance.git, and each suite report's run record (test-suites.ts) before and after its run.
//   A suite run that exited non-zero, a Vitest report with success other than true, a Playwright report
//   with unexpected > 0 or errors, and a report whose SHA-256 differs from its run record are problems.
// - Nothing stored is trusted: the harness gates are re-derived from the file's own cases (run.ts regate)
//   and S4 from the perf file's raw timings and S4_THRESHOLD_MS; any disagreement names the file.
// - Formal output takes no --reuse, and needs --harness and --perf files in the results directory.
// Every problem fails S7-release, which the harness-integrity scorer decides (releaseIntegrity).
// Exit codes: 0 every release gate passes; 1 a gate failed; 2 bad usage, a refused formal run, or a crash.

export const RELEASE_SCHEMA = 'udgam-eval-release/1';
export const RELEASE_TAG = 'v1';

/**
 * M-003 cases and the ticket that measures each (tickets.md: TKT-28 · TASK-29 owns EVAL-085/090, TKT-29 ·
 * TASK-30 owns EVAL-070/072). An M3 case missing here is an integrity problem, never silently deferred.
 */
export const DEFERRED_TICKETS: Record<string, string> = {
  'EVAL-070': 'TKT-29 · TASK-30',
  'EVAL-072': 'TKT-29 · TASK-30',
  'EVAL-085': 'TKT-28 · TASK-29',
  'EVAL-090': 'TKT-28 · TASK-29',
};

export type Runner = 'harness' | 'harness-integrity' | 'vitest' | 'playwright' | 'perf';
export type EvidenceStatus = 'passed' | 'failed' | 'skipped';
export type Evidence = { id: string; runner: Runner; source: string; title: string; status: EvidenceStatus; detail?: string };
export type ReleaseStatus = 'passed' | 'failed' | 'skipped' | 'missing' | 'deferred' | 'out_of_scope' | 'retired';
export type ReleaseCase = {
  id: string;
  title: string;
  suite: Suite;
  milestone: string;
  datasetStatus: EvalCase['status'];
  priority: EvalCase['priority'];
  /** Counts in the release gates: in milestone scope and active or stretch. */
  gated: boolean;
  /** The release status (named `outcome` so a harness run reading this file compares it like a run). */
  outcome: ReleaseStatus;
  runners: Runner[];
  evidence: Evidence[];
  outsideSuite: boolean;
  deferredTo: string | null;
  notes: string[];
};
/** One input of the release. `record`: a suite report's run record (test-suites.ts); `rangeTitles`: titles whose range-written IDs were not read. */
export type SuiteSource = { name: SuiteReport | 'harness' | 'perf'; file: string | null; record?: string | null; sha256: string | null; command: string | null; exitCode: number | null; tests: number; evalTests: number; errors: string[]; rangeTitles?: string[] };
export type ReleaseTotals = { cases: number; gated: number; passed: number; failed: number; skipped: number; missing: number; deferred: number; outOfScope: number; notGated: number };
export type ReleaseFile = {
  schema: typeof RELEASE_SCHEMA;
  provenance: Provenance & { release: { tag: string; milestone: Milestone; harnessFile: string; harnessCommit: string; sources: SuiteSource[] } };
  summary: { overall: 'PASS' | 'FAIL'; exitCode: 0 | 1; blockers: string[] };
  gates: (Gate & { source: string })[];
  totals: ReleaseTotals;
  problems: string[];
  readiness: string[];
  cases: ReleaseCase[];
};

// ── Titles → EVAL IDs ─────────────────────────────────────────────────────────────────────────────

const EVAL_ID = /(?<![\p{L}\p{N}_-])EVAL-(\d{3})(?![\p{L}\p{N}_])/gu;
const RANGE_AFTER = /^\s*(?:\.\.|[-–—])\s*(?:EVAL-)?\d/;
const RANGE_BEFORE = /\d\s*(?:\.\.|[-–—])\s*$/;
const inRange = (title: string, m: RegExpMatchArray) => RANGE_AFTER.test(title.slice(m.index! + m[0].length)) || RANGE_BEFORE.test(title.slice(0, m.index));

/**
 * Every EVAL ID a test title names, as whole IDs only: `EVAL-` and three digits, with no letter, digit,
 * underscore or hyphen before it and no letter, digit or underscore after it. Range syntax is never read:
 * an ID written as either end of a range (`EVAL-058..063`, `EVAL-100–102`, `EVAL-058–EVAL-060`, and so
 * `EVAL-086 – 100 events`) maps to nothing, so a title can never claim a case it does not name.
 */
export function evalIdsIn(title: string): string[] {
  const ids = new Set<string>();
  for (const m of title.matchAll(EVAL_ID)) if (!inRange(title, m)) ids.add(`EVAL-${m[1]}`);
  return [...ids];
}

/** Whether a title writes an EVAL ID as part of a range (not read; the report lists such titles). */
export const hasRangeSyntax = (title: string): boolean => [...title.matchAll(EVAL_ID)].some((m) => inRange(title, m));

// ── Runner reports → evidence ─────────────────────────────────────────────────────────────────────

type VitestAssertion = { ancestorTitles?: string[]; title?: string; fullName?: string; status?: string; failureMessages?: string[] };
type VitestReport = { success?: boolean; numFailedTestSuites?: number; testResults?: { name?: string; status?: string; message?: string; assertionResults?: VitestAssertion[] }[] };
export type ReportEvidence = { evidence: Evidence[]; tests: number; errors: string[]; rangeTitles: string[] };

const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);
const rel = (p: string) => (relative(REPO_ROOT, p).startsWith('..') ? p : relative(REPO_ROOT, p));

/**
 * Vitest's JSON report → evidence for every test whose full name names an EVAL ID. A file that failed to
 * run, and a report whose `success` is not true (a failed suite or test, or no test file), are errors.
 * Vitest's JSON does not mark `it.fails` (such a test reports passed); no EVAL test uses it.
 */
export function vitestEvidence(report: VitestReport): ReportEvidence {
  const evidence: Evidence[] = [];
  const errors: string[] = [];
  const rangeTitles: string[] = [];
  let tests = 0;
  if (report.success !== true) errors.push(`Vitest reports success=${String(report.success)} (${report.numFailedTestSuites ?? '?'} failed suite(s)): the run failed`);
  for (const file of report.testResults ?? []) {
    const source = rel(file.name ?? 'unknown file');
    const results = file.assertionResults ?? [];
    tests += results.length;
    if (file.status === 'failed' && results.every((a) => a.status !== 'failed')) errors.push(`${source}: ${short(file.message || 'the file failed outside any test')}`);
    for (const a of results) {
      const title = [...(a.ancestorTitles ?? []), a.title ?? ''].join(' › ');
      if (hasRangeSyntax(title)) rangeTitles.push(`${source}: ${title}`);
      const status: EvidenceStatus = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      for (const id of evalIdsIn(title)) evidence.push({ id, runner: 'vitest', source, title, status, ...(status === 'failed' ? { detail: short((a.failureMessages ?? []).join(' | ')) } : {}) });
    }
  }
  return { evidence, tests, errors, rangeTitles };
}

type PwResult = { status?: string; error?: { message?: string } };
type PwTest = { projectName?: string; status?: string; expectedStatus?: string; results?: PwResult[] };
type PwSpec = { title?: string; file?: string; tests?: PwTest[] };
type PwSuite = { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] };
type PwReport = { suites?: PwSuite[]; errors?: { message?: string }[]; stats?: { unexpected?: number } };

/**
 * Playwright's JSON report → one piece of evidence per EVAL-titled test and project. Flaky counts as
 * passed (noted); a test marked test.fail() is failed evidence, since its pass proves nothing. Top-level
 * errors, a report without `stats`, and `stats.unexpected > 0` are errors.
 */
export function playwrightEvidence(report: PwReport): ReportEvidence {
  const evidence: Evidence[] = [];
  const rangeTitles: string[] = [];
  let tests = 0;
  const walk = (suite: PwSuite, titles: string[]) => {
    const path = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      const title = [...path, spec.title ?? ''].join(' › ');
      const source = spec.file ?? suite.file ?? 'unknown spec';
      if (hasRangeSyntax(title)) rangeTitles.push(`${source}: ${title}`);
      for (const t of spec.tests ?? []) {
        tests++;
        const markedFail = t.expectedStatus !== undefined && t.expectedStatus !== 'passed' && t.expectedStatus !== 'skipped';
        const status: EvidenceStatus = markedFail ? 'failed' : t.status === 'expected' || t.status === 'flaky' ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed';
        const err = (t.results ?? []).map((r) => r.error?.message).find(Boolean);
        const detail = [
          t.projectName ? `project ${t.projectName}` : null,
          markedFail ? `expected status ${t.expectedStatus} (test.fail()): not evidence of a pass` : null,
          t.status === 'flaky' ? 'flaky: passed on retry' : null,
          status === 'failed' && err ? short(err) : null,
        ]
          .filter(Boolean)
          .join('; ');
        for (const id of evalIdsIn(title)) evidence.push({ id, runner: 'playwright', source, title, status, ...(detail ? { detail } : {}) });
      }
    }
    for (const s of suite.suites ?? []) walk(s, path);
  };
  for (const s of report.suites ?? []) walk(s, []);
  const errors = (report.errors ?? []).map((e) => short(e.message ?? 'Playwright reported an error'));
  if (report.stats === undefined) errors.push('the report has no stats: it cannot show that the run finished');
  else if ((report.stats.unexpected ?? 0) > 0) errors.push(`Playwright reports ${report.stats.unexpected} unexpected result(s): the run failed`);
  return { evidence, tests, errors, rangeTitles };
}

type PerfRun = { finalState?: string; ms?: number | null };
type PerfFile = { gate?: string; case?: string; pass?: boolean; runs?: PerfRun[]; summary?: { max?: number; p50?: number; p95?: number; thresholdMs?: number } | null; provenance?: { git?: GitLike } };
type GitLike = { commit?: string; shortSha?: string; dirty?: boolean };
export const S4_MIN_RUNS = 10;

/**
 * A perf results file (pnpm eval:perf --only=s4) → EVAL-071's evidence, recomputed from the raw runs:
 * pass needs ≥ 10 runs, every one `verified` with a time under S4_THRESHOLD_MS (this code's, not the
 * file's). A stored `pass` or threshold that disagrees is a problem naming the file, and fails the case.
 */
export function perfEvidence(perf: PerfFile, source: string): { evidence: Evidence[]; problems: string[] } {
  if (perf.case !== 'EVAL-071' || perf.gate !== 'S4') return { evidence: [{ id: 'EVAL-071', runner: 'perf', source, title: 'S4 perf results', status: 'failed', detail: `${source} is not an S4 / EVAL-071 perf result` }], problems: [] };
  const runs = perf.runs ?? [];
  const under = (r: PerfRun) => r.finalState === 'verified' && typeof r.ms === 'number' && Number.isFinite(r.ms) && r.ms >= 0 && r.ms < S4_THRESHOLD_MS;
  const pass = runs.length >= S4_MIN_RUNS && runs.every(under);
  const times = runs.map((r) => r.ms).filter((x): x is number => typeof x === 'number');
  const problems: string[] = [];
  if (perf.pass !== pass) problems.push(`${source}: the file says pass=${String(perf.pass)}, its runs give ${pass ? 'PASS' : 'FAIL'} (≥ ${S4_MIN_RUNS} loads, each verified and under ${S4_THRESHOLD_MS} ms)`);
  if (perf.summary && perf.summary.thresholdMs !== S4_THRESHOLD_MS) problems.push(`${source}: the file's threshold ${perf.summary.thresholdMs} ms is not S4's ${S4_THRESHOLD_MS} ms`);
  const detail = [
    `${runs.length} cold loads, ${runs.filter((r) => r.finalState === 'verified').length} verified, ${runs.filter(under).length} verified under ${S4_THRESHOLD_MS} ms`,
    ...(times.length > 0 ? [`max ${Math.max(...times)} ms`] : []),
    ...(runs.length < S4_MIN_RUNS ? [`fewer than the ${S4_MIN_RUNS} runs S4 needs`] : []),
  ].join(', ');
  return { evidence: [{ id: 'EVAL-071', runner: 'perf', source, title: 'S4 certificate verification, cold loads', status: pass && problems.length === 0 ? 'passed' : 'failed', detail }], problems };
}

/** The problem with an input whose recorded git facts are not this commit on a clean tree, else null. */
export function provenanceProblem(what: string, git: GitLike | undefined, head: Pick<TreeState, 'commit' | 'shortSha'>): string | null {
  if (!git || typeof git.commit !== 'string') return `${what} records no commit, so it cannot be tied to ${head.shortSha} (CF-12)`;
  if (git.commit !== head.commit) return `${what} is from ${git.shortSha ?? git.commit.slice(0, 7)}, the release runs at ${head.shortSha}: every number must come from this commit (CF-12)`;
  if (git.dirty !== false) return `${what} was produced on a dirty tree (CF-12)`;
  return null;
}

/** The harness results → evidence for every case it ran, plus EVAL-091/092 from its own integrity result. */
export function harnessEvidence(h: ResultsFile, source: string): Evidence[] {
  const out: Evidence[] = h.cases.map((c) => ({
    id: c.id,
    runner: 'harness' as const,
    source,
    title: `harness ${c.suite}`,
    status: c.outcome === 'passed' ? ('passed' as const) : ('failed' as const),
    ...(c.outcome === 'passed' ? {} : { detail: [c.outcome, ...c.notes, c.error?.message].filter(Boolean).join('; ') }),
  }));
  const s7 = h.gates.find((g) => g.id === 'S7');
  const integrityOk = s7?.pass === true && h.totals.skipped === 0;
  out.push({
    id: 'EVAL-092',
    runner: 'harness-integrity',
    source,
    title: 'the harness run reconciles with the dataset (nothing skipped or hidden)',
    status: integrityOk ? 'passed' : 'failed',
    detail: `S7 ${s7?.display ?? 'absent'}; ${h.totals.active} cases, ${h.totals.skipped} skipped${h.totals.problems.length > 0 ? `; ${h.totals.problems.join('; ')}` : ''}`,
  });
  const gatesPass = h.gates.every((g) => g.pass) && h.criticalConditions.length === 0;
  const exitConsistent = (h.summary.exitCode === 0) === gatesPass;
  const offline = h.runtime.networkCalls.length === 0;
  const clean = h.provenance.git.dirty === false;
  out.push({
    id: 'EVAL-091',
    runner: 'harness-integrity',
    source,
    title: 'pnpm eval ran with one command, offline, from a clean tree',
    status: integrityOk && exitConsistent && offline && clean ? 'passed' : 'failed',
    detail: `exit ${h.summary.exitCode} ${exitConsistent ? 'matches' : 'CONTRADICTS'} the gates; ${h.runtime.networkCalls.length} network call(s); tree ${clean ? 'clean' : 'DIRTY'} at ${h.provenance.git.shortSha}`,
  });
  return out;
}

// ── Reconciliation ────────────────────────────────────────────────────────────────────────────────

const STRICT: Partial<Record<Suite, Runner>> = { 'harness-verifier': 'harness', 'harness-proof': 'harness', perf: 'perf' };
const PRIMARY: Partial<Record<Suite, Runner[]>> = { integration: ['vitest'], e2e: ['playwright'], ci: ['vitest', 'playwright', 'harness-integrity'] };
const rank = (m: string | undefined) => MILESTONES.indexOf(m as Milestone);

/** One status per dataset case (never dropped), plus the problems that fail S7 for the release. */
export function reconcile(dataset: Pick<Dataset, 'cases'>, evidence: Evidence[], milestone: Milestone): { cases: ReleaseCase[]; problems: string[] } {
  const problems: string[] = [];
  const byId = new Map<string, Evidence[]>();
  for (const e of evidence) byId.set(e.id, [...(byId.get(e.id) ?? []), e]);
  const known = new Set(dataset.cases.map((c) => c.id));
  const unknown = [...byId.keys()].filter((id) => !known.has(id)).sort();
  if (unknown.length > 0) problems.push(`tests name EVAL IDs that are not in the dataset: ${unknown.join(', ')}`);

  const cases = dataset.cases.map((c): ReleaseCase => {
    const ev = byId.get(c.id) ?? [];
    const strict = STRICT[c.suite];
    const later = rank(c.milestone) > rank(milestone) && rank(c.milestone) !== -1;
    const gated = !later && (c.status === 'active' || c.status === 'stretch');
    const notes: string[] = [];
    const base = { id: c.id, title: c.title, suite: c.suite, milestone: c.milestone, datasetStatus: c.status, priority: c.priority, gated, evidence: ev, runners: [...new Set(ev.map((e) => e.runner))].sort() as Runner[] };
    const statusOf = (): ReleaseStatus => {
      if (strict && !ev.some((e) => e.runner === strict)) {
        notes.push(strict === 'perf' ? 'no perf results for this run (pnpm eval:perf … then --perf=<file>)' : 'not in the harness results');
        return 'missing';
      }
      if (ev.length === 0) {
        notes.push(c.suite === 'manual' ? 'manual case with no recorded evidence' : 'no test names this case');
        return 'missing';
      }
      if (ev.some((e) => e.status === 'failed')) return 'failed';
      if (!ev.some((e) => e.status === 'passed')) return 'skipped';
      const skipped = ev.filter((e) => e.status === 'skipped').length;
      if (skipped > 0) notes.push(`${skipped} skipped test(s) beside the passing ones`);
      return 'passed';
    };
    if (c.status === 'retired') return { ...base, outcome: 'retired', outsideSuite: false, deferredTo: null, notes: ['retired in the dataset'] };
    if (later) {
      if (c.milestone === 'M3') {
        const ticket = DEFERRED_TICKETS[c.id];
        if (!ticket) problems.push(`${c.id} (M3) has no deferral ticket in DEFERRED_TICKETS`);
        return { ...base, outcome: 'deferred', outsideSuite: false, deferredTo: `M-003 (${ticket ?? 'ticket not recorded'})`, notes: [`deferred to M-003${ticket ? ` (${ticket})` : ''}`] };
      }
      return { ...base, outcome: 'out_of_scope', outsideSuite: false, deferredTo: null, notes: [`${c.milestone} case, outside the ${milestone} gates`] };
    }
    const outcome = statusOf();
    const primary = PRIMARY[c.suite];
    const outsideSuite = primary !== undefined && ev.length > 0 && !ev.some((e) => primary.includes(e.runner));
    if (outsideSuite) notes.push(`evidence from ${base.runners.join(', ')} only; the dataset names the ${c.suite} suite`);
    if (c.status === 'pending_decision') notes.push('pending decision: reported, outside the gates');
    return { ...base, outcome, outsideSuite, deferredTo: null, notes };
  });
  return { cases, problems };
}

export function totalsOf(cases: ReleaseCase[]): ReleaseTotals {
  const g = cases.filter((c) => c.gated);
  const n = (s: ReleaseStatus) => g.filter((c) => c.outcome === s).length;
  return {
    cases: cases.length,
    gated: g.length,
    passed: n('passed'),
    failed: n('failed'),
    skipped: n('skipped'),
    missing: n('missing'),
    deferred: cases.filter((c) => c.outcome === 'deferred').length,
    outOfScope: cases.filter((c) => c.outcome === 'out_of_scope').length,
    notGated: cases.filter((c) => !c.gated && c.outcome !== 'deferred' && c.outcome !== 'out_of_scope').length,
  };
}

// ── The release result ────────────────────────────────────────────────────────────────────────────

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export type ReleaseInput = {
  dataset: Pick<Dataset, 'cases'>;
  milestone: Milestone;
  harness: { results: ResultsFile; file: string; text: string };
  suites: { source: SuiteSource; evidence: Evidence[] }[];
  perf?: { evidence: Evidence[]; source: SuiteSource };
  readiness: string[];
  /** The release's own tree (tree-state.ts): `dirty` = changes outside the untracked formal outputs. */
  git: Provenance['git'] & { changes?: string[] };
  /** CF-13's input, judged now (run.ts configDriftOf); undefined before baseline-v1 exists. */
  configDrift?: RunFacts['configDrift'];
  startedAt: Date;
  durationMs: number;
};

/** Merge the harness, the suite reports and the perf result into the release result (pure). */
export function buildRelease(i: ReleaseInput): ReleaseFile {
  const h = i.harness.results;
  const file = rel(i.harness.file);
  // The harness gates are re-derived from the file's own cases; the stored flags only have to agree.
  const re = regate(h, i.dataset, i.milestone, i.configDrift);
  const checked: ResultsFile = { ...h, gates: re.gates, criticalConditions: re.criticalConditions, totals: re.integrity };
  const harnessErrors = [
    ...re.problems.map((p) => `${file} disagrees with its own cases: ${p}`),
    ...[provenanceProblem(`the harness results ${file}`, h.provenance?.git, i.git)].filter((x): x is string => x !== null),
  ];
  const harnessSource: SuiteSource = { name: 'harness', file, sha256: sha256(i.harness.text), command: null, exitCode: h.summary.exitCode, tests: h.cases.length, evalTests: h.cases.length, errors: harnessErrors };
  const evidence = [...harnessEvidence(checked, file), ...i.suites.flatMap((s) => s.evidence), ...(i.perf?.evidence ?? [])];
  const { cases, problems } = reconcile(i.dataset, evidence, i.milestone);
  const sources = [harnessSource, ...i.suites.map((s) => s.source), ...(i.perf ? [i.perf.source] : [])];
  for (const s of sources) for (const e of s.errors) problems.push(`${s.name}: ${e}`);
  if (i.git.dirty) problems.push(`the release tree has changes outside the untracked formal outputs (${(i.git.changes ?? []).join(', ') || 'git status is not clean'}): every number must come from the committed tree (CF-12)`);
  if (h.scope && h.scope.milestone !== i.milestone) problems.push(`the harness ran with --milestone=${h.scope.milestone}, the release with ${i.milestone}`);
  const totals = totalsOf(cases);

  const harnessGates = re.gates.map((g) => ({ ...g, source: file }));
  const perf = cases.find((c) => c.id === 'EVAL-071');
  const perfEv = perf?.evidence.find((e) => e.runner === 'perf');
  const s4: Gate & { source: string } = perfEv
    ? { id: 'S4', name: 'Certificate verifies in the browser (10 cold loads)', value: perfEv.status === 'passed', display: perfEv.status === 'passed' ? 'Yes' : 'No', target: `every load < ${S4_THRESHOLD_MS / 1000} s`, pass: perfEv.status === 'passed', detail: perfEv.detail ?? '', source: perfEv.source }
    : { id: 'S4', name: 'Certificate verifies in the browser (10 cold loads)', value: null, display: 'not run', target: `every load < ${S4_THRESHOLD_MS / 1000} s`, pass: false, detail: 'no perf results file was given (--perf)', source: '—' };
  // Harness cases are judged by the harness gates above (S1 tolerates a miss; scenario 5–6 stretch cases
  // are reported, not gated, evaluation-plan §4.1). Every other in-scope case must pass, stretch included:
  // EVAL-051/052 are critical security cases whatever S1 says (§6).
  const gatedCases = cases.filter((c) => c.gated && !c.suite.startsWith('harness-'));
  const notPassed = gatedCases.filter((c) => c.outcome !== 'passed');
  const releaseCases: Gate & { source: string } = {
    id: 'Cases',
    name: `Every in-scope ${i.milestone} case outside the harness passes (integration, e2e, ci, perf, manual)`,
    value: gatedCases.length === 0 ? null : (gatedCases.length - notPassed.length) / gatedCases.length,
    display: `${gatedCases.length - notPassed.length}/${gatedCases.length}`,
    target: 'all',
    pass: gatedCases.length > 0 && notPassed.length === 0,
    detail: notPassed.map((c) => `${c.id} ${c.outcome}`).join(', ') || 'none failed',
    source: 'cases',
  };
  // The reconciliation is the harness-integrity scorer's (technical-plan TSK-21.4), applied to the release.
  const integ = releaseIntegrity(totals, problems);
  const s7: Gate & { source: string } = {
    id: 'S7-release',
    name: 'Every case reconciled (nothing missing, skipped or unexplained)',
    value: integ.ok,
    display: integ.ok ? 'Yes' : 'No',
    target: 'Yes',
    pass: integ.ok,
    detail: integ.detail,
    source: 'cases',
  };
  const gates = [...harnessGates, s4, releaseCases, s7];
  const pass = gates.every((g) => g.pass);
  const git: Provenance['git'] = { commit: i.git.commit, shortSha: i.git.shortSha, branch: i.git.branch, dirty: i.git.dirty };
  return {
    schema: RELEASE_SCHEMA,
    provenance: {
      ...h.provenance,
      git,
      timestampUtc: i.startedAt.toISOString(),
      durationMs: i.durationMs,
      release: { tag: RELEASE_TAG, milestone: i.milestone, harnessFile: file, harnessCommit: h.provenance.git.commit, sources },
    },
    summary: { overall: pass ? 'PASS' : 'FAIL', exitCode: pass ? 0 : 1, blockers: gates.filter((g) => !g.pass).map((g) => `${g.id} ${g.name}: ${g.display} (target ${g.target})${g.detail ? ` — ${g.detail}` : ''}`) },
    gates,
    totals,
    problems,
    readiness: i.readiness,
    cases,
  };
}

// ── The report (from the release file only) ───────────────────────────────────────────────────────

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReleaseReport(r: ReleaseFile, resultsPath: string): string {
  const p = r.provenance;
  const out: string[] = [];
  const t = r.totals;
  out.push(`# Udgam release evaluation — ${basename(resultsPath, '.json')}`, '');
  out.push(`Generated by \`evals/harness/release.ts\` from \`${basename(resultsPath)}\` only; do not edit by hand. Milestone scope **${p.release.milestone}**; commit \`${p.git.shortSha}\` on \`${p.git.branch}\`${p.git.dirty ? ' (**dirty tree**)' : ''}; config \`${p.config.version}\` \`${p.config.hash}\`; dataset ${p.dataset.version}; ${p.timestampUtc}.`, '');
  out.push(`**Overall: ${r.summary.overall}**`, '');
  if (r.summary.blockers.length > 0) out.push('Blockers:', '', ...r.summary.blockers.map((b) => `- ${cell(b)}`), '');
  out.push('## Readiness (pnpm eval:ready)', '', '```', ...r.readiness, '```', '');
  out.push('## Gates', '', '| Gate | Measure | Value | Target | Pass | Source |', '|---|---|---|---|---|---|');
  for (const g of r.gates) out.push(`| ${g.id} | ${cell(g.name)} | ${cell(g.display)} | ${cell(g.target)} | ${g.pass ? 'PASS' : 'FAIL'} | \`${g.source}\` |`);
  out.push('');
  out.push('## Totals', '', `${t.cases} cases in the dataset: ${t.gated} in the ${p.release.milestone} gates (${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped, ${t.missing} missing); ${t.deferred} deferred; ${t.outOfScope} out of scope; ${t.notGated} reported outside the gates.`, '');
  if (r.problems.length > 0) out.push('## Problems (fail S7-release)', '', ...r.problems.map((x) => `- ${cell(x)}`), '');
  const attention = r.cases.filter((c) => c.gated && c.outcome !== 'passed');
  out.push('## Cases that did not pass', '');
  if (attention.length === 0) out.push('None.', '');
  else {
    out.push('| Case | Suite | Status | Evidence |', '|---|---|---|---|');
    for (const c of attention) {
      const why = [...c.notes, ...c.evidence.filter((e) => e.status !== 'passed').map((e) => `${e.runner} ${e.status}: ${e.title}${e.detail ? ` (${e.detail})` : ''}`)].join('; ');
      out.push(`| ${c.id} | ${c.suite} | ${c.outcome} | ${cell(why || '—')} |`);
    }
    out.push('');
  }
  const partly = r.cases.filter((c) => c.gated && c.outcome === 'passed' && c.evidence.some((e) => e.status === 'skipped'));
  if (partly.length > 0) {
    out.push('## Passed, with skipped tests', '', '| Case | Skipped evidence |', '|---|---|');
    for (const c of partly) out.push(`| ${c.id} | ${cell(c.evidence.filter((e) => e.status === 'skipped').map((e) => `${e.runner}: ${e.title}${e.detail ? ` (${e.detail})` : ''}`).join('; '))} |`);
    out.push('');
  }
  const ranged = [...new Set(p.release.sources.flatMap((s) => s.rangeTitles ?? []))];
  if (ranged.length > 0) {
    out.push('## Titles with range-written IDs (not read)', '', 'An EVAL ID written as part of a range is not mapped to any case; name each case in full to count it.', '', ...ranged.map((t) => `- ${cell(t)}`), '');
  }
  const outside = r.cases.filter((c) => c.outsideSuite);
  if (outside.length > 0) {
    out.push('## Evidence outside the dataset suite', '', 'These cases count on tests from a runner other than the one their dataset suite names.', '', '| Case | Dataset suite | Evidence from |', '|---|---|---|');
    for (const c of outside) out.push(`| ${c.id} | ${c.suite} | ${c.runners.join(', ')} (${[...new Set(c.evidence.map((e) => e.source))].join(', ')}) |`);
    out.push('');
  }
  const deferred = r.cases.filter((c) => c.outcome === 'deferred');
  out.push('## Deferred', '', '| Case | Title | Suite | Deferred to |', '|---|---|---|---|');
  for (const c of deferred) out.push(`| ${c.id} | ${cell(c.title)} | ${c.suite} | ${c.deferredTo} |`);
  if (deferred.length === 0) out.push('| — | | | |');
  out.push('');
  const other = r.cases.filter((c) => !c.gated && c.outcome !== 'deferred');
  if (other.length > 0) {
    out.push('## Outside the gates', '', '| Case | Milestone | Dataset status | Status | Note |', '|---|---|---|---|---|');
    for (const c of other) out.push(`| ${c.id} | ${c.milestone} | ${c.datasetStatus} | ${c.outcome} | ${cell(c.notes.join('; '))} |`);
    out.push('');
  }
  out.push('## Every case', '', '| Case | Suite | Milestone | Status | Runners | Evidence (passed/total) |', '|---|---|---|---|---|---|');
  for (const c of r.cases) out.push(`| ${c.id} | ${c.suite} | ${c.milestone} | ${c.outcome} | ${c.runners.join(', ') || '—'} | ${c.evidence.filter((e) => e.status === 'passed').length}/${c.evidence.length} |`);
  out.push('');
  out.push('## Sources', '', '| Source | File | Run record | SHA-256 | Command | Exit | Tests (EVAL-titled) |', '|---|---|---|---|---|---|---|');
  for (const s of p.release.sources) out.push(`| ${s.name} | ${s.file ? `\`${s.file}\`` : '—'} | ${s.record ? `\`${s.record}\`` : '—'} | ${s.sha256 ? `\`${s.sha256.slice(0, 12)}…\`` : '—'} | ${s.command ? `\`${cell(s.command)}\`` : '—'} | ${s.exitCode ?? '—'} | ${s.tests} (${s.evalTests}) |`);
  out.push('');
  return out.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────

export type ReleaseArgs = { milestone: Milestone; harness?: string; perf?: string; out: Out; dir?: string; reuse: boolean };

export function parseReleaseArgs(argv: string[]): ReleaseArgs {
  const o: ReleaseArgs = { milestone: DEFAULT_MILESTONE, out: 'local', reuse: false };
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    const [flag, value] = m ? [m[1], m[2]] : [arg, undefined];
    const need = () => {
      if (!value) throw new Error(`--${flag} needs a value`);
      return value;
    };
    switch (flag) {
      case 'milestone':
        if (!(MILESTONES as readonly string[]).includes(value ?? '')) throw new Error(`--milestone must be ${MILESTONES.join(', ')}; got ${value}`);
        o.milestone = value as Milestone;
        break;
      case 'harness':
        o.harness = resolve(need());
        break;
      case 'perf':
        o.perf = resolve(need());
        break;
      case 'out':
        if (value !== 'local' && value !== 'formal') throw new Error(`--out must be local or formal, got ${value}`);
        o.out = value;
        break;
      case 'dir':
        o.dir = resolve(need());
        break;
      case 'reuse':
        if (value !== undefined) throw new Error('--reuse takes no value');
        o.reuse = true;
        break;
      default:
        throw new Error(`unknown flag ${arg}`);
    }
  }
  if (o.dir && o.out === 'formal') throw new Error('--dir is for local runs; formal output goes to evals/results/ and evals/reports/');
  if (o.reuse && o.out === 'formal') throw new Error('--reuse is for local runs: a formal release runs every suite itself, at this commit');
  return o;
}

function readJson<T>(file: string): { data: T; text: string } {
  const text = readFileSync(file, 'utf8');
  return { data: JSON.parse(text) as T, text };
}

/**
 * Read one suite's JSON report and its run record into evidence. An absent or unreadable report is an
 * error, never "no tests". So is a report without a run record, or whose record shows another commit, a
 * dirty tree before or after the run, a refused or failed run (exit ≠ 0), or a report SHA-256 other than
 * the one the run left.
 */
export function loadSuite(name: SuiteReport, file: string, head: Pick<TreeState, 'commit' | 'shortSha'>): { source: SuiteSource; evidence: Evidence[] } {
  const recordFile = sidecarPath(file);
  const source: SuiteSource = { name, file: rel(file), record: rel(recordFile), sha256: null, command: null, exitCode: null, tests: 0, evalTests: 0, errors: [], rangeTitles: [] };
  let record: SuiteRunRecord | null = null;
  try {
    record = JSON.parse(readFileSync(recordFile, 'utf8')) as SuiteRunRecord;
  } catch (e) {
    source.errors.push(`no readable run record at ${rel(recordFile)} (${(e as Error).message.split('\n')[0]}): the report cannot be tied to this commit`);
  }
  if (record) {
    source.command = record.command ?? null;
    source.exitCode = typeof record.exitCode === 'number' ? record.exitCode : null;
    if (record.schema !== 'udgam-suite-run/1' || record.report !== name) source.errors.push(`${rel(recordFile)} is not a ${name} run record`);
    if (record.refused) source.errors.push(`the run was refused: ${record.refused}`);
    if (record.exitCode !== 0) source.errors.push(`the run exited ${String(record.exitCode)}: a failed run fails the release whatever its tests say`);
    for (const [when, git] of [['before', record.git?.before], ['after', record.git?.after]] as const) {
      const p = provenanceProblem(`the ${name} run (tree ${when} it)`, git, head);
      if (p) source.errors.push(p + (git?.dirty && git.changes?.length ? `: ${git.changes.join(', ')}` : ''));
    }
  }
  let parsed: { data: unknown; text: string };
  try {
    parsed = readJson(file);
  } catch (e) {
    source.errors.push(`no readable report at ${rel(file)} (${(e as Error).message.split('\n')[0]})`);
    return { source, evidence: [] };
  }
  source.sha256 = sha256(parsed.text);
  if (record && record.reportSha256 !== source.sha256) source.errors.push(`${rel(file)} is not the report its run left (SHA-256 ${source.sha256.slice(0, 12)}…, run record ${record.reportSha256?.slice(0, 12) ?? 'none'}…): changed after the run`);
  const r = name === 'integration' ? vitestEvidence(parsed.data as VitestReport) : playwrightEvidence(parsed.data as PwReport);
  source.tests = r.tests;
  source.evalTests = new Set(r.evidence.map((e) => `${e.source} ${e.title} ${e.detail ?? ''}`)).size;
  source.rangeTitles = r.rangeTitles;
  source.errors.push(...r.errors);
  if (r.tests === 0) source.errors.push('the report holds no tests');
  return { source, evidence: r.evidence };
}

/** Read a perf results file: evidence recomputed from its runs, and its provenance checked against `head`. */
export function loadPerf(file: string, head: Pick<TreeState, 'commit' | 'shortSha'>): { evidence: Evidence[]; source: SuiteSource } {
  const p = readJson<PerfFile>(file);
  const r = perfEvidence(p.data, rel(file));
  const prov = provenanceProblem(`the perf results ${rel(file)}`, p.data.provenance?.git, head);
  return { evidence: r.evidence, source: { name: 'perf', file: rel(file), sha256: sha256(p.text), command: null, exitCode: null, tests: p.data.runs?.length ?? 0, evalTests: 1, errors: [...r.problems, ...(prov ? [prov] : [])] } };
}

/** Why a formal release must not run (nothing is run or written), or [] when it may. */
export function formalRefusals(args: ReleaseArgs, head: TreeState, resultsDir: string): string[] {
  const out: string[] = [];
  if (head.dirty) out.push(`the tree has changes outside the untracked formal outputs: ${head.changes.join(', ')}`);
  for (const [flag, path] of [['--harness', args.harness], ['--perf', args.perf]] as const) {
    if (!path) out.push(`${flag}=<file> is required: the formal inputs are the files the M-001 sequence wrote in ${rel(resultsDir)}/`);
    else if (resolve(path, '..') !== resolve(resultsDir)) out.push(`${flag} must name a formal file in ${rel(resultsDir)}/, got ${rel(path)}`);
  }
  return out;
}

export type ReleaseDeps = {
  /** The tree the release judges (default: this repository's). */
  git?: () => TreeState;
  /** The formal results and reports directories (default evals/results/, evals/reports/). */
  resultsDir?: string;
  reportsDir?: string;
  dataset?: Pick<Dataset, 'cases'>;
  /** Runs one suite and writes its reports and run records (default test-suites.ts runSuite). */
  runSuite?: (suite: 'integration' | 'e2e', outDir: string, opts: { evm?: boolean; env?: NodeJS.ProcessEnv }) => Promise<unknown>;
  /** The environment the spawned suites get. */
  childEnv?: NodeJS.ProcessEnv;
};

export async function main(argv: string[], io: Pick<Console, 'log' | 'error'> = console, deps: ReleaseDeps = {}): Promise<0 | 1 | 2> {
  let args: ReleaseArgs;
  try {
    args = parseReleaseArgs(argv);
  } catch (e) {
    io.error(`eval:release: ${(e as Error).message}`);
    return 2;
  }
  const startedAt = new Date();
  const t0 = performance.now();
  const git = deps.git ?? (() => treeState());
  const formalDir = deps.resultsDir ?? RESULTS_DIR;
  const resultsDir = args.dir ?? formalDir;
  const suiteDir = join(resultsDir, 'local');
  const head = git();
  if (args.out === 'formal') {
    const refusals = formalRefusals(args, head, formalDir);
    if (refusals.length > 0) {
      io.error(`eval:release --out=formal refused; nothing was run or written:\n${refusals.map((r) => `  - ${r}`).join('\n')}`);
      return 2;
    }
  }
  const dataset = deps.dataset ?? loadDataset();

  if (!args.reuse) {
    for (const suite of ['integration', 'e2e'] as const) await (deps.runSuite ?? runSuite)(suite, suiteDir, { evm: suite === 'integration' && args.milestone !== 'M1', env: deps.childEnv ?? process.env });
  }
  const suites = (Object.keys(SUITE_REPORTS) as SuiteReport[]).map((name) => loadSuite(name, join(suiteDir, SUITE_REPORTS[name]), head));

  let harnessFile = args.harness;
  if (!harnessFile) {
    io.log(`eval:release: no --harness given; running the harness (--milestone=${args.milestone}, local results)`);
    harnessFile = (await runHarness({ milestone: args.milestone, out: 'local', resultsDir })).resultsPath;
  }
  const harness = readJson<ResultsFile>(harnessFile);
  const perf = args.perf ? loadPerf(args.perf, head) : undefined;

  // The tree must still be the commit it was, clean but for formal outputs, once everything has run.
  const end = git();
  const changed = end.commit !== head.commit ? [`HEAD moved from ${head.shortSha} to ${end.shortSha} during the release`] : [];
  const release = buildRelease({
    dataset,
    milestone: args.milestone,
    harness: { results: harness.data, file: harnessFile, text: harness.text },
    suites,
    perf,
    readiness: readinessLines(checkReadiness(dataset as Dataset, REGISTRY, { milestone: args.milestone })),
    git: { ...head, dirty: head.dirty || end.dirty || changed.length > 0, changes: [...new Set([...head.changes, ...end.changes, ...changed])] },
    configDrift: configDriftOf(formalDir),
    startedAt,
    durationMs: Math.round(performance.now() - t0),
  });
  const resultsPath = writeResults(release, { out: args.out, dir: resultsDir, name: `eval-run-${RELEASE_TAG}-release-${release.provenance.git.shortSha}` });
  const reportPath = writeReport(
    reportPathFor(resultsPath, { out: args.out, reportsDir: deps.reportsDir ?? REPORTS_DIR, reportName: RELEASE_TAG }),
    renderReleaseReport(JSON.parse(readFileSync(resultsPath, 'utf8')) as ReleaseFile, resultsPath),
  );
  const t = release.totals;
  io.log(`eval:release (${args.milestone}) — ${release.summary.overall}`);
  io.log(`cases: ${t.gated} gated · ${t.passed} passed · ${t.failed} failed · ${t.skipped} skipped · ${t.missing} missing · ${t.deferred} deferred · ${t.outOfScope} out of scope · ${t.notGated} outside the gates`);
  for (const g of release.gates) io.log(`  ${g.pass ? 'PASS' : 'FAIL'}  ${g.id.padEnd(10)} ${g.display} (target ${g.target})`);
  for (const p of release.problems) io.log(`  problem: ${p}`);
  io.log(`results: ${relative(process.cwd(), resultsPath)}`);
  io.log(`report:  ${relative(process.cwd(), reportPath)}`);
  return release.summary.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The spawned suites get the caller's environment; the in-process harness gets a throwaway DATA_DIR.
  const childEnv = { ...process.env };
  const scratch = isolateDataDir();
  main(process.argv.slice(2), console, { childEnv })
    .then(
      (code) => {
        process.exitCode = code;
      },
      (e: unknown) => {
        console.error(`eval:release crashed (exit 2): ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        process.exitCode = 2;
      },
    )
    .finally(() => rmSync(scratch, { recursive: true, force: true }));
}
