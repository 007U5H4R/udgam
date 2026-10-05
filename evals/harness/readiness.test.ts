import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECK_IDS, type CheckId } from '../../src/lib/verification/types';
import type { EvalCase } from './dataset';
import { checkReadiness, main, readinessLines, type ReadinessCheck } from './readiness';

// TSK-21.1 (TKT-21, TC-079): the pre-gate readiness check. The M-001 formal run starts only when all
// twelve checks are registered, scenarios 1–4 each hold ≥ 10 active attack cases, the legitimate class
// holds ≥ 35 active cases, and no active in-scope case would come out not_yet_implemented. A missing
// HR3 field-calibration file is a warning the report prints, never a failure (HR3 waived, TP29).

const dir = mkdtempSync(join(tmpdir(), 'udgam-readiness-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const HR3_PRESENT = join(dir, 'hr3-field-calibration.md');
writeFileSync(HR3_PRESENT, '# HR3\n');
const HR3_ABSENT = join(dir, 'absent', 'hr3-field-calibration.md');

let n = 0;
const kase = (over: Partial<EvalCase>): EvalCase =>
  ({
    id: `EVAL-${String(++n).padStart(3, '0')}`,
    title: 't',
    feature: 'verifier',
    category: 'functional',
    suite: 'harness-verifier',
    case_class: 'attack',
    scenario: 1,
    gates: ['S1'],
    priority: 'high',
    automated: true,
    milestone: 'M1',
    status: 'active',
    input: {},
    expected: { acceptable_verdicts: ['Needs Review', 'Rejected'], catching_checks: ['geofence'] },
    failure_conditions: [],
    ...over,
  }) as EvalCase;

const attacks = (scenario: number, count: number, over: Partial<EvalCase> = {}) => Array.from({ length: count }, () => kase({ scenario, ...over }));
const legit = (count: number) => Array.from({ length: count }, () => kase({ case_class: 'legitimate', scenario: null, gates: ['S2'], expected: { verdict: 'Verified' } }));
const proof = (id: string, over: Partial<EvalCase> = {}) => ({ ...kase({ suite: 'harness-proof', case_class: null, scenario: null, gates: ['S6'] }), id, ...over }) as EvalCase;

const FULL = CHECK_IDS.map((id) => ({ id }));
const without = (...ids: CheckId[]) => FULL.filter((c) => !ids.includes(c.id));
const readyCases = () => [...attacks(1, 10), ...attacks(2, 10), ...attacks(3, 10), ...attacks(4, 10), ...legit(35), proof('EVAL-058')];
const opts = { hr3Path: HR3_PRESENT, proofCases: ['EVAL-058'] };
const byId = (checks: ReadinessCheck[], id: string) => checks.find((c) => c.id === id)!;

describe('checkReadiness (TSK-21.1)', () => {
  it('is ready with twelve checks, ≥ 10 attacks per scenario, ≥ 35 legitimate cases and nothing not_yet_implemented', () => {
    const r = checkReadiness({ cases: readyCases() }, FULL, opts);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.checks.map((c) => c.id)).toEqual(['registry', 'scenario-1', 'scenario-2', 'scenario-3', 'scenario-4', 'legitimate', 'not-yet-implemented']);
  });

  it('fails when a check is not registered, naming it (and the cases that would wait on it)', () => {
    const r = checkReadiness({ cases: readyCases() }, without('yield_plausibility'), opts);
    expect(r.ready).toBe(false);
    expect(byId(r.checks, 'registry')).toMatchObject({ pass: false });
    expect(byId(r.checks, 'registry').detail).toContain('yield_plausibility');
    expect(byId(r.checks, 'registry').detail).toContain('11/12');
    // every legitimate case asserts that all twelve checks stay quiet, so they would be not_yet_implemented
    expect(byId(r.checks, 'not-yet-implemented').pass).toBe(false);
  });

  it('fails a scenario with 9 active attack cases; stretch, retired, other-suite and later-milestone cases do not count', () => {
    const cases = [
      ...attacks(1, 10),
      ...attacks(2, 10),
      ...attacks(3, 9),
      ...attacks(3, 1, { status: 'stretch' }),
      ...attacks(3, 1, { status: 'retired' }),
      ...attacks(3, 1, { suite: 'integration' }),
      ...attacks(3, 1, { milestone: 'M2' }),
      ...attacks(3, 1, { case_class: 'known_limitation' }),
      ...attacks(4, 10),
      ...legit(35),
    ];
    const r = checkReadiness({ cases }, FULL, opts);
    expect(r.ready).toBe(false);
    expect(byId(r.checks, 'scenario-3')).toMatchObject({ pass: false });
    expect(byId(r.checks, 'scenario-3').detail).toMatch(/^9 active attack cases \(need ≥ 10\)/);
    expect(byId(r.checks, 'scenario-1').pass).toBe(true);
  });

  it('fails with 34 active legitimate cases (legitimate_edge does not count)', () => {
    const cases = [...attacks(1, 10), ...attacks(2, 10), ...attacks(3, 10), ...attacks(4, 10), ...legit(34), kase({ case_class: 'legitimate_edge', scenario: null })];
    const r = checkReadiness({ cases }, FULL, opts);
    expect(r.ready).toBe(false);
    expect(byId(r.checks, 'legitimate')).toMatchObject({ pass: false });
    expect(byId(r.checks, 'legitimate').detail).toMatch(/^34 active legitimate cases \(need ≥ 35\)/);
  });

  it('fails when an active case needs a check the registry lacks, naming the case', () => {
    const lonely = kase({ scenario: 4, expected: { acceptable_verdicts: ['Rejected'], catching_checks: ['yield_plausibility'] } });
    const cases = [...attacks(1, 10), ...attacks(2, 10), ...attacks(3, 10), ...attacks(4, 10), lonely];
    const r = checkReadiness({ cases }, without('yield_plausibility'), { ...opts });
    const nyi = byId(r.checks, 'not-yet-implemented');
    expect(nyi.pass).toBe(false);
    expect(nyi.detail).toContain(`${lonely.id} (needs yield_plausibility)`);
  });

  it('fails when an active in-scope harness-proof case has no runner, or runs only on the EVM ledger; M2 cases are out of the M1 scope', () => {
    const cases = [...readyCases(), proof('EVAL-200'), proof('EVAL-103', { milestone: 'M1' }), proof('EVAL-201', { milestone: 'M2' })];
    const r = checkReadiness({ cases }, FULL, opts);
    const nyi = byId(r.checks, 'not-yet-implemented');
    expect(nyi.pass).toBe(false);
    expect(nyi.detail).toContain('EVAL-200 (no harness-proof runner)');
    expect(nyi.detail).toContain('EVAL-103 (runs only with --ledger=evm)');
    expect(nyi.detail).not.toContain('EVAL-201');
    // with the M2 scope, EVAL-201 is in scope too
    expect(byId(checkReadiness({ cases }, FULL, { ...opts, milestone: 'M2' }).checks, 'not-yet-implemented').detail).toContain('EVAL-201');
  });

  it('a stretch case that would be not_yet_implemented does not block (only active cases are checked)', () => {
    const cases = [...readyCases(), kase({ scenario: 6, status: 'stretch', expected: { acceptable_verdicts: ['Rejected'], catching_checks: ['yield_plausibility'] } })];
    expect(checkReadiness({ cases }, FULL, opts).ready).toBe(true);
  });

  it('a missing HR3 field-calibration file is a warning line, not a failure (HR3 waived, TP29)', () => {
    const r = checkReadiness({ cases: readyCases() }, FULL, { ...opts, hr3Path: HR3_ABSENT });
    expect(r.ready).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^WARNING: /);
    expect(r.warnings[0]).toContain('hr3-field-calibration.md');
    expect(r.warnings[0]).toContain('TP29');
    expect(r.warnings[0]).toMatch(/S2 realism/);
    // and the printed lines carry it
    expect(readinessLines(r)).toContain(r.warnings[0]);
  });

  it('readinessLines prints one PASS/FAIL line per check under a READY / NOT READY header', () => {
    const r = checkReadiness({ cases: readyCases() }, without('geofence'), opts);
    const lines = readinessLines(r);
    expect(lines[0]).toBe('eval:ready (milestone M1) — NOT READY');
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}FAIL {2}registry +11\/12 checks registered; missing geofence$/));
    expect(lines).toContainEqual(expect.stringMatching(/^ {2}PASS {2}scenario-1 +10 active attack cases \(need ≥ 10\)$/));
  });
});

describe('eval:ready CLI (TSK-21.1)', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
  };

  it('exits 2 on an unknown flag or milestone, before reading anything', () => {
    const a = io();
    expect(main(['--milestone=M9'], a.io)).toBe(2);
    expect(a.err[0]).toMatch(/--milestone must be M1, M2, M3; got M9/);
    const b = io();
    expect(main(['--baseline=v1'], b.io)).toBe(2);
    expect(b.err[0]).toMatch(/unknown flag --baseline=v1/);
  });

  it('prints a header and one line per check for the repository dataset', () => {
    const a = io();
    const code = main(['--milestone=M1'], a.io);
    expect([0, 1]).toContain(code);
    expect(a.out[0]).toMatch(/^eval:ready \(milestone M1\) — (READY|NOT READY)$/);
    expect(a.out.filter((l) => /^ {2}(PASS|FAIL) {2}/.test(l))).toHaveLength(7);
  });
});
