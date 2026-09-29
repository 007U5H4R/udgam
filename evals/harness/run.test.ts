import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../../src/lib/verification/config';
import { REGISTRY } from '../../src/lib/verification/registry';
import type { CaseResult } from '../scorers/case-assertions';
import { buildCase } from './mutate';
import { loadDataset } from './dataset';
import { caseLimitMs, CASE_TIMEOUT_MS, evaluate, main, parseArgs, runHarness } from './run';

// TC-015 (EVAL-092, CF-12): the harness never hides a case. TC-014 (order independence).

const strip = (cs: CaseResult[]) => cs.map((c) => ({ ...c, durationMs: 0 }));

describe('parseArgs', () => {
  it('reads every flag, with fixture / both suites / local as defaults', () => {
    expect(parseArgs([])).toMatchObject({ config: 'full', provider: 'fixture', suites: ['harness-verifier', 'harness-proof'], out: 'local' });
    expect(parseArgs(['--config=ledger-only', '--suite=harness-verifier', '--seed=42', '--out=formal', '--name=baseline-v0-ledger-only', '--report-name=baseline-v0'])).toMatchObject({
      config: 'ledger-only',
      suites: ['harness-verifier'],
      seed: 42,
      out: 'formal',
      name: 'baseline-v0-ledger-only',
      reportName: 'baseline-v0',
    });
    expect(() => parseArgs(['--config=everything'])).toThrow(/--config/);
    expect(() => parseArgs(['--suite=harness-magic'])).toThrow(/--suite/);
    expect(() => parseArgs(['--bogus'])).toThrow(/--bogus/);
  });

  it('validates --name and --report-name up front as plain file stems (no empty name, no path segments)', () => {
    expect(() => parseArgs(['--name='])).toThrow(/--name/);
    expect(() => parseArgs(['--name=../escape'])).toThrow(/--name/);
    expect(() => parseArgs(['--report-name=../../README'])).toThrow(/--report-name/);
    expect(() => parseArgs(['--report-name=a/b'])).toThrow(/--report-name/);
    expect(() => parseArgs(['--report-name='])).toThrow(/--report-name/);
  });
});

describe('exit codes: 0 pass, 1 gate failure, 2 usage error or harness crash', () => {
  const quiet = { log: () => undefined, error: () => undefined };
  it('a bad flag exits 2 before anything runs', async () => {
    let ran = false;
    const code = await main(['--name=../x'], async () => {
      ran = true;
      throw new Error('must not run');
    }, quiet);
    expect(code).toBe(2);
    expect(ran).toBe(false);
  });

  it('a harness crash exits 2, not the gate-failure 1', async () => {
    expect(await main(['--seed=1'], async () => Promise.reject(new Error('harness bug')), quiet)).toBe(2);
  });

  it('a completed run passes its own exit code through (1 = gates failed)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'udgam-main-'));
    const code = await main(['--seed=1', '--suite=harness-verifier'], (o) => runHarness({ ...o, resultsDir: join(root, 'results') }), quiet);
    expect(code).toBe(1);
  });
});

describe('the harness never hides a case (TC-015, EVAL-092)', () => {
  it('a missing check → not_yet_implemented (failed); a setup throw → errored; totals reconcile; exit 1', async () => {
    // Only signature_valid: geofence (and every later check) is missing, so the counts below are fixed.
    const registry = REGISTRY.filter((c) => c.id === 'signature_valid');
    const run = await evaluate({
      seed: 7,
      registry,
      buildCase: (c, inputs, keys) => (c.id === 'EVAL-002' ? Promise.reject(new RangeError('setup exploded')) : buildCase(c, inputs, keys)),
    });
    const byId = new Map(run.cases.map((c) => [c.id, c]));

    // EVAL-022 asserts geofence: with geofence gone it is not_yet_implemented, never dropped.
    expect(byId.get('EVAL-022')).toMatchObject({ outcome: 'not_yet_implemented', missingChecks: expect.arrayContaining(['geofence']) });
    expect(byId.get('EVAL-002')).toMatchObject({ outcome: 'errored', error: { class: 'RangeError', message: 'setup exploded' }, result: null });
    // The proof suite is registered but not built: every case reported, none dropped.
    expect(byId.get('EVAL-058')).toMatchObject({ suite: 'harness-proof', outcome: 'not_yet_implemented' });

    const t = run.totals;
    expect(t).toMatchObject({ ok: true, active: 60, passed: 2, failed: 57, notYetImplemented: 57, errored: 1, skipped: 0 });
    expect(t.active).toBe(t.passed + t.failed + t.errored);
    expect(run.cases).toHaveLength(t.active);
    expect(run.summary.exitCode).toBe(1);
    expect(run.gates.find((g) => g.id === 'S1')!.pass).toBe(false);
  });

  it('every in-scope case appears exactly once and the totals equal the dataset count', async () => {
    const run = await evaluate({ seed: 1 });
    const ids = run.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run.totals.active).toBe(60); // 49 active + 3 stretch harness-verifier, 8 harness-proof (dataset 0.2.0)
    expect(run.totals.skipped).toBe(0);
    expect(run.totals.ok).toBe(true);
  });

  it('a case whose verify() result lacks a check it asserts fails (attribution and status), it is not skipped', async () => {
    const run = await evaluate({ seed: 3, config: 'ledger-only' });
    const c = run.cases.find((x) => x.id === 'EVAL-022')!;
    expect(c.outcome).toBe('failed');
    expect(c.detected).toBe(false);
    expect(c.result!.checks.map((x) => x.id)).toEqual(['signature_valid']);
  });

  it('runs offline: fetch is stubbed during the run and restored afterwards', async () => {
    const before = globalThis.fetch;
    const run = await evaluate({
      seed: 5,
      suites: ['harness-verifier'],
      buildCase: async (c, inputs, keys) => {
        if (c.id === 'EVAL-001') await fetch('https://example.invalid/').catch(() => undefined);
        return buildCase(c, inputs, keys);
      },
    });
    expect(run.runtime.networkCalls).toEqual(['https://example.invalid/']);
    expect(run.totals.ok).toBe(false);
    expect(run.criticalConditions.map((f) => f.id)).toContain('CF-12');
    expect(globalThis.fetch).toBe(before);
  });
});

