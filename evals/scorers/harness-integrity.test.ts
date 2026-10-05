import { describe, expect, it } from 'vitest';
import { integrity, releaseIntegrity } from './harness-integrity';
import { caseResult, evalCase } from './testing';

// harness-integrity (evaluation-plan §8, EVAL-092, CF-12): every case the harness must run is in the
// results exactly once; active = passed + failed + errored; skipped = 0.

const dataset = {
  cases: [
    evalCase({ id: 'EVAL-001' }),
    evalCase({ id: 'EVAL-022', case_class: 'attack', scenario: 1 }),
    evalCase({ id: 'EVAL-055', case_class: 'attack', scenario: 6, status: 'stretch' }),
    evalCase({ id: 'EVAL-058', suite: 'harness-proof', case_class: null }),
    evalCase({ id: 'EVAL-044', suite: 'integration' }), // not a harness case
    evalCase({ id: 'EVAL-099', status: 'retired' }), // retired: not run
  ],
};

const all = () => [
  caseResult({ id: 'EVAL-001' }),
  caseResult({ id: 'EVAL-022', outcome: 'failed' }),
  caseResult({ id: 'EVAL-055', outcome: 'not_yet_implemented' }),
  caseResult({ id: 'EVAL-058', suite: 'harness-proof', outcome: 'errored' }),
];

describe('integrity', () => {
  it('reconciles: active = passed + failed + errored, skipped = 0; not_yet_implemented counts as failed', () => {
    expect(integrity(dataset, all())).toEqual({
      ok: true,
      active: 4,
      passed: 1,
      failed: 2,
      notYetImplemented: 1,
      errored: 1,
      skipped: 0,
      problems: [],
    });
  });

  it('a case missing from the results is skipped and fails integrity', () => {
    const r = integrity(dataset, all().filter((x) => x.id !== 'EVAL-022'));
    expect(r).toMatchObject({ ok: false, active: 4, skipped: 1 });
    expect(r.problems).toContain('EVAL-022 is in scope but missing from the results');
  });

  it('a duplicate or unknown result fails integrity', () => {
    expect(integrity(dataset, [...all(), caseResult({ id: 'EVAL-001' })]).problems).toContain('EVAL-001 appears 2 times in the results');
    expect(integrity(dataset, [...all(), caseResult({ id: 'EVAL-777' })]).problems).toContain('EVAL-777 is in the results but not in scope');
  });

  it('limits scope to the selected suites', () => {
    const r = integrity(dataset, all().filter((x) => x.suite === 'harness-verifier'), { suites: ['harness-verifier'] });
    expect(r).toMatchObject({ ok: true, active: 3 });
  });
});

describe('releaseIntegrity (the release reconciliation, S7-release)', () => {
  it('passes only with nothing missing, nothing skipped and no problem', () => {
    expect(releaseIntegrity({ missing: 0, skipped: 0 }, [])).toEqual({ ok: true, detail: '0 missing; 0 skipped' });
    expect(releaseIntegrity({ missing: 1, skipped: 0 }, [])).toEqual({ ok: false, detail: '1 missing; 0 skipped' });
    expect(releaseIntegrity({ missing: 0, skipped: 2 }, [])).toEqual({ ok: false, detail: '0 missing; 2 skipped' });
    expect(releaseIntegrity({ missing: 0, skipped: 0 }, ['e2e: the run exited 1'])).toEqual({ ok: false, detail: '0 missing; 0 skipped; e2e: the run exited 1' });
  });
});
