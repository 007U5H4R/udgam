import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../../src/lib/verification/registry';
import type { CaseResult } from '../scorers/case-assertions';
import { buildCase } from './mutate';
import { evaluate, parseArgs, runHarness } from './run';

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
});

describe('the harness never hides a case (TC-015, EVAL-092)', () => {
  it('a missing check → not_yet_implemented (failed); a setup throw → errored; totals reconcile; exit 1', async () => {
    const registry = REGISTRY.filter((c) => c.id !== 'geofence');
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
    expect(t.skipped).toBe(0);
    expect(t.active).toBe(t.passed + t.failed + t.errored);
    expect(t.failed).toBeGreaterThanOrEqual(t.notYetImplemented);
    expect(t.errored).toBe(1);
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
});
