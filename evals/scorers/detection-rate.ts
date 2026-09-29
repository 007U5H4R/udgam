import type { CheckId, CheckResult, Verdict } from '../../src/lib/verification/types';
import type { CaseOutcome, CaseResult } from './case-assertions';
import { rate, type Rate } from './wilson';

// detection-rate (evaluation-plan §4.1, §8). S1 population: harness-verifier, attack, scenario 1–4,
// status active. A case counts as detected only when case-assertions attributed it (EV4); cases that
// are not_yet_implemented or errored count as undetected. Scenarios 5–6 are reported, never pooled.

export type Undetected = {
  id: string;
  scenario: number;
  outcome: CaseOutcome;
  verdict: Verdict | null;
  missingChecks: CheckId[];
  checks: CheckResult[];
};

export type Detection = {
  pooled: Rate;
  perScenario: Record<'1' | '2' | '3' | '4', Rate>;
  otherScenarios: Record<'5' | '6', Rate>;
  undetected: Undetected[];
};

const isAttack = (r: CaseResult) => r.suite === 'harness-verifier' && r.caseClass === 'attack';
const isDetected = (r: CaseResult) => (r.outcome === 'passed' || r.outcome === 'failed') && r.detected === true;

function rateOf(rs: CaseResult[]): Rate {
  return rate(rs.filter(isDetected).length, rs.length);
}

export function detectionRate(results: CaseResult[]): Detection {
  const s1 = results.filter((r) => isAttack(r) && r.datasetStatus === 'active' && r.scenario !== null && r.scenario >= 1 && r.scenario <= 4);
  const other = results.filter((r) => isAttack(r) && (r.scenario === 5 || r.scenario === 6) && (r.datasetStatus === 'active' || r.datasetStatus === 'stretch'));
  const byScenario = (rs: CaseResult[], s: number) => rateOf(rs.filter((r) => r.scenario === s));
  return {
    pooled: rateOf(s1),
    perScenario: { '1': byScenario(s1, 1), '2': byScenario(s1, 2), '3': byScenario(s1, 3), '4': byScenario(s1, 4) },
    otherScenarios: { '5': byScenario(other, 5), '6': byScenario(other, 6) },
    undetected: s1
      .filter((r) => !isDetected(r))
      .map((r) => ({
        id: r.id,
        scenario: r.scenario!,
        outcome: r.outcome,
        verdict: r.result?.verdict ?? null,
        missingChecks: r.missingChecks,
        checks: r.result?.checks ?? [],
      })),
  };
}
