import type { EvalCase, Suite } from '../harness/dataset';
import type { CaseResult } from './case-assertions';

// harness-integrity (evaluation-plan §8, §4.7; EVAL-092, CF-12). The cases the harness must run are
// those in a harness suite whose status is `active` or `stretch` (scenario 5–6 cases are stretch and are
// reported separately, never dropped). Every one appears exactly once; active = passed + failed +
// errored; skipped must be 0. not_yet_implemented is a failure.

export const HARNESS_SUITES: readonly Suite[] = ['harness-verifier', 'harness-proof'];

export type Integrity = {
  ok: boolean;
  /** Cases the harness must run (status active or stretch) in the selected suites. */
  active: number;
  passed: number;
  /** Includes not_yet_implemented. */
  failed: number;
  notYetImplemented: number;
  errored: number;
  skipped: number;
  problems: string[];
};

export const inScope = (c: Pick<EvalCase, 'suite' | 'status'>, suites: readonly Suite[] = HARNESS_SUITES) =>
  suites.includes(c.suite) && (c.status === 'active' || c.status === 'stretch');

export function integrity(dataset: { cases: EvalCase[] }, results: CaseResult[], opts: { suites?: readonly Suite[] } = {}): Integrity {
  const scope = dataset.cases.filter((c) => inScope(c, opts.suites));
  const ids = new Set(scope.map((c) => c.id));
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);

  const problems: string[] = [];
  let skipped = 0;
  for (const c of scope) {
    if (!counts.has(c.id)) {
      skipped++;
      problems.push(`${c.id} is in scope but missing from the results`);
    }
  }
  for (const [id, n] of counts) {
    if (!ids.has(id)) problems.push(`${id} is in the results but not in scope`);
    else if (n > 1) problems.push(`${id} appears ${n} times in the results`);
  }

  const passed = results.filter((r) => r.outcome === 'passed').length;
  const notYetImplemented = results.filter((r) => r.outcome === 'not_yet_implemented').length;
  const failed = results.filter((r) => r.outcome === 'failed').length + notYetImplemented;
  const errored = results.filter((r) => r.outcome === 'errored').length;
  if (passed + failed + errored !== scope.length) problems.push(`totals do not reconcile: ${passed} + ${failed} + ${errored} ≠ ${scope.length} active`);

  return { ok: problems.length === 0, active: scope.length, passed, failed, notYetImplemented, errored, skipped, problems };
}
