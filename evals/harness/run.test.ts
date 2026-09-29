import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../../src/lib/verification/config';
import { REGISTRY } from '../../src/lib/verification/registry';
import type { CaseResult } from '../scorers/case-assertions';
import { buildCase } from './mutate';
import { loadDataset } from './dataset';
import { runProofSuite } from './proof-suite';
import { REPO_ROOT } from './provenance';
import { caseLimitMs, CASE_TIMEOUT_MS, evaluate, isolateDataDir, main, parseArgs, runHarness } from './run';

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
    // The proof suite runs (TKT-15); EVAL-103 waits on the EVM adapter: reported, never dropped.
    expect(byId.get('EVAL-058')).toMatchObject({ suite: 'harness-proof', outcome: 'passed' });
    expect(byId.get('EVAL-103')).toMatchObject({ suite: 'harness-proof', outcome: 'not_yet_implemented' });

    const t = run.totals;
    // dataset 0.3.0: EVAL-110–113 (TKT-08) assert geofence/EXIF/movement checks, so they are not_yet_implemented here too.
    // + 7 harness-proof passes (EVAL-058–063, 066); EVAL-103 is not yet implemented.
    expect(t).toMatchObject({ ok: true, active: 64, passed: 9, failed: 54, notYetImplemented: 54, errored: 1, skipped: 0 });
    expect(t.active).toBe(t.passed + t.failed + t.errored);
    expect(run.cases).toHaveLength(t.active);
    expect(run.summary.exitCode).toBe(1);
    expect(run.gates.find((g) => g.id === 'S1')!.pass).toBe(false);
  }, 60_000);

  it('every in-scope case appears exactly once and the totals equal the dataset count', async () => {
    const run = await evaluate({ seed: 1 });
    const ids = run.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run.totals.active).toBe(64); // 53 active + 3 stretch harness-verifier, 8 harness-proof (dataset 0.3.0: + EVAL-110–113)
    expect(run.totals.skipped).toBe(0);
    expect(run.totals.ok).toBe(true);
  }, 60_000);

  it('a case whose verify() result lacks a check it asserts fails (attribution and status), it is not skipped', async () => {
    const run = await evaluate({ seed: 3, config: 'ledger-only' });
    const c = run.cases.find((x) => x.id === 'EVAL-022')!;
    expect(c.outcome).toBe('failed');
    expect(c.detected).toBe(false);
    expect(c.result!.checks.map((x) => x.id)).toEqual(['signature_valid']);
  }, 60_000);

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
      caseTimeoutMs: 2000, // generous: only EVAL-001 hangs; a loaded machine must not time out real cases
      buildCase: (c, inputs, keys) => (c.id === 'EVAL-001' ? new Promise(() => undefined) : buildCase(c, inputs, keys)),
    });
    const c = run.cases.find((x) => x.id === 'EVAL-001')!;
    expect(c).toMatchObject({ outcome: 'errored', result: null, error: { class: 'CaseTimeout', message: 'timeout: the case did not settle within 2000 ms' } });
    expect(run.totals).toMatchObject({ active: 56, errored: 1, skipped: 0, ok: true }); // harness-verifier, dataset 0.3.0
  });

  it('the limit is the case own max_latency_ms when it has one, else 30 s', () => {
    const ds = loadDataset();
    expect(CASE_TIMEOUT_MS).toBe(30_000);
    expect(caseLimitMs(ds.cases.find((c) => c.id === 'EVAL-001')!)).toBe(30_000);
    expect(caseLimitMs({ ...ds.cases.find((c) => c.id === 'EVAL-001')!, expected: { verdict: 'Verified', max_latency_ms: 3000 } })).toBe(3000);
    expect(caseLimitMs(ds.cases.find((c) => c.id === 'EVAL-001')!, 50)).toBe(50);
  });
});

