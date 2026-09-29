import type { CheckId, CheckResult, VerifyResult } from '../../src/lib/verification/types';
import type { CaseClass, CaseStatus, EvalCase, Suite } from '../harness/dataset';

// case-assertions (evaluation-plan §8, §7.4; technical-plan §22 TSK-03.5): score one verify() result
// against a case's `expected` block. Detection needs attribution (EV4): the verdict is acceptable AND
// one of the case's catching checks returned flag or fail.

export type CaseOutcome = 'passed' | 'failed' | 'errored' | 'not_yet_implemented';
export type Assertion = { name: string; pass: boolean; detail: string };

/** One case's entry in a results file. */
export type CaseResult = {
  id: string;
  suite: Suite;
  datasetStatus: CaseStatus;
  caseClass: CaseClass | null;
  scenario: number | null;
  priority: EvalCase['priority'];
  criticalConditions: string[];
  pair: string | null;
  tags: string[];
  expected: EvalCase['expected'];
  outcome: CaseOutcome;
  /** Checks the case needs that the registry does not have yet (→ not_yet_implemented). */
  missingChecks: CheckId[];
  /** The raw verify() output; null when the case errored before verify() or its suite is not built. */
  result: VerifyResult | null;
  assertions: Assertion[];
  /** Attack cases only: verdict acceptable and attributed to a catching check. */
  detected: boolean | null;
  /** The case injects a provider fault or a throwing check (CF-03). */
  faultInjected: boolean;
  error: { class: string; message: string } | null;
  notes: string[];
  durationMs: number;
};

/** Lowercase and strip all whitespace (evaluation-plan §7.4). */
export const normaliseEvidence = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const find = (r: VerifyResult, id: CheckId): CheckResult | undefined => r.checks.find((c) => c.id === id);

export function assertCase(c: EvalCase, result: VerifyResult): { pass: boolean; assertions: Assertion[]; detected?: boolean } {
  const e = c.expected;
  const assertions: Assertion[] = [];

  let verdictOk = true;
  if (e.acceptable_verdicts) {
    verdictOk = e.acceptable_verdicts.includes(result.verdict);
    assertions.push({ name: 'verdict', pass: verdictOk, detail: `${result.verdict} ${verdictOk ? '∈' : '∉'} {${e.acceptable_verdicts.join(', ')}}` });
  } else if (e.verdict) {
    verdictOk = result.verdict === e.verdict;
    assertions.push({ name: 'verdict', pass: verdictOk, detail: `${result.verdict} ${verdictOk ? '=' : '≠'} ${e.verdict}` });
  }

  for (const [id, want] of Object.entries(e.check_status ?? {}) as [CheckId, string][]) {
    const got = find(result, id);
    assertions.push({
      name: `check_status.${id}`,
      pass: got?.status === want,
      detail: got ? `${got.status} ${got.status === want ? '=' : '≠'} ${want}` : `${id} is not in the result (expected ${want})`,
    });
  }

  for (const id of e.hard_fail_checks ?? []) {
    const got = find(result, id);
    assertions.push({
      name: `hard_fail.${id}`,
      pass: got?.hardFail === true,
      detail: got ? `hardFail ${got.hardFail}` : `${id} is not in the result (expected a hard fail)`,
    });
  }

  let detected: boolean | undefined;
  if (c.case_class === 'attack') {
    const catching = e.catching_checks ?? [];
    const firing = catching.filter((id) => {
      const s = find(result, id)?.status;
      return s === 'flag' || s === 'fail';
    });
    const attributed = firing.length > 0;
    assertions.push({
      name: 'attribution',
      pass: attributed,
      detail: attributed
        ? `${firing.join(', ')} flagged or failed`
        : `none of ${catching.join(', ')} flagged or failed (${catching.map((id) => `${id}: ${find(result, id)?.status ?? 'absent'}`).join('; ')})`,
    });
    detected = verdictOk && attributed;
  }

  for (const [id, subs] of Object.entries(e.evidence_substrings ?? {}) as [CheckId, string[]][]) {
    const got = find(result, id);
    for (const sub of subs) {
      const pass = got !== undefined && normaliseEvidence(got.evidence).includes(normaliseEvidence(sub));
      assertions.push({
        name: `evidence.${id}: "${sub}"`,
        pass,
        detail: got ? `evidence: ${JSON.stringify(got.evidence)}` : `${id} is not in the result`,
      });
    }
  }

  return { pass: assertions.every((a) => a.pass), assertions, ...(detected === undefined ? {} : { detected }) };
}
