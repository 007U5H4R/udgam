import { describe, expect, it } from 'vitest';
import { detectionRate } from './detection-rate';
import { caseResult, check, verifyResult } from './testing';

// detection-rate (evaluation-plan §4.1): population = harness-verifier, attack, scenario 1–4, status
// active; detected = verdict acceptable AND a catching check flagged or failed (EV4).

const attack = (id: string, scenario: number, detected: boolean, over = {}) =>
  caseResult({ id, caseClass: 'attack', scenario, detected, outcome: detected ? 'passed' : 'failed', ...over });

describe('detectionRate', () => {
  const results = [
    attack('EVAL-022', 1, true),
    attack('EVAL-023', 1, true),
    attack('EVAL-024', 1, false, { result: verifyResult('Verified', [check('movement_plausibility', 'ok')]) }),
    attack('EVAL-030', 2, true),
    attack('EVAL-037', 3, false, { outcome: 'not_yet_implemented', detected: null, missingChecks: ['deforestation_overlap'] }),
    attack('EVAL-045', 4, false, { outcome: 'errored', detected: null, result: null, error: { class: 'Error', message: 'setup' } }),
    // Not in the S1 population:
    caseResult({ id: 'EVAL-029', caseClass: 'known_limitation', scenario: 1, detected: null }),
    attack('EVAL-055', 6, true, { datasetStatus: 'stretch' }),
    attack('EVAL-044', 3, true, { suite: 'integration' }),
    caseResult({ id: 'EVAL-001' }),
  ];
  const d = detectionRate(results);

  it('pools scenarios 1–4 only; not_yet_implemented and errored count as undetected', () => {
    expect(d.pooled).toMatchObject({ k: 3, n: 6, rate: 0.5 });
    expect(d.pooled.wilson95.lower).toBeLessThan(0.5);
  });

  it('reports every scenario 1–4 separately with its Wilson interval', () => {
    expect(d.perScenario['1']).toMatchObject({ k: 2, n: 3 });
    expect(d.perScenario['2']).toMatchObject({ k: 1, n: 1, rate: 1 });
    expect(d.perScenario['3']).toMatchObject({ k: 0, n: 1, rate: 0 });
    expect(d.perScenario['4']).toMatchObject({ k: 0, n: 1 });
    expect(d.perScenario['2']!.wilson95.lower).toBeCloseTo(0.207, 3);
  });

  it('lists the undetected cases with their outcome and check results', () => {
    expect(d.undetected.map((u) => u.id)).toEqual(['EVAL-024', 'EVAL-037', 'EVAL-045']);
    expect(d.undetected[0]).toMatchObject({ scenario: 1, outcome: 'failed', verdict: 'Verified' });
    expect(d.undetected[0]!.checks).toEqual([check('movement_plausibility', 'ok')]);
    expect(d.undetected[1]).toMatchObject({ outcome: 'not_yet_implemented', missingChecks: ['deforestation_overlap'] });
  });

  it('reports scenarios 5–6 separately, outside S1', () => {
    expect(d.otherScenarios['6']).toMatchObject({ k: 1, n: 1 });
    expect(d.otherScenarios['5']).toMatchObject({ k: 0, n: 0, rate: null });
  });

  it('an empty population has a null rate', () => {
    expect(detectionRate([]).pooled).toMatchObject({ k: 0, n: 0, rate: null });
  });
});
