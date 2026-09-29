import type { VerdictView } from '../../client/capture-client';
import type { VerifyResult } from '../../lib/verification/types';

// The streamed verdict as the farmer copy layer reads it (TSK-10.11). The verdict line carries each
// check's status, evidence and hard-fail flag, and the score caps (TASK-11 fix round 1), so "Not
// accepted" names the check that decided it (D5) and not merely the first fail in registry order.

export function streamedResult(v: VerdictView): VerifyResult {
  return {
    verdict: v.verdict,
    score: v.score,
    checks: v.checks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence, score: 0, weight: 1, hardFail: c.hardFail === true })),
    unavailableProviders: [],
    capReasons: v.capReasons ?? [],
    config: { version: '', hash: '' },
  };
}
