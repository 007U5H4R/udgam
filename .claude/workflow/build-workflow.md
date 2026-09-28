# Build Workflow — Lifecycle Orchestrator (12-Stage Chain)

Referenced from the global `CLAUDE.md`. **Read and follow this file before starting any Lite- or Full-tier build (tiers: global `CLAUDE.md`).** It is the **orchestrator**: it defines *what lifecycle stage comes next and its entry/exit conditions*, and routes each stage to a `bw-*` **stage skill** that carries the detailed procedure (the *how*). It is **not** the place for per-stage SOP prose — that now lives in the skills.

- **Detailed evaluation methodology** → companion `~/.claude/workflow/eval-framework.md` (single source of truth; never duplicated here).
- **Web/UI mandatory checklists** → companion `~/.claude/web-deliverables.md` (loaded only for user-facing UI/web work).
- **Global operating rules** (blast radius, prove-it-against-reality, secrets, scope discipline, compact-at-80%, machine constraints, progress persistence) → `~/.claude/CLAUDE.md`; not restated here.

The goal is a **closed-loop, evidence-driven delivery system**: a fresh session must be able to reconstruct — from the repository artifacts, verified PWA state, codebase, and deployed system alone — what problem was solved, what "good" meant and how it was measured, what was planned/built/changed/tested/evaluated/found/resolved, why it shipped, and what was learned. If that needs hidden chat context, the workflow is incomplete.

---

## Operating Principles (cross-cutting — apply at every stage)

### PWA is the operational source of truth
The **Campfire Board PWA** (local PM dashboard, a Backlog.md fork) is the **active execution system** once a project enters execution — not just a report. Onboard the project and keep it current: metadata, milestones, tickets, tasks, dependencies, priorities, work-item types, status, `sp:` estimates, timeline, progress. The version-controlled Markdown artifacts are the durable planning/spec/QA/learning records. **Keep the two synchronized.** **Capability boundary:** Campfire natively models projects, tickets/subtasks (`parentTaskId`), status, labels, `sp:`, dependencies, assignee, file-backed milestones, and renders Kanban + hours-axis Gantt + Workflow view. It does **not** natively model acceptance criteria, DoD, test/eval links, or QA/security findings — those stay in the Markdown artifacts. Map what fits; never fake a field the app lacks.

### Canonical PWA configuration (define once, reference everywhere)
- `PROJECT_MANAGEMENT_PWA_URL = http://127.0.0.1:6480` — the Campfire Board dashboard.
- Launched by the **`campfire`** shell function (`~/dotfiles/zsh/.zshrc`): starts the local server if down, opens the URL in Chrome.
- Fork/binary root: `/Volumes/E Drive/Dev/Code/Claude/PM Tools/backlog-md-fork/` (manifest: `projects.json`).
Don't hard-code the URL — reference this value.

### Source-of-truth hierarchy (resolve conflicts by this order)
1. **Implementation truth** — the actual code and deployed system.
2. **Operational execution state** — the **PWA** (status, execution, ownership, priorities, dependencies, scheduling, progress).
3. **Version-controlled definition** — the **repository Markdown artifacts** (decisions, specs, acceptance criteria, evaluation plans, test plans, QA evidence, lessons).
When the PWA conflicts with code or verified evidence, **reconcile by investigation** — don't blindly trust either side.

### End-to-end traceability
`Project → Milestone → Ticket → Task → Implementation → Test/Eval Case → Design/Code/QA/Security Finding → Resolution → Retest/Verification → QA Gate → Deployment → Production Verification → Lesson → Reusable Rule`. Any important finding must trace back to the scope and implementation that produced it.

### Stable ID convention (never silently regenerate an ID once implementation begins)
- **Milestones:** `M-001`, `M-002`, … (authored in `milestones.md`; mirror onto the PWA milestone).
- **Tickets & Tasks:** the **PWA's native Backlog IDs are canonical once onboarded** (`task-44`, subtask `task-44.1`). Backlog.md **allocates these itself** — never hand-pick or pre-reserve. Before onboarding, `tickets.md` may use provisional `TKT-01`/`TSK-01`; at Stage-6 onboarding record the mapping (`TKT-03 → task-12`) and use native IDs thereafter.
- **Markdown-only IDs (yours; never collide with the allocator):** `TC-001` (test case), `EVAL-001` (evaluation case), `DES-001` (design), `CR-001` (code review), `QA-001` (QA/functional), `SEC-001` (security).
Use the same IDs consistently across PWA, Gantt, Markdown artifacts, QA reports, test/eval results, and lessons.

