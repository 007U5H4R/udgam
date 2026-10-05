import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main, type ReleaseFile } from './release';
import { runSuite, type SuiteCommand } from './test-suites';
import { WORLD, WORLD_READY, worldHarness } from './testing/release-world';
import { treeState } from './tree-state';

// The M-001 formal sequence (docs/exec/m-001-formal-run.md; TASK-22 fix round 1, A-6), simulated end to
// end in a temporary git repository with fixture runners: clean tree at the gate commit → the formal
// harness run and baseline-v1 → baseline-perf-v1 → the suites and the formal release, all at the same
// HEAD with only the formal outputs untracked → ONE commit holding every formal file. The guards that
// make the release fail closed run for real (tree state, run records, provenance, regating).
// No test TITLE here names an EVAL ID (the release would count it as evidence).

const root = mkdtempSync(join(tmpdir(), 'udgam-m001-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' }).toString();

function gateCommit(name: string) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'build/stage7');
  writeFileSync(join(dir, '.gitignore'), 'evals/results/local/\n');
  writeFileSync(join(dir, 'README'), 'the gate commit\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'gate commit');
  const results = join(dir, 'evals', 'results');
  const reports = join(dir, 'evals', 'reports');
  mkdirSync(results, { recursive: true });
  mkdirSync(reports, { recursive: true });
  return { dir, results, reports, tree: () => treeState({ cwd: dir }) };
}

/** Fixture suite runners: the real runSuite (run records and all) with commands that write fixture reports. */
function fixtureRunner(o: { during?: () => void } = {}) {
  const write = (file: string, body: unknown) => `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(JSON.stringify(body))})`;
  const pw = (title: string) => ({ suites: [{ title: 'x.spec.ts', file: 'x.spec.ts', specs: [{ title, file: 'x.spec.ts', tests: [{ projectName: 'phone', status: 'expected', expectedStatus: 'passed' }] }] }], errors: [], stats: { expected: 1, unexpected: 0 } });
  const commands = (suite: 'integration' | 'e2e', outDir: string): SuiteCommand[] =>
    suite === 'integration'
      ? [{ report: 'integration', file: join(outDir, 'integration.json'), command: process.execPath, args: ['-e', write(join(outDir, 'integration.json'), { success: true, numFailedTestSuites: 0, testResults: [{ name: '/repo/a.int.test.ts', status: 'passed', assertionResults: [{ ancestorTitles: [], title: 'EVAL-053 a tampered payload is refused', status: 'passed' }] }] })], env: {} }]
      : [
          { report: 'e2e', file: join(outDir, 'e2e.json'), command: process.execPath, args: ['-e', write(join(outDir, 'e2e.json'), pw('@eval EVAL-064 an unknown batch is not found'))], env: {} },
          { report: 'e2e-demo', file: join(outDir, 'e2e-demo.json'), command: process.execPath, args: ['-e', write(join(outDir, 'e2e-demo.json'), pw('@eval EVAL-073 the Kodagu demo'))], env: {} },
        ];
  return (tree: () => ReturnType<typeof treeState>) =>
    async (suite: 'integration' | 'e2e', outDir: string) => {
      const runs = await runSuite(suite, outDir, { commands: commands(suite, outDir), git: tree });
      o.during?.();
      return runs;
    };
}

/** Step 3 (`pnpm eval --baseline=v1`): the formal harness run, its byte-identical baseline copy and both reports. */
function formalHarnessRun(w: ReturnType<typeof gateCommit>): string {
  const t = w.tree();
  expect(t.dirty).toBe(false); // the harness refuses a dirty tree
  const file = join(w.results, `eval-run-0.1.0-${t.shortSha}.json`);
  writeFileSync(file, `${JSON.stringify(worldHarness({ git: { commit: t.commit, shortSha: t.shortSha, branch: t.branch, dirty: false } }), null, 2)}\n`);
  copyFileSync(file, join(w.results, 'baseline-v1.json'));
  writeFileSync(join(w.reports, `eval-report-0.1.0-${t.shortSha}.md`), '# report\n');
  writeFileSync(join(w.reports, 'eval-report-baseline-v1.md'), '# report\n');
  return file;
}

/** Step 4 (`pnpm eval:perf --out=evals/results/baseline-perf-v1.json`), with the provenance perf/run.ts records. */
function formalPerfRun(w: ReturnType<typeof gateCommit>): string {
  const t = w.tree();
  const file = join(w.results, 'baseline-perf-v1.json');
  const runs = [1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400].map((ms, i) => ({ run: i + 1, ms, finalState: 'verified' }));
  writeFileSync(file, JSON.stringify({ gate: 'S4', case: 'EVAL-071', runs, summary: { n: 10, p50: 1950, p95: 2355, max: 2400, thresholdMs: 3000, pass: true }, pass: true, provenance: { git: { commit: t.commit, shortSha: t.shortSha, branch: t.branch, dirty: t.dirty } } }));
  return file;
}

