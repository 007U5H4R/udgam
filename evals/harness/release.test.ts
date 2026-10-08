import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../../src/lib/verification/config';
import { loadDataset } from './dataset';
import {
  buildRelease,
  DEFERRED_TICKETS,
  evalIdsIn,
  formalRefusals,
  harnessEvidence,
  hasRangeSyntax,
  loadPerf,
  loadSuite,
  main,
  parseReleaseArgs,
  perfEvidence,
  playwrightEvidence,
  provenanceProblem,
  reconcile,
  renderReleaseReport,
  vitestEvidence,
  type Evidence,
  type ReleaseFile,
  type ReleaseInput,
} from './release';
import { evaluate, type ResultsFile } from './run';
import { parseSuiteArgs, sidecarPath, suiteCommands, type SuiteReport, type SuiteRunRecord } from './test-suites';
import { kase, WORLD, WORLD_GIT, WORLD_READY, worldHarness } from './testing/release-world';
import type { TreeState } from './tree-state';

// TSK-21.4 (TKT-21, TC-079, S7): the release evaluation merges the harness, the EVAL-titled Vitest and
// Playwright tests and the S4 perf result into one release result. Every dataset case gets exactly one
// status; a gated case with no evidence is `missing` and fails S7-release; M3 cases are `deferred to
// M-003` with their ticket. TASK-22 fix round 1: the release fails closed on stale, failed or altered
// inputs (every probe of the two reviews is a test below). All fixtures live in a temporary directory,
// never in evals/results/.
// No test TITLE here may name an EVAL ID: the release maps every EVAL-titled test to its case, so a
// title such as "EVAL-073 …" in this file would count as evidence for that case (fixture IDs stay in
// the bodies; table rows are titled by index).

