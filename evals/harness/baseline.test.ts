import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVALS_DIR } from './dataset';
import { renderReport } from './report';
import type { ResultsFile } from './run';

// TSK-03.7 (EV13): baseline-v0 is a real ledger-only harness run, committed with its report.

const RESULTS = join(EVALS_DIR, 'results', 'baseline-v0-ledger-only.json');
const REPORT = join(EVALS_DIR, 'reports', 'eval-report-baseline-v0.md');

describe('baseline-v0 (ledger only)', () => {
  const r = JSON.parse(readFileSync(RESULTS, 'utf8')) as ResultsFile;

  it('records config ledger-only (signature_valid only), the config hash and the commit it ran on', () => {
    expect(r.provenance.config).toMatchObject({ version: 'cfg-1', mode: 'ledger-only', enabledChecks: ['signature_valid'] });
    expect(r.provenance.config.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.provenance.git.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.provenance.provider).toBe('fixture');
  });

  it('ran on a clean tree with a recorded seed, and its headline numbers are the ones committed', () => {
    expect(r.provenance.git.dirty).toBe(false);
    expect(r.provenance.seed).toBe(20260929);
    expect(r.totals).toMatchObject({ ok: true, active: 60, passed: 3, failed: 57, notYetImplemented: 8, errored: 0, skipped: 0 });
    const gate = (id: string) => r.gates.find((g) => g.id === id)!;
    expect(gate('S1')).toMatchObject({ display: '0.0 % (0/26)', pass: false });
    expect(gate('S2')).toMatchObject({ display: '0.0 % (0/14)', pass: true });
    expect(gate('S7')).toMatchObject({ display: 'Yes', pass: true });
    // CF-01 on exactly the 10 hard-fail attacks: ledger-only runs signature_valid alone, so none is Rejected.
    expect(r.criticalConditions).toEqual([
      {
        id: 'CF-01',
        caseIds: ['EVAL-030', 'EVAL-031', 'EVAL-032', 'EVAL-037', 'EVAL-038', 'EVAL-042', 'EVAL-045', 'EVAL-046', 'EVAL-049', 'EVAL-050'],
        reason: 'an attack covered by a hard-fail rule was not Rejected with hardFail on that check',
      },
    ]);
    expect(r.summary).toMatchObject({ overall: 'FAIL', exitCode: 1 });
  });

  it('accounts for every harness case (nothing skipped)', () => {
    expect(r.totals.skipped).toBe(0);
    expect(r.totals.active).toBe(r.totals.passed + r.totals.failed + r.totals.errored);
    expect(r.cases).toHaveLength(r.totals.active);
  });

  it('its committed report re-renders byte-identically from the results file', () => {
    expect(renderReport(RESULTS)).toBe(readFileSync(REPORT, 'utf8'));
  });
});
