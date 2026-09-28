---
name: bw-execution-orchestration
description: Build-workflow Stage 7 — Execution. Use to execute the per-ticket plans from technical-plan.md via isolated-branch, subagent-per-task orchestration with TDD, continuous evals, two-stage review, bounded fix loops, and an independent per-phase QA gate. Invoked by workflow/build-workflow.md.
---

# Stage 7 · Execution

**Model/effort:** Opus 5.5 (`claude-opus-5-5`), Standard. **Underlying skills:** `superpowers:subagent-driven-development` + `orchestration-playbook` (load the playbook first — it holds the worktree/ledger setup, one-implementer-per-task rule, per-task review, fix loop, model assignment, final review, HITL checkpoints).
**Companion framework (reference):** `~/.claude/workflow/eval-framework.md` (continuous-evaluation triggers, AI evals-before-optimization rule).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 7, after an approved `technical-plan.md` with atomic tasks and an onboarded PWA project.

## Do Not Trigger
No approved plan; a one-or-two-file change that direct execution handles faster than orchestration setup.

## Inputs
`technical-plan.md`, `tickets.md`, `test-cases.md`, `evaluation-plan.md`, `Design.md` (UI). Read the current PWA state.

## Procedure
1. **Isolation:** independent git worktree/branch (never `main` without consent) + a progress **ledger** that survives context resets.
2. **Dispatch:** one **fresh implementer subagent per task**, sequentially or in managed batches; no parallel implementers on shared files. Brief + report travel as **files**, never pasted history.
3. **TDD:** red → green → refactor before moving on, wherever the stack supports it; for UI/emulator shells with no runner, documented manual verification is the equivalent gate.
4. **Continuous evaluation:** rerun the applicable eval suites whenever behavior-changing code lands (triggers in `eval-framework.md`); detect regressions. **AI rule:** never begin substantial prompt/model/retrieval/agent optimization before eval criteria + representative cases exist — define → cases → baseline → modify → rerun → compare.
5. **Review:** two-stage per-task review (spec compliance, then clean-code) → bounded fix loop (max 5 rounds; resume implementer 1–3, escalate to a more capable model 4–5; adjudicate/park at the breaker).
6. **Per-phase QA gate:** a fresh **QA-tester subagent** (separate from implementers, standard-or-capable model) executes the phase's `TC-`/`EVAL-` cases + regressions of earlier phases and reports PASS/FAIL/BLOCKED/NA per case. A phase isn't done until its QA + critical evals pass.
7. Keep the PWA current (status/blockers/progress). Append `EXE1`, `EXE2`, … to `decisions.md`.
8. **Completion:** final whole-branch review on the most capable model → single fix wave → verify all pass.

**Routing reality:** subagent model is chosen by tier and resolves once per session (env vars) — no per-call override; you cannot mix vendors in one session. Split vendors across sessions and surface it at the checkpoint. Name provider + model on every dispatch.

## Delegation Policy
**Required (selective).** This stage is subagent-driven by design — but delegate per task where it creates value, not by reflex. Implementer brief carries only: Task/Ticket ID · objective · acceptance criteria · related `TC-`/`EVAL-` IDs · the exact plan section · files/modules likely affected · constraints · output/report location. No full orchestration history.

## Outputs
Code on the isolated branch; progress ledger; updated PWA; `TC-`/`EVAL-` statuses; `decisions.md` (`EXE#`).

## Exit Criteria
All tasks green under TDD; per-task two-stage reviews pass; every phase's QA + critical evals pass; final whole-branch review clean.

## Handoff
Rewrite `HANDOFF.md` → Stage 8 (UI) or Stage 9; recommend `/clear`. Branch goes to Stages 8–10 before any merge.
