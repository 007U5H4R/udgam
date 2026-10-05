import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../src/lib/verification/config';
import { checkConfigFreeze, CONFIG_CHANGES_PATH, DECISIONS_PATH, type FreezeInput } from '../evals/harness/config-freeze';
import { loadDataset } from '../evals/harness/dataset';
import { renderReport } from '../evals/harness/report';
import { RESULTS_DIR } from '../evals/harness/results';
import { BASELINE_V1_FILE, BASELINE_V1_REPORT, evaluate, main, parseArgs, runHarness } from '../evals/harness/run';

// TSK-21.2 (TKT-21, EV13, CF-13): the verification config `cfg-1` is frozen by baseline-v1. Once
// evals/results/baseline-v1.json exists, CONFIG_HASH must equal its provenance.config.hash, unless
// evals/config-changes.md lists the new hash with a TP/EV decision ID (recorded in decisions.md) and,
// for every scenario the change affects, at least two NEW attack-case IDs (absent from baseline-v1)
// that already exist in the dataset as attack cases of that scenario (evaluation-plan §10).
// Before baseline-v1 exists the guard passes vacuously.
// The rule itself is evals/harness/config-freeze.ts (EXE34): this test and the harness's CF-13 (run.ts)
// call the same function, so a drift the test rejects can never pass the gate. A bare mention of a hash
// in decisions.md authorises nothing.
//
// evals/config-changes.md format: one table row per authorised config change, e.g.
//   | Config hash | Decision | Scenarios | New attack cases |
//   |---|---|---|---|
//   | <64-hex sha-256> | EV17 | 1, 3 | EVAL-150, EVAL-151, EVAL-152, EVAL-153 |

