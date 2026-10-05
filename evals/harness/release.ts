import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from '../../src/lib/verification/registry';
import { loadDataset, type Dataset, type EvalCase, type Suite } from './dataset';
import { gitFacts, REPO_ROOT, type Provenance } from './provenance';
import { checkReadiness, readinessLines } from './readiness';
import { REPORTS_DIR, RESULTS_DIR, reportPathFor, writeReport, writeResults, type Out } from './results';
import { DEFAULT_MILESTONE, isolateDataDir, MILESTONES, runHarness, type Gate, type Milestone, type ResultsFile } from './run';
import { runSuite, SUITE_REPORTS, type SuiteReport, type SuiteRun } from './test-suites';

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
// Exit codes: 0 every release gate passes; 1 a gate failed; 2 bad usage or a crash.

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
export type SuiteSource = { name: SuiteReport | 'harness' | 'perf'; file: string | null; sha256: string | null; command: string | null; exitCode: number | null; tests: number; evalTests: number; errors: string[] };
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

/**
 * Every EVAL ID a test title names: single IDs and ranges written `EVAL-058..063`, `EVAL-100–102` or
 * `EVAL-058–EVAL-063` (en or em dash; a plain hyphen is never read as a range).
 */
export function evalIdsIn(title: string): string[] {
  const ids = new Set<string>();
  for (const m of title.matchAll(/EVAL-(\d{3})(?:\s*(?:\.\.|–|—)\s*(?:EVAL-)?(\d{3}))?/g)) {
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    const end = b > a && b - a <= 50 ? b : a;
    for (let n = a; n <= end; n++) ids.add(`EVAL-${String(n).padStart(3, '0')}`);
  }
  return [...ids];
}

// ── Runner reports → evidence ─────────────────────────────────────────────────────────────────────

type VitestAssertion = { ancestorTitles?: string[]; title?: string; fullName?: string; status?: string; failureMessages?: string[] };
type VitestReport = { testResults?: { name?: string; status?: string; message?: string; assertionResults?: VitestAssertion[] }[] };

const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);
const rel = (p: string) => (relative(REPO_ROOT, p).startsWith('..') ? p : relative(REPO_ROOT, p));

/** Vitest's JSON report → evidence for every test whose full name names an EVAL ID; a file that failed to run is an error. */
export function vitestEvidence(report: VitestReport): { evidence: Evidence[]; tests: number; errors: string[] } {
  const evidence: Evidence[] = [];
  const errors: string[] = [];
  let tests = 0;
  for (const file of report.testResults ?? []) {
    const source = rel(file.name ?? 'unknown file');
    const results = file.assertionResults ?? [];
    tests += results.length;
    if (file.status === 'failed' && results.every((a) => a.status !== 'failed')) errors.push(`${source}: ${short(file.message || 'the file failed outside any test')}`);
    for (const a of results) {
      const title = [...(a.ancestorTitles ?? []), a.title ?? ''].join(' › ');
      const status: EvidenceStatus = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      for (const id of evalIdsIn(title)) evidence.push({ id, runner: 'vitest', source, title, status, ...(status === 'failed' ? { detail: short((a.failureMessages ?? []).join(' | ')) } : {}) });
    }
  }
  return { evidence, tests, errors };
}

type PwResult = { status?: string; error?: { message?: string } };
type PwTest = { projectName?: string; status?: string; results?: PwResult[] };
type PwSpec = { title?: string; file?: string; tests?: PwTest[] };
type PwSuite = { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] };
type PwReport = { suites?: PwSuite[]; errors?: { message?: string }[] };

/** Playwright's JSON report → one piece of evidence per EVAL-titled test and project (flaky counts as passed, noted). */
export function playwrightEvidence(report: PwReport): { evidence: Evidence[]; tests: number; errors: string[] } {
  const evidence: Evidence[] = [];
  let tests = 0;
  const walk = (suite: PwSuite, titles: string[]) => {
    const path = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      const title = [...path, spec.title ?? ''].join(' › ');
      for (const t of spec.tests ?? []) {
        tests++;
        const status: EvidenceStatus = t.status === 'expected' || t.status === 'flaky' ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed';
        const err = (t.results ?? []).map((r) => r.error?.message).find(Boolean);
        const detail = [t.projectName ? `project ${t.projectName}` : null, t.status === 'flaky' ? 'flaky: passed on retry' : null, status === 'failed' && err ? short(err) : null].filter(Boolean).join('; ');
        for (const id of evalIdsIn(title)) evidence.push({ id, runner: 'playwright', source: spec.file ?? suite.file ?? 'unknown spec', title, status, ...(detail ? { detail } : {}) });
      }
    }
    for (const s of suite.suites ?? []) walk(s, path);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return { evidence, tests, errors: (report.errors ?? []).map((e) => short(e.message ?? 'Playwright reported an error')) };
}

