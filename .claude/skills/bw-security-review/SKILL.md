---
name: bw-security-review
description: Build-workflow Stage 10 — Security Review. Use to run /security-review + threat modelling over the branch changes (SEC- findings), then assemble the consolidated QA-report.md release gate and eval-report. Invoked by workflow/build-workflow.md.
---

# Stage 10 · Security Review (+ consolidated QA gate)

**Model/effort:** Fable (`claude-fable-5-1`), Low. **Underlying:** `/security-review` command.
**Companion framework (reference, do not copy):** `~/.claude/workflow/eval-framework.md` (release gates, eval-report format).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator (finding IDs, QA-report structure): `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 10, after Code Review + Test/Eval Execution, on the pending branch.

## Do Not Trigger
No branch changes; security already reviewed clean for this exact diff.

## Inputs
Branch diff + real architecture/threat surface; `DES-`/`CR-`/`TC-`/`EVAL-`/`QA-` findings from Stages 8–9; `evaluation-plan.md` results.

## Procedure
1. Run `/security-review` for vulnerability + threat modelling: auth/authz, session/secrets/credentials, input validation, injection (SQL/NoSQL/command), API security, data exposure, access control, CORS/CSRF/XSS, SSRF, file-upload/path-traversal, dependency/supply-chain, config, logging/error leakage, client/server security, storage/env/token/encryption, insecure defaults, authorization boundaries, privilege escalation.
2. Record each as **`SEC-###`** (component/API/module, related M-/ticket/task, finding, attack surface, severity, likelihood, impact, exploitability, root cause, mitigation, resolution, retest, residual risk, status). Triage → fix or park with reason → re-run until clean. Existing `silent-failure-hunter` agent is reusable.
3. **Assemble `QA-report.md`** (the single consolidated pre-deployment gate): collate/normalize/dedupe Stage 8 (`DES-`), 9A (`CR-`), 9B (`TC-`/`EVAL-`), 10 (`SEC-`). Sections: executive summary + one overall recommendation (READY / READY WITH ACCEPTED RISKS / CONDITIONALLY READY — FIXES REQUIRED / NOT READY); per-stage results with aggregate metrics; **Unified Findings Register** (one canonical row per underlying problem, strongest severity, every source stage referenced); severity summary; open issues & accepted risks (never silently omitted); formal QA gate + release gates (Design · Code Quality · Functional Test · Evaluation · Security · Overall). Also generate `/evals/reports/eval-report-{version}.md` from real output. Block release per `eval-framework.md`; **never weaken thresholds to pass**; recommendation must not contradict any unresolved Critical.

## Delegation Policy
**Preferred.** A `security-reviewer` subagent runs the review against the threat surface and returns `SEC-` findings; `QA-report.md` assembly (cross-stage judgment) stays in the main context.

## Outputs
`SEC-###` findings; `QA-report.md`; `/evals/reports/eval-report-{version}.md`.

## Exit Criteria
Security findings resolved or parked with reason; `QA-report.md` carries a single evidence-based recommendation; no unresolved Critical contradicts a "ready" verdict.

## Handoff
Rewrite `HANDOFF.md` → Stage 11 Deployment (only if the QA gate approves); recommend `/clear`.
