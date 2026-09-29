# HANDOFF — Udgam

**Stage just completed:** Stage 5 · Problem Breakdown — **approved 2026-09-29**.
**Next stage:** Stage 6 · Technical Planning (`bw-technical-planning`, Fable 5.1 / Medium). **Runs locally** (Campfire Board PWA onboarding + Gantt sync). **Stage 7 must run in an owner-opened claude.ai/code cloud session (S11).**

## Outputs of Stage 5
- `milestones.md` — M-001 Trust at the edge, end to end (P0, TKT-01–21, 102 sp) · M-002 Contract farming on real smart contracts (P2, TKT-22–26, 23 sp) · M-003 Public deployment and demo (P1, TKT-27–29, 11 sp). Each has objective, scope, deliverables, entry/exit criteria, DoD, risks.
- `tickets.md` — 29 tracer-bullet vertical-slice tickets (136 sp, none above 8 sp), base Definition of Done, dependency DAG + M-001 phase build order, type + priority + acceptance criteria per ticket, all 92 EVAL cases (EVAL-001–092) linked. IDs are provisional `TKT-##`; `TC-` IDs not yet assigned.
- S11 prerequisites are tickets: TKT-01 (walking skeleton + cloud setup script, `.env.example`, fixture-provider default).

## Earlier stages (all approved)
Stage 1 `Discovery-PRD.md` (DISC1–16) · Stage 2 `Solution-PRD.md` (F1–F20, N1–N7, S1–S11) · Stage 3 `evaluation-plan.md` + `evals/eval-dataset.json` (EV1–EV16, S1–S7 gates, CF-01–CF-14) · Stage 4 `Design.md` FROZEN + `.design/exploration/final/` (D1–D8).

## Open items (not blocking Stage 6)
- Should farmers log in themselves? (D8) — owner decision pending.
- Kannada strings need native-speaker review. Dark UI needs a midday sunlight field test (Design.md §22/§23).
- M-002 screens are outside the frozen design — TKT-23 design addendum is required before any M-002 UI.
- Owner actions pending from Stage 1 (block M-003, not M-001): create GFW, Copernicus, ArcGIS, Oracle Cloud accounts (provision the A1 instance early). Domain: `udgam.in` is taken; register `udgamtrace.in` or `udgam.co.in`.

## What Stage 6 must do
Invoke `bw-technical-planning`. Read first: `milestones.md`, `tickets.md`, `Solution-PRD.md`, `evaluation-plan.md`, `evals/eval-dataset.json`, `Design.md` (frozen), `decisions.md`.
1. **Entry gate:** verify the Campfire Board PWA is loaded locally; onboard Udgam into Campfire (`backlog init` + `projects.json`) per the skill's Campfire entry protocol. Create milestones and tickets there; Campfire allocates native IDs — record the `TKT-##` → native ID mapping in `tickets.md`. Sync the Gantt from the DAG.
2. Produce `technical-plan.md` (architecture, stack, per-ticket plans sized for fresh-context execution, eval architecture wiring for `pnpm eval`) and `test-cases.md` (`TC-` IDs, linked back into `tickets.md`).
3. Append `TP#` decisions to `decisions.md`.
4. Preserve all DISC#, S#, EV#, D#, M-, EVAL- IDs and the approved ticket types, priorities and dependencies.
5. End by rewriting this file for Stage 7 (cloud session, `bw-execution-orchestration`) and committing + pushing so the cloud session can `git pull` it.