describe('the M-001 formal sequence in a temporary repository', () => {
  it('runs end to end: one HEAD, only formal outputs untracked, a PASS release, then one commit with every formal file', async () => {
    const w = gateCommit('pass');
    const gate = w.tree();
    expect(gate).toMatchObject({ dirty: false, changes: [], formalOutputs: [] }); // 1. clean tree at the gate commit
    // 2. `pnpm eval:ready` READY (injected: the fixture world is too small; the repository dataset is checked in readiness.test.ts).
    const harness = formalHarnessRun(w); // 3.
    const perf = formalPerfRun(w); // 4.
    const perfGit = JSON.parse(readFileSync(perf, 'utf8')).provenance.git;
    expect(perfGit).toMatchObject({ commit: gate.commit, dirty: false }); // the baseline files written in 3 do not make 4 dirty

    // 5. the suites and the formal release, at the same HEAD
    const lines: string[] = [];
    const code = await main(['--milestone=M1', '--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: (s) => lines.push(s), error: (s) => lines.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY, runSuite: fixtureRunner()(w.tree) });
    expect(lines.filter((l) => l.includes('problem'))).toEqual([]);
    expect(code).toBe(0);
    expect(lines[0]).toBe('eval:release (M1) — PASS');
    const release = JSON.parse(readFileSync(join(w.results, `eval-run-v1-release-${gate.shortSha}.json`), 'utf8')) as ReleaseFile;
    expect(release.provenance.git).toEqual({ commit: gate.commit, shortSha: gate.shortSha, branch: 'build/stage7', dirty: false });
    expect(release.gates.map((g) => `${g.id} ${g.pass ? 'PASS' : 'FAIL'}`)).toEqual(['S1 PASS', 'S1-floor PASS', 'S2 PASS', 'S6-lib PASS', 'S7 PASS', 'CF PASS', 'S4 PASS', 'Cases PASS', 'S7-release PASS']);
    expect(release.provenance.release.sources.map((s) => [s.name, s.exitCode, s.errors.length])).toEqual([
      ['harness', 0, 0],
      ['integration', 0, 0],
      ['e2e', 0, 0],
      ['e2e-demo', 0, 0],
      ['perf', null, 0],
    ]);

    // the HR3 warning (TP29) stays a warning, and the release report carries it
    expect(readFileSync(join(w.reports, 'eval-report-v1.md'), 'utf8')).toContain(WORLD_READY.warnings[0]);

    const formal = [
      `evals/reports/eval-report-0.1.0-${gate.shortSha}.md`,
      'evals/reports/eval-report-baseline-v1.md',
      'evals/reports/eval-report-v1.md',
      'evals/results/baseline-perf-v1.json',
      'evals/results/baseline-v1.json',
      `evals/results/eval-run-0.1.0-${gate.shortSha}.json`,
      `evals/results/eval-run-v1-release-${gate.shortSha}.json`,
    ];
    expect(w.tree()).toMatchObject({ commit: gate.commit, dirty: false, changes: [], formalOutputs: formal }); // nothing else untracked

    // 6. ONE commit with every formal file (the suite reports stay git-ignored under evals/results/local/)
    git(w.dir, 'add', '-A');
    git(w.dir, 'commit', '-q', '-m', 'Record the M-001 formal evaluation (TASK-22)');
    expect(git(w.dir, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual(formal);
    expect(w.tree()).toMatchObject({ dirty: false, formalOutputs: [] });
  });

  it('refuses the formal release (exit 2, nothing written) when anything but formal outputs is untracked', async () => {
    const w = gateCommit('stray');
    const harness = formalHarnessRun(w);
    const perf = formalPerfRun(w);
    writeFileSync(join(w.dir, 'notes.txt'), 'scratch\n');
    let ran = 0;
    const errors: string[] = [];
    const code = await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: () => {}, error: (s) => errors.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY, runSuite: async () => void ran++ });
    expect(code).toBe(2);
    expect(errors[0]).toMatch(/the tree has changes outside the untracked formal outputs: \?\? notes\.txt/);
    expect(ran).toBe(0);
    expect(w.tree().formalOutputs.filter((f) => f.includes('release') || f.endsWith('eval-report-v1.md'))).toEqual([]);
  });

  // TASK-22 re-review R-1 / Q-2 (the probe): attempt 1 fails, attempt 2 at the same HEAD is refused, so a
  // formal release can never be rerun until it passes; the FAIL pair stays for step 6's commit.
  it('a second formal release at the same HEAD is refused (exit 2) and the first attempt stays as it was', async () => {
    const w = gateCommit('retry');
    const harness = formalHarnessRun(w);
    const perf = formalPerfRun(w);
    const deps = { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY };
    // attempt 1 fails: the dataset names a case no test covers, so it is missing
    const lines1: string[] = [];
    const dsNoE2e = { cases: WORLD.cases.map((c) => (c.id === 'EVAL-064' ? { ...c, id: 'EVAL-065' } : c)) }; // EVAL-065 has no test: missing, so the release FAILs
    expect(await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: (s) => lines1.push(s), error: (s) => lines1.push(s) }, { ...deps, dataset: dsNoE2e, runSuite: fixtureRunner()(w.tree) })).toBe(1);
    expect(lines1[0]).toBe('eval:release (M1) — FAIL');
    const sha = w.tree().shortSha;
    const before = readdirSync(w.results).sort();
    expect(before).toContain(`eval-run-v1-release-${sha}.json`);
    const firstText = readFileSync(join(w.results, `eval-run-v1-release-${sha}.json`), 'utf8');

    // attempt 2, with every suite passing, is refused before anything runs
    let ran = 0;
    const errors: string[] = [];
    expect(await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: () => {}, error: (s) => errors.push(s) }, { ...deps, runSuite: async () => void ran++ })).toBe(2);
    expect(errors.join('\n')).toMatch(new RegExp(`a formal release of ${sha} already exists \\(eval-run-v1-release-${sha}\\.json\\)`));
    expect(ran).toBe(0);
    expect(readdirSync(w.results).sort()).toEqual(before); // no -r2
    expect(readFileSync(join(w.results, `eval-run-v1-release-${sha}.json`), 'utf8')).toBe(firstText);
    expect(readdirSync(w.reports).filter((f) => f.startsWith('eval-report-v1'))).toEqual(['eval-report-v1.md']);
  });

  // Re-review R-2 / Q-5 (the probe): the fixture world is NOT READY; the formal release used to PASS on it.
  it('refuses the formal release (exit 2) when pnpm eval:ready is NOT READY', async () => {
    const w = gateCommit('not-ready');
    const harness = formalHarnessRun(w);
    const perf = formalPerfRun(w);
    let ran = 0;
    const errors: string[] = [];
    expect(await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: () => {}, error: (s) => errors.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, runSuite: async () => void ran++ })).toBe(2);
    expect(errors.join('\n')).toMatch(/pnpm eval:ready is NOT READY for M1: .*scenario-1 \(1 active attack cases \(need ≥ 10\)\)/);
    expect(ran).toBe(0);
    expect(readdirSync(w.results).filter((f) => f.includes('release'))).toEqual([]);
  });

  // Re-review R-5 / Q-4 (the probe): a symlink named like a formal output, pointing outside the repository.
  it('refuses a harness input that is a symlink to a file outside the repository', async () => {
    const w = gateCommit('symlink');
    const harness = formalHarnessRun(w);
    const perf = formalPerfRun(w);
    const outside = join(root, 'outside-harness.json');
    copyFileSync(harness, outside);
    const link = join(w.results, 'eval-run-link.json');
    symlinkSync(outside, link);
    let ran = 0;
    const errors: string[] = [];
    expect(await main(['--out=formal', `--harness=${link}`, `--perf=${perf}`], { log: () => {}, error: (s) => errors.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY, runSuite: async () => void ran++ })).toBe(2);
    expect(errors.join('\n')).toContain(`--harness must be a regular file, not a symlink: ${link}`);
    expect(ran).toBe(0);
  });

  it('a perf file measured before the gate commit (another HEAD) fails the release', async () => {
    const w = gateCommit('stale-perf');
    const perf = formalPerfRun(w); // measured at the old HEAD …
    writeFileSync(join(w.dir, 'README'), 'a later change\n');
    git(w.dir, 'commit', '-q', '-am', 'later commit'); // … then the gate commit moved on
    const harness = formalHarnessRun(w);
    const lines: string[] = [];
    expect(await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: (s) => lines.push(s), error: (s) => lines.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY, runSuite: fixtureRunner()(w.tree) })).toBe(1);
    expect(lines.some((l) => /problem: perf: the perf results .*baseline-perf-v1\.json is from [0-9a-f]{7}, the release runs at [0-9a-f]{7}/.test(l))).toBe(true);
  });

  it('a suite run that dirties the tree fails the release', async () => {
    const w = gateCommit('dirtied');
    const harness = formalHarnessRun(w);
    const perf = formalPerfRun(w);
    const runner = fixtureRunner({ during: () => writeFileSync(join(w.dir, 'README'), 'changed by a test\n') })(w.tree);
    const lines: string[] = [];
    expect(await main(['--out=formal', `--harness=${harness}`, `--perf=${perf}`], { log: (s) => lines.push(s), error: (s) => lines.push(s) }, { git: w.tree, resultsDir: w.results, reportsDir: w.reports, dataset: WORLD, readiness: () => WORLD_READY, runSuite: runner })).toBe(1);
    expect(lines.some((l) => /problem: e2e: the e2e run \(tree before it\) was produced on a dirty tree \(CF-12\):  M README/.test(l))).toBe(true);
    expect(lines.some((l) => /problem: the release tree has changes outside the untracked formal outputs \( M README\)/.test(l))).toBe(true);
  });
});