type PerfFile = { gate?: string; case?: string; pass?: boolean; runs?: { finalState?: string }[]; summary?: { max?: number; p50?: number; p95?: number; thresholdMs?: number } | null };
export const S4_MIN_RUNS = 10;

/** A perf results file (pnpm eval:perf --only=s4) → EVAL-071's evidence: pass needs ≥ 10 runs, every one under 3 s and verified. */
export function perfEvidence(perf: PerfFile, source: string): Evidence[] {
  if (perf.case !== 'EVAL-071' || perf.gate !== 'S4') return [{ id: 'EVAL-071', runner: 'perf', source, title: 'S4 perf results', status: 'failed', detail: `${source} is not an S4 / EVAL-071 perf result` }];
  const runs = perf.runs?.length ?? 0;
  const verified = (perf.runs ?? []).filter((r) => r.finalState === 'verified').length;
  const s = perf.summary;
  const pass = perf.pass === true && runs >= S4_MIN_RUNS;
  const detail = `${runs} cold loads, ${verified} verified${s ? `, p50 ${s.p50} ms, p95 ${s.p95} ms, max ${s.max} ms (threshold ${s.thresholdMs} ms)` : ''}${runs < S4_MIN_RUNS ? `; fewer than the ${S4_MIN_RUNS} runs S4 needs` : ''}`;
  return [{ id: 'EVAL-071', runner: 'perf', source, title: 'S4 certificate verification, cold loads', status: pass ? 'passed' : 'failed', detail }];
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
    const all = byId.get(c.id) ?? [];
    const strict = STRICT[c.suite];
    const ev = all;
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
  git: Provenance['git'];
  startedAt: Date;
  durationMs: number;
};

