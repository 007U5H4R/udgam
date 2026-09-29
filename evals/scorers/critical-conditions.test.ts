import { describe, expect, it } from 'vitest';
import { criticalConditions } from './critical-conditions';
import { caseResult, check, verifyResult } from './testing';

// critical-conditions (evaluation-plan §5, §8): CF-01, 02, 03, 12, 13 are judged by the harness; the
// others fire from a failed case's `critical_conditions`.

const ids = (r: ReturnType<typeof criticalConditions>) => r.fired.map((f) => f.id);

describe('criticalConditions', () => {
  it('nothing fires on a clean run', () => {
    expect(criticalConditions([caseResult({ id: 'EVAL-001', criticalConditions: ['CF-02'] })]).fired).toEqual([]);
  });

  it('CF-01: a hard-fail attack not Rejected with hardFail on that check', () => {
    const expected = { verdict: 'Rejected' as const, catching_checks: ['photo_uniqueness' as const], hard_fail_checks: ['photo_uniqueness' as const] };
    const miss = caseResult({
      id: 'EVAL-030',
      caseClass: 'attack',
      scenario: 2,
      expected,
      outcome: 'failed',
      criticalConditions: ['CF-01'],
      result: verifyResult('Needs Review', [check('photo_uniqueness', 'fail')]),
    });
    const hit = caseResult({
      id: 'EVAL-031',
      caseClass: 'attack',
      scenario: 2,
      expected,
      criticalConditions: ['CF-01'],
      result: verifyResult('Rejected', [check('photo_uniqueness', 'fail', { hardFail: true })]),
    });
    const r = criticalConditions([miss, hit]);
    expect(r.fired).toEqual([{ id: 'CF-01', caseIds: ['EVAL-030'], reason: expect.any(String) }]);
  });

  it('CF-02: an honest case (legitimate or edge) Rejected', () => {
    const r = criticalConditions([
      caseResult({ id: 'EVAL-001', outcome: 'failed', result: verifyResult('Rejected', []) }),
      caseResult({ id: 'EVAL-020', caseClass: 'legitimate_edge', outcome: 'failed', result: verifyResult('Rejected', []) }),
      caseResult({ id: 'EVAL-019', caseClass: 'legitimate_edge', result: verifyResult('Needs Review', []) }),
    ]);
    expect(r.fired).toEqual([{ id: 'CF-02', caseIds: ['EVAL-001', 'EVAL-020'], reason: expect.any(String) }]);
  });

  it('CF-03: a provider fault or throwing check that yields Rejected or crashes the case', () => {
    const r = criticalConditions([
      caseResult({ id: 'EVAL-016', caseClass: 'legitimate_edge', faultInjected: true, outcome: 'failed', result: verifyResult('Rejected', []) }),
      caseResult({ id: 'EVAL-017', caseClass: 'legitimate_edge', faultInjected: true, outcome: 'errored', result: null, error: { class: 'Error', message: 'x' } }),
      caseResult({ id: 'EVAL-018', caseClass: 'legitimate_edge', faultInjected: true, result: verifyResult('Needs Review', []) }),
    ]);
    expect(ids(r)).toContain('CF-03');
    expect(r.fired.find((f) => f.id === 'CF-03')!.caseIds).toEqual(['EVAL-016', 'EVAL-017']);
  });

  it('not_yet_implemented cases fire no CF (they fail the gates instead)', () => {
    const r = criticalConditions([
      caseResult({
        id: 'EVAL-038',
        caseClass: 'attack',
        scenario: 3,
        outcome: 'not_yet_implemented',
        criticalConditions: ['CF-01'],
        expected: { verdict: 'Rejected', hard_fail_checks: ['deforestation_overlap'] },
        result: verifyResult('Verified', []),
      }),
      caseResult({ id: 'EVAL-059', suite: 'harness-proof', caseClass: null, outcome: 'not_yet_implemented', criticalConditions: ['CF-04'], result: null }),
    ]);
    expect(r.fired).toEqual([]);
  });

  it('CF-12 fires when harness integrity fails; CF-13 when the config drifted from baseline-v1 without a decision', () => {
    const r = criticalConditions([], {
      integrity: { ok: false, problems: ['EVAL-007 missing from results'] },
      configDrift: { baselineHash: 'aaa', currentHash: 'bbb', authorised: false },
    });
    expect(ids(r)).toEqual(['CF-12', 'CF-13']);
    expect(criticalConditions([], { configDrift: { baselineHash: 'aaa', currentHash: 'bbb', authorised: true } }).fired).toEqual([]);
  });

  it('other CFs fire from a failed case’s critical_conditions', () => {
    const r = criticalConditions([
      caseResult({ id: 'EVAL-060', suite: 'harness-proof', caseClass: null, outcome: 'failed', criticalConditions: ['CF-04'], result: null }),
      caseResult({ id: 'EVAL-061', suite: 'harness-proof', caseClass: null, outcome: 'passed', criticalConditions: ['CF-04'], result: null }),
    ]);
    expect(r.fired).toEqual([{ id: 'CF-04', caseIds: ['EVAL-060'], reason: expect.any(String) }]);
  });
});
