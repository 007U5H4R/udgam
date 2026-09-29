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

  it('accounts for every harness case (nothing skipped)', () => {
    expect(r.totals.skipped).toBe(0);
    expect(r.totals.active).toBe(r.totals.passed + r.totals.failed + r.totals.errored);
    expect(r.cases).toHaveLength(r.totals.active);
  });

  it('its committed report re-renders byte-identically from the results file', () => {
    expect(renderReport(RESULTS)).toBe(readFileSync(REPORT, 'utf8'));
  });
});