const root = mkdtempSync(join(tmpdir(), 'udgam-freeze-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let k = 0;
const OTHER_HASH = 'f'.repeat(64);

/** A temporary world: results dir, decisions.md, optional config-changes.md, and a planted baseline. */
function world(o: { baselineHash?: string | null; baselineText?: string; baselineCases?: string[]; changes?: string; decisions?: string }) {
  const dir = join(root, `w${++k}`);
  const resultsDir = join(dir, 'results');
  mkdirSync(resultsDir, { recursive: true });
  if (o.baselineText !== undefined) writeFileSync(join(resultsDir, BASELINE_V1_FILE), o.baselineText);
  else if (o.baselineHash !== null && o.baselineHash !== undefined) {
    writeFileSync(
      join(resultsDir, BASELINE_V1_FILE),
      JSON.stringify({ provenance: { config: { hash: o.baselineHash } }, cases: (o.baselineCases ?? ['EVAL-022', 'EVAL-023']).map((id) => ({ id, outcome: 'passed' })) }),
    );
  }
  const changesPath = join(dir, 'config-changes.md');
  if (o.changes !== undefined) writeFileSync(changesPath, o.changes);
  const decisionsPath = join(dir, 'decisions.md');
  writeFileSync(decisionsPath, o.decisions ?? '# Decisions\n\n## EV17 · Tighten the geofence buffer — accepted\nreason\n');
  return { resultsDir, changesPath, decisionsPath };
}

const CASES: FreezeInput['cases'] = [
  { id: 'EVAL-022', case_class: 'attack', scenario: 1 },
  { id: 'EVAL-150', case_class: 'attack', scenario: 1 },
  { id: 'EVAL-151', case_class: 'attack', scenario: 1 },
  { id: 'EVAL-152', case_class: 'attack', scenario: 3 },
  { id: 'EVAL-153', case_class: 'attack', scenario: 3 },
  { id: 'EVAL-154', case_class: 'legitimate', scenario: null },
];
const row = (cells: string) => `| Config hash | Decision | Scenarios | New attack cases |\n|---|---|---|---|\n| ${cells} |\n`;
const freeze = (w: ReturnType<typeof world>, configHash = CONFIG_HASH) => checkConfigFreeze({ ...w, configHash, cases: CASES });

describe('the frozen verification config (TSK-21.2, EV13, CF-13)', () => {
  it('in this repository, CONFIG_HASH matches baseline-v1 or an authorised change (vacuous before baseline-v1)', () => {
    const r = checkConfigFreeze({
      resultsDir: RESULTS_DIR,
      configHash: CONFIG_HASH,
      changesPath: CONFIG_CHANGES_PATH,
      decisionsPath: DECISIONS_PATH,
      cases: loadDataset().cases,
    });
    expect(r, r.reason).toMatchObject({ ok: true });
  });

  it('passes vacuously with no baseline-v1', () => {
    expect(freeze(world({ baselineHash: null }))).toMatchObject({ ok: true, reason: expect.stringMatching(/vacuous/) });
  });

  it('FAILS with a planted fake baseline carrying a different hash', () => {
    const r = freeze(world({ baselineHash: OTHER_HASH }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(OTHER_HASH);
    expect(r.reason).toContain(CONFIG_HASH);
    expect(r.reason).toMatch(/no evals\/config-changes\.md/);
  });

  it('passes with a planted baseline carrying the current hash', () => {
    expect(freeze(world({ baselineHash: CONFIG_HASH })).ok).toBe(true);
  });

  it('fails closed on a baseline that is not JSON, lacks the hash, or lacks cases', () => {
    expect(freeze(world({ baselineText: '{not json' }))).toMatchObject({ ok: false, reason: 'baseline-v1 is not valid JSON' });
    expect(freeze(world({ baselineText: JSON.stringify({ provenance: {}, cases: [] }) }))).toMatchObject({ ok: false, reason: 'baseline-v1 lacks provenance.config.hash' });
    expect(freeze(world({ baselineText: JSON.stringify({ provenance: { config: { hash: OTHER_HASH } } }) }))).toMatchObject({ ok: false, reason: 'baseline-v1 lacks cases' });
  });

  it('passes a drift that config-changes.md authorises: a recorded EV decision and two new attack cases per affected scenario', () => {
    const w = world({ baselineHash: OTHER_HASH, changes: row(`${CONFIG_HASH} | EV17 | 1, 3 | EVAL-150, EVAL-151, EVAL-152, EVAL-153`) });
    expect(freeze(w)).toMatchObject({ ok: true, reason: expect.stringMatching(/authorised by EV17/) });
  });

  it.each([
    ['the hash is not listed', row(`${'e'.repeat(64)} | EV17 | 1 | EVAL-150, EVAL-151`), /does not list/],
    ['no TP/EV decision', row(`${CONFIG_HASH} | — | 1 | EVAL-150, EVAL-151`), /names no TP\/EV decision/],
    ['a decision missing from decisions.md', row(`${CONFIG_HASH} | TP99 | 1 | EVAL-150, EVAL-151`), /TP99 is not recorded in decisions\.md/],
    ['no affected scenario', row(`${CONFIG_HASH} | EV17 | — | EVAL-150, EVAL-151`), /names no affected scenario/],
    ['only one new case for scenario 1', row(`${CONFIG_HASH} | EV17 | 1 | EVAL-150`), /scenario 1 needs ≥ 2 new attack cases.*found EVAL-150$/],
    ['a "new" case that was already in baseline-v1', row(`${CONFIG_HASH} | EV17 | 1 | EVAL-022, EVAL-150`), /scenario 1 needs ≥ 2/],
    ['a case not in the dataset', row(`${CONFIG_HASH} | EV17 | 1 | EVAL-150, EVAL-999`), /scenario 1 needs ≥ 2/],
    ['a non-attack case', row(`${CONFIG_HASH} | EV17 | 1 | EVAL-150, EVAL-154`), /scenario 1 needs ≥ 2/],
    ['cases of another scenario', row(`${CONFIG_HASH} | EV17 | 1, 3 | EVAL-150, EVAL-151, EVAL-152`), /scenario 3 needs ≥ 2.*found EVAL-152$/],
    ['the same case listed twice', row(`${CONFIG_HASH} | EV17 | 1 | EVAL-150, EVAL-150`), /scenario 1 needs ≥ 2/],
    ['the hash only in a later cell, not as the row\'s config hash', row(`${'e'.repeat(64)} | EV17 | 1 | EVAL-150, EVAL-151 (was ${CONFIG_HASH})`), /does not list/],
  ])('fails a drift when config-changes.md has %s', (_why, changes, reason) => {
    const r = freeze(world({ baselineHash: OTHER_HASH, changes }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(reason);
  });
});

describe('one rule: the harness CF-13 uses the same authorisation (EXE34)', () => {
  const s1 = loadDataset()
    .cases.filter((c) => c.case_class === 'attack' && c.scenario === 1 && c.status === 'active')
    .map((c) => c.id);
  const cf13 = async (w: ReturnType<typeof world>) => (await evaluate({ seed: 1, suites: ['harness-proof'], proofSuite: async () => [], resultsDir: w.resultsDir, configChangesPath: w.changesPath, decisionsPath: w.decisionsPath })).criticalConditions.filter((f) => f.id === 'CF-13');
  const planted = (o: { changes?: string; decisions?: string }) => {
    const w = world({ baselineHash: null, ...o });
    writeFileSync(join(w.resultsDir, BASELINE_V1_FILE), JSON.stringify({ provenance: { config: { hash: OTHER_HASH } }, gates: [], cases: [] }));
    return w;
  };

  it('a "Rejected" decision that names the new hash does NOT authorise it: CF-13 fires', async () => {
    const w = planted({ decisions: `# Decisions\n\n## EXE99 · Rejected: we will NOT move to config ${CONFIG_HASH} — rejected\n` });
    expect(await cf13(w)).toHaveLength(1);
  });

  it('a drift with no config-changes row fires CF-13; a complete row (recorded decision, two new attack cases) clears it', async () => {
    expect(s1.length).toBeGreaterThanOrEqual(2);
    expect(await cf13(planted({}))).toHaveLength(1);
    expect(await cf13(planted({ changes: row(`${CONFIG_HASH} | EV17 | 1 | ${s1[0]}, ${s1[1]}`) }))).toEqual([]);
    expect(await cf13(planted({ changes: row(`${CONFIG_HASH} | EV17 | 1 | ${s1[0]}`) }))).toHaveLength(1);
  });
});

describe('pnpm eval --baseline=v1 (TSK-21.2)', () => {
  const quiet = { log: () => {}, error: () => {} };
  const clean = { git: () => ({ dirty: false }) };

  it('parses --baseline=v1 into a formal, full-config M1 run, and refuses anything else', () => {
    expect(parseArgs(['--baseline=v1'])).toMatchObject({ baseline: 'v1', out: 'formal', config: 'full', milestone: 'M1' });
    expect(parseArgs([]).baseline).toBeUndefined();
    expect(() => parseArgs(['--baseline=v2'])).toThrow(/--baseline must be v1/);
    expect(() => parseArgs(['--baseline=v1', '--config=ledger-only'])).toThrow(/--baseline=v1/);
    expect(() => parseArgs(['--baseline=v1', '--suite=harness-verifier'])).toThrow(/--baseline=v1/);
    expect(() => parseArgs(['--baseline=v1', '--out=local'])).toThrow(/--baseline=v1/);
    expect(() => parseArgs(['--baseline=v1', '--milestone=M2'])).toThrow(/--baseline=v1/);
    expect(() => parseArgs(['--baseline=v1', '--ledger=evm'])).toThrow(/--baseline=v1/);
    expect(() => parseArgs(['--baseline=v1', '--name=x'])).toThrow(/--baseline=v1/);
  });

  it('writes the formal run, a byte-identical baseline-v1.json and a report that regenerates byte-identically from it', async () => {
    const dir = join(root, `b${++k}`);
    const r = await runHarness({ baseline: 'v1', out: 'formal', seed: 5, suites: ['harness-proof'], proofSuite: async () => [], resultsDir: join(dir, 'results'), reportsDir: join(dir, 'reports') });
    expect(r.baselinePath).toBe(join(dir, 'results', BASELINE_V1_FILE));
    expect(r.resultsPath).toMatch(/results\/eval-run-\d+\.\d+\.\d+-[0-9a-f]{7,}\.json$/);
    expect(readFileSync(r.baselinePath!, 'utf8')).toBe(readFileSync(r.resultsPath, 'utf8'));
    expect(r.baselineReportPath).toBe(join(dir, 'reports', BASELINE_V1_REPORT));
    expect(readFileSync(r.baselineReportPath!, 'utf8')).toBe(renderReport(r.baselinePath!));
    expect(JSON.parse(readFileSync(r.baselinePath!, 'utf8')).provenance.config.hash).toBe(CONFIG_HASH);
  });

  it('refuses to overwrite an existing baseline-v1 (nothing is run or written)', async () => {
    const dir = join(root, `b${++k}`);
    const resultsDir = join(dir, 'results');
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, BASELINE_V1_FILE), 'FROZEN\n');
    let proofRan = false;
    await expect(
      runHarness({
        baseline: 'v1',
        out: 'formal',
        seed: 5,
        suites: ['harness-proof'],
        proofSuite: async () => {
          proofRan = true;
          return [];
        },
        resultsDir,
        reportsDir: join(dir, 'reports'),
      }),
    ).rejects.toThrow(/refusing to overwrite .*baseline-v1\.json/);
    expect(proofRan).toBe(false);
    expect(readFileSync(join(resultsDir, BASELINE_V1_FILE), 'utf8')).toBe('FROZEN\n');
    expect(existsSync(join(dir, 'reports'))).toBe(false);
  });

  it('refuses to overwrite an existing baseline-v1 report', async () => {
    const dir = join(root, `b${++k}`);
    mkdirSync(join(dir, 'reports'), { recursive: true });
    writeFileSync(join(dir, 'reports', BASELINE_V1_REPORT), 'FROZEN\n');
    await expect(
      runHarness({ baseline: 'v1', out: 'formal', seed: 5, suites: ['harness-proof'], proofSuite: async () => [], resultsDir: join(dir, 'results'), reportsDir: join(dir, 'reports') }),
    ).rejects.toThrow(/refusing to overwrite .*eval-report-baseline-v1\.md/);
    expect(existsSync(join(dir, 'results'))).toBe(false);
  });

  it('the CLI exits 2 on a dirty tree or an existing baseline, and never calls the runner', async () => {
    let ran = false;
    const runner = async () => {
      ran = true;
      throw new Error('should not run');
    };
    const errors: string[] = [];
    const io = { log: () => {}, error: (s: string) => errors.push(s) };
    expect(await main(['--baseline=v1'], runner, io, { git: () => ({ dirty: true }) })).toBe(2);
    expect(errors.join('\n')).toMatch(/clean tree/);
    expect(ran).toBe(false);

    const dir = join(root, `b${++k}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, BASELINE_V1_FILE), '{}');
    errors.length = 0;
    expect(await main(['--baseline=v1'], runner, io, { ...clean, resultsDir: dir })).toBe(2);
    expect(errors.join('\n')).toMatch(/refusing to overwrite/);
    expect(ran).toBe(false);
    expect(await main(['--baseline=v1', '--out=local'], runner, quiet, clean)).toBe(2);
  });
});
