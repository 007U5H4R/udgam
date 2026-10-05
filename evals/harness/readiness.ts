import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, type Check } from '../../src/lib/verification/registry';
import { CHECK_IDS } from '../../src/lib/verification/types';
import { loadDataset, type Dataset, type EvalCase } from './dataset';
import { REPO_ROOT } from './provenance';
import { DEFAULT_MILESTONE, inMilestone, MILESTONES, PROOF_EVM_ONLY, requiredChecks, type Milestone } from './run';
import { PROOF_CASES } from './suites/proof';

// Pre-gate readiness check (technical-plan §22 TSK-21.1, TKT-21). `pnpm eval:ready [--milestone=M1]`
// answers, before the formal run that freezes baseline-v1, whether that run can mean anything:
//   - all twelve checks are registered;
//   - scenarios 1–4 each hold ≥ 10 active attack cases (the S1 population, evaluation-plan §4.1);
//   - the legitimate class holds ≥ 35 active cases (the S2 population, §4.2);
//   - no active in-scope harness case would be reported not_yet_implemented (a verifier case needing an
//     unregistered check, or a harness-proof case without a runner on the hash-chain ledger).
// A missing docs/exec/hr3-field-calibration.md is a WARNING line that the gate report must print, not a
// failure: HR3 was waived (decisions.md TP29). Read-only: it writes nothing.
// Exit codes: 0 ready; 1 not ready; 2 bad usage or a crash.

export const HR3_CALIBRATION_PATH = join(REPO_ROOT, 'docs', 'exec', 'hr3-field-calibration.md');
export const MIN_ATTACKS_PER_SCENARIO = 10;
export const MIN_LEGITIMATE = 35;

export type ReadinessCheck = { id: string; pass: boolean; detail: string };
export type Readiness = { ready: boolean; milestone: Milestone; checks: ReadinessCheck[]; warnings: string[] };
export type ReadinessOptions = {
  milestone?: Milestone;
  /** Where the HR3 field-calibration record would be (default docs/exec/hr3-field-calibration.md). */
  hr3Path?: string;
  /** The harness-proof cases that have a runner (default: runProofSuite's PROOF_CASES). */
  proofCases?: readonly string[];
};

const HARNESS = ['harness-verifier', 'harness-proof'];
/** A path as the report prints it: repo-relative inside the repo, absolute outside it. */
const shown = (p: string) => (relative(REPO_ROOT, p).startsWith('..') ? p : relative(REPO_ROOT, p));

/** Why an active harness case would come out not_yet_implemented on the default (hash-chain) run, or null. */
function nyiReason(c: EvalCase, registered: Set<string>, proofCases: readonly string[]): string | null {
  if (c.suite === 'harness-verifier') {
    const missing = requiredChecks(c).filter((id) => !registered.has(id));
    return missing.length > 0 ? `needs ${missing.join(', ')}` : null;
  }
  if (c.suite === 'harness-proof') {
    if (PROOF_EVM_ONLY[c.id]) return 'runs only with --ledger=evm';
    return proofCases.includes(c.id) ? null : 'no harness-proof runner';
  }
  return null;
}

export function checkReadiness(dataset: Pick<Dataset, 'cases'>, registry: readonly Pick<Check, 'id'>[], opts: ReadinessOptions = {}): Readiness {
  const milestone = opts.milestone ?? DEFAULT_MILESTONE;
  const proofCases = opts.proofCases ?? PROOF_CASES;
  const hr3Path = opts.hr3Path ?? HR3_CALIBRATION_PATH;
  const registered = new Set<string>(registry.map((c) => c.id));
  const active = dataset.cases.filter((c) => c.status === 'active' && inMilestone(c.milestone, milestone));
  const verifier = active.filter((c) => c.suite === 'harness-verifier');

  const missing = CHECK_IDS.filter((id) => !registered.has(id));
  const checks: ReadinessCheck[] = [
    {
      id: 'registry',
      pass: missing.length === 0,
      detail: `${CHECK_IDS.length - missing.length}/${CHECK_IDS.length} checks registered${missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}`,
    },
  ];
  for (const s of [1, 2, 3, 4]) {
    const ids = verifier.filter((c) => c.case_class === 'attack' && c.scenario === s).map((c) => c.id);
    checks.push({ id: `scenario-${s}`, pass: ids.length >= MIN_ATTACKS_PER_SCENARIO, detail: `${ids.length} active attack cases (need ≥ ${MIN_ATTACKS_PER_SCENARIO})` });
  }
  const legit = verifier.filter((c) => c.case_class === 'legitimate');
  checks.push({ id: 'legitimate', pass: legit.length >= MIN_LEGITIMATE, detail: `${legit.length} active legitimate cases (need ≥ ${MIN_LEGITIMATE})` });

  const nyi = active
    .filter((c) => HARNESS.includes(c.suite))
    .map((c) => ({ id: c.id, why: nyiReason(c, registered, proofCases) }))
    .filter((x): x is { id: string; why: string } => x.why !== null);
  checks.push({
    id: 'not-yet-implemented',
    pass: nyi.length === 0,
    detail: nyi.length === 0 ? 'no active harness case would be not_yet_implemented' : `${nyi.length} active case(s) would be not_yet_implemented: ${nyi.map((x) => `${x.id} (${x.why})`).join(', ')}`,
  });

  const warnings = existsSync(hr3Path)
    ? []
    : [
        `WARNING: ${shown(hr3Path)} is absent: HR3 field calibration was waived (decisions.md TP29), so S2 realism (the legitimate-set jitter) and the S3 reference condition are unvalidated assumptions. The gate report must print this line.`,
      ];
  return { ready: checks.every((c) => c.pass), milestone, checks, warnings };
}

/** The lines `pnpm eval:ready` prints (the gate report quotes them). */
export function readinessLines(r: Readiness): string[] {
  const width = Math.max(...r.checks.map((c) => c.id.length));
  return [
    `eval:ready (milestone ${r.milestone}) — ${r.ready ? 'READY' : 'NOT READY'}`,
    ...r.checks.map((c) => `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(width)}  ${c.detail}`),
    ...r.warnings,
  ];
}

export function main(argv: string[], io: Pick<Console, 'log' | 'error'> = console): 0 | 1 | 2 {
  let milestone: Milestone = DEFAULT_MILESTONE;
  for (const arg of argv) {
    const m = /^--milestone=(.*)$/.exec(arg);
    if (!m || !(MILESTONES as readonly string[]).includes(m[1]!)) {
      io.error(`eval:ready: ${m ? `--milestone must be ${MILESTONES.join(', ')}; got ${m[1]}` : `unknown flag ${arg}`}`);
      return 2;
    }
    milestone = m[1] as Milestone;
  }
  const r = checkReadiness(loadDataset(), REGISTRY, { milestone });
  for (const line of readinessLines(r)) io.log(line);
  return r.ready ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`eval:ready crashed (exit 2): ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 2;
  }
}
