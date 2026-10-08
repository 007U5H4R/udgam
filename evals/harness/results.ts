import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { EVALS_DIR } from './dataset';

// Versioned results files (evaluation-plan §12). Formal runs go to evals/results/ and are committed;
// ad-hoc runs go to evals/results/local/ (git-ignored). A file is never overwritten: a repeat on the
// same version and commit appends -r2, -r3, … . Reports sit beside their results' naming and follow the
// same rule, so a committed report (e.g. eval-report-baseline-v0.md) can never be clobbered.

export const RESULTS_DIR = join(EVALS_DIR, 'results');
export const REPORTS_DIR = join(EVALS_DIR, 'reports');

export type Out = 'local' | 'formal';

type Nameable = { provenance: { appVersion: string; git: { shortSha: string } } };

/** A plain file stem: no path separators, no leading dot or dash, not empty. */
export const isFileStem = (s: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s);

/** The file stem before any -rN suffix: `eval-run-{appVersion}-{shortSha}` or the given name. */
export function resultsStem(r: Nameable, name?: string): string {
  if (name !== undefined) {
    if (!isFileStem(name)) throw new TypeError(`results name must be a plain file stem, got ${name}`);
    return name;
  }
  return `eval-run-${r.provenance.appVersion}-${r.provenance.git.shortSha}`;
}

/** Create `{stem}{ext}` in `dir`, or `{stem}-rN{ext}` from `firstRun` up; never overwrites (`wx`). */
function writeNew(dir: string, stem: string, ext: string, text: string, firstRun = 1): string {
  for (let n = firstRun; ; n++) {
    const path = join(dir, `${stem}${n === 1 ? '' : `-r${n}`}${ext}`);
    if (existsSync(path)) continue;
    try {
      writeFileSync(path, text, { flag: 'wx' });
      return path;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

/** Write a results object; returns its path. Never overwrites (`-r2`, `-r3`, … instead). */
export function writeResults(obj: Nameable, opts: { out: Out; dir?: string; name?: string } = { out: 'local' }): string {
  const dir = opts.out === 'formal' ? (opts.dir ?? RESULTS_DIR) : join(opts.dir ?? RESULTS_DIR, 'local');
  mkdirSync(dir, { recursive: true });
  return writeNew(dir, resultsStem(obj, opts.name), '.json', `${JSON.stringify(obj, null, 2)}\n`);
}

/**
 * Write a report at `reportPath` (from reportPathFor); returns the path actually written. If that file
 * exists, the next free -rN is used instead, counting on from the path's own -rN (if any).
 */
export function writeReport(reportPath: string, text: string): string {
  const dir = dirname(reportPath);
  mkdirSync(dir, { recursive: true });
  const base = basename(reportPath, '.md');
  const m = /^(.*)-r(\d+)$/.exec(base);
  return m ? writeNew(dir, m[1]!, '.md', text, Number(m[2])) : writeNew(dir, base, '.md', text);
}

/** Where a results file's report goes: evals/reports/ for formal runs, beside the results for local ones. */
export function reportPathFor(resultsPath: string, opts: { out: Out; reportsDir?: string; reportName?: string }): string {
  const resultsStemWithRun = basename(resultsPath, '.json');
  const rerun = /-r\d+$/.exec(resultsStemWithRun)?.[0] ?? '';
  const stem = opts.reportName !== undefined ? `${opts.reportName}${rerun}` : resultsStemWithRun.replace(/^eval-run-/, '');
  const file = `eval-report-${stem}.md`;
  return opts.out === 'formal' ? join(opts.reportsDir ?? REPORTS_DIR, file) : join(resultsPath, '..', file);
}