### Work-item types & priorities
Each ticket and task gets exactly one type and one priority. **Both are defined once in the global `CLAUDE.md` → "Campfire Ticket per Request"**. Don't redefine them here.

### Evidence-first execution
Never claim success from exit 0. "PWA opened" requires verifying it **loaded**; "implementation complete" requires acceptance criteria + tests; "deployment successful" requires inspecting/testing the deployed product; "QA passed" requires the consolidated evidence. Evaluation reports are **generated from actual execution output**, never hand-entered. If an automation capability is genuinely unavailable, state the specific limitation, give the exact manual command, and continue with everything else.

### Evaluation as an engineering discipline (adaptive, conditional)
Define what "good" means before building, set measurable acceptance criteria, evaluate continuously, preserve evidence across releases. Applies to **every** project but activates **only** the categories a project warrants (AI evals only when the project actually contains AI/ML/LLM/RAG/agentic behavior). **Tests** ask *"did it behave as specified?"*; **evaluations** ask *"how good was the outcome?"* Depth is proportional to risk. **All methodology, catalogs, `/evals` layout, schemas, gates, provenance, and DoD templates live in `eval-framework.md` — read it there; do not duplicate here.**

### Canonical artifact naming (update the canonical file — don't fork `-v2`/`-final` variants)
`Discovery-PRD.md`, `Solution-PRD.md`, `Design.md`, `evaluation-plan.md`, `decisions.md`, `milestones.md`, `tickets.md`, `technical-plan.md`, `test-cases.md`, `QA-report.md`, `lesson-learnt.md`, the `HANDOFF.md` baton, and the `/evals` package (`evaluation-plan.md`, `eval-dataset.json` where relevant, `scorers/`, `results/`, `reports/`). Evaluation **evidence** is versioned deliberately and never overwritten (see `eval-framework.md`).

### Decision log (single source, auto-surfaced by Campfire)
Record every load-bearing decision in one running **`decisions.md`** at the project root. Campfire's **Decisions** section auto-parses it. **Never overwrite, never renumber** once recorded. Format:
```markdown
# Decision Log — <Project>

## <ID> · <Short title> — <status>
**Context.** why this decision was needed
**Decision.** what was chosen
**Rejected.** the alternatives not taken, and why
```
`status` ∈ `accepted | rejected | proposed | superseded` (default `accepted`). Each decision is a `##` block; inside use `###`/bold, never `##`. `<ID>` is the stage label (`S1`, `EV1`, `D1`, `TP1`, `EXE1`, `RCA1`, …). Keep chronological.

### Scope discipline & change management
Only modify what the current stage / approved ticket / approved task / a genuinely necessary dependency requires. If more work becomes necessary, don't fold it in silently: explain why, gauge blast radius, **create/update the Ticket/Task** (type + priority + dependencies), update the Gantt/PWA and affected test/eval cases, then proceed. When implementation reveals the plan is wrong, name the new evidence and the changed assumption, then walk the **artifact synchronization chain** (below). Planning artifacts are **living**.

---

## Lifecycle map & stage routing

**One line:** Understand the problem → define the solution → define what success means and how it's measured → establish baseline → build → test → evaluate → compare → review → release → observe production → convert failures into regression evidence → improve.

**Tier first.** The global `CLAUDE.md` picks the tier (Trivial / Lite / Full). **Lite** runs only Stages 2 → 6 → 7 → 9, with the same skills and approval gates. Its Solution-PRD and plan may be short, and consecutive Lite stages may share a session (the `HANDOFF.md` baton is still rewritten). **Full** runs everything below.

**Human-in-the-loop gate after EVERY stage (mandatory).** Stages are not run back-to-back. At the end of each stage (and each Execution phase): **stop, present the output (or a tight summary + file path), and ask the user to approve before proceeding.** At that checkpoint, **name the next stage's default model + effort and confirm/adjust it** (routing is set per-session — see the Execution skill's routing note). Do not start the next stage on your own initiative. On change requests, revise and re-confirm the same stage. Only exception: the user explicitly says to run straight through.

**Fresh session per stage + single `HANDOFF.md` baton (mandatory).** Maintain one `HANDOFF.md` in the project root; **rewrite the same file** at each stage end (never one file per stage): stage just completed, key decisions, outputs + paths (canonical artifacts + branch/worktree), open questions, and **exactly what the next stage must do and which files it must read**. Then hand off via the Session-Clearing Protocol and start the next stage fresh. `HANDOFF.md` is a baton, not the record of note — still persist durable progress per **Progress & Notes Persistence** in the global `CLAUDE.md`.

