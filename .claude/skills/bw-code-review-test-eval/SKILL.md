---
name: bw-code-review-test-eval
description: Build-workflow Stage 9 — Code Review + Test & Evaluation Execution. Use to run /code-review over the branch diff (CR- findings) AND execute test-cases.md + applicable eval suites from real output. Not complete on build/lint/typecheck alone. Invoked by workflow/build-workflow.md.
---

# Stage 9 · Code Review + Test & Evaluation Execution

**Model/effort:** Fable (`claude-fable-5-1`), Low (maximizes precision; higher settings flood false positives). **Underlying:** `/code-review` command + the planned test/eval run.
**Companion framework (reference, do not copy):** `~/.claude/workflow/eval-framework.md` (result artifact, provenance, release gates).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 9, after Execution (and Design Critique for UI), on the pending branch.

## Do Not Trigger
No branch diff to review; work not yet implemented.

## Inputs
Branch diff; `test-cases.md`; `evaluation-plan.md` + `/evals`; `tickets.md` (for traceability).

## Procedure
**9A Code Review.** Run `/code-review` over the branch diff for correctness + architecture, maintainability, readability, modularity/reuse, simplicity, error handling, state/API/data handling, performance, reliability, observability, dependency usage, dead code, duplicate logic, concurrency/race, resource leaks, boundaries. Record each as **`CR-###`** (file/module, related M-/ticket/task, finding, category, severity, root cause, recommendation, resolution, verification, residual risk). Triage → fix or park with reason → re-run until clean.
**9B Test & Eval Execution.** Run the planned `test-cases.md` + applicable eval suites; prefer a **single top-level command** for reproducibility. Per case record `TC-` ID, expected/actual, **PASS/FAIL/BLOCKED/NA**, finding ID, root cause, resolution, retest. For evals, generate `/evals/results/eval-run-{version}.json` **from real execution output** (totals, scores, critical failures, regressions, improvements, runtime, config, timestamp, provenance — per `eval-framework.md`). On FAIL: root cause → trace to Ticket/Task → create/update `QA-###` → fix → retest/re-eval → update result. **Never hide or silently remove failed cases.** **If a non-native scroll model shipped**, the run must test it on the real app per `~/.claude/skills/t-design/references/motion-scroll.md` §12: mouse · trackpad where practical · touch on a real phone · keyboard (Page Up/Down, Space, Home/End, Tab) · reduced motion · anchors + skip links (sticky-header offsets, deep links, back/forward) · nested scroll ownership · mobile (no horizontal page scroll, sticky/keyboard/browser-chrome behavior) · scroll performance. **If `Design.md` §26 (Spatial 3D) exists**, run the `spatial-3d.md` §13 verification on the real app: every input modality, reduced motion, forced WebGL/model failure → fallback, browser/device matrix, frame pacing and memory/disposal, page CWV intact, accessibility equivalence. **If `Design.md` §27 (Product Experience) exists**, run analytics QA against `analytics/product-analytics-contract.md` per `product-analytics.md` §7 (payloads, counts, properties, identity stitching, ordering, environment, activation condition, dedup, no prohibited PII — confirmed in the tool's live events view, not by HTTP 200).

## Delegation Policy
**Preferred.** A `code-reviewer` subagent (large diff) and an `eval-runner` subagent (large suite output) each return concise evidence-backed results, keeping raw diffs/logs out of the orchestrator. Existing agents `silent-failure-hunter` and `type-design-analyzer` are reusable here.

## Outputs
`CR-###` findings; `TC-` results; `/evals/results/eval-run-{version}.json`; `QA-###` findings. All carry into `QA-report.md`.

## Exit Criteria
`/code-review` clean (or parked with reason); the planned suite executed; critical test/eval cases pass. **Not complete merely because the project builds/compiles/lints/type-checks or unit tests pass.**

## Handoff
Rewrite `HANDOFF.md` → Stage 10 Security Review; recommend `/clear`.
