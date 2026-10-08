import { CONFIG, type VerifyConfig } from './config';
import type { CheckResult, Verdict } from './types';

export type ScoreResult = { verdict: Verdict; score: number; capReasons: string[] };

/**
 * Weighted mean and verdict (technical-plan §6.2, S4 + S10).
 * score = 100 × Σ(weight × statusScore) / Σ weight over checks that are not `unavailable`.
 * Verdict order: any hard fail → Rejected; score < reviewMin → Rejected; any cap → Needs Review;
 * score ≥ verifiedMin → Verified; else Needs Review. Thresholds compare the unrounded mean; only the
 * reported score is rounded to one decimal.
 */
export function score(checks: readonly CheckResult[], config: VerifyConfig = CONFIG): ScoreResult {
  let num = 0;
  let den = 0;
  for (const c of checks) {
    if (c.status === 'unavailable') continue;
    const w = config.weights[c.id];
    num += w * config.statusScore[c.status];
    den += w;
  }
  // Multiply before dividing so weight sums of halves stay exact (80.0 must not become 79.999…).
  const mean = den === 0 ? 0 : (100 * num) / den;

  const capReasons: string[] = [];
  if (config.caps.anyFail && checks.some((c) => c.status === 'fail')) capReasons.push('anyFail');
  for (const id of config.caps.flagCaps) {
    if (checks.some((c) => c.id === id && c.status === 'flag')) capReasons.push(`flag:${id}`);
  }
  if (config.caps.anyUnavailable && checks.some((c) => c.status === 'unavailable')) capReasons.push('anyUnavailable');

  let verdict: Verdict;
  if (checks.some((c) => c.hardFail)) verdict = 'Rejected';
  else if (den === 0) verdict = 'Needs Review'; // nothing scored: an outage is never a rejection (S6)
  else if (mean < config.verdict.reviewMin) verdict = 'Rejected';
  else if (capReasons.length > 0) verdict = 'Needs Review';
  else if (mean >= config.verdict.verifiedMin) verdict = 'Verified';
  else verdict = 'Needs Review';

  return { verdict, score: Math.round(mean * 10) / 10, capReasons };
}
