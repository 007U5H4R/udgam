import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Stage 9 CR-200 (EV14: "a regression on a critical case, or any CF, blocks merge"). `pnpm eval` already
// exits 1 on a failed gate or a fired CF; scripts/ci/check-eval-regressions.mjs also fails the CI job when
// the run's comparison with the latest formal run names a regressed case whose priority is critical.
// A non-critical regression is a warning. A missing or unreadable results file fails closed.

const SCRIPT = 'scripts/ci/check-eval-regressions.mjs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eval-regressions-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const DATASET = { cases: [{ id: 'EVAL-001', priority: 'critical' }, { id: 'EVAL-002', priority: 'high' }, { id: 'EVAL-003', priority: 'critical' }] };

function files(regressions: string[]) {
  const results = join(dir, 'eval-run-0.1.0-abc1234.json');
  const dataset = join(dir, 'eval-dataset.json');
  writeFileSync(results, JSON.stringify({ comparison: { previous: { file: 'eval-run-0.1.0-old.json' }, regressions } }));
  writeFileSync(dataset, JSON.stringify(DATASET));
  return { results, dataset };
}
const run = (args: string[]) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

describe('check-eval-regressions.mjs', () => {
  it('passes with no regressions', () => {
    const f = files([]);
    const r = run([f.results, f.dataset]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('check-eval-regressions: no regressed case against eval-run-0.1.0-old.json');
  });

  it('passes with a warning when only a non-critical case regressed', () => {
    const f = files(['EVAL-002']);
    const r = run([f.results, f.dataset]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('::warning::regressed (not critical): EVAL-002');
  });

  it('fails naming each regressed critical case', () => {
    const f = files(['EVAL-001', 'EVAL-002', 'EVAL-003']);
    const r = run([f.results, f.dataset]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('::error::regressed critical case(s) block merge (EV14): EVAL-001, EVAL-003');
  });

  it('a regressed case missing from the dataset counts as critical (fails closed)', () => {
    const f = files(['EVAL-999']);
    expect(run([f.results, f.dataset]).status).toBe(1);
  });

  it('exits 2 on a missing or unreadable results file, or a results file without a comparison', () => {
    const f = files([]);
    expect(run([join(dir, 'absent.json'), f.dataset]).status).toBe(2);
    writeFileSync(f.results, '{not json');
    expect(run([f.results, f.dataset]).status).toBe(2);
    writeFileSync(f.results, JSON.stringify({ cases: [] }));
    expect(run([f.results, f.dataset]).status).toBe(2);
  });

  it('--help prints the usage and exits 2', () => {
    const r = run(['--help']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: node scripts\/ci\/check-eval-regressions\.mjs \[results\.json \[dataset\.json\]\]/);
  });
});