**Session-Clearing Protocol.** Before recommending a clear, persist all decisions into artifacts, sync the PWA, ensure IDs are stable. Then present:
> **Stage Complete:** `<stage name>`
> **Artifacts created/updated:** `<paths>`
> **PWA synchronization status:** `Synchronized / Partially / Not Required / Blocked`
> **Current execution status:** Milestone · Ticket · Task · Blockers · Open findings
> **Before clearing, verify:** decisions persisted · files saved · PWA current · stable IDs preserved · nothing load-bearing left only in chat
> **Recommended action:** `Clear the session.`
> **After clearing, paste this command:** `<complete, project-specific continuation command>`

The continuation command is **specific to this project and state** (which stage just completed and which begins next, which artifacts to read first, which PWA project/milestones/tickets to inspect, which IDs must stay unchanged, which decisions are approved, which risks remain, the next stage's objective) — e.g. *"Read the global CLAUDE.md and this project's artifacts first. Stage 6 is complete. Read technical-plan.md, evaluation-plan.md, milestones.md, tickets.md, test-cases.md, and open Campfire (`campfire`). Preserve all M-, TC-, EVAL-, and native Backlog IDs, priorities, types, dependencies, approved decisions, accepted scope. Continue with Stage 7 (invoke skill `bw-execution-orchestration`); don't redo completed stages absent a concrete inconsistency."*

### Stage table — the routing contract

Each stage invokes its `bw-*` skill (the detailed SOP). The skill defines Trigger / Do-Not-Trigger / Inputs / Procedure / Delegation Policy / Outputs / Exit Criteria / Handoff. Conditional stages (4, 8) apply to **UI work only**.

| # | Stage | Skill to invoke | Model / effort | Key output artifact(s) | Entry gate | Exit gate |
|---|-------|-----------------|----------------|------------------------|------------|-----------|
| 1 | Product Discovery | `bw-product-discovery` (→ `mattpocock-skills:grilling`) | Fable 5.1 / High | `Discovery-PRD.md` | Full-tier build; problem not yet nailed down | signed-off Discovery-PRD (problem/why/users/scope/success) |
| 2 | Solution Design | `bw-solution-design` (→ `superpowers:brainstorming`) | Fable 5.1 / High | `Solution-PRD.md`, `decisions.md` (`S#`) | approved Discovery-PRD | **approved `Solution-PRD.md`** (no build without it) |
| 3 | Evaluation Design | `bw-evaluation-design` (+ `eval-framework.md`) | Fable 5.1 / High | `evaluation-plan.md`, `/evals` seed, `decisions.md` (`EV#`) | approved Solution-PRD | plan answers "what makes this unacceptable to release?"; signed off |
| 4 | UI/UX Design *(UI only)* | `bw-ui-ux-design` (→ `t-design`; + `web-deliverables.md`) | Sonnet 5 / Medium | `Design.md`, HTML mockup (+ OG mockup for public web), `decisions.md` (`D#`) | UI work + approved Solution-PRD | signed-off `Design.md` **+ user-approved HTML mockup** (+ OG image mockup for public web); ethical + anti-AI-slop gates pass; web-deliverables design gates addressed |
| 5 | Problem Breakdown | `bw-problem-breakdown` (→ `mattpocock-skills:to-tickets`) | Fable 5.1 / Medium | `milestones.md`, `tickets.md` | approved Solution-PRD (+ Design.md, evaluation-plan) | dependency DAG + vertical-slice tickets w/ `TC-`/`EVAL-` links; signed off |
| 6 | Technical Planning | `bw-technical-planning` (→ `superpowers:writing-plans` + Campfire) | Fable 5.1 / Medium | `technical-plan.md`, `test-cases.md`, PWA onboarded/synced, `decisions.md` (`TP#`) | approved milestones/tickets; **PWA verified loaded** | plan + test-cases complete & PWA-consistent; eval architecture wired |
| 7 | Execution | `bw-execution-orchestration` (→ `superpowers:subagent-driven-development` + `orchestration-playbook`) | Opus 5.5 / Standard | code on branch, ledger, PWA current, `TC-`/`EVAL-` statuses, `decisions.md` (`EXE#`) | approved plan + onboarded PWA | all tasks green (TDD); per-task + per-phase QA + final whole-branch review pass |
| 8 | Design Critique *(UI only)* | `bw-design-critique` (→ `impeccable`) | Sonnet 5 / High | `DES-` findings → fixes | UI work + running implementation | clean re-run; DES- resolved/parked; web-deliverables done-gates verified |
| 9 | Code Review + Test & Eval Execution | `bw-code-review-test-eval` (→ `/code-review` + test/eval run) | Fable 5.1 / Low | `CR-` findings, `TC-` results, `/evals/results/eval-run-{v}.json`, `QA-` findings | pending branch diff | `/code-review` clean; planned suite executed; critical cases pass (not build/lint alone) |
| 10 | Security Review (+ QA gate) | `bw-security-review` (→ `/security-review`) | Fable 5.1 / Low | `SEC-` findings, **`QA-report.md`**, `eval-report-{v}.md` | Stages 8–9 done | security clean/parked; QA-report single evidence-based recommendation |
| 11 | Deployment + Production Monitoring | `bw-deployment-production-monitoring` (→ `superpowers:finishing-a-development-branch` + CI/CD) | Opus 5.5 / Standard | release, monitoring, `lesson-learnt.md` | **`QA-report.md` gate approved** | deployed app verified live; monitoring/alerting up; provenance recorded |
| 12 | Feedback & Regression Evaluation | `bw-feedback-regression` (RCA + eval/test authoring) | Opus 5.5 / Standard | new `EVAL-`/`TC-` regression cases, updated `/evals`, `decisions.md` (`RCA#`) | a meaningful production signal | issue reproduced as a permanent passing regression case; evidence retained |

**Stage 4 note:** `t-design` now covers cognitive psychology, behavioral design, emotional design, HCI/usability heuristics, production-pattern research, anti-AI-slop safeguards, visual/design-system specification, accessibility, responsive behavior, and design validation — plus optional `/design`-style visual exploration where available. Stage 4 approval now requires **`Design.md` + a user-approved lightweight HTML/CSS mockup**, and for a publicly reachable page **an approved OG image mockup** — the delivery contract for both lives in `web-deliverables.md` (OG design methodology in the companion `workflow/og-image-guidelines.md`). Detailed procedure and its `references/` live inside the skill; this row stays a routing pointer.

**Reused specialist agents** (Execution/Review, dispatched only when isolation adds value — never one-agent-per-skill): `silent-failure-hunter`, `type-design-analyzer`, `spec-miner`, plus ad-hoc implementer/QA-tester/reviewer/eval-runner subagents via the `Agent` tool. Each receives a **small brief** (objective · exact artifacts · exact files/modules · constraints · output format) — never the full conversation history.

**No build ever begins without an approved `Solution-PRD.md` (Stage 2).** Do not treat plan-mode `ExitPlanMode` as the terminal step of the early stages — the chain continues past it.

---

## Artifact synchronization chain (keep logically in sync)
`evaluation-plan.md → decisions.md (append-only) → technical-plan.md → milestones.md → tickets.md → test-cases.md → /evals (plan/dataset/scorers) → PWA (project/milestones/tickets/tasks) → Gantt → Implementation → Design Critique → Code Review → Test & Eval Execution → Security Review → QA-report.md + eval-report → Deployment + Production Monitoring → lesson-learnt.md → Feedback & Regression Evaluation`.

Whenever implementation changes the plan, walk the chain: update the Task, then parent Ticket, then Milestone, then dependencies/estimates/timeline; update the Gantt; sync the PWA; update affected Test/Eval cases; preserve traceability. Never let planning artifacts rot into stale documentation.

## Definition of Done (universal — apply the conditional blocks that fit)
Never treat a successful demo as sufficient evidence. **Base:** functional implementation complete · acceptance criteria satisfied · required tests created & passing · required evaluation cases created · applicable eval suite executed · critical evaluations pass · no unacceptable regression vs. baseline · results persisted · docs updated · observability added. **Conditional blocks (AI features · performance-sensitive · security-sensitive) and full templates: `eval-framework.md`.**

When a project's design and plan are documented but execution is deferred, also write an orchestration/execution playbook alongside the plan so the build day is turnkey.

## Budget-aware execution (Pro tier)
Phase long builds across separate sessions at natural checkpoints (a growing orchestrator context is the biggest token sink). Tier models deliberately per the stage table. Keep orchestration lean (briefs/reports as files, fresh subagent per task, targeted reads). Prefer build/console checks over image-heavy browser verification. Stop at phase boundaries, not mid-task. Compact around ~80% context at a clean boundary.