describe('per-case watchdog', () => {
  it('a case that never settles is recorded as errored with reason timeout, and the run goes on', async () => {
    const run = await evaluate({
      seed: 4,
      suites: ['harness-verifier'],
      caseTimeoutMs: 50,
      buildCase: (c, inputs, keys) => (c.id === 'EVAL-001' ? new Promise(() => undefined) : buildCase(c, inputs, keys)),
    });
    const c = run.cases.find((x) => x.id === 'EVAL-001')!;
    expect(c).toMatchObject({ outcome: 'errored', result: null, error: { class: 'CaseTimeout', message: 'timeout: the case did not settle within 50 ms' } });
    expect(run.totals).toMatchObject({ active: 52, errored: 1, skipped: 0, ok: true });
  });

  it('the limit is the case own max_latency_ms when it has one, else 30 s', () => {
    const ds = loadDataset();
    expect(CASE_TIMEOUT_MS).toBe(30_000);
    expect(caseLimitMs(ds.cases.find((c) => c.id === 'EVAL-001')!)).toBe(30_000);
    expect(caseLimitMs({ ...ds.cases.find((c) => c.id === 'EVAL-001')!, expected: { verdict: 'Verified', max_latency_ms: 3000 } })).toBe(3000);
    expect(caseLimitMs(ds.cases.find((c) => c.id === 'EVAL-001')!, 50)).toBe(50);
  });
});