const root = mkdtempSync(join(tmpdir(), 'udgam-release-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let k = 0;
const HEAD: TreeState = { ...WORLD_GIT, changes: [], formalOutputs: [] };
const OTHER = { ...WORLD_GIT, commit: 'b'.repeat(40), shortSha: 'bbbbbbb' };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const ev = (id: string, runner: Evidence['runner'], status: Evidence['status'] = 'passed', source = 'x.test.ts'): Evidence => ({ id, runner, source, title: `${id} test`, status });
const runs = (ms: number[]) => ms.map((x) => ({ finalState: 'verified', ms: x }));
const TEN = runs([1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100]);
const perfFile = (over: Record<string, unknown> = {}) => ({ gate: 'S4', case: 'EVAL-071', pass: true, runs: TEN, summary: { p50: 1650, p95: 2055, max: 2100, thresholdMs: 3000 }, provenance: { git: WORLD_GIT }, ...over });

const VITEST_OK = (title: string, status = 'passed') => ({ success: status !== 'failed', numFailedTestSuites: 0, testResults: [{ name: '/repo/a.int.test.ts', status: status === 'failed' ? 'failed' : 'passed', assertionResults: [{ ancestorTitles: [], title, status }] }] });
const PW_OK = (title: string, status = 'expected') => ({ suites: [{ title: 'c.spec.ts', file: 'c.spec.ts', specs: [{ title, file: 'c.spec.ts', tests: [{ projectName: 'phone', status, expectedStatus: 'passed' }] }] }], errors: [], stats: { expected: 1, unexpected: status === 'unexpected' ? 1 : 0, skipped: 0, flaky: 0 } });

/** Write a suite report and the run record a real run would leave beside it (or a doctored one). */
function writeSuite(dir: string, name: SuiteReport, report: unknown, rec: Partial<SuiteRunRecord> & { gitBoth?: TreeState } = {}): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const text = JSON.stringify(report);
  writeFileSync(file, text);
  const tree = rec.gitBoth ?? HEAD;
  const record: SuiteRunRecord = { schema: 'udgam-suite-run/1', report: name, command: `fixture ${name}`, exitCode: 0, refused: null, reportSha256: sha(text), git: { before: tree, after: tree }, startedAt: '2026-10-05T00:00:00.000Z', finishedAt: '2026-10-05T00:01:00.000Z', ...rec };
  delete (record as { gitBoth?: unknown }).gitBoth;
  writeFileSync(sidecarPath(file), JSON.stringify(record));
  return file;
}

describe('evalIdsIn: test titles → EVAL IDs (whole IDs only, no ranges)', () => {
  it.each([
    ['@eval EVAL-073 TC-078 the Kodagu demo', ['EVAL-073']],
    ['certificate gates (TSK-16.11, @eval EVAL-087, EVAL-089, TC-080)', ['EVAL-087', 'EVAL-089']],
    ['(EVAL-086) capture at 375 px', ['EVAL-086']],
    ['capture flow — EVAL-086 at 375 px', ['EVAL-086']],
    ['EVAL-064 and again EVAL-064', ['EVAL-064']],
    ['EVAL-0861 hand-added', []],
    ['XEVAL-086 hand-added', []],
    ['EVAL-086a', []],
    ['EVAL-086_x', []],
    ['TC-EVAL-086', []],
    ['EVAL-086 – 100 events', []],
    ['EVAL-086 - 100 events', []],
    ['certificate tamper mode (@eval EVAL-058..063, TC-065)', []],
    ['@eval EVAL-100–102 through the screens', []],
    ['EVAL-058–EVAL-060 on EVM', []],
    ['runProofSuite (EVAL-058–063, 066) and EVAL-064', ['EVAL-064']],
    ['TC-016 only', []],
  ])('title table row %#', (title, ids) => {
    expect(evalIdsIn(title)).toEqual(ids);
  });

  it('hasRangeSyntax flags the titles whose range-written IDs are not read', () => {
    expect(hasRangeSyntax('EVAL-058..063')).toBe(true);
    expect(hasRangeSyntax('EVAL-086 – 100 events')).toBe(true);
    expect(hasRangeSyntax('capture flow — EVAL-086 at 375 px')).toBe(false);
  });
});

describe('runner reports → evidence', () => {
  it('Vitest JSON: full names (describe › test), passed / failed / skipped, and a file that failed outside any test', () => {
    const r = vitestEvidence({
      success: false,
      numFailedTestSuites: 1,
      testResults: [
        {
          name: '/repo/src/lib/capture/pipeline.int.test.ts',
          status: 'failed',
          assertionResults: [
            { ancestorTitles: ['capture pipeline (EVAL-067)'], title: 'rolls back', status: 'passed' },
            { ancestorTitles: [], title: 'EVAL-053 tampered payload', status: 'failed', failureMessages: ['expected 400'] },
            { ancestorTitles: [], title: 'not an eval test', status: 'skipped' },
            { ancestorTitles: [], title: 'EVAL-081 limits', status: 'pending' },
          ],
        },
        { name: '/repo/src/lib/broken.int.test.ts', status: 'failed', message: 'Cannot find module x', assertionResults: [] },
      ],
    });
    expect(r.tests).toBe(4);
    expect(r.evidence.map((e) => [e.id, e.status])).toEqual([
      ['EVAL-067', 'passed'],
      ['EVAL-053', 'failed'],
      ['EVAL-081', 'skipped'],
    ]);
    expect(r.evidence[0]!.title).toBe('capture pipeline (EVAL-067) › rolls back');
    expect(r.evidence[1]!.detail).toBe('expected 400');
    expect(r.errors).toEqual(['Vitest reports success=false (1 failed suite(s)): the run failed', '/repo/src/lib/broken.int.test.ts: Cannot find module x']);
  });

  it('Vitest: success false (an unhandled error) is an error even when every test passed; a report without success fails closed', () => {
    expect(vitestEvidence({ ...VITEST_OK('EVAL-053 ok'), success: false }).errors).toEqual(['Vitest reports success=false (0 failed suite(s)): the run failed']);
    expect(vitestEvidence({ testResults: VITEST_OK('EVAL-053 ok').testResults }).errors[0]).toMatch(/success=undefined/);
    expect(vitestEvidence(VITEST_OK('EVAL-053 ok')).errors).toEqual([]);
  });

  it('Playwright JSON: nested describes, one piece of evidence per project, flaky = passed (noted), top-level errors kept', () => {
    const r = playwrightEvidence({
      suites: [
        {
          title: 'certificate.spec.ts',
          file: 'certificate.spec.ts',
          specs: [],
          suites: [
            {
              title: 'certificate gates (@eval EVAL-087, EVAL-089)',
              file: 'certificate.spec.ts',
              specs: [
                {
                  title: 'no horizontal scroll',
                  file: 'certificate.spec.ts',
                  tests: [
                    { projectName: 'phone', status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed' }] },
                    { projectName: 'desktop', status: 'unexpected', expectedStatus: 'passed', results: [{ status: 'failed', error: { message: 'scrollWidth 400 > 375' } }] },
                    { projectName: 'tablet', status: 'flaky', expectedStatus: 'passed', results: [{ status: 'failed' }, { status: 'passed' }] },
                    { projectName: 'phone-small', status: 'skipped', expectedStatus: 'skipped', results: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
      errors: [{ message: 'webServer exited early' }],
      stats: { unexpected: 1 },
    });
    expect(r.tests).toBe(4);
    const of = (id: string) => r.evidence.filter((e) => e.id === id).map((e) => e.status);
    expect(of('EVAL-087')).toEqual(['passed', 'failed', 'passed', 'skipped']);
    expect(of('EVAL-089')).toEqual(['passed', 'failed', 'passed', 'skipped']);
    const e087 = r.evidence.filter((e) => e.id === 'EVAL-087');
    expect(e087[1]!.detail).toBe('project desktop; scrollWidth 400 > 375');
    expect(e087[2]!.detail).toBe('project tablet; flaky: passed on retry');
    expect(r.evidence[0]!.title).toBe('certificate.spec.ts › certificate gates (@eval EVAL-087, EVAL-089) › no horizontal scroll');
    expect(r.errors).toEqual(['webServer exited early', 'Playwright reports 1 unexpected result(s): the run failed']);
  });

  it('Playwright: unexpected > 0 is an error whatever the EVAL tests say; no stats fails closed; test.fail() is not a pass', () => {
    const passing = PW_OK('@eval EVAL-064 not found');
    expect(playwrightEvidence({ ...passing, stats: { unexpected: 2 } }).errors).toEqual(['Playwright reports 2 unexpected result(s): the run failed']);
    expect(playwrightEvidence({ ...passing, stats: undefined }).errors).toEqual(['the report has no stats: it cannot show that the run finished']);
    expect(playwrightEvidence(passing).errors).toEqual([]);
    const markedFail = playwrightEvidence({ ...passing, suites: [{ title: 'c.spec.ts', specs: [{ title: '@eval EVAL-064 x', tests: [{ projectName: 'phone', status: 'expected', expectedStatus: 'failed' }] }] }] });
    expect(markedFail.evidence[0]).toMatchObject({ status: 'failed', detail: 'project phone; expected status failed (test.fail()): not evidence of a pass' });
  });

  it('a range-titled test maps to nothing and is listed', () => {
    const r = playwrightEvidence(PW_OK('certificate tamper mode (@eval EVAL-058..063, TC-065)'));
    expect(r.evidence).toEqual([]);
    expect(r.rangeTitles).toEqual(['c.spec.ts: c.spec.ts › certificate tamper mode (@eval EVAL-058..063, TC-065)']);
  });

  it('perf: S4 is recomputed from the raw runs and the code threshold, never the stored flag', () => {
    expect(perfEvidence(perfFile(), 'p.json')).toEqual({
      evidence: [{ id: 'EVAL-071', runner: 'perf', source: 'p.json', title: 'S4 certificate verification, cold loads', status: 'passed', detail: '10 cold loads, 10 verified, 10 verified under 3000 ms, max 2100 ms' }],
      problems: [],
    });
    const nine = perfEvidence(perfFile({ runs: TEN.slice(0, 9), pass: false }), 'p.json');
    expect(nine.evidence[0]).toMatchObject({ status: 'failed', detail: '9 cold loads, 9 verified, 9 verified under 3000 ms, max 2000 ms, fewer than the 10 runs S4 needs' });
    expect(nine.problems).toEqual([]);
    expect(perfEvidence(perfFile({ gate: 'S3', case: 'EVAL-070' }), 'p.json').evidence[0]).toMatchObject({ id: 'EVAL-071', status: 'failed' });
  });

  it('perf: a flipped pass flag, a slow or unverified load, or a doctored threshold is a problem naming the file', () => {
    const slow = perfEvidence(perfFile({ runs: [...TEN.slice(0, 9), { finalState: 'verified', ms: 3000 }] }), 'evals/results/baseline-perf-v1.json');
    expect(slow.evidence[0]!.status).toBe('failed');
    expect(slow.problems).toEqual(['evals/results/baseline-perf-v1.json: the file says pass=true, its runs give FAIL (≥ 10 loads, each verified and under 3000 ms)']);
    const unverified = perfEvidence(perfFile({ runs: [...TEN.slice(0, 9), { finalState: 'timeout', ms: 1000 }] }), 'p.json');
    expect(unverified.problems).toHaveLength(1);
    const lowered = perfEvidence(perfFile({ pass: false }), 'p.json');
    expect(lowered.problems).toEqual(['p.json: the file says pass=false, its runs give PASS (≥ 10 loads, each verified and under 3000 ms)']);
    expect(lowered.evidence[0]!.status).toBe('failed');
    expect(perfEvidence(perfFile({ summary: { p50: 1, p95: 1, max: 1, thresholdMs: 4000 } }), 'p.json').problems).toEqual(["p.json: the file's threshold 4000 ms is not S4's 3000 ms"]);
  });

  it('harness: one piece per case, and the two harness-integrity cases from its own integrity (clean tree, offline, exit code consistent)', () => {
    const ok = harnessEvidence(worldHarness({ undetected: ['EVAL-002'] }), 'h.json');
    expect(ok.filter((e) => e.runner === 'harness').map((e) => [e.id, e.status])).toEqual([
      ['EVAL-001', 'passed'],
      ['EVAL-002', 'failed'],
      ['EVAL-003', 'passed'],
      ['EVAL-004', 'passed'],
      ['EVAL-005', 'passed'],
      ['EVAL-058', 'passed'],
    ]);
    // S1 fails on the miss and the file exits 1: consistent, offline and clean, so both integrity cases pass.
    expect(ok.filter((e) => e.runner === 'harness-integrity').map((e) => [e.id, e.status])).toEqual([
      ['EVAL-092', 'passed'],
      ['EVAL-091', 'passed'],
    ]);
    const status = (h: ResultsFile, id: string) => harnessEvidence(h, 'h.json').find((e) => e.id === id)!.status;
    expect(status(worldHarness({ git: { ...WORLD_GIT, dirty: true } }), 'EVAL-091')).toBe('failed');
    expect(status(worldHarness({ networkCalls: ['https://x'] }), 'EVAL-091')).toBe('failed');
    const lying = worldHarness({ undetected: ['EVAL-001'] });
    lying.summary.exitCode = 0;
    expect(status(lying, 'EVAL-091')).toBe('failed');
  });

  it('provenanceProblem: no commit, another commit, or a dirty tree', () => {
    expect(provenanceProblem('the perf results p.json', undefined, HEAD)).toBe('the perf results p.json records no commit, so it cannot be tied to aaaaaaa (CF-12)');
    expect(provenanceProblem('the perf results p.json', OTHER, HEAD)).toBe('the perf results p.json is from bbbbbbb, the release runs at aaaaaaa: every number must come from this commit (CF-12)');
    expect(provenanceProblem('the perf results p.json', { ...WORLD_GIT, dirty: true }, HEAD)).toBe('the perf results p.json was produced on a dirty tree (CF-12)');
    expect(provenanceProblem('x', WORLD_GIT, HEAD)).toBeNull();
  });
});

describe('reconcile: one status per dataset case, never dropped', () => {
  const cases = [
    kase('EVAL-001', { suite: 'harness-verifier' }),
    kase('EVAL-002', { suite: 'harness-verifier' }),
    kase('EVAL-044'),
    kase('EVAL-053'),
    kase('EVAL-054'),
    kase('EVAL-067'),
    kase('EVAL-075', { suite: 'e2e' }),
    kase('EVAL-071', { suite: 'perf' }),
    kase('EVAL-051', { status: 'stretch' }),
    kase('EVAL-084', { suite: 'e2e', status: 'pending_decision' }),
    kase('EVAL-070', { suite: 'perf', milestone: 'M3' }),
    kase('EVAL-072', { suite: 'manual', milestone: 'M3' }),
    kase('EVAL-199', { suite: 'manual', milestone: 'M3' }),
    kase('EVAL-093', { milestone: 'M2' }),
    kase('EVAL-040', { status: 'retired' }),
    kase('EVAL-064', { suite: 'e2e' }),
  ];
  const evidence = [
    ev('EVAL-001', 'harness'),
    ev('EVAL-001', 'vitest'),
    ev('EVAL-002', 'vitest'), // a unit test is not the harness result
    ev('EVAL-044', 'vitest'),
    ev('EVAL-053', 'vitest'),
    ev('EVAL-053', 'vitest', 'failed'),
    ev('EVAL-054', 'vitest', 'skipped'),
    ev('EVAL-075', 'vitest'),
    ev('EVAL-071', 'vitest'), // the latency scorer's unit test is not a measurement
    ev('EVAL-051', 'vitest'),
    ev('EVAL-084', 'playwright'),
    ev('EVAL-093', 'vitest', 'failed'),
    ev('EVAL-500', 'playwright'),
    ev('EVAL-064', 'playwright'),
    ev('EVAL-064', 'playwright', 'skipped'),
  ];
  const { cases: out, problems } = reconcile({ cases }, evidence, 'M1');
  const of = (id: string) => out.find((c) => c.id === id)!;

  it('every dataset case appears exactly once', () => {
    expect(out.map((c) => c.id)).toEqual(cases.map((c) => c.id));
  });

  it.each([
    ['EVAL-001', 'passed', true],
    ['EVAL-002', 'missing', true],
    ['EVAL-044', 'passed', true],
    ['EVAL-053', 'failed', true],
    ['EVAL-054', 'skipped', true],
    ['EVAL-067', 'missing', true],
    ['EVAL-075', 'passed', true],
    ['EVAL-071', 'missing', true],
    ['EVAL-051', 'passed', true],
    ['EVAL-084', 'passed', false],
    ['EVAL-070', 'deferred', false],
    ['EVAL-072', 'deferred', false],
    ['EVAL-093', 'out_of_scope', false],
    ['EVAL-040', 'retired', false],
    ['EVAL-064', 'passed', true],
  ])('reconcile table row %#', (id, outcome, gated) => {
    expect(of(id)).toMatchObject({ outcome, gated });
  });

  it('notes say why: no test, not in the harness, no perf results, pending decision, skipped beside passing', () => {
    expect(of('EVAL-067').notes).toContain('no test names this case');
    expect(of('EVAL-002').notes).toContain('not in the harness results');
    expect(of('EVAL-071').notes[0]).toMatch(/no perf results/);
    expect(of('EVAL-084').notes).toContain('pending decision: reported, outside the gates');
    expect(of('EVAL-064').notes).toContain('1 skipped test(s) beside the passing ones');
  });

  it('flags evidence from a runner other than the dataset suite names (e2e case, vitest test)', () => {
    expect(of('EVAL-075')).toMatchObject({ outsideSuite: true, runners: ['vitest'] });
    expect(of('EVAL-075').notes[0]).toMatch(/evidence from vitest only; the dataset names the e2e suite/);
    expect(of('EVAL-044').outsideSuite).toBe(false);
  });

  it('M3 cases are deferred to M-003 with their ticket; an unmapped M3 case is a problem, still deferred', () => {
    expect(of('EVAL-070')).toMatchObject({ deferredTo: 'M-003 (TKT-29 · TASK-30)', notes: ['deferred to M-003 (TKT-29 · TASK-30)'] });
    expect(of('EVAL-199')).toMatchObject({ outcome: 'deferred', deferredTo: 'M-003 (ticket not recorded)' });
    expect(problems).toContain('EVAL-199 (M3) has no deferral ticket in DEFERRED_TICKETS');
  });

  it('a test naming an EVAL ID that is not in the dataset is a problem', () => {
    expect(problems).toContain('tests name EVAL IDs that are not in the dataset: EVAL-500');
  });

  it('with --milestone=M2 the M2 case is gated', () => {
    const m2 = reconcile({ cases }, evidence, 'M2').cases.find((c) => c.id === 'EVAL-093')!;
    expect(m2).toMatchObject({ outcome: 'failed', gated: true });
  });

  it('every M3 case in the repository dataset has a deferral ticket', () => {
    const m3 = loadDataset().cases.filter((c) => c.milestone === 'M3').map((c) => c.id);
    expect(m3.length).toBeGreaterThan(0);
    expect(m3.filter((id) => !DEFERRED_TICKETS[id])).toEqual([]);
  });
});

describe('buildRelease and the report', () => {
  const suiteSource = (name: 'integration' | 'e2e' | 'e2e-demo', errors: string[] = []) => ({ name, file: `${name}.json`, record: `${name}.run.json`, sha256: 'b'.repeat(64), command: 'x', exitCode: 0, tests: 1, evalTests: 1, errors });
  const perfOk = { evidence: [ev('EVAL-071', 'perf')], source: { name: 'perf' as const, file: 'perf.json', sha256: 'c'.repeat(64), command: null, exitCode: null, tests: 10, evalTests: 1, errors: [] } };
  const input = (over: Partial<ReleaseInput> & { harnessResults?: ResultsFile } = {}): ReleaseInput => {
    const h = over.harnessResults ?? worldHarness();
    return {
      dataset: WORLD,
      milestone: 'M1',
      harness: { results: h, file: join(root, 'h.json'), text: JSON.stringify(h) },
      suites: [{ source: suiteSource('integration'), evidence: [ev('EVAL-053', 'vitest'), ev('EVAL-064', 'playwright'), ev('EVAL-073', 'playwright')] }],
      perf: perfOk,
      readiness: ['eval:ready (milestone M1) — READY', 'WARNING: docs/exec/hr3-field-calibration.md is absent: … (decisions.md TP29) …'],
      git: HEAD,
      startedAt: new Date('2026-10-05T01:02:03.000Z'),
      durationMs: 42,
      ...over,
    };
  };
  const gate = (r: ReleaseFile, id: string) => r.gates.find((g) => g.id === id)!;

  it('PASS when every gated case passes, S4 comes from the perf file and nothing is missing', () => {
    const r = buildRelease(input());
    expect(r.problems).toEqual([]);
    expect(r.summary).toMatchObject({ overall: 'PASS', exitCode: 0, blockers: [] });
    expect(r.gates.map((g) => g.id)).toEqual(['S1', 'S1-floor', 'S2', 'S6-lib', 'S7', 'CF', 'S4', 'Cases', 'S7-release']);
    expect(gate(r, 'S4')).toMatchObject({ pass: true, source: 'x.test.ts', target: 'every load < 3 s' });
    expect(gate(r, 'Cases')).toMatchObject({ display: '6/6', pass: true });
    expect(r.totals).toEqual({ cases: 13, gated: 12, passed: 12, failed: 0, skipped: 0, missing: 0, deferred: 1, outOfScope: 0, notGated: 0 });
    // A harness run reading this file as its "previous formal run" needs these (run.ts readResultsFile).
    expect(r.provenance.config.hash).toBe(CONFIG_HASH);
    expect(r.provenance.timestampUtc).toBe('2026-10-05T01:02:03.000Z');
    expect(r.provenance.git).toEqual(WORLD_GIT);
    expect(r.cases.every((c) => typeof c.outcome === 'string')).toBe(true);
  });

  it('FAIL: no perf file → S4 not run and the S4 case missing; a stale harness commit and a suite error are problems', () => {
    const r = buildRelease(input({ perf: undefined, harnessResults: worldHarness({ git: OTHER }), suites: [{ source: suiteSource('e2e', ['webServer exited early']), evidence: [ev('EVAL-053', 'vitest'), ev('EVAL-064', 'playwright'), ev('EVAL-073', 'playwright')] }] }));
    expect(r.summary.overall).toBe('FAIL');
    expect(gate(r, 'S4')).toMatchObject({ pass: false, display: 'not run' });
    expect(r.cases.find((c) => c.id === 'EVAL-071')!.outcome).toBe('missing');
    expect(r.problems).toEqual([
      `harness: the harness results ${join(root, 'h.json')} is from bbbbbbb, the release runs at aaaaaaa: every number must come from this commit (CF-12)`,
      'e2e: webServer exited early',
    ]);
    expect(gate(r, 'S7-release').pass).toBe(false);
    expect(gate(r, 'Cases').detail).toBe('EVAL-071 missing');
  });

  it('FAIL: a harness file produced on a dirty tree', () => {
    const r = buildRelease(input({ harnessResults: worldHarness({ git: { ...WORLD_GIT, dirty: true } }) }));
    expect(r.problems).toContain(`harness: the harness results ${join(root, 'h.json')} was produced on a dirty tree (CF-12)`);
    expect(r.summary.overall).toBe('FAIL');
  });

  it('FAIL: the release tree itself is dirty', () => {
    const r = buildRelease(input({ git: { ...HEAD, dirty: true, changes: [' M src/a.ts'] } }));
    expect(r.problems).toEqual(['the release tree has changes outside the untracked formal outputs ( M src/a.ts): every number must come from the committed tree (CF-12)']);
    expect(r.provenance.git.dirty).toBe(true);
    expect(r.summary.overall).toBe('FAIL');
  });

  it('FAIL: a harness file with a flipped pass flag is named, and the recomputed gate decides', () => {
    const h = worldHarness({ undetected: ['EVAL-001'] });
    h.gates.find((g) => g.id === 'S1')!.pass = true;
    h.summary = { ...h.summary, overall: 'PASS', exitCode: 0 };
    const r = buildRelease(input({ harnessResults: h }));
    expect(gate(r, 'S1')).toMatchObject({ display: '75.0 % (3/4)', pass: false });
    expect(r.problems).toContain(`harness: ${join(root, 'h.json')} disagrees with its own cases: gate S1: the file says 75.0 % (3/4) PASS, its cases give 75.0 % (3/4) FAIL`);
    expect(r.summary.overall).toBe('FAIL');
  });

  it('a failed harness case is judged by the harness gates, not the Cases gate (here S1 fails on it)', () => {
    const r = buildRelease(input({ harnessResults: worldHarness({ undetected: ['EVAL-001'] }) }));
    expect(r.cases.find((c) => c.id === 'EVAL-001')!.outcome).toBe('failed');
    expect(gate(r, 'Cases')).toMatchObject({ display: '6/6', pass: true });
    expect(r.problems).toEqual([]);
    expect(r.summary.blockers[0]).toMatch(/^S1 /);
  });

  it('CF-13 is judged at release time from the drift passed in', () => {
    const r = buildRelease(input({ configDrift: { baselineHash: 'f'.repeat(64), currentHash: CONFIG_HASH, authorised: false } }));
    expect(gate(r, 'CF')).toMatchObject({ display: '1', pass: false });
  });

  it('the report prints the readiness lines (with the HR3 warning), the gates, the deferred table, every case, range titles and skipped evidence', () => {
    const r = buildRelease(
      input({
        suites: [
          { source: { ...suiteSource('integration'), rangeTitles: ['c.spec.ts: tamper (EVAL-058..063)'] }, evidence: [ev('EVAL-053', 'vitest'), ev('EVAL-053', 'vitest', 'skipped'), ev('EVAL-064', 'playwright'), ev('EVAL-073', 'playwright')] },
        ],
      }),
    );
    const md = renderReleaseReport(r, '/x/eval-run-v1-release-aaaaaaa.json');
    expect(md).toContain('# Udgam release evaluation — eval-run-v1-release-aaaaaaa');
    expect(md).toContain('**Overall: PASS**');
    expect(md).toContain('WARNING: docs/exec/hr3-field-calibration.md is absent');
    expect(md).toMatch(/\| S4 \| .* \| PASS \| `x\.test\.ts` \|/);
    expect(md).toContain('| EVAL-070 | title of EVAL-070 | perf | M-003 (TKT-29 · TASK-30) |');
    expect(md).toContain('## Titles with range-written IDs (not read)');
    expect(md).toContain('- c.spec.ts: tamper (EVAL-058..063)');
    expect(md).toContain('## Passed, with skipped tests');
    expect(md).toContain('| integration | `integration.json` | `integration.run.json` |');
    for (const c of WORLD.cases) expect(md).toContain(`| ${c.id} | ${c.suite} | ${c.milestone} |`);
  });
});

describe('suite reports and perf files must come from this commit, unaltered', () => {
  const dir = () => join(root, `s${++k}`);
  const problemsOf = (file: string) => loadSuite('integration', file, HEAD).source.errors;

  it('a report with a matching run record loads cleanly', () => {
    const f = writeSuite(dir(), 'integration', VITEST_OK('EVAL-053 ok'));
    const r = loadSuite('integration', f, HEAD);
    expect(r.source).toMatchObject({ errors: [], exitCode: 0, command: 'fixture integration', tests: 1, evalTests: 1 });
    expect(r.evidence.map((e) => e.id)).toEqual(['EVAL-053']);
  });

  it('a stale suite report (run at another commit) is a problem', () => {
    expect(problemsOf(writeSuite(dir(), 'integration', VITEST_OK('EVAL-053 ok'), { gitBoth: { ...OTHER, changes: [], formalOutputs: [] } }))).toEqual([
      'the integration run (tree before it) is from bbbbbbb, the release runs at aaaaaaa: every number must come from this commit (CF-12)',
      'the integration run (tree after it) is from bbbbbbb, the release runs at aaaaaaa: every number must come from this commit (CF-12)',
    ]);
  });

  it('a run on a dirty tree (before or after) is a problem, naming the changes', () => {
    const d = dir();
    const f = writeSuite(d, 'integration', VITEST_OK('EVAL-053 ok'), { git: { before: HEAD, after: { ...HEAD, dirty: true, changes: ['?? stray.txt'] } } });
    expect(problemsOf(f)).toEqual(['the integration run (tree after it) was produced on a dirty tree (CF-12): ?? stray.txt']);
  });

  it('a failed or refused run is a problem even when every EVAL test passed', () => {
    expect(problemsOf(writeSuite(dir(), 'integration', VITEST_OK('EVAL-053 ok'), { exitCode: 1 }))).toEqual(['the run exited 1: a failed run fails the release whatever its tests say']);
    expect(loadSuite('e2e', writeSuite(dir(), 'e2e', PW_OK('@eval EVAL-064 x'), { exitCode: 2, refused: 'port 3100 is already in use' }), HEAD).source.errors).toEqual(['the run was refused: port 3100 is already in use', 'the run exited 2: a failed run fails the release whatever its tests say']);
  });

  it('a report changed after its run (the hand-added test probe) is a problem', () => {
    const d = dir();
    const f = writeSuite(d, 'e2e', PW_OK('@eval EVAL-064 x'));
    const doctored = PW_OK('@eval EVAL-064 x');
    doctored.suites[0]!.specs.push({ title: 'EVAL-0861 hand-added', file: 'c.spec.ts', tests: [{ projectName: 'phone', status: 'expected', expectedStatus: 'passed' }] });
    writeFileSync(f, JSON.stringify(doctored));
    const r = loadSuite('e2e', f, HEAD);
    expect(r.source.errors).toHaveLength(1);
    expect(r.source.errors[0]).toMatch(/e2e\.json is not the report its run left .*: changed after the run$/);
    expect(r.evidence.map((e) => e.id)).toEqual(['EVAL-064']); // and EVAL-0861 never maps to EVAL-086
  });

  it('a report without a run record, or with a record of another suite, is a problem', () => {
    const d = dir();
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'integration.json'), JSON.stringify(VITEST_OK('EVAL-053 ok')));
    expect(problemsOf(join(d, 'integration.json'))[0]).toMatch(/^no readable run record at .*integration\.run\.json .*: the report cannot be tied to this commit$/);
    const f = writeSuite(dir(), 'integration', VITEST_OK('EVAL-053 ok'), { report: 'e2e' });
    expect(problemsOf(f)[0]).toMatch(/integration\.run\.json is not a integration run record$/);
  });

  it('a perf file from another commit, or produced on a dirty tree, is a problem naming it', () => {
    const d = dir();
    mkdirSync(d, { recursive: true });
    const write = (name: string, body: unknown) => {
      writeFileSync(join(d, name), JSON.stringify(body));
      return join(d, name);
    };
    expect(loadPerf(write('a.json', perfFile()), HEAD).source.errors).toEqual([]);
    expect(loadPerf(write('b.json', perfFile({ provenance: { git: OTHER } })), HEAD).source.errors).toEqual([`the perf results ${join(d, 'b.json')} is from bbbbbbb, the release runs at aaaaaaa: every number must come from this commit (CF-12)`]);
    expect(loadPerf(write('c.json', perfFile({ provenance: { git: { ...WORLD_GIT, dirty: true } } })), HEAD).source.errors).toEqual([`the perf results ${join(d, 'c.json')} was produced on a dirty tree (CF-12)`]);
    expect(loadPerf(write('d.json', perfFile({ provenance: undefined })), HEAD).source.errors).toEqual([`the perf results ${join(d, 'd.json')} records no commit, so it cannot be tied to aaaaaaa (CF-12)`]);
  });
});

describe('a harness run reads a release file as a previous formal run without an integrity problem', () => {
  it('provenance.config.hash, timestampUtc and cases[].outcome are where run.ts looks', async () => {
    const dir = join(root, 'compat');
    mkdirSync(dir, { recursive: true });
    const h = worldHarness();
    const release = buildRelease({ dataset: WORLD, milestone: 'M1', harness: { results: h, file: 'h.json', text: '{}' }, suites: [], readiness: [], git: HEAD, startedAt: new Date(), durationMs: 1 });
    writeFileSync(join(dir, 'eval-run-v1-release-aaaaaaa.json'), JSON.stringify(release));
    const run = await evaluate({ seed: 3, suites: ['harness-proof'], proofSuite: async () => [], resultsDir: dir });
    expect(run.totals.problems.filter((p) => p.includes('eval-run-v1-release'))).toEqual([]);
    expect(run.comparison.previous?.file).toBe('eval-run-v1-release-aaaaaaa.json');
  });
});

describe('eval:release CLI', () => {
  it('parses its flags and refuses bad ones, including --reuse with formal output', () => {
    expect(parseReleaseArgs(['--milestone=M1'])).toMatchObject({ milestone: 'M1', out: 'local', reuse: false });
    expect(parseReleaseArgs(['--reuse', '--harness=h.json', '--perf=p.json'])).toMatchObject({ reuse: true, out: 'local', harness: expect.stringMatching(/h\.json$/), perf: expect.stringMatching(/p\.json$/) });
    expect(() => parseReleaseArgs(['--reuse', '--out=formal', '--harness=h.json', '--perf=p.json'])).toThrow(/--reuse is for local runs/);
    expect(() => parseReleaseArgs(['--milestone=M7'])).toThrow(/--milestone/);
    expect(() => parseReleaseArgs(['--harness'])).toThrow(/--harness needs a value/);
    expect(() => parseReleaseArgs(['--dir=/tmp/x', '--out=formal'])).toThrow(/--dir is for local runs/);
    expect(() => parseReleaseArgs(['--bogus'])).toThrow(/unknown flag/);
  });

  describe('formalRefusals (nothing is run or written when any applies)', () => {
    const args = (o: { harness?: string; perf?: string; milestone?: 'M1' | 'M2' }) => ({ milestone: 'M1' as const, out: 'formal' as const, reuse: false, ...o });
    /** A results directory holding a formal harness file (worldHarness, with `over` merged into its provenance or scope) and a perf file. */
    function formalDir(o: { provenance?: Record<string, unknown>; scope?: Record<string, unknown>; text?: string } = {}) {
      const dir = join(root, `formal-${++k}`, 'results');
      mkdirSync(dir, { recursive: true });
      const h = worldHarness();
      const harness = join(dir, 'eval-run-0.1.0-aaaaaaa.json');
      writeFileSync(harness, o.text ?? JSON.stringify({ ...h, provenance: { ...h.provenance, ...o.provenance }, scope: { ...h.scope, ...o.scope } }));
      const perf = join(dir, 'baseline-perf-v1.json');
      writeFileSync(perf, JSON.stringify(perfFile()));
      return { dir, harness, perf };
    }

    it('accepts the formal M-001 inputs on a clean tree with READY readiness', () => {
      const f = formalDir();
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([]);
    });

    it('a dirty tree, a missing input, or an input outside the results directory', () => {
      const f = formalDir();
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), { ...HEAD, dirty: true, changes: [' M src/a.ts'] }, f.dir, WORLD_READY)).toEqual(['the tree has changes outside the untracked formal outputs:  M src/a.ts']);
      expect(formalRefusals(args({ perf: f.perf }), HEAD, f.dir, WORLD_READY)[0]).toMatch(/^--harness=<file> is required/);
      expect(formalRefusals(args({ harness: '/tmp/h.json', perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([`--harness must name a formal file in ${f.dir}/, got /tmp/h.json`]);
    });

    // Re-review R-2 / Q-5: readiness is a precondition, not a printout; the HR3 warning stays a warning.
    it('NOT READY readiness refuses, naming each failing check; READY with the HR3 warning does not', () => {
      const f = formalDir();
      const notReady = { ...WORLD_READY, ready: false, checks: [{ id: 'scenario-1', pass: false, detail: '1 active attack cases (need ≥ 10)' }, { id: 'registry', pass: true, detail: '12/12' }] };
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, notReady)).toEqual(['pnpm eval:ready is NOT READY for M1: scenario-1 (1 active attack cases (need ≥ 10))']);
      expect(WORLD_READY.warnings[0]).toMatch(/^WARNING: .*TP29/);
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([]);
    });

    // Re-review R-1 / Q-2: a formal release runs once per commit; an earlier attempt is never retried away.
    it.each([['eval-run-v1-release-aaaaaaa.json'], ['eval-run-v1-release-aaaaaaa-r2.json'], ['eval-run-v1-release-aaaaaaaaaa.json'], ['eval-run-v1-release-aaaa.json']])('row %#: an existing formal release file %s for this commit refuses', (name) => {
      const f = formalDir();
      writeFileSync(join(f.dir, name), '{}');
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([
        `a formal release of ${HEAD.shortSha} already exists (${name}): a formal release runs once per commit, and an earlier attempt is never rerun until it passes`,
      ]);
    });

    it('a formal release file of another commit does not refuse', () => {
      const f = formalDir();
      writeFileSync(join(f.dir, 'eval-run-v1-release-bbbbbbb.json'), '{}');
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([]);
    });

    // Re-review R-5 / Q-4: the harness input is a regular file made with the formal M-001 options.
    it('a symlink, a directory or a missing file refuses (harness and perf alike)', () => {
      const f = formalDir();
      const outside = join(root, `outside-${++k}.json`);
      writeFileSync(outside, readFileSync(f.harness));
      const link = join(f.dir, 'eval-run-link.json');
      symlinkSync(outside, link);
      expect(formalRefusals(args({ harness: link, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([`--harness must be a regular file, not a symlink: ${link}`]);
      const perfLink = join(f.dir, 'eval-run-perf-link.json');
      symlinkSync(f.perf, perfLink);
      expect(formalRefusals(args({ harness: f.harness, perf: perfLink }), HEAD, f.dir, WORLD_READY)).toEqual([`--perf must be a regular file, not a symlink: ${perfLink}`]);
      const sub = join(f.dir, 'eval-run-dir.json');
      mkdirSync(sub);
      expect(formalRefusals(args({ harness: sub, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([`--harness must be a regular file, not a directory: ${sub}`]);
      const missing = join(f.dir, 'eval-run-none.json');
      expect(formalRefusals(args({ harness: f.harness, perf: missing }), HEAD, f.dir, WORLD_READY)).toEqual([`--perf names no file: ${missing}`]);
    });

    it.each([
      ['the ledger-only config', { provenance: { config: { ...worldHarness().provenance.config, mode: 'ledger-only' } } }, 'config.mode is ledger-only, not full'],
      ['a chosen seed (--seed)', { provenance: { seed: 999, seedPolicy: 'chosen' } }, 'the seed 999 was chosen with --seed, not the harness default'],
      ['no recorded seed policy', { provenance: { seedPolicy: undefined } }, 'it records no seed policy, so the default seed cannot be shown'],
      ['the live provider', { provenance: { provider: 'live' } }, 'provider is live, not fixture'],
      ['one harness suite only', { provenance: { suites: ['harness-verifier'] } }, 'suites are harness-verifier, not harness-verifier, harness-proof'],
      ['the EVM ledger', { provenance: { ledger: 'evm' } }, 'ledger is evm, not hashchain'],
      ['milestone M2', { scope: { milestone: 'M2' } }, 'milestone is M2, not M1'],
    ])('row %#: a harness file made with %s refuses', (_why, over, reason) => {
      const f = formalDir(over);
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)).toEqual([`--harness is not the formal M-001 harness run (pnpm eval --baseline=v1): ${reason}`]);
    });

    it('a harness file that is not JSON refuses', () => {
      const f = formalDir({ text: '{not json' });
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf }), HEAD, f.dir, WORLD_READY)[0]).toMatch(/^--harness is not readable JSON:/);
    });

    it('a formal release is defined for M1 only', () => {
      const f = formalDir();
      expect(formalRefusals(args({ harness: f.harness, perf: f.perf, milestone: 'M2' }), HEAD, f.dir, WORLD_READY)).toEqual(['--out=formal is defined for --milestone=M1 (the M-001 gate) only; got M2']);
    });
  });

  it('--out=formal on a dirty tree, or with --reuse, exits 2 and runs and writes nothing', async () => {
    const dir = join(root, 'refuse');
    mkdirSync(join(dir, 'results'), { recursive: true });
    let ran = 0;
    const errors: string[] = [];
    const io = { log: () => {}, error: (s: string) => errors.push(s) };
    const deps = { git: () => ({ ...HEAD, dirty: true, changes: ['?? notes.txt'] }), resultsDir: join(dir, 'results'), reportsDir: join(dir, 'reports'), dataset: WORLD, runSuite: async () => void ran++ };
    expect(await main(['--out=formal', `--harness=${join(dir, 'results', 'h.json')}`, `--perf=${join(dir, 'results', 'p.json')}`], io, deps)).toBe(2);
    expect(errors.join('\n')).toMatch(/refused; nothing was run or written:\n {2}- the tree has changes outside the untracked formal outputs: \?\? notes\.txt/);
    expect(await main(['--out=formal', '--reuse'], io, { ...deps, git: () => HEAD })).toBe(2);
    expect(errors.join('\n')).toMatch(/--reuse is for local runs/);
    expect(ran).toBe(0);
    expect(readdirSync(join(dir, 'results'))).toEqual([]);
    expect(existsSync(join(dir, 'reports'))).toBe(false);
  });

  it('--reuse --dir: merges fixture reports and their run records into a local release, and the report re-renders byte-identically from it', async () => {
    const dir = join(root, 'cli');
    const local = join(dir, 'local');
    const h = worldHarness();
    mkdirSync(local, { recursive: true });
    writeFileSync(join(dir, 'harness.json'), JSON.stringify(h));
    writeSuite(local, 'integration', VITEST_OK('EVAL-053 tampered'));
    writeSuite(local, 'e2e', PW_OK('@eval EVAL-064 not found'));
    // e2e-demo.json is absent: an error, never "no tests"
    writeFileSync(join(dir, 'perf.json'), JSON.stringify(perfFile()));
    const lines: string[] = [];
    const code = await main(['--milestone=M1', '--reuse', `--dir=${dir}`, `--harness=${join(dir, 'harness.json')}`, `--perf=${join(dir, 'perf.json')}`], { log: (s) => lines.push(s), error: (s) => lines.push(s) }, { git: () => HEAD, dataset: WORLD });
    expect(code).toBe(1);
    const written = readdirSync(local).filter((f) => f.startsWith('eval-'));
    expect(written).toEqual(['eval-report-v1.md', 'eval-run-v1-release-aaaaaaa.json']);
    const resultsPath = join(local, 'eval-run-v1-release-aaaaaaa.json');
    const r = JSON.parse(readFileSync(resultsPath, 'utf8')) as ReleaseFile;
    expect(r.cases.find((c) => c.id === 'EVAL-053')!.runners).toEqual(['vitest']);
    expect(r.cases.find((c) => c.id === 'EVAL-064')!.runners).toEqual(['playwright']);
    expect(r.cases.find((c) => c.id === 'EVAL-071')!.runners).toContain('perf');
    expect(r.cases.find((c) => c.id === 'EVAL-073')!.outcome).toBe('missing');
    expect(r.problems.filter((p) => p.startsWith('e2e-demo: '))).toHaveLength(2); // no run record, no report
    expect(r.problems.filter((p) => !p.startsWith('e2e-demo: '))).toEqual([]);
    expect(r.cases).toHaveLength(WORLD.cases.length);
    expect(readFileSync(join(local, 'eval-report-v1.md'), 'utf8')).toBe(renderReleaseReport(r, resultsPath));
    expect(lines[0]).toBe('eval:release (M1) — FAIL');
  });
});

describe('eval:release readiness follows the harness run\'s ledger (Stage 9 CR-202)', () => {
  it.each([
    ['an EVM-ledger harness file', 'evm', 'evm'],
    ['a hash-chain harness file', 'hashchain', 'hashchain'],
    ['a harness file that records no ledger', undefined, 'hashchain'],
  ])('%s: readiness is judged for ledger %s', async (_why, recorded, expected) => {
    const dir = join(root, `ledger-${String(recorded)}`);
    const local = join(dir, 'local');
    mkdirSync(local, { recursive: true });
    const h = worldHarness();
    writeFileSync(join(dir, 'harness.json'), JSON.stringify({ ...h, provenance: { ...h.provenance, ledger: recorded } }));
    const seen: unknown[][] = [];
    const readiness = (...a: unknown[]) => {
      seen.push(a.slice(1));
      return { ...WORLD_READY, milestone: 'M2' as const, ledger: expected as 'evm' | 'hashchain' };
    };
    await main(['--milestone=M2', '--reuse', `--dir=${dir}`, `--harness=${join(dir, 'harness.json')}`], { log: () => {}, error: () => {} }, { git: () => HEAD, dataset: WORLD, readiness });
    expect(seen).toEqual([['M2', expected]]);
  });
});

describe('eval:integration and eval:e2e commands', () => {
  it('integration: Vitest unit + integration projects filtered to EVAL-titled tests, JSON report in the out dir; --evm adds the evm project', () => {
    const [c] = suiteCommands('integration', '/out');
    expect(c!.args).toEqual(['run', '--project', 'unit', '--project', 'integration', '-t', 'EVAL-[0-9]{3}', '--reporter=default', '--reporter=json', '--outputFile.json=/out/integration.json']);
    expect(suiteCommands('integration', '/out', { evm: true })[0]!.args).toContain('evm');
  });

  it('e2e: the EVAL-titled Playwright tests, then the demo config, each with its own JSON report', () => {
    const [a, b] = suiteCommands('e2e', '/out');
    expect(a).toMatchObject({ report: 'e2e', args: ['test', '--grep', 'EVAL-[0-9]{3}', '--reporter=list,json'], env: { PLAYWRIGHT_JSON_OUTPUT_NAME: '/out/e2e.json' } });
    expect(b).toMatchObject({ report: 'e2e-demo', args: ['test', '-c', 'playwright.demo.config.ts', '--grep', 'EVAL-[0-9]{3}', '--reporter=list,json'], env: { PLAYWRIGHT_JSON_OUTPUT_NAME: '/out/e2e-demo.json' } });
  });

  it('parses its arguments', () => {
    expect(parseSuiteArgs(['integration', '--out-dir=/tmp/o', '--evm'])).toEqual({ suite: 'integration', outDir: '/tmp/o', evm: true });
    expect(parseSuiteArgs(['e2e']).outDir).toMatch(/evals\/results\/local$/);
    expect(() => parseSuiteArgs(['perf'])).toThrow(/usage/);
    expect(() => parseSuiteArgs(['e2e', '--evm'])).toThrow(/unknown flag --evm/);
  });
});