/** Merge the harness, the suite reports and the perf result into the release result (pure). */
export function buildRelease(i: ReleaseInput): ReleaseFile {
  const h = i.harness.results;
  const harnessSource: SuiteSource = { name: 'harness', file: rel(i.harness.file), sha256: sha256(i.harness.text), command: null, exitCode: h.summary.exitCode, tests: h.cases.length, evalTests: h.cases.length, errors: [] };
  const evidence = [...harnessEvidence(h, harnessSource.file!), ...i.suites.flatMap((s) => s.evidence), ...(i.perf?.evidence ?? [])];
  const { cases, problems } = reconcile(i.dataset, evidence, i.milestone);
  const sources = [harnessSource, ...i.suites.map((s) => s.source), ...(i.perf ? [i.perf.source] : [])];
  for (const s of sources) for (const e of s.errors) problems.push(`${s.name}: ${e}`);
  if (h.provenance.git.commit !== i.git.commit) problems.push(`the harness results are from ${h.provenance.git.shortSha}, the release runs at ${i.git.shortSha}: every number must come from this commit (CF-12)`);
  if (h.scope && h.scope.milestone !== i.milestone) problems.push(`the harness ran with --milestone=${h.scope.milestone}, the release with ${i.milestone}`);
  const totals = totalsOf(cases);

  const harnessGates = h.gates.map((g) => ({ ...g, source: harnessSource.file! }));
  const perf = cases.find((c) => c.id === 'EVAL-071');
  const perfEv = perf?.evidence.find((e) => e.runner === 'perf');
  const s4: Gate & { source: string } = perfEv
    ? { id: 'S4', name: 'Certificate verifies in the browser (10 cold loads)', value: perfEv.status === 'passed', display: perfEv.status === 'passed' ? 'Yes' : 'No', target: 'every load < 3 s', pass: perfEv.status === 'passed', detail: perfEv.detail ?? '', source: perfEv.source }
    : { id: 'S4', name: 'Certificate verifies in the browser (10 cold loads)', value: null, display: 'not run', target: 'every load < 3 s', pass: false, detail: 'no perf results file was given (--perf)', source: '—' };
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
  const s7: Gate & { source: string } = {
    id: 'S7-release',
    name: 'Every case reconciled (nothing missing, skipped or unexplained)',
    value: totals.missing === 0 && totals.skipped === 0 && problems.length === 0,
    display: totals.missing === 0 && totals.skipped === 0 && problems.length === 0 ? 'Yes' : 'No',
    target: 'Yes',
    pass: totals.missing === 0 && totals.skipped === 0 && problems.length === 0,
    detail: [`${totals.missing} missing`, `${totals.skipped} skipped`, ...problems].join('; '),
    source: 'cases',
  };
  const gates = [...harnessGates, s4, releaseCases, s7];
  const pass = gates.every((g) => g.pass);
  return {
    schema: RELEASE_SCHEMA,
    provenance: {
      ...h.provenance,
      git: i.git,
      timestampUtc: i.startedAt.toISOString(),
      durationMs: i.durationMs,
      release: { tag: RELEASE_TAG, milestone: i.milestone, harnessFile: harnessSource.file!, harnessCommit: h.provenance.git.commit, sources },
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
  out.push('## Sources', '', '| Source | File | SHA-256 | Command | Exit | Tests (EVAL-titled) |', '|---|---|---|---|---|---|');
  for (const s of p.release.sources) out.push(`| ${s.name} | ${s.file ? `\`${s.file}\`` : '—'} | ${s.sha256 ? `\`${s.sha256.slice(0, 12)}…\`` : '—'} | ${s.command ? `\`${cell(s.command)}\`` : '—'} | ${s.exitCode ?? '—'} | ${s.tests} (${s.evalTests}) |`);
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
  return o;
}

function readJson<T>(file: string): { data: T; text: string } {
  const text = readFileSync(file, 'utf8');
  return { data: JSON.parse(text) as T, text };
}

/** Read one suite's JSON report into evidence; an absent or unreadable report is an error, never "no tests". */
export function loadSuite(name: SuiteReport, file: string, run?: SuiteRun): { source: SuiteSource; evidence: Evidence[] } {
  const source: SuiteSource = { name, file: rel(file), sha256: null, command: run?.command ?? null, exitCode: run?.exitCode ?? null, tests: 0, evalTests: 0, errors: [] };
  let parsed: { data: unknown; text: string };
  try {
    parsed = readJson(file);
  } catch (e) {
    source.errors.push(`no readable report at ${rel(file)} (${(e as Error).message.split('\n')[0]})`);
    return { source, evidence: [] };
  }
  source.sha256 = sha256(parsed.text);
  const r = name === 'integration' ? vitestEvidence(parsed.data as VitestReport) : playwrightEvidence(parsed.data as PwReport);
  source.tests = r.tests;
  source.evalTests = new Set(r.evidence.map((e) => `${e.source} ${e.title} ${e.detail ?? ''}`)).size;
  source.errors.push(...r.errors);
  if (r.tests === 0) source.errors.push('the report holds no tests');
  return { source, evidence: r.evidence };
}

export async function main(argv: string[], io: Pick<Console, 'log' | 'error'> = console, childEnv: NodeJS.ProcessEnv = process.env): Promise<0 | 1 | 2> {
  let args: ReleaseArgs;
  try {
    args = parseReleaseArgs(argv);
  } catch (e) {
    io.error(`eval:release: ${(e as Error).message}`);
    return 2;
  }
  const startedAt = new Date();
  const t0 = performance.now();
  const resultsDir = args.dir ?? RESULTS_DIR;
  const suiteDir = join(resultsDir, 'local');
  const dataset = loadDataset();

  const runs = new Map<SuiteReport, SuiteRun>();
  if (!args.reuse) {
    for (const suite of ['integration', 'e2e'] as const) for (const r of runSuite(suite, suiteDir, { evm: suite === 'integration' && args.milestone !== 'M1', env: childEnv })) runs.set(r.report, r);
  }
  const suites = (Object.keys(SUITE_REPORTS) as SuiteReport[]).map((name) => loadSuite(name, join(suiteDir, SUITE_REPORTS[name]), runs.get(name)));

  let harnessFile = args.harness;
  if (!harnessFile) {
    io.log(`eval:release: no --harness given; running the harness (--milestone=${args.milestone}, local results)`);
    harnessFile = (await runHarness({ milestone: args.milestone, out: 'local', resultsDir })).resultsPath;
  }
  const harness = readJson<ResultsFile>(harnessFile);
  let perf: ReleaseInput['perf'];
  if (args.perf) {
    const p = readJson<PerfFile>(args.perf);
    perf = { evidence: perfEvidence(p.data, rel(args.perf)), source: { name: 'perf', file: rel(args.perf), sha256: sha256(p.text), command: null, exitCode: null, tests: p.data.runs?.length ?? 0, evalTests: 1, errors: [] } };
  }

  const release = buildRelease({
    dataset,
    milestone: args.milestone,
    harness: { results: harness.data, file: harnessFile, text: harness.text },
    suites,
    perf,
    readiness: readinessLines(checkReadiness(dataset, REGISTRY, { milestone: args.milestone })),
    git: gitFacts(),
    startedAt,
    durationMs: Math.round(performance.now() - t0),
  });
  const resultsPath = writeResults(release, { out: args.out, dir: resultsDir, name: `eval-run-${RELEASE_TAG}-release-${release.provenance.git.shortSha}` });
  const reportPath = writeReport(
    reportPathFor(resultsPath, { out: args.out, reportsDir: REPORTS_DIR, reportName: RELEASE_TAG }),
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
  main(process.argv.slice(2), console, childEnv)
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
