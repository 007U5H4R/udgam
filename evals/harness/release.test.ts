import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../../src/lib/verification/config';
import type { CaseResult } from '../scorers/case-assertions';
import { loadDataset, type EvalCase } from './dataset';
import { gitFacts } from './provenance';
import {
  buildRelease,
  DEFERRED_TICKETS,
  evalIdsIn,
  harnessEvidence,
  main,
  parseReleaseArgs,
  perfEvidence,
  playwrightEvidence,
  reconcile,
  renderReleaseReport,
  vitestEvidence,
  type Evidence,
  type ReleaseFile,
  type ReleaseInput,
} from './release';
import { evaluate, type ResultsFile } from './run';
import { parseSuiteArgs, suiteCommands } from './test-suites';

// TSK-21.4 (TKT-21, TC-079, S7): the release evaluation merges the harness, the EVAL-titled Vitest and
// Playwright tests and the S4 perf result into one release result. Every dataset case gets exactly one
// status; a gated case with no evidence is `missing` and fails S7-release; M3 cases are `deferred to
// M-003` with their ticket. All fixtures live in a temporary directory, never in evals/results/.
// No test TITLE here may name an EVAL ID: the release maps every EVAL-titled test to its case, so a
// title such as "EVAL-073 …" in this file would count as evidence for that case (fixture IDs stay in
// the bodies; table rows are titled by index).