describe('harness-proof suite (TSK-15.8, S6-lib)', () => {
  it('runs the proof suite once per run: EVAL-058 at coverage 1, EVAL-059–063 and 066 pass, the clean-room column is kept', async () => {
    const keyFile = resolve(REPO_ROOT, 'data/keys/ledger.jwk');
    const before = existsSync(keyFile) ? statSync(keyFile).mtimeMs : null;
    let calls = 0;
    const run = await evaluate({
      seed: 21,
      suites: ['harness-proof'],
      proofSuite: async (o) => {
        calls++;
        return runProofSuite(o);
      },
    });
    expect(calls).toBe(1);
    const byId = new Map(run.cases.map((c) => [c.id, c]));

    const intact = byId.get('EVAL-058')!;
    expect(intact).toMatchObject({ outcome: 'passed', error: null, result: null });
    expect(intact.proof).toMatchObject({ metrics: { coverage: 1, checkpoints: 2 }, cleanRoom: { status: 'not_yet_implemented' } });
    expect(intact.proof!.metrics!.verified).toBe(intact.proof!.metrics!.closureEntries);
    expect(intact.assertions.every((a) => a.pass)).toBe(true);

    const steps: Record<string, string[]> = {
      'EVAL-059': ['payload-hash'],
      'EVAL-060': ['merkle-path'],
      'EVAL-061': ['checkpoint-signature'],
      'EVAL-062': ['unknown-key'],
      'EVAL-063': ['closure-incomplete', 'merkle-path'],
    };
    for (const [id, want] of Object.entries(steps)) {
      const c = byId.get(id)!;
      expect(c.outcome, id).toBe('passed');
      expect(c.proof!.variants.map((v) => v.lib.step), id).toEqual(want);
      expect(c.assertions.length, id).toBe(want.length);
      expect(c.assertions.every((a) => a.pass), id).toBe(true);
    }
    expect(byId.get('EVAL-066')).toMatchObject({ outcome: 'passed' });
    for (const id of ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066']) {
      expect(byId.get(id)!.proof!.cleanRoom, id).toEqual({ status: 'not_yet_implemented' });
      expect(byId.get(id)!.notes.join('; '), id).toContain('clean-room checker: not_yet_implemented');
    }

    // EVAL-103 (EVM anchoring, M-002) is reported as not yet implemented, never dropped.
    expect(byId.get('EVAL-103')).toMatchObject({ outcome: 'not_yet_implemented' });
    expect(byId.get('EVAL-103')!.notes.join(' ')).toMatch(/TKT-23/);
    expect(run.totals).toMatchObject({ ok: true, active: 8, passed: 7, notYetImplemented: 1, errored: 0, skipped: 0 });
    expect(run.gates.find((g) => g.id === 'S6-lib')).toMatchObject({ display: '87.5 % (7/8)', pass: false, detail: '1 not yet implemented' });
    expect(run.criticalConditions).toEqual([]);

    // The suite used a temporary ledger and key: ./data was not touched.
    expect(existsSync(keyFile) ? statSync(keyFile).mtimeMs : null).toBe(before);
  }, 120_000);

  it('a proof suite that crashes → every proof case it owns is errored, none dropped', async () => {
    const run = await evaluate({
      seed: 22,
      suites: ['harness-proof'],
      proofSuite: async () => {
        throw new RangeError('ledger exploded');
      },
    });
    for (const id of ['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066']) {
      expect(run.cases.find((c) => c.id === id), id).toMatchObject({ outcome: 'errored', error: { class: 'RangeError', message: 'ledger exploded' } });
    }
    expect(run.totals).toMatchObject({ active: 8, errored: 7, skipped: 0 });
    expect(run.criticalConditions.map((f) => f.id)).toContain('CF-04');
  });

  it('the CLI gives pnpm eval a throwaway DATA_DIR, database and ledger key path, never ./data', () => {
    const vars: Record<string, string | undefined> = { DATA_DIR: './data' };
    const dir = isolateDataDir(vars);
    try {
      expect(dir.startsWith(tmpdir())).toBe(true);
      expect(existsSync(dir)).toBe(true);
      expect(vars).toMatchObject({ DATA_DIR: dir, LEDGER_KEY_PATH: join(dir, 'keys', 'ledger.jwk'), DATABASE_URL: `file:${join(dir, 'udgam.db')}`, LOG_LEVEL: 'warn' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
  }, 120_000);
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
  }, 60_000);

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
