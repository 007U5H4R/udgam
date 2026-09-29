import type { CheckId, CheckResult, CheckStatus, Verdict, VerifyResult } from '../../src/lib/verification/types';
import type { EvalCase } from '../harness/dataset';
import type { CaseResult } from './case-assertions';

// Hand-built cases and results for scorer tests (never used by the harness itself).

export function check(id: CheckId, status: CheckStatus, over: Partial<CheckResult> = {}): CheckResult {
  return { id, status, score: status === 'ok' ? 1 : status === 'flag' ? 0.5 : 0, weight: 1, hardFail: false, evidence: `${id} ${status}`, ...over };
}

export function verifyResult(verdict: Verdict, checks: CheckResult[], over: Partial<VerifyResult> = {}): VerifyResult {
  return { verdict, score: 90, checks, unavailableProviders: [], capReasons: [], config: { version: 'cfg-1', hash: 'h' }, ...over };
}

export function evalCase(over: Partial<EvalCase> & { id: string }): EvalCase {
  return {
    title: over.id,
    feature: 'verifier',
    category: 'functional',
    suite: 'harness-verifier',
    case_class: 'legitimate',
    scenario: null,
    gates: [],
    priority: 'critical',
    automated: true,
    milestone: 'M1',
    status: 'active',
    input: {},
    expected: {},
    failure_conditions: [],
    ...over,
  };
}

export function caseResult(over: Partial<CaseResult> & { id: string }): CaseResult {
  return {
    suite: 'harness-verifier',
    datasetStatus: 'active',
    caseClass: 'legitimate',
    scenario: null,
    priority: 'critical',
    criticalConditions: [],
    pair: null,
    tags: [],
    expected: {},
    outcome: 'passed',
    missingChecks: [],
    result: verifyResult('Verified', [check('signature_valid', 'ok')]),
    assertions: [],
    detected: null,
    faultInjected: false,
    error: null,
    notes: [],
    durationMs: 1,
    ...over,
  };
}
