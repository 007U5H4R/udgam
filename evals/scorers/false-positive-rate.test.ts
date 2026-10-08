import { describe, expect, it } from 'vitest';
import { falsePositiveRate } from './false-positive-rate';
import { caseResult, check, verifyResult } from './testing';

// false-positive-rate (evaluation-plan §4.2): population = legitimate, active; FP = not Verified
// (Needs Review counts). Honest review load = legitimate + legitimate_edge not Verified (information).

describe('falsePositiveRate', () => {
  const results = [
    caseResult({ id: 'EVAL-001' }),
    caseResult({ id: 'EVAL-002' }),
    caseResult({
      id: 'EVAL-009',
      outcome: 'failed',
      result: verifyResult('Needs Review', [check('geofence', 'flag'), check('signature_valid', 'ok'), check('gps_accuracy', 'unavailable')]),
    }),
    caseResult({ id: 'EVAL-010', outcome: 'not_yet_implemented', missingChecks: ['gps_accuracy'] }),
    caseResult({ id: 'EVAL-015', caseClass: 'legitimate_edge', result: verifyResult('Needs Review', [check('ndvi_harvest_window', 'unavailable')]) }),
    caseResult({ id: 'EVAL-019', caseClass: 'legitimate_edge' }),
    caseResult({ id: 'EVAL-022', caseClass: 'attack', scenario: 1, result: verifyResult('Rejected', []) }),
  ];
  const fp = falsePositiveRate(results);

  it('counts legitimate cases not Verified, including not_yet_implemented', () => {
    expect(fp).toMatchObject({ k: 2, n: 4, rate: 0.5 });
  });

  it('lists each false positive with the checks responsible', () => {
    expect(fp.fps).toEqual([
      { id: 'EVAL-009', outcome: 'failed', verdict: 'Needs Review', responsible: ['geofence', 'gps_accuracy'] },
      { id: 'EVAL-010', outcome: 'not_yet_implemented', verdict: 'Verified', responsible: [] },
    ]);
  });

  it('reports the honest review load over legitimate + edge', () => {
    expect(fp.honestReviewLoad).toMatchObject({ k: 3, n: 6, rate: 0.5 });
  });

  it('an empty population has a null rate', () => {
    expect(falsePositiveRate([])).toMatchObject({ k: 0, n: 0, rate: null });
  });
});
