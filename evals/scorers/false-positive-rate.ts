import type { CheckId, Verdict } from '../../src/lib/verification/types';
import type { CaseOutcome, CaseResult } from './case-assertions';
import { rate, type Rate } from './wilson';

// false-positive-rate (evaluation-plan §4.2, §8). S2 population: harness-verifier, legitimate, status
// active. A false positive is a legitimate case that is not Verified (Needs Review counts). A case the
// harness could not establish (not_yet_implemented, errored) is not a proven Verified, so it counts
// against the gate too. Honest review load (legitimate + legitimate_edge not Verified) is information.

export type FalsePositive = { id: string; outcome: CaseOutcome; verdict: Verdict | null; responsible: CheckId[] };
export type FalsePositives = Rate & { fps: FalsePositive[]; honestReviewLoad: Rate };

const verified = (r: CaseResult) => (r.outcome === 'passed' || r.outcome === 'failed') && r.result?.verdict === 'Verified';
const honest = (r: CaseResult) => r.suite === 'harness-verifier' && r.datasetStatus === 'active';

export function falsePositiveRate(results: CaseResult[]): FalsePositives {
  const legit = results.filter((r) => honest(r) && r.caseClass === 'legitimate');
  const edge = results.filter((r) => honest(r) && r.caseClass === 'legitimate_edge');
  const fps = legit
    .filter((r) => !verified(r))
    .map((r) => ({
      id: r.id,
      outcome: r.outcome,
      verdict: r.result?.verdict ?? null,
      responsible: (r.result?.checks ?? []).filter((c) => c.status !== 'ok').map((c) => c.id),
    }));
  const reviewed = [...legit, ...edge].filter((r) => !verified(r)).length;
  return { ...rate(fps.length, legit.length), fps, honestReviewLoad: rate(reviewed, legit.length + edge.length) };
}
