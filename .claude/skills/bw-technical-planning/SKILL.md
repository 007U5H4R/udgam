---
name: bw-technical-planning
description: Build-workflow Stage 6 — Technical Planning. Use to produce technical-plan.md and test-cases.md, onboard/sync the project into the Campfire Board PWA (Gantt), and wire the evaluation architecture. Contains the Campfire entry protocol. Invoked by workflow/build-workflow.md.
---

# Stage 6 · Technical Planning

**Model/effort:** Fable (`claude-fable-5-1`), Medium. **Underlying skill:** `superpowers:writing-plans` + Campfire Board PWA.
**Companion framework (reference, do not copy):** `~/.claude/workflow/eval-framework.md` for eval runner/provenance/reproducibility.
Global rules: `~/.claude/CLAUDE.md`. Orchestrator (stable IDs, PWA canonical config, source-of-truth hierarchy, artifact-sync chain): `~/.claude/workflow/build-workflow.md`.

**Canonical PWA config (reference the orchestrator, don't hard-code):** `PROJECT_MANAGEMENT_PWA_URL = http://127.0.0.1:6480`; launched by the `campfire` shell function; fork root `/Volumes/E Drive/Dev/Code/Claude/PM Tools/backlog-md-fork/` (manifest `projects.json`).

## Trigger
Stage 6, after approved `milestones.md` + `tickets.md`.

## Do Not Trigger
Tickets not signed off; trivial change with no multi-step plan.

## Inputs
`Discovery-PRD.md`, `Solution-PRD.md`, `evaluation-plan.md`, `Design.md` (UI), `milestones.md`, `tickets.md`.

## Procedure
**6.0 Entry protocol (do first).** Enter planning → launch/reuse Chrome → run `campfire` → **verify the PWA actually loaded** (evidence-first, not just "Chrome launched") → locate the existing project OR create/onboard it → inspect existing milestones/tickets/tasks/timeline/status → respect existing decisions. Do this yourself (browser/shell) — don't ask the user. If browser control is genuinely unavailable, state the limitation, give the exact `campfire` command, and continue the rest. **Entry gate:** Chrome up ✓ · PWA verified loaded ✓ · correct project identified/onboarded ✓ · existing state inspected ✓ · existing IDs preserved ✓.
**6.1** Produce **`technical-plan.md`**: technical approach (architecture, components, data model, data flows, integrations, dependencies, auth/authz, observability, failure modes, sequencing, risks, deployment, migration, testing strategy, rollback) **and** per-ticket **atomic 2–5-minute tasks** with exact file paths, interfaces, and a verification gate. Implement `Design.md` tokens/components/motion verbatim. **If `Design.md` §15 chooses a non-native scroll model** (smooth, scrollytelling, horizontal, snap, nested, infinite/load-more, virtualized, significant scroll-linked motion), plan the implementation technology per `~/.claude/skills/t-design/references/motion-scroll.md` §8/§12 — lightest suitable tool, one canonical scroll source and animation loop, anchor offsets, nested-scroll ownership, phone/touch policy, reduced-motion behavior; native scroll needs no plan. **If `Design.md` §26 (Spatial 3D) exists**, decide and record the Stage-6 items in `~/.claude/skills/t-design/references/spatial-3d.md` §11 (Three.js vs R3F, WebGL vs WebGPU, asset pipeline, quality tiers, render-on-demand, disposal/context loss, fallback wiring) without changing the approved experience. **If `Design.md` §27 (Product Experience) exists**, plan the Stage-6 analytics items in `~/.claude/skills/t-design/references/product-analytics.md` §8 (SDK, identity wiring, client vs server tracking, dedup, environments, and — once the tool is confirmed — the derived tracking-plan/funnel/retention/validation files) plus intent preservation across auth/paywall. Append `TP1`, `TP2`, … to `decisions.md`.
**6.2** Onboard/sync the PWA: register `backlog/` in the fork's `projects.json`; create/sync project, milestones, tickets, tasks, dependencies, priorities, types, `sp:` via the Backlog.md CLI (`backlog task create` — **never hand-pick or hand-edit IDs**); record the `TKT-## → task-NN` mapping in `tickets.md`. Ensure `decisions.md` exists (backfill from PRDs/plans if needed).
**6.3** Gantt = **the Campfire hours-axis Gantt + Workflow view** rendered from onboarded data. Do **not** build a parallel Gantt; keep PWA data current so it stays synced.
**6.4** Create **`test-cases.md`** before implementation is considered complete (`TC-###` schema per orchestrator: title, related M-/ticket/task, objective, preconditions, steps, data, expected result, type, priority, automation-candidate, status, finding ref). Prioritize real risk — do not pad.
**6.5** Wire the evaluation architecture: eval-runner, test-data/fixtures, result storage, observability/tracing, regression execution, CI integration, and the baseline capture — represented in `milestones.md`/`tickets.md`/`test-cases.md`; give `/evals` a single top-level run command. Follow `eval-framework.md`.

## Delegation Policy
**Optional.** A `researcher`/`architect` subagent may draft the architecture section when it requires reading many files, returning a concise evidence-backed design. **PWA onboarding, Gantt sync, and browser verification stay in the main context** (shell/browser control). Never send full history — pass the plan section + file list.

## Outputs
`technical-plan.md`; `test-cases.md`; updated Campfire PWA (project/milestones/tickets/tasks/deps/Gantt); `decisions.md` (`TP#`); `TKT→task` mapping in `tickets.md`.

## Exit Criteria
Entry gate satisfied (PWA verified loaded, project onboarded, IDs preserved); `technical-plan.md` + `test-cases.md` complete and consistent with the PWA; eval architecture wired; user sign-off.

## Handoff
Rewrite `HANDOFF.md` → Stage 7 Execution (name preserved M-/TC-/EVAL-/native task IDs, approved decisions, accepted scope); recommend `/clear`.
