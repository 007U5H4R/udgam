import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { YIELD_REFERENCE_VERSION } from '../../src/lib/yield/reference-data';
import { loadDataset } from './dataset';
import { renderReport } from './report';
import { writeResults } from './results';
import { evaluate, type ResultsFile } from './run';

// TC-016 (EVAL-091, S7): results carry every evaluation-plan §12 provenance field; the report is
// rendered from the results file alone, byte-identically; a second formal write gets -r2.

let results: ResultsFile;
let dir: string;
let path: string;

beforeAll(async () => {
  results = await evaluate({ seed: 9 });
  dir = mkdtempSync(join(tmpdir(), 'udgam-results-'));
  path = writeResults(results, { out: 'formal', dir });
}, 60_000);

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);

describe('provenance (evaluation-plan §12)', () => {
  it('has every field', () => {
    const p = JSON.parse(readFileSync(path, 'utf8')).provenance;
    expect(p).toMatchObject({
      appVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      git: { commit: expect.stringMatching(/^[0-9a-f]{40}$/), shortSha: expect.any(String), branch: expect.any(String), dirty: expect.any(Boolean) },
      environment: expect.stringMatching(/^(local|ci)$/),
      dataset: { version: loadDataset().version, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      fixtures: { version: expect.any(String), sha256: expect.stringMatching(/^[0-9a-f]{64}$/), files: 42 },
      config: { version: 'cfg-1', hash: expect.stringMatching(/^[0-9a-f]{64}$/), mode: 'full', object: expect.any(Object) },
      provider: 'fixture',
      yieldReference: {
        version: expect.any(String),
        source: 'placeholder',
        placeholder: true,
        row: { maxKgHa: 1000, cherryToCleanRatio: 0.2 },
        // TC-039: what the app seeds, printed beside the harness's synthetic U (TKT-09)
        app: { version: YIELD_REFERENCE_VERSION, yields: 'Coffee Board', cherryRatio: 'industry estimate, unverified', maxKgHa: { arabica: 783, robusta: 1494 } },
      },
      ledger: 'hashchain',
      node: process.version,
      os: { platform: expect.any(String), arch: expect.any(String) },
      harness: { version: expect.any(String) },
      seed: 9,
      timestampUtc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      durationMs: expect.any(Number),
    });
    expect(p.config.object.version).toBe('cfg-1');
  });
});

describe('versioned results', () => {
  it('a second and third formal write on the same commit get -r2 and -r3 instead of overwriting', () => {
    const second = writeResults(results, { out: 'formal', dir });
    const third = writeResults(results, { out: 'formal', dir });
    expect(second).toBe(path.replace(/\.json$/, '-r2.json'));
    expect(third).toBe(path.replace(/\.json$/, '-r3.json'));
  });

  it('local runs go under local/, and --name writes that name', () => {
    expect(writeResults(results, { out: 'local', dir })).toMatch(/\/local\/eval-run-[^/]+\.json$/);
    expect(writeResults(results, { out: 'formal', dir, name: 'baseline-v0-ledger-only' })).toBe(join(dir, 'baseline-v0-ledger-only.json'));
    expect(writeResults(results, { out: 'formal', dir, name: 'baseline-v0-ledger-only' })).toBe(join(dir, 'baseline-v0-ledger-only-r2.json'));
  });
});

describe('the report derives from the results file only (TC-016)', () => {
  it('renders byte-identically twice', () => {
    expect(renderReport(path)).toBe(renderReport(path));
  });

  it('prints the same numbers as the results file', () => {
    const md = renderReport(path);
    const r = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile;
    expect(md).toContain(`**Overall: ${r.summary.overall}**`);
    const t = r.totals;
    expect(md).toContain(`| ${t.active} | ${t.passed} | ${t.failed} | ${t.notYetImplemented} | ${t.errored} | ${t.skipped} |`);
    for (const s of ['1', '2', '3', '4'] as const) {
      const x = r.detection.perScenario[s];
      expect(md).toContain(`| ${s} | ${x.k}/${x.n} | ${pct(x.rate)} | ${pct(x.wilson95.lower)}–${pct(x.wilson95.upper)} |`);
    }
    for (const g of r.gates) expect(md).toMatch(new RegExp(`\\| ${g.id} [^|]*\\|[^|]*\\| ${g.display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|`));
    for (const c of r.cases.filter((x) => x.outcome !== 'passed')) expect(md).toContain(c.id);
    expect(md).toContain(r.provenance.config.hash);
    expect(md).toContain(r.provenance.dataset.sha256);
  });

  it('shows the pairs side by side, the known limitations and the sample-size caveat', () => {
    const md = renderReport(path);
    expect(md).toMatch(/EVAL-019 \| EVAL-040/);
    expect(md).toMatch(/EVAL-005 \| EVAL-026/);
    expect(md).toContain('EVAL-029');
    expect(md).toContain('EVAL-036');
    expect(md).toMatch(/\| GAP-7 \(EVAL-049\) \| 4 \| Rejected \| Earlier captures in a season are not re-scored/); // TKT-09
    expect(md).toMatch(/Wilson/);
    expect(md).toMatch(/10\/10 .*72\.2 %/);
  });

  it('shows the proof suite with a library column and the clean-room checker column (S6, TKT-15, TKT-18)', () => {
    const md = renderReport(path);
    expect(md).toContain('## Proof suite (S6)');
    expect(md).toContain('| Case | Outcome | Library verifier | Clean-room checker |');
    expect(md).toMatch(/\| EVAL-058 \| passed \| [^|]*closure entries[^|]* \| \d+\/\d+ closure entries verified \(coverage 100\.0 %\) \|/);
    expect(md).toMatch(/\| EVAL-063 \| passed \| dropped-entry: closure-incomplete; reordered-entries: merkle-path \| dropped-entry: closure-incomplete; reordered-entries: merkle-path \|/);
    expect(md).toMatch(/\| EVAL-103 \| not_yet_implemented \| — \| — \|/);
    expect(md).toContain('S6 score (evals/scorers/proof-verifier.ts): coverage library 100.0 %, clean-room 100.0 %');
    expect(md).toContain('variants accepted by either verifier: none (run-level CF-04');
  });

  it('lists the cases outside the milestone scope in their own section (TKT-18 milestone scoping)', () => {
    const md = renderReport(path);
    expect(md).toContain('Milestone scope: `M1`.');
    expect(md).toContain('## Out of milestone scope');
    expect(md).toMatch(/\| EVAL-103 \| harness-proof \| M2 \| not_yet_implemented \| [^|]*--ledger=evm[^|]* \|/);
  });

  it('the CLI prints the same report', () => {
    const out = execFileSync(join('node_modules', '.bin', 'tsx'), ['evals/harness/report.ts', path], { encoding: 'utf8' });
    expect(out).toBe(renderReport(path));
  }, 30_000);
});
