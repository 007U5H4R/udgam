import type { CaseResult } from './case-assertions';

// critical-conditions (evaluation-plan §5, §8). The harness judges CF-01, CF-02, CF-03 from verify()
// results and CF-12, CF-13 from the run itself; every other CF fires from a failed or errored case
// that lists it in `critical_conditions`. Any CF makes the run exit non-zero. A not_yet_implemented
// case fires no CF (it has no real outcome yet) — it fails the gates instead (EVAL-092).

export type FiredCondition = { id: string; caseIds: string[]; reason: string };
export type CriticalConditions = { fired: FiredCondition[] };

export type RunFacts = {
  integrity?: { ok: boolean; problems: string[] };
  /**
   * baseline-v1's frozen config hash vs this run's; `authorised` = the shared rule in evals/harness/config-freeze.ts accepts it (EXE34).
   * `{ error }` = baseline-v1 exists but cannot be read, parsed or lacks its hash: CF-13 fails closed.
   */
  configDrift?: { baselineHash: string; currentHash: string; authorised: boolean } | { error: string };
};

const HARNESS_JUDGED = new Set(['CF-01', 'CF-02', 'CF-03', 'CF-12', 'CF-13']);
const judged = (r: CaseResult) => (r.outcome === 'passed' || r.outcome === 'failed') && r.result !== null;

export function criticalConditions(results: CaseResult[], run: RunFacts = {}): CriticalConditions {
  const fired: FiredCondition[] = [];
  const add = (id: string, caseIds: string[], reason: string) => {
    if (caseIds.length > 0) fired.push({ id, caseIds, reason });
  };

  add(
    'CF-01',
    results
      .filter((r) => r.caseClass === 'attack' && (r.expected.hard_fail_checks?.length ?? 0) > 0 && judged(r))
      .filter((r) => r.result!.verdict !== 'Rejected' || !r.expected.hard_fail_checks!.every((id) => r.result!.checks.some((c) => c.id === id && c.hardFail)))
      .map((r) => r.id),
    'an attack covered by a hard-fail rule was not Rejected with hardFail on that check',
  );

  add(
    'CF-02',
    results.filter((r) => (r.caseClass === 'legitimate' || r.caseClass === 'legitimate_edge') && judged(r) && r.result!.verdict === 'Rejected').map((r) => r.id),
    'an honest (legitimate or legitimate_edge) case was Rejected',
  );

  add(
    'CF-03',
    results.filter((r) => r.faultInjected && (r.outcome === 'errored' || (judged(r) && r.result!.verdict === 'Rejected'))).map((r) => r.id),
    'a provider fault or a throwing check yielded Rejected or crashed the case',
  );

  const others = new Map<string, string[]>();
  for (const r of results) {
    if (r.outcome !== 'failed' && r.outcome !== 'errored') continue;
    for (const cf of r.criticalConditions) if (!HARNESS_JUDGED.has(cf)) others.set(cf, [...(others.get(cf) ?? []), r.id]);
  }
  for (const [cf, ids] of [...others].sort(([a], [b]) => a.localeCompare(b))) add(cf, ids, `a case linked to ${cf} failed`);

  if (run.integrity && !run.integrity.ok) fired.push({ id: 'CF-12', caseIds: [], reason: `harness integrity failed: ${run.integrity.problems.join('; ')}` });
  const drift = run.configDrift;
  if (drift && 'error' in drift) {
    fired.push({ id: 'CF-13', caseIds: [], reason: `baseline-v1 cannot be checked for config drift: ${drift.error}` });
  } else if (drift && drift.baselineHash !== drift.currentHash && !drift.authorised) {
    fired.push({ id: 'CF-13', caseIds: [], reason: `config hash ${drift.currentHash} differs from baseline-v1 (${drift.baselineHash}) and evals/config-changes.md does not authorise it (config-freeze.ts)` });
  }

  return { fired: fired.sort((a, b) => a.id.localeCompare(b.id)) };
}
