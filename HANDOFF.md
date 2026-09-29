# HANDOFF — Udgam

**Stage just completed:** Stage 6 · Technical Planning — **approved 2026-09-29** (Campfire TASK-1).
**Next stage:** Stage 7 · Execution (`bw-execution-orchestration`, Opus 5.5 / Standard). **Runs in an owner-opened claude.ai/code cloud session on `007U5H4R/udgam` (S11)**, on branch `build/stage7`.

## Outputs of Stage 6
- `technical-plan.md`:
  - architecture, schema with DB-enforced invariants, the crypto and payload spec, and the verification pipeline with `cfg-1`;
  - remote-sensing adapters, the ledger and proof-feed v1, the capture client, auth, UI port rules, EUDR export, the eval architecture, testing, observability, security, deployment, budgets and risks;
  - phase sequencing (§20), the cloud runbook (§21), and per-ticket atomic task plans for all 30 tickets (§22).
- `test-cases.md` — TC-001–TC-094, linked to M-, TKT-, TASK- and EVAL- IDs.
- `decisions.md` — TP1–TP29.
- `evals/eval-dataset.json` 0.2.0: M-002 cases EVAL-093–105 added; EVAL-054 and EVAL-068 activated; schema feature `contract-farming`; `evaluation-plan.md` §7.6.
- **Campfire:** project **Udgam** onboarded (`backlog/`, manifest entry `udgam`), milestones M-001 `m-0`, M-002 `m-1`, M-003 `m-2`, tickets TKT-01..30 → **TASK-2..31** with type, priority, `P#` and `sp:` labels, dependencies, ACs and DoD; the Gantt renders from them. Mapping in `tickets.md` → Campfire mapping.

## Stage 7 — start here
1. **Owner pre-flight** (technical-plan §21.1): the Claude GitHub App on the repo; claude.ai/code environment `udgam` with the network allow-list and setup script from §21.1; no secrets needed for M-001 (fixture provider).
2. Open claude.ai/code on `007U5H4R/udgam`, branch `main`, and paste the prompt from technical-plan §21.4.
3. Order: M-001 phases P1 → P9 (§20): TKT-01 = TASK-2 first. Stop after each phase with a gate report; stop at the M-001 gate for owner approval.
4. The cloud session never edits `backlog/`; it keeps `docs/exec/ledger.md`.

## Preserve
All DISC#, S#, EV#, D#, TP#, M-, TC-, EVAL- IDs and native TASK- IDs; approved types, priorities, dependencies and scope; `cfg-1` until baseline-v1 (EV13); the Design Freeze.

## To sync locally after each Stage 7 phase gate
From `docs/exec/ledger.md` on `build/stage7`:
- Campfire task statuses, `--check-ac` and `--append-notes` (commit SHAs, eval deltas);
- the Obsidian vault `Udgam/` progress note;
- auto-memory `udgam-project-state.md`.

## Open items
- **Resolved 2026-09-29:** TP13 approved as TKT-30 = TASK-31 (TP28, runs in phase P7). HR3 waived (TP29): 8 AI-generated demo photos are in `assets/demo-photos/`, and 4 more prompts are pending until provider limits reset.
- **Yield reference (TP6):** Coffee Board district averages are used as U; the design-partner FPO should validate them before any pilot. The 6:1 cherry ratio is unverified.
- **Mass-balance bands (TKT-26):** no Coffee Board figure exists for pulping or drying; the owner confirms placeholder bands before M-002.
- **Processor role (M-002):** decided with the TKT-23 design addendum (next D#).
- Carried over: D8 farmer login; Kannada native review; midday sunlight test (not waived); TKT-23 design addendum before any M-002 UI.
- **Owner accounts** (block M-003, not M-001): Oracle Cloud A1 instance (provision early); domain `udgamtrace.in` or `udgam.co.in`; GFW Data API key; Copernicus Data Space OAuth client; ArcGIS Location Platform key (tiles; MapTiler as fallback).
