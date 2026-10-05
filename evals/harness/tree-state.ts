import { execFileSync } from 'node:child_process';
import { REPO_ROOT, type Provenance } from './provenance';

// The working tree as the M-001 release sequence sees it (TASK-22 fix round 1; docs/exec/m-001-formal-run.md).
// The sequence runs on one clean commit and writes its formal outputs as untracked files, committed together
// at the end. So "clean" here means: nothing changed except untracked files that are formal outputs —
// evals/results/{eval-run-*,baseline-v1,baseline-perf-v1}.json (eval-run-* includes the release file
// eval-run-v1-release-*) and evals/reports/eval-report-*.md. Anything else (a modified tracked file,
// including a committed formal output, or any other untracked file) makes the tree dirty, and so does a
// tracked file flagged skip-worktree or assume-unchanged, whose edits git status would not show.
// Git-ignored files (evals/results/local/) never show. A git failure fails closed: commit `unknown`, dirty.

const FORMAL_OUTPUTS = [/^evals\/results\/(?:eval-run-[^/]+|baseline-v1|baseline-perf-v1)\.json$/, /^evals\/reports\/eval-report-[^/]+\.md$/];

/** Whether a repo-relative path is one of the formal outputs the M-001 sequence writes. */
export const isFormalOutput = (path: string): boolean => FORMAL_OUTPUTS.some((re) => re.test(path));

export type TreeState = Provenance['git'] & {
  /** `git status` entries that make the tree dirty (`XY path`). */
  changes: string[];
  /** Untracked formal outputs, allowed. */
  formalOutputs: string[];
};

/** `git status --porcelain=v1 -z` → entries; the original path of a rename or copy is skipped. */
export function parsePorcelain(z: string): { code: string; path: string }[] {
  const out: { code: string; path: string }[] = [];
  const parts = z.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.length < 4) continue;
    const code = p.slice(0, 2);
    out.push({ code, path: p.slice(3) });
    if (code[0] === 'R' || code[0] === 'C') i++;
  }
  return out;
}

/**
 * Tracked files whose index flag hides their changes from `git status` (TASK-22 re-review R-4): from
 * `git ls-files -v -z`, tag `S` is skip-worktree and a lower-case tag is assume-unchanged (`s` is both,
 * named as skip-worktree). Each one is a change, edited or not, since the tree check cannot see inside it.
 */
export function hiddenByIndexFlags(lsFilesV: string): string[] {
  return lsFilesV
    .split('\0')
    .filter((e) => /^(?:S|[a-z]) /.test(e))
    .map((e) => `${e[0] === 'S' || e[0] === 's' ? 'skip-worktree' : 'assume-unchanged'} ${e.slice(2)}`);
}

/** The tree's commit and whether it is clean apart from untracked formal outputs (see the header). */
export function treeState(o: { cwd?: string } = {}): TreeState {
  const run = (args: string[]): string | null => {
    try {
      return execFileSync('git', args, { cwd: o.cwd ?? REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
  const commit = run(['rev-parse', 'HEAD'])?.trim() ?? null;
  const status = run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const index = run(['ls-files', '-v', '-z']);
  if (commit === null || status === null || index === null) {
    return { commit: 'unknown', shortSha: 'unknown', branch: 'unknown', dirty: true, changes: ['git status failed: the tree cannot be shown clean'], formalOutputs: [] };
  }
  const entries = parsePorcelain(status);
  const allowed = (e: { code: string; path: string }) => e.code === '??' && isFormalOutput(e.path);
  const changes = [...entries.filter((e) => !allowed(e)).map((e) => `${e.code} ${e.path}`), ...hiddenByIndexFlags(index)];
  return {
    commit,
    shortSha: run(['rev-parse', '--short', 'HEAD'])?.trim() ?? commit.slice(0, 7),
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD'])?.trim() ?? 'unknown',
    dirty: changes.length > 0,
    changes,
    formalOutputs: entries
      .filter(allowed)
      .map((e) => e.path)
      .sort(),
  };
}