describe('baseline and previous-run files fail closed (CF-13, CF-12)', () => {
  const dirWith = (files: Record<string, string | null>) => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-results-'));
    for (const [name, body] of Object.entries(files)) {
      if (body === null) mkdirSync(join(dir, name)); // exists but cannot be read as a file
      else writeFileSync(join(dir, name), body);
    }
    return dir;
  };
  const run = (resultsDir: string) => evaluate({ seed: 9, suites: ['harness-verifier'], resultsDir });
  const ids = (r: Awaited<ReturnType<typeof run>>) => r.criticalConditions.map((f) => f.id);

  it('no baseline-v1 yet → absent: no CF-13, integrity intact', async () => {
    const r = await run(dirWith({}));
    expect(ids(r)).not.toContain('CF-13');
    expect(r.totals.ok).toBe(true);
    expect(r.comparison.baseline).toBeNull();
  });

  it('a baseline-v1 with the current config hash → no CF-13', async () => {
    const v1 = { provenance: { timestampUtc: '2026-10-01T00:00:00.000Z', config: { hash: CONFIG_HASH } }, gates: [{ id: 'S1', display: '96.0 %' }], cases: [] };
    const r = await run(dirWith({ 'baseline-v1.json': JSON.stringify(v1) }));
    expect(ids(r)).not.toContain('CF-13');
    expect(r.totals.ok).toBe(true);
    expect(r.comparison.baseline).toEqual({ name: 'baseline-v1', file: 'baseline-v1.json', gates: [{ id: 'S1', display: '96.0 %' }] });
  });

  it('a baseline-v1 that does not parse → CF-13 and an integrity problem (S7 FAIL, CF-12), exit 1', async () => {
    const r = await run(dirWith({ 'baseline-v1.json': '{"provenance": <<<<<<< HEAD' }));
    expect(ids(r)).toEqual(expect.arrayContaining(['CF-12', 'CF-13']));
    expect(r.criticalConditions.find((f) => f.id === 'CF-13')!.reason).toMatch(/baseline-v1\.json.*not valid JSON/);
    expect(r.totals.ok).toBe(false);
    expect(r.totals.problems.join('\n')).toMatch(/baseline-v1\.json.*not valid JSON/);
    expect(r.gates.find((g) => g.id === 'S7')!.pass).toBe(false);
    expect(r.summary.exitCode).toBe(1);
  });

  it('a baseline-v1 without provenance.config.hash → CF-13', async () => {
    const r = await run(dirWith({ 'baseline-v1.json': JSON.stringify({ provenance: { timestampUtc: 'x', config: {} }, gates: [], cases: [] }) }));
    expect(r.criticalConditions.find((f) => f.id === 'CF-13')!.reason).toMatch(/baseline-v1\.json.*provenance\.config\.hash/);
    expect(r.totals.ok).toBe(false);
  });

  it('a baseline-v1 that exists but cannot be read → CF-13', async () => {
    const r = await run(dirWith({ 'baseline-v1.json': null }));
    expect(r.criticalConditions.find((f) => f.id === 'CF-13')!.reason).toMatch(/baseline-v1\.json.*cannot be read/);
    expect(r.totals.ok).toBe(false);
  });

  it('a corrupt formal run or baseline-v0 is an integrity problem, never silently skipped', async () => {
    const r = await run(dirWith({ 'eval-run-0.1.0-abc1234.json': '{truncated', 'baseline-v0-ledger-only.json': JSON.stringify({ provenance: {} }) }));
    const problems = r.totals.problems.join('\n');
    expect(problems).toMatch(/eval-run-0\.1\.0-abc1234\.json.*not valid JSON/);
    expect(problems).toMatch(/baseline-v0-ledger-only\.json.*provenance\.config\.hash/);
    expect(ids(r)).toContain('CF-12');
    expect(ids(r)).not.toContain('CF-13');
    expect(r.comparison).toMatchObject({ previous: null, baseline: null });
  });
});

describe('order independence (TC-014)', () => {
  it('two shuffle seeds → identical per-case results', async () => {
    const a = await evaluate({ seed: 11 });
    const b = await evaluate({ seed: 12 });
    expect(a.runtime.executionOrder).not.toEqual(b.runtime.executionOrder);
    expect(strip(b.cases)).toEqual(strip(a.cases));
    expect(a.provenance.seed).toBe(11);
  });
});

describe('runHarness writes results and a report derived from them', () => {
  it('exit 1 now (most checks are not built), and both files land where --out says', async () => {
    const root = mkdtempSync(join(tmpdir(), 'udgam-run-'));
    const r = await runHarness({ seed: 2, out: 'formal', resultsDir: join(root, 'results'), reportsDir: join(root, 'reports') });
    expect(r.exitCode).toBe(1);
    expect(r.resultsPath).toMatch(/results\/eval-run-\d+\.\d+\.\d+-[0-9a-f]{7,}\.json$/);
    expect(r.reportPath).toMatch(/reports\/eval-report-\d+\.\d+\.\d+-[0-9a-f]{7,}\.md$/);
    const results = JSON.parse(readFileSync(r.resultsPath, 'utf8'));
    expect(results.summary.overall).toBe('FAIL');
    expect(readFileSync(r.reportPath, 'utf8')).toContain('**Overall: FAIL**');
  });

  it('never overwrites a report: an existing one keeps its bytes and the new report gets -rN', async () => {
    const root = mkdtempSync(join(tmpdir(), 'udgam-run-'));
    const reportsDir = join(root, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, 'eval-report-baseline-v0.md'), 'COMMITTED\n');
    const opts = { seed: 2, suites: ['harness-verifier' as const], out: 'formal' as const, name: 'foo', reportName: 'baseline-v0', resultsDir: join(root, 'results'), reportsDir };
    const a = await runHarness(opts);
    expect(a.resultsPath).toMatch(/results\/foo\.json$/);
    expect(a.reportPath).toMatch(/reports\/eval-report-baseline-v0-r2\.md$/);
    expect(readFileSync(join(reportsDir, 'eval-report-baseline-v0.md'), 'utf8')).toBe('COMMITTED\n');
    const b = await runHarness(opts);
    expect(b.resultsPath).toMatch(/results\/foo-r2\.json$/);
    expect(b.reportPath).toMatch(/reports\/eval-report-baseline-v0-r3\.md$/);
    expect(existsSync(a.reportPath)).toBe(true);
  });
});
