import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { baselineTree } from './run';
import { isFormalOutput, parsePorcelain, treeState } from './tree-state';

// The release's tree check (TASK-22 fix round 1): a tree is clean for the M-001 sequence when nothing
// changed except the untracked formal outputs that sequence itself writes.

const root = mkdtempSync(join(tmpdir(), 'udgam-tree-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' }).toString();

function repo(name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, 'evals', 'results'), { recursive: true });
  mkdirSync(join(dir, 'evals', 'reports'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, '.gitignore'), 'evals/results/local/\n');
  writeFileSync(join(dir, 'README'), 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

describe('isFormalOutput', () => {
  it.each([
    ['evals/results/eval-run-0.1.0-abc1234.json', true],
    ['evals/results/eval-run-0.1.0-abc1234-r2.json', true],
    ['evals/results/eval-run-v1-release-abc1234.json', true],
    ['evals/results/baseline-v1.json', true],
    ['evals/results/baseline-perf-v1.json', true],
    ['evals/reports/eval-report-v1.md', true],
    ['evals/reports/eval-report-baseline-v1.md', true],
    ['evals/results/baseline-v0-ledger-only.json', false],
    ['evals/results/notes.json', false],
    ['evals/results/sub/eval-run-x.json', false],
    ['evals/reports/summary.md', false],
    // TSK-29.1: the S3 baseline, one file per commit (pnpm eval:perf --suite=s3 --formal)
    ['evals/results/baseline-perf-v1-s3-76d63c1.json', true],
    ['evals/results/baseline-perf-v1-s3-76d63c1a2b3c4d5e6f708192a3b4c5d6e7f80910.json', true],
    ['evals/results/baseline-perf-v1-s3-.json', false],
    ['evals/results/baseline-perf-v1-s3-xyz.json', false],
    ['evals/results/baseline-perf-v1-s3-76d63c1/x.json', false],
    ['evals/results/local/baseline-perf-v1-s3-76d63c1.json', false],
    ['src/eval-run-x.json', false],
    ['evals/eval-dataset.json', false],
  ])('row %#: %s', (path, formal) => {
    expect(isFormalOutput(path)).toBe(formal);
  });
});

describe('parsePorcelain (-z)', () => {
  it('reads codes and paths, and skips the original path of a rename', () => {
    expect(parsePorcelain('?? evals/results/baseline-v1.json\0 M src/a.ts\0R  b.ts\0a.ts\0')).toEqual([
      { code: '??', path: 'evals/results/baseline-v1.json' },
      { code: ' M', path: 'src/a.ts' },
      { code: 'R ', path: 'b.ts' },
    ]);
  });
});

describe('treeState in a real git repository', () => {
  it('clean: the commit, not dirty, nothing listed', () => {
    const dir = repo('clean');
    const s = treeState({ cwd: dir });
    expect(s.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(s.commit).toBe(git(dir, 'rev-parse', 'HEAD').trim());
    expect(s).toMatchObject({ dirty: false, changes: [], formalOutputs: [] });
  });

  it('untracked formal outputs alone keep it clean, and are listed', () => {
    const dir = repo('formal');
    writeFileSync(join(dir, 'evals', 'results', 'baseline-v1.json'), '{}');
    writeFileSync(join(dir, 'evals', 'reports', 'eval-report-v1.md'), '#');
    mkdirSync(join(dir, 'evals', 'results', 'local'));
    writeFileSync(join(dir, 'evals', 'results', 'local', 'integration.json'), '{}'); // git-ignored
    expect(treeState({ cwd: dir })).toMatchObject({ dirty: false, changes: [], formalOutputs: ['evals/reports/eval-report-v1.md', 'evals/results/baseline-v1.json'] });
  });

  it('any other untracked file, a modified tracked file, or a tracked formal output that changed makes it dirty', () => {
    const a = repo('other');
    writeFileSync(join(a, 'evals', 'results', 'notes.json'), '{}');
    expect(treeState({ cwd: a })).toMatchObject({ dirty: true, changes: ['?? evals/results/notes.json'] });

    const b = repo('modified');
    writeFileSync(join(b, 'README'), 'changed\n');
    expect(treeState({ cwd: b })).toMatchObject({ dirty: true, changes: [' M README'] });

    const c = repo('tracked-formal');
    writeFileSync(join(c, 'evals', 'results', 'baseline-v1.json'), '{"a":1}');
    git(c, 'add', '-A');
    git(c, 'commit', '-q', '-m', 'baseline');
    writeFileSync(join(c, 'evals', 'results', 'baseline-v1.json'), '{"a":2}');
    expect(treeState({ cwd: c })).toMatchObject({ dirty: true, changes: [' M evals/results/baseline-v1.json'] });
  });

  // TASK-22 re-review R-4 / Q-1: an index flag hides a modified tracked file from `git status`.
  it.each([
    ['skip-worktree', '--skip-worktree'],
    ['assume-unchanged', '--assume-unchanged'],
  ])('a tracked file flagged %s makes it dirty, edited or not (git status cannot see it)', (flag, option) => {
    const dir = repo(`flag-${flag}`);
    git(dir, 'update-index', option, 'README');
    expect(treeState({ cwd: dir })).toMatchObject({ dirty: true, changes: [`${flag} README`] });
    writeFileSync(join(dir, 'README'), 'edited behind the flag\n');
    expect(git(dir, 'status', '--porcelain')).toBe(''); // the probe: git status is blind to it
    expect(treeState({ cwd: dir })).toMatchObject({ dirty: true, changes: [`${flag} README`] });
    expect(baselineTree({ cwd: dir })).toEqual({ dirty: true }); // --baseline=v1 refuses it too
  });

  it('both flags on one file are named once, as skip-worktree', () => {
    const dir = repo('flag-both');
    git(dir, 'update-index', '--skip-worktree', 'README');
    git(dir, 'update-index', '--assume-unchanged', 'README');
    expect(treeState({ cwd: dir })).toMatchObject({ dirty: true, changes: ['skip-worktree README'] });
  });

  it('baselineTree: a clean repository is clean; an untracked formal output is not (the baseline is step 3)', () => {
    const dir = repo('baseline-tree');
    expect(baselineTree({ cwd: dir })).toEqual({ dirty: false });
    writeFileSync(join(dir, 'evals', 'results', 'baseline-v1.json'), '{}');
    expect(baselineTree({ cwd: dir })).toEqual({ dirty: true });
  });

  it('fails closed outside a git repository: unknown commit, dirty', () => {
    const dir = join(root, 'not-a-repo');
    mkdirSync(dir);
    expect(treeState({ cwd: dir })).toMatchObject({ commit: 'unknown', dirty: true });
  });
});
