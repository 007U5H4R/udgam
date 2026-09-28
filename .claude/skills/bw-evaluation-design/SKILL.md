---
name: bw-evaluation-design
description: Build-workflow Stage 3 — Evaluation Design. Use after an approved Solution-PRD.md to define what "good" means and how it will be measured, producing evaluation-plan.md (and seeding /evals where warranted). Applies to every project. Invoked by workflow/build-workflow.md.
---

# Stage 3 · Evaluation Design (define success before building)

**Model/effort:** Fable (`claude-fable-5-1`), High. **Underlying skill:** `superpowers:brainstorming`.
**Companion framework (READ IT, do not copy it here):** `~/.claude/workflow/eval-framework.md` — the single source of truth for evaluation methodology (categories, `/evals` layout, case schemas, dataset coverage, provenance, release gates, DoD templates, tests-vs-evals).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 3, after an approved `Solution-PRD.md` and **before** any planning. Runs for **every** project (software, API, PWA, data, AI/RAG/agent).

## Do Not Trigger
No approved `Solution-PRD.md` yet; trivial change with no measurable success surface.

## Inputs
`Solution-PRD.md` (approved). Read `eval-framework.md` in full at the start.

## Procedure
1. Identify the **project type** and **select the applicable evaluation categories** (functional · product-acceptance · performance · reliability · security · design; **AI evals only if the project actually contains AI/ML/LLM/RAG/agentic behavior**). Choose deliberately — do not apply all mechanically; depth is proportional to risk.
2. Produce **`evaluation-plan.md`**: what to evaluate + why, categories, metrics, scoring, acceptance thresholds, **critical failure conditions**, automated/manual/human-review strategy, regression strategy, release gates. It must explicitly answer **"what would make this unacceptable to release?"**
3. Where warranted, seed the **`/evals`** package and author initial `EVAL-###` cases with measurable expected behavior. Plan a **baseline** run for any metric to be optimized (never rely on "seems better"). Follow `eval-framework.md` for structure/schemas — reference it, don't restate it.
4. Append load-bearing decisions (categories selected, thresholds, release gates, alternatives rejected) to `decisions.md` as `EV1`, `EV2`, ….

## Delegation Policy
**Optional.** Design is interactive and stays in the main context. An `eval-runner` subagent is for *executing* large suites later (Stage 9/12), not for this design stage.

## Outputs
`evaluation-plan.md`; seeded `/evals/` + `EVAL-###` cases where warranted; `decisions.md` (`EV#`).

## Exit Criteria
`evaluation-plan.md` answers the unacceptable-to-release question, selected categories match the project type, baselines are planned, and the **user has signed off**.

## Handoff
Rewrite `HANDOFF.md` → Stage 4 (if UI) or Stage 5; recommend `/clear`.
