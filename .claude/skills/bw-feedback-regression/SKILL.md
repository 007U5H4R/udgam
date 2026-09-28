---
name: bw-feedback-regression
description: Build-workflow Stage 12 — Feedback & Regression Evaluation. Use post-release to turn every meaningful production failure into a permanent EVAL-/TC- regression case (RCA → reproduce → add case → fix → verify → retain). Invoked by workflow/build-workflow.md.
---

# Stage 12 · Feedback & Regression Evaluation (continuous, post-release)

**Model/effort:** Opus 5.5 (`claude-opus-5-5`), Standard. **Underlying:** RCA + eval/test authoring.
**Companion framework (reference, do not copy):** `~/.claude/workflow/eval-framework.md` (production-failures-become-regression-cases loop, versioned-evidence rule).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 12, on any meaningful production issue after release — UI, API, business-rule, performance, security, or (where the system has AI) hallucination/retrieval/agent failure.

## Do Not Trigger
No production signal; a cosmetic issue with no regression value; still pre-release.

## Inputs
The production signal (telemetry/alert/report); `/evals`; `lesson-learnt.md`; `decisions.md`.

## Procedure
1. Follow: **Production Issue → Root Cause Analysis → Reproduce → add `EVAL-`/`TC-` case → Fix → Verify PASS → Retain permanently.** Whenever technically reasonable, never fix a meaningful production defect without first or simultaneously creating a reproducible regression case.
2. Preserve evaluation **history** — never overwrite baselines/runs/reports unless explicitly ephemeral (`/evals/results/` and `/evals/reports/` accumulate versioned evidence).
3. **Product Journey products:** once real usage exists, run the post-launch learning loop in `~/.claude/skills/t-design/references/product-analytics.md` §9 (funnel → drop-off → segments → time-to-value → retention → validate activation → hypothesis → experiment → update design); a weak activation event is a finding like any other.
4. Feed material findings into `lesson-learnt.md`; where they generalize, add **Candidate Global CLAUDE.md Improvements** (do not auto-edit the global). Append production-RCA decisions to `decisions.md` as `RCA1`, `RCA2`, ….

## Delegation Policy
**Optional.** A `researcher`/`eval-runner` subagent can reproduce the failure and rerun the suite, returning a concise pass/fail; RCA judgment + case authoring stay in the main context.

## Outputs
New permanent `EVAL-`/`TC-` regression cases; updated `/evals`; `decisions.md` (`RCA#`); `lesson-learnt.md` updates.

## Exit Criteria
The production issue is reproduced as a permanent regression case that now **passes** after the fix; evidence retained (not overwritten).

## Handoff
Update `HANDOFF.md` / close the loop; keep the PWA and artifacts in sync.