const root = mkdtempSync(join(tmpdir(), 'udgam-release-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const GIT = { commit: 'a'.repeat(40), shortSha: 'aaaaaaa', branch: 'build/stage7', dirty: false };

const kase = (id: string, over: Partial<EvalCase> = {}): EvalCase =>
  ({ id, title: `title of ${id}`, feature: 'x', category: 'functional', suite: 'integration', gates: [], priority: 'high', automated: true, milestone: 'M1', status: 'active', input: {}, expected: {}, failure_conditions: [], ...over }) as EvalCase;
const ev = (id: string, runner: Evidence['runner'], status: Evidence['status'] = 'passed', source = 'x.test.ts'): Evidence => ({ id, runner, source, title: `${id} test`, status });

/** A minimal harness results file: the fields release.ts reads. */
function harnessFile(over: { cases?: Partial<CaseResult>[]; dirty?: boolean; commit?: string; gatesPass?: boolean; skipped?: number; networkCalls?: string[] } = {}): ResultsFile {
  const pass = over.gatesPass ?? true;
  const gates = ['S1', 'S1-floor', 'S2', 'S6-lib', 'S7', 'CF'].map((id) => ({ id, name: id, value: pass, display: pass ? 'Yes' : 'No', target: 'Yes', pass, detail: '' }));
  return {
    schema: 'udgam-eval-results/1',
    provenance: {
      appVersion: '0.1.0',
      git: { ...GIT, commit: over.commit ?? GIT.commit, dirty: over.dirty ?? false },
      config: { version: 'cfg-1', hash: CONFIG_HASH, mode: 'full', enabledChecks: [], object: {} },
      dataset: { path: 'evals/eval-dataset.json', version: '0.8.0', sha256: 'd'.repeat(64) },
      timestampUtc: '2026-10-05T00:00:00.000Z',
    },
    summary: { overall: pass ? 'PASS' : 'FAIL', exitCode: pass ? 0 : 1, recommendation: '', blockers: [] },
    totals: { ok: pass, active: 2, passed: 2, failed: 0, notYetImplemented: 0, errored: 0, skipped: over.skipped ?? 0, problems: [] },
    gates,
    criticalConditions: [],
    scope: { milestone: 'M1', outOfScope: [] },
    cases: (over.cases ?? [{ id: 'EVAL-001', suite: 'harness-verifier', outcome: 'passed', notes: [], error: null }]) as CaseResult[],
    runtime: { networkCalls: over.networkCalls ?? [], executionOrder: [] },
  } as unknown as ResultsFile;
}

describe('evalIdsIn: test titles → EVAL IDs', () => {
  it.each([
    ['@eval EVAL-073 TC-078 the Kodagu demo', ['EVAL-073']],
    ['certificate gates (TSK-16.11, @eval EVAL-087, EVAL-089, TC-080)', ['EVAL-087', 'EVAL-089']],
    ['certificate tamper mode (@eval EVAL-058..063, TC-065)', ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063']],
    ['@eval EVAL-100–102 through the screens', ['EVAL-100', 'EVAL-101', 'EVAL-102']],
    ['EVAL-058–EVAL-060 on EVM', ['EVAL-058', 'EVAL-059', 'EVAL-060']],
    ['EVAL-100-102 is not a range', ['EVAL-100']],
    ['EVAL-063..058 is reversed, so only the first', ['EVAL-063']],
    ['EVAL-064 and again EVAL-064', ['EVAL-064']],
    ['TC-016 only', []],
  ])('title table row %#', (title, ids) => {
    expect(evalIdsIn(title)).toEqual(ids);
  });
});

describe('runner reports → evidence', () => {
  it('Vitest JSON: full names (describe › test), passed / failed / skipped, and a file that failed outside any test', () => {
    const r = vitestEvidence({
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
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/broken\.int\.test\.ts: Cannot find module x/);
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
                    { projectName: 'phone', status: 'expected', results: [{ status: 'passed' }] },
                    { projectName: 'desktop', status: 'unexpected', results: [{ status: 'failed', error: { message: 'scrollWidth 400 > 375' } }] },
                    { projectName: 'tablet', status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] },
                    { projectName: 'phone-small', status: 'skipped', results: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
      errors: [{ message: 'webServer exited early' }],
    });
    expect(r.tests).toBe(4);
    const of = (id: string) => r.evidence.filter((e) => e.id === id).map((e) => e.status);
    expect(of('EVAL-087')).toEqual(['passed', 'failed', 'passed', 'skipped']);
    expect(of('EVAL-089')).toEqual(['passed', 'failed', 'passed', 'skipped']);
    const e087 = r.evidence.filter((e) => e.id === 'EVAL-087');
    expect(e087[1]!.detail).toBe('project desktop; scrollWidth 400 > 375');
    expect(e087[2]!.detail).toBe('project tablet; flaky: passed on retry');
    expect(r.evidence[0]!.title).toBe('certificate.spec.ts › certificate gates (@eval EVAL-087, EVAL-089) › no horizontal scroll');
    expect(r.errors).toEqual(['webServer exited early']);
  });

  it('perf: the S4 case passes only with ≥ 10 runs that passed the S4 gate', () => {
    const runs = (n: number) => Array.from({ length: n }, () => ({ finalState: 'verified' }));
    const summary = { p50: 1200, p95: 1500, max: 1600, thresholdMs: 3000 };
    expect(perfEvidence({ gate: 'S4', case: 'EVAL-071', pass: true, runs: runs(10), summary }, 'p.json')[0]).toMatchObject({ status: 'passed', detail: '10 cold loads, 10 verified, p50 1200 ms, p95 1500 ms, max 1600 ms (threshold 3000 ms)' });
    expect(perfEvidence({ gate: 'S4', case: 'EVAL-071', pass: true, runs: runs(9), summary }, 'p.json')[0]).toMatchObject({ status: 'failed', detail: expect.stringMatching(/fewer than the 10 runs/) });
    expect(perfEvidence({ gate: 'S4', case: 'EVAL-071', pass: false, runs: runs(10), summary }, 'p.json')[0]!.status).toBe('failed');
    expect(perfEvidence({ gate: 'S3', case: 'EVAL-070', pass: true, runs: runs(20) }, 'p.json')[0]).toMatchObject({ id: 'EVAL-071', status: 'failed' });
  });

  it('harness: one piece per case, and the two harness-integrity cases from its own integrity (clean tree, offline, exit code consistent)', () => {
    const ok = harnessEvidence(harnessFile({ cases: [{ id: 'EVAL-001', suite: 'harness-verifier', outcome: 'passed', notes: [] }, { id: 'EVAL-002', suite: 'harness-verifier', outcome: 'not_yet_implemented', notes: ['needs x'] }] }), 'h.json');
    expect(ok.map((e) => [e.id, e.runner, e.status])).toEqual([
      ['EVAL-001', 'harness', 'passed'],
      ['EVAL-002', 'harness', 'failed'],
      ['EVAL-092', 'harness-integrity', 'passed'],
      ['EVAL-091', 'harness-integrity', 'passed'],
    ]);
    expect(ok[1]!.detail).toBe('not_yet_implemented; needs x');
    const status = (h: ResultsFile, id: string) => harnessEvidence(h, 'h.json').find((e) => e.id === id)!.status;
    expect(status(harnessFile({ dirty: true }), 'EVAL-091')).toBe('failed');
    expect(status(harnessFile({ networkCalls: ['https://x'] }), 'EVAL-091')).toBe('failed');
    expect(status(harnessFile({ skipped: 1 }), 'EVAL-092')).toBe('failed');
    const lying = harnessFile({ gatesPass: false });
    lying.summary.exitCode = 0;
    expect(status(lying, 'EVAL-091')).toBe('failed');
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
  ])('reconcile table row %#', (id, outcome, gated) => {
    expect(of(id)).toMatchObject({ outcome, gated });
  });

  it('notes say why: no test, not in the harness, no perf results, pending decision', () => {
    expect(of('EVAL-067').notes).toContain('no test names this case');
    expect(of('EVAL-002').notes).toContain('not in the harness results');
    expect(of('EVAL-071').notes[0]).toMatch(/no perf results/);
    expect(of('EVAL-084').notes).toContain('pending decision: reported, outside the gates');
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
  const dataset = { cases: [kase('EVAL-001', { suite: 'harness-verifier' }), kase('EVAL-053'), kase('EVAL-071', { suite: 'perf' }), kase('EVAL-091', { suite: 'ci' }), kase('EVAL-092', { suite: 'ci' }), kase('EVAL-070', { suite: 'perf', milestone: 'M3' })] };
  const suiteSource = (name: 'integration' | 'e2e' | 'e2e-demo') => ({ name, file: `${name}.json`, sha256: 'b'.repeat(64), command: 'x', exitCode: 0, tests: 1, evalTests: 1, errors: [] as string[] });
  const perfOk = { evidence: [ev('EVAL-071', 'perf')], source: { name: 'perf' as const, file: 'perf.json', sha256: 'c'.repeat(64), command: null, exitCode: null, tests: 10, evalTests: 1, errors: [] } };
  const input = (over: Partial<ReleaseInput> = {}): ReleaseInput => {
    const h = harnessFile();
    return {
      dataset,
      milestone: 'M1',
      harness: { results: h, file: join(root, 'h.json'), text: JSON.stringify(h) },
      suites: [{ source: suiteSource('integration'), evidence: [ev('EVAL-053', 'vitest')] }],
      perf: perfOk,
      readiness: ['eval:ready (milestone M1) — READY', 'WARNING: docs/exec/hr3-field-calibration.md is absent: … (decisions.md TP29) …'],
      git: GIT,
      startedAt: new Date('2026-10-05T01:02:03.000Z'),
      durationMs: 42,
      ...over,
    };
  };

  it('PASS when every gated case passes, S4 comes from the perf file and nothing is missing', () => {
    const r = buildRelease(input());
    expect(r.summary).toMatchObject({ overall: 'PASS', exitCode: 0, blockers: [] });
    expect(r.gates.map((g) => g.id)).toEqual(['S1', 'S1-floor', 'S2', 'S6-lib', 'S7', 'CF', 'S4', 'Cases', 'S7-release']);
    expect(r.gates.find((g) => g.id === 'S4')).toMatchObject({ pass: true, source: 'x.test.ts' });
    expect(r.gates.find((g) => g.id === 'Cases')).toMatchObject({ display: '4/4', pass: true });
    expect(r.totals).toEqual({ cases: 6, gated: 5, passed: 5, failed: 0, skipped: 0, missing: 0, deferred: 1, outOfScope: 0, notGated: 0 });
    // A harness run reading this file as its "previous formal run" needs these (run.ts readResultsFile).
    expect(r.provenance.config.hash).toBe(CONFIG_HASH);
    expect(r.provenance.timestampUtc).toBe('2026-10-05T01:02:03.000Z');
    expect(r.cases.every((c) => typeof c.outcome === 'string')).toBe(true);
  });

  it('FAIL: no perf file → S4 not run and the S4 case missing; a stale harness commit and a suite error are problems', () => {
    const r = buildRelease(input({ perf: undefined, git: { ...GIT, commit: 'b'.repeat(40), shortSha: 'bbbbbbb' }, suites: [{ source: { ...suiteSource('e2e'), errors: ['webServer exited early'] }, evidence: [ev('EVAL-053', 'vitest')] }] }));
    expect(r.summary.overall).toBe('FAIL');
    expect(r.gates.find((g) => g.id === 'S4')).toMatchObject({ pass: false, display: 'not run' });
    expect(r.cases.find((c) => c.id === 'EVAL-071')!.outcome).toBe('missing');
    expect(r.problems).toEqual(['e2e: webServer exited early', 'the harness results are from aaaaaaa, the release runs at bbbbbbb: every number must come from this commit (CF-12)']);
    expect(r.gates.find((g) => g.id === 'S7-release')!.pass).toBe(false);
    expect(r.gates.find((g) => g.id === 'Cases')!.detail).toBe('EVAL-071 missing');
  });

  it('a failed harness case is judged by the harness gates, not the Cases gate (S1 tolerates a miss; stretch is reported)', () => {
    const h = harnessFile({ cases: [{ id: 'EVAL-001', suite: 'harness-verifier', outcome: 'failed', notes: [] }] });
    const r = buildRelease(input({ harness: { results: h, file: join(root, 'h.json'), text: JSON.stringify(h) } }));
    expect(r.cases.find((c) => c.id === 'EVAL-001')!.outcome).toBe('failed');
    expect(r.gates.find((g) => g.id === 'Cases')).toMatchObject({ display: '4/4', pass: true });
    expect(r.summary.overall).toBe('PASS'); // the harness's own S1/S2 gates (here passing) decide
  });

  it('the report prints the readiness lines (with the HR3 warning), the gates, the deferred table and every case', () => {
    const r = buildRelease(input());
    const md = renderReleaseReport(r, '/x/eval-run-v1-release-aaaaaaa.json');
    expect(md).toContain('# Udgam release evaluation — eval-run-v1-release-aaaaaaa');
    expect(md).toContain('**Overall: PASS**');
    expect(md).toContain('WARNING: docs/exec/hr3-field-calibration.md is absent');
    expect(md).toMatch(/\| S4 \| .* \| PASS \| `x\.test\.ts` \|/);
    expect(md).toContain('| EVAL-070 | title of EVAL-070 | perf | M-003 (TKT-29 · TASK-30) |');
    for (const c of dataset.cases) expect(md).toContain(`| ${c.id} | ${c.suite} | ${c.milestone} |`);
  });
});

describe('a harness run reads a release file as a previous formal run without an integrity problem', () => {
  it('provenance.config.hash, timestampUtc and cases[].outcome are where run.ts looks', async () => {
    const dir = join(root, 'compat');
    mkdirSync(dir, { recursive: true });
    const h = harnessFile();
    const release = buildRelease({ dataset: { cases: [kase('EVAL-058', { suite: 'harness-proof' })] }, milestone: 'M1', harness: { results: h, file: 'h.json', text: '{}' }, suites: [], readiness: [], git: GIT, startedAt: new Date(), durationMs: 1 });
    writeFileSync(join(dir, 'eval-run-v1-release-aaaaaaa.json'), JSON.stringify(release));
    const run = await evaluate({ seed: 3, suites: ['harness-proof'], proofSuite: async () => [], resultsDir: dir });
    expect(run.totals.problems.filter((p) => p.includes('eval-run-v1-release'))).toEqual([]);
    expect(run.comparison.previous?.file).toBe('eval-run-v1-release-aaaaaaa.json');
  });
});

describe('eval:release CLI', () => {
  it('parses its flags and refuses bad ones', () => {
    expect(parseReleaseArgs(['--milestone=M1'])).toMatchObject({ milestone: 'M1', out: 'local', reuse: false });
    expect(parseReleaseArgs(['--reuse', '--out=formal', '--harness=h.json', '--perf=p.json'])).toMatchObject({ reuse: true, out: 'formal', harness: expect.stringMatching(/h\.json$/), perf: expect.stringMatching(/p\.json$/) });
    expect(() => parseReleaseArgs(['--milestone=M7'])).toThrow(/--milestone/);
    expect(() => parseReleaseArgs(['--harness'])).toThrow(/--harness needs a value/);
    expect(() => parseReleaseArgs(['--dir=/tmp/x', '--out=formal'])).toThrow(/--dir is for local runs/);
    expect(() => parseReleaseArgs(['--bogus'])).toThrow(/unknown flag/);
  });

  it('--reuse --dir: merges fixture reports into a local release under the temp dir, and the report re-renders byte-identically from it', async () => {
    const dir = join(root, 'cli');
    const local = join(dir, 'local');
    mkdirSync(local, { recursive: true });
    const git = gitFacts();
    const h = harnessFile({ commit: git.commit, dirty: git.dirty });
    writeFileSync(join(dir, 'harness.json'), JSON.stringify(h));
    writeFileSync(join(local, 'integration.json'), JSON.stringify({ testResults: [{ name: 'a.int.test.ts', status: 'passed', assertionResults: [{ ancestorTitles: [], title: 'EVAL-053 tampered', status: 'passed' }] }] }));
    writeFileSync(join(local, 'e2e.json'), JSON.stringify({ suites: [{ title: 'c.spec.ts', specs: [{ title: '@eval EVAL-064 not found', tests: [{ projectName: 'phone', status: 'expected' }] }] }], errors: [] }));
    // e2e-demo.json is absent: an error, never "no tests"
    writeFileSync(join(dir, 'perf.json'), JSON.stringify({ gate: 'S4', case: 'EVAL-071', pass: true, runs: Array.from({ length: 10 }, () => ({ finalState: 'verified' })), summary: { p50: 1, p95: 1, max: 1, thresholdMs: 3000 } }));
    const lines: string[] = [];
    const code = await main(['--milestone=M1', '--reuse', `--dir=${dir}`, `--harness=${join(dir, 'harness.json')}`, `--perf=${join(dir, 'perf.json')}`], { log: (s) => lines.push(s), error: (s) => lines.push(s) });
    expect(code).toBe(1); // the real dataset has many cases these fixtures do not cover
    const written = readdirSync(local).filter((f) => f.startsWith('eval-'));
    expect(written).toEqual([`eval-report-v1.md`, `eval-run-v1-release-${git.shortSha}.json`].sort());
    const resultsPath = join(local, `eval-run-v1-release-${git.shortSha}.json`);
    const r = JSON.parse(readFileSync(resultsPath, 'utf8')) as ReleaseFile;
    expect(r.cases.find((c) => c.id === 'EVAL-053')!.runners).toEqual(['vitest']);
    expect(r.cases.find((c) => c.id === 'EVAL-064')!.runners).toEqual(['playwright']);
    expect(r.cases.find((c) => c.id === 'EVAL-071')!.runners).toContain('perf');
    expect(r.problems.some((p) => /^e2e-demo: no readable report/.test(p))).toBe(true);
    expect(r.cases).toHaveLength(loadDataset().cases.length);
    expect(readFileSync(join(local, 'eval-report-v1.md'), 'utf8')).toBe(renderReleaseReport(r, resultsPath));
    expect(lines[0]).toBe('eval:release (M1) — FAIL');
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
