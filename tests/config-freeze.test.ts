import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_HASH } from '../src/lib/verification/config';
import { loadDataset, type EvalCase } from '../evals/harness/dataset';
import { REPO_ROOT } from '../evals/harness/provenance';
import { renderReport } from '../evals/harness/report';
import { RESULTS_DIR } from '../evals/harness/results';
import { BASELINE_V1_FILE, BASELINE_V1_REPORT, main, parseArgs, runHarness } from '../evals/harness/run';

// TSK-21.2 (TKT-21, EV13, CF-13): the verification config `cfg-1` is frozen by baseline-v1. Once
// evals/results/baseline-v1.json exists, CONFIG_HASH must equal its provenance.config.hash, unless
// evals/config-changes.md lists the new hash with a TP/EV decision ID (recorded in decisions.md) and,
// for every scenario the change affects, at least two NEW attack-case IDs (absent from baseline-v1)
// that already exist in the dataset as attack cases of that scenario (evaluation-plan §10).
// Before baseline-v1 exists the guard passes vacuously.
//
// evals/config-changes.md format: one table row per authorised config change, e.g.
//   | Config hash | Decision | Scenarios | New attack cases |
//   |---|---|---|---|
//   | <64-hex sha-256> | EV17 | 1, 3 | EVAL-150, EVAL-151, EVAL-152, EVAL-153 |

type Freeze = { ok: boolean; reason: string };
type FreezeInput = {
  resultsDir: string;
  configHash: string;
  changesPath: string;
  decisionsPath: string;
  cases: Pick<EvalCase, 'id' | 'case_class' | 'scenario'>[];
};

const readOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
};

/** The freeze guard. Fails closed: an unreadable or malformed baseline is a failure, never "absent". */
function checkConfigFreeze(i: FreezeInput): Freeze {
  let text: string | null;
  try {
    text = readOrNull(join(i.resultsDir, BASELINE_V1_FILE));
  } catch (e) {
    return { ok: false, reason: `baseline-v1 exists but cannot be read: ${(e as Error).message}` };
  }
  if (text === null) return { ok: true, reason: 'no baseline-v1 yet: the guard passes vacuously' };
  let baseline: { provenance?: { config?: { hash?: unknown } }; cases?: { id?: unknown }[] };
  try {
    baseline = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'baseline-v1 is not valid JSON' };
  }
  const frozen = baseline.provenance?.config?.hash;
  if (typeof frozen !== 'string' || !/^[0-9a-f]{64}$/.test(frozen)) return { ok: false, reason: 'baseline-v1 lacks provenance.config.hash' };
  if (!Array.isArray(baseline.cases)) return { ok: false, reason: 'baseline-v1 lacks cases' };
  if (frozen === i.configHash) return { ok: true, reason: `CONFIG_HASH equals the baseline-v1 hash ${frozen}` };

  const drift = `CONFIG_HASH ${i.configHash} differs from the baseline-v1 hash ${frozen}`;
  const changes = readOrNull(i.changesPath);
  if (changes === null) return { ok: false, reason: `${drift}, and there is no evals/config-changes.md authorising it` };
  const row = changes.split('\n').find((l) => l.trim().startsWith('|') && l.includes(i.configHash));
  if (!row) return { ok: false, reason: `${drift}, and evals/config-changes.md does not list ${i.configHash}` };
  const cells = row.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 4) return { ok: false, reason: `the config-changes row for ${i.configHash} needs 4 cells (hash | decision | scenarios | new attack cases)` };
  const [, decisionCell, scenarioCell, caseCell] = cells as [string, string, string, string];

  const decision = /^(TP|EV)\d+$/.exec(decisionCell)?.[0];
  if (!decision) return { ok: false, reason: `${drift}: the row names no TP/EV decision (got "${decisionCell}")` };
  const decisions = readOrNull(i.decisionsPath) ?? '';
  if (!new RegExp(`^## ${decision} `, 'm').test(decisions)) return { ok: false, reason: `${drift}: decision ${decision} is not recorded in decisions.md` };

  const scenarios = [...scenarioCell.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (scenarios.length === 0) return { ok: false, reason: `${drift}: the row names no affected scenario` };
  const inBaseline = new Set(baseline.cases.map((c) => c.id));
  const byId = new Map(i.cases.map((c) => [c.id, c]));
  const listed = [...caseCell.matchAll(/EVAL-\d{3,}/g)].map((m) => m[0]);
  for (const s of scenarios) {
    const fresh = listed.filter((id) => {
      const c = byId.get(id);
      return c !== undefined && c.case_class === 'attack' && c.scenario === s && !inBaseline.has(id);
    });
    if (new Set(fresh).size < 2) {
      return { ok: false, reason: `${drift}: scenario ${s} needs ≥ 2 new attack cases already in the dataset (and not in baseline-v1); found ${fresh.length === 0 ? 'none' : fresh.join(', ')}` };
    }
  }
  return { ok: true, reason: `${drift}, authorised by ${decision} with new attack cases for scenario(s) ${scenarios.join(', ')}` };
}

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
      changesPath: join(REPO_ROOT, 'evals', 'config-changes.md'),
      decisionsPath: join(REPO_ROOT, 'decisions.md'),
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
  ])('fails a drift when config-changes.md has %s', (_why, changes, reason) => {
    const r = freeze(world({ baselineHash: OTHER_HASH, changes }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(reason);
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
