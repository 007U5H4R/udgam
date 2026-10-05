import { execFileSync } from 'node:child_process';
import { REPO_ROOT, type Provenance } from './provenance';

// The working tree as the M-001 release sequence sees it (TASK-22 fix round 1; docs/exec/m-001-formal-run.md).
// The sequence runs on one clean commit and writes its formal outputs as untracked files, committed together
// at the end. So "clean" here means: nothing changed except untracked files that are formal outputs —
// evals/results/{eval-run-*,baseline-v1,baseline-perf-v1}.json (eval-run-* includes the release file
// eval-run-v1-release-*) and evals/reports/eval-report-*.md. Anything else (a modified tracked file,
// including a committed formal output, or any other untracked file) makes the tree dirty. Git-ignored
// files (evals/results/local/) never show. A git failure fails closed: commit `unknown`, dirty.

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
  if (commit === null || status === null) {
    return { commit: 'unknown', shortSha: 'unknown', branch: 'unknown', dirty: true, changes: ['git status failed: the tree cannot be shown clean'], formalOutputs: [] };
  }
  const entries = parsePorcelain(status);
  const allowed = (e: { code: string; path: string }) => e.code === '??' && isFormalOutput(e.path);
  const changes = entries.filter((e) => !allowed(e)).map((e) => `${e.code} ${e.path}`);
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
