---
name: bw-problem-breakdown
description: Build-workflow Stage 5 — Problem Breakdown. Use to break an approved Solution-PRD.md (+ Design.md + evaluation-plan.md) into tracer-bullet vertical-slice tickets with a dependency DAG, producing milestones.md and tickets.md. Invoked by workflow/build-workflow.md.
---

# Stage 5 · Problem Breakdown

**Model/effort:** Fable (`claude-fable-5-1`), Medium. **Underlying skill:** `mattpocock-skills:to-tickets` (user-invoked; trigger explicitly).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator (stable IDs, work-item types, priorities, ticket/milestone schemas): `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 5, after an approved `Solution-PRD.md` (and `Design.md` for UI work) and `evaluation-plan.md`.

## Do Not Trigger
Missing approved Solution-PRD / evaluation-plan; trivial single-file change.

## Inputs
`Solution-PRD.md`, `Design.md` (UI), `evaluation-plan.md`.

## Procedure
1. Run `/to-tickets` to break work into **tracer-bullet vertical slices**: each ticket cuts a narrow but complete path (schema → API → UI → tests/evals), is demoable, fits a single fresh context window, and declares its **blocking edges** (a dependency DAG). Sequence wide mechanical refactors expand → migrate → contract.
2. Publish one ticket per file/issue in dependency order (blockers first) to the tracker, labelled `ready-for-agent`.
3. Produce **`milestones.md`** (`M-###`: name, objective, scope, deliverables, tickets, dependencies, entry/exit criteria, DoD, sequence, priority, status, risks) and **`tickets.md`** (per ticket + task: all fields the PWA dialog needs — type, priority, milestone, dependencies, objective, acceptance criteria, DoD, `sp:` estimate, notes, **related `TC-` and `EVAL-` IDs**; provisional `TKT-##`/`TSK-##` until PWA onboarding). Every applicable feature ticket references its `EVAL-` requirements (see `eval-framework.md` worked examples).
4. **Quiz the user** on granularity and blocking edges; iterate to sign-off.

## Delegation Policy
**Unnecessary.** Ticket granularity is a judgment dialogue with the user; keep it in the main context.

## Outputs
`milestones.md`, `tickets.md` (+ per-file/tracker ticket copies).

## Exit Criteria
Dependency DAG is explicit, each ticket is a demoable vertical slice sized to one context window, `TC-`/`EVAL-` links present, and the **user has signed off** on granularity.

## Handoff
Rewrite `HANDOFF.md` → Stage 6 Technical Planning; recommend `/clear`.
