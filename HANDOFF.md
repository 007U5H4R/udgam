# HANDOFF — Udgam

**Stage just completed:** Stage 7 · Execution — **complete 2026-10-05** on `build/stage7`. It ran under the owner's gate waiver (EXE1) and went straight on to Stage 8 (EXE22). The M-001 owner review items are still open (see below).
**Next stage:** Stage 8 · Design Critique (`bw-design-critique`, **Sonnet 5 / High**), started directly in the same cloud session (EXE22). Then Stage 9 · Code Review + Test & Evaluation (`bw-code-review-test-eval`).

## Read first
1. `docs/exec/stage7-report.md`: what was built, the gate table per phase, the M-001 formal result, every decision, the owner items, and what Stages 8 and 9 inherit.
2. `docs/exec/m-001-gate.md`: the M-001 gate report and the owner review items (OD-1..9 answered; HR1, HR2, HR6, Kannada list).
3. `docs/exec/ledger.md`: task rows, gate sections P1–P8, M-002 and M-001, and the BUG rows.
4. `decisions.md`: EXE1–EXE39, D9/D10 (append-only).

## State of the branch
- **Branch:** `build/stage7`. Tracking PR: 007U5H4R/udgam#1 (never merge to `main` before Stages 8–10).
- **Scope done:**
  - M-001 TKT-01..21 + TKT-30 (TASK-2..22, TASK-31);
  - M-002 TKT-22..26 (TASK-23..27).
  - **M-003 (TKT-27..29) not started.** It runs after the Stage 10 gate.
- **Tests:** all green at the head: 2513 unit + integration, `test:evm` 41, `contracts:test` 47, and the full e2e in the phase QA runs.
- **M-001 formal evaluation** at eb321a1 (formal commit d7124cb):
  - S1 97.7 %, S1-floor 91.7 %;
  - S2 0/40;
  - S4 10/10 under 3 s (max 2.9 s, VM host);
  - S6-lib 100 %, S7 and S7-release Yes, CF 0.

  **baseline-v1 is frozen** (EV13). A change to the verification config needs an `evals/config-changes.md` row (EXE34).
- **Eval dataset:** 0.8.0 (148 cases). The reported misses are EVAL-122 (EXE27) and EVAL-055/056 (stretch).

## Stage 8 — start here
- **The critique skill is missing.** `impeccable` is not in this repo's vendored skill snapshot (`.claude/skills/`). Follow `bw-design-critique`'s procedure directly: critique the RUNNING app against `Design.md` (including §28, M-002) and the approved mockups in `.design/exploration/final/*.html` (`contract.html` for M-002), and check the `web-deliverables.md` done-gates. Record findings as `DES-###`.
- **How to run the app:**
  - `pnpm build` and `next start` with `E2E=1` and a throwaway `BETTER_AUTH_SECRET` (EXE38);
  - or `pnpm test:e2e` seeds;
  - or `NODE_ENV=development pnpm seed` plus `pnpm demo` (EXE35/EXE33).
  - Never `pnpm dev` (it rewrites CLAUDE.md).
- **Inputs already queued for Stage 8** (`docs/exec/stage7-report.md` §7):
  - the QR code on the printed certificate (EVAL-087/TC-071, QA-P6-8-4 — owner: add the QR, or amend the case);
  - the QA-P6-8-5 visuals: the floating tab bar on short Pickings pages, the underlined "What can I do?", wrapping queue IDs, no "used before" marker on the review photo, no labels on the certificate map;
  - the QA-M002-1 buyer status after grading;
  - the "Not accepted" halo;
  - the og image naming "Kodagu Arabica";
  - D9/D10 touch points T1–T4 for the owner's confirmation;
  - the new copy "Handed to a processor" / "No processing step recorded" (EXE32) and "This agreement changed…" (EXE29);
  - colour-only contrast cases (EVAL-086 N8).

## Owner items (not blocking Stage 8)
- **M-001 review:**
  - HR1 (evidence templates), HR2 (known-limitations wording) and HR6 (number traceability) in `docs/exec/m-001-gate.md`;
  - 617 Kannada strings marked `REVIEW: native speaker`.
- **Stage 8 review of the delegated decisions:** D9/D10 and EXE24–EXE39.
- **Pre-pilot:**
  - official district boundaries (EXE28);
  - pulping and drying bands (EXE29);
  - FPO validation of the yield reference (TP6);
  - the midday sunlight test.
- **Before any public chain:** the contract stores only a terms hash (EXE29).
- **A later ticket:** a signed `toOrgType` on custody transfers (EXE32).
- **M-003 / TKT-27..29:**
  - migrate with `pnpm db:migrate`, never `drizzle-kit migrate` (EXE29);
  - keep the trace check (EXE39);
  - require an https `PUBLIC_BASE_URL` in production (QA-P6-8-3);
  - the live rehearsal runs on a staging copy (EXE33);
  - S4 on the Oracle A1 reference host;
  - the owner accounts (Oracle A1, domain, GFW, Copernicus, ArcGIS).

## To sync locally (cloud can't)
- **Campfire:** run `docs/exec/campfire-sync.md` §3c (statuses, AC ticks, notes for P6–P9 and M-002) and §4–5. Never edit `backlog/` from the cloud.
- **Obsidian vault and auto-memory:** mirror this HANDOFF and `docs/exec/stage7-report.md`.

## Preserve
- All DISC#, S#, EV#, D#, TP#, EXE#, M-, TKT-, TC-, EVAL- and native TASK- IDs.
- The Design Freeze.
- cfg-1 and baseline-v1 (EV13, EXE34).
- `decisions.md` is append-only.
- The two required CI job names: `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`.
