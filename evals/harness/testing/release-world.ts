import { CONFIG_HASH } from '../../../src/lib/verification/config';
import type { VerifyResult } from '../../../src/lib/verification/types';
import { assertCase, type CaseResult } from '../../scorers/case-assertions';
import type { EvalCase } from '../dataset';
import type { Provenance } from '../provenance';
import type { Readiness } from '../readiness';
import { regate, type ResultsFile } from '../run';

// A small, self-consistent world for the release tests (TASK-22 fix round 1): a dataset with one attack
// case per scenario 1–4, one legitimate case and one proof case (so every harness gate has a value), plus
// integration, e2e, perf, ci and M3 cases; and a harness results file whose gates are what run.ts derives
// from its cases. Test-only.

export const kase = (id: string, over: Partial<EvalCase> = {}): EvalCase =>
  ({ id, title: `title of ${id}`, feature: 'x', category: 'functional', suite: 'integration', gates: [], priority: 'high', automated: true, milestone: 'M1', status: 'active', input: {}, expected: {}, failure_conditions: [], ...over }) as EvalCase;

const attack = (id: string, scenario: number) => kase(id, { suite: 'harness-verifier', case_class: 'attack', scenario, expected: { verdict: 'Rejected', catching_checks: ['signature_valid'] } });

export const WORLD_CASES: EvalCase[] = [
  attack('EVAL-001', 1),
  attack('EVAL-002', 2),
  attack('EVAL-003', 3),
  attack('EVAL-004', 4),
  kase('EVAL-005', { suite: 'harness-verifier', case_class: 'legitimate', expected: { verdict: 'Verified' } }),
  kase('EVAL-058', { suite: 'harness-proof' }),
  kase('EVAL-053'),
  kase('EVAL-064', { suite: 'e2e' }),
  kase('EVAL-073', { suite: 'e2e' }),
  kase('EVAL-071', { suite: 'perf' }),
  kase('EVAL-091', { suite: 'ci' }),
  kase('EVAL-092', { suite: 'ci' }),
  kase('EVAL-070', { suite: 'perf', milestone: 'M3' }),
];
export const WORLD = { cases: WORLD_CASES };

export const verifyResult = (verdict: VerifyResult['verdict'], status: 'ok' | 'fail'): VerifyResult => ({
  verdict,
  score: verdict === 'Verified' ? 100 : 0,
  checks: [{ id: 'signature_valid', status, score: status === 'ok' ? 1 : 0, weight: 1, hardFail: status === 'fail', evidence: status === 'ok' ? 'signature ok' : 'bad signature' }],
  unavailableProviders: [],
  capReasons: [],
  config: { version: 'cfg-1', hash: CONFIG_HASH },
});

/** The case result run.ts would record for `c` given its verify() result (null: a passing proof case). */
export function caseResult(c: EvalCase, result: VerifyResult | null): CaseResult {
  const a = result ? assertCase(c, result) : { pass: true, assertions: [{ name: 'both verifiers accept the intact feed', pass: true, detail: '' }], detected: undefined };
  return {
    id: c.id,
    suite: c.suite,
    datasetStatus: c.status,
    caseClass: c.case_class ?? null,
    scenario: c.scenario ?? null,
    priority: c.priority,
    criticalConditions: [],
    pair: null,
    tags: [],
    expected: c.expected,
    milestone: c.milestone,
    inMilestoneScope: true,
    outcome: a.pass ? 'passed' : 'failed',
    missingChecks: [],
    result,
    assertions: a.assertions,
    detected: c.case_class === 'attack' ? (a.detected ?? false) : null,
    faultInjected: false,
    error: null,
    notes: [],
    durationMs: 1,
  };
}

/**
 * `pnpm eval:ready` as it reads for the repository dataset at the M-001 gate: READY, with the HR3 warning
 * (TP29). The world's own dataset is far too small to be READY, so formal-release tests inject this.
 */
export const WORLD_READY: Readiness = {
  ready: true,
  milestone: 'M1',
  checks: [{ id: 'registry', pass: true, detail: '12/12 checks registered' }],
  warnings: ['WARNING: docs/exec/hr3-field-calibration.md is absent: HR3 field calibration was waived (decisions.md TP29), so S2 realism (the legitimate-set jitter) and the S3 reference condition are unvalidated assumptions. The gate report must print this line.'],
};

export const WORLD_GIT: Provenance['git'] = { commit: 'a'.repeat(40), shortSha: 'aaaaaaa', branch: 'build/stage7', dirty: false };

/**
 * A harness results file over WORLD whose gates, critical conditions, totals and summary are what run.ts
 * derives from its cases. `undetected` lists attack cases whose verify() said Verified.
 */
export function worldHarness(o: { git?: Provenance['git']; undetected?: string[]; networkCalls?: string[] } = {}): ResultsFile {
  const cases = WORLD_CASES.filter((c) => c.suite.startsWith('harness-')).map((c) =>
    caseResult(c, c.suite === 'harness-proof' ? null : c.case_class === 'attack' && !(o.undetected ?? []).includes(c.id) ? verifyResult('Rejected', 'fail') : verifyResult('Verified', 'ok')),
  );
  const r = {
    schema: 'udgam-eval-results/1',
    provenance: {
      harness: { name: 'udgam-eval', version: '0.1.0' },
      appVersion: '0.1.0',
      git: o.git ?? WORLD_GIT,
      environment: 'local',
      dataset: { path: 'evals/eval-dataset.json', version: '0.8.0', sha256: 'd'.repeat(64) },
      config: { version: 'cfg-1', hash: CONFIG_HASH, mode: 'full', enabledChecks: [], object: {} },
      provider: 'fixture',
      ledger: 'hashchain',
      suites: ['harness-verifier', 'harness-proof'],
      seed: 1,
      seedPolicy: 'default',
      timestampUtc: '2026-10-05T00:00:00.000Z',
      durationMs: 1,
    },
    summary: { overall: 'PASS', exitCode: 0, recommendation: '', blockers: [] },
    totals: { ok: true, active: 0, passed: 0, failed: 0, notYetImplemented: 0, errored: 0, skipped: 0, problems: [] },
    gates: [],
    categoryGates: [],
    criticalConditions: [],
    scope: { milestone: 'M1', outOfScope: [] },
    cases,
    runtime: { networkCalls: o.networkCalls ?? [], executionOrder: cases.map((c) => c.id) },
  } as unknown as ResultsFile;
  const re = regate(r, WORLD, 'M1');
  const pass = re.gates.every((g) => g.pass) && re.criticalConditions.length === 0;
  return { ...r, gates: re.gates, criticalConditions: re.criticalConditions, totals: re.integrity, summary: { ...r.summary, overall: pass ? 'PASS' : 'FAIL', exitCode: pass ? 0 : 1 } };
}
