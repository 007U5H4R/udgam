# HANDOFF — Udgam

**Stage just completed:** Stage 9 · Code Review + Test & Evaluation, **complete 2026-10-06** (`docs/exec/stage9/README.md`). Earlier: Stage 8 · Design Critique was clean on 2026-10-06 (`docs/exec/stage8/README.md`), and Stage 7 · Execution completed 2026-10-05 (`docs/exec/stage7-report.md`).
**Current stage:** Stage 10 · Security Review + consolidated QA gate (`bw-security-review`, **Fable 5.1 / Low**). It started directly in the same cloud session (EXE46, where the owner said "without my approval"). Then Stage 11 · Deployment, but only if the QA gate approves.

## Read first
1. `docs/exec/stage9/README.md`: the CR register, the TC and eval results, and QA-S9-001/002.
2. `docs/exec/stage8/README.md`: the DES register and the parked items.
3. `docs/exec/stage7-report.md` and `docs/exec/ledger.md`: scope, gates and the M-001 formal result.
4. `decisions.md`: EXE1–EXE48 and D9/D10. The file is append-only.

## State of the branch
- **Branch:** `build/stage7`, tracked by PR 007U5H4R/udgam#1. Never merge to `main` before Stage 10 clears.
- **Scope:** M-001 (TKT-01..21 + TKT-30) and M-002 (TKT-22..26) are built, reviewed, critiqued and tested. M-003 (TKT-27..29) has not started; it comes after the Stage 10 gate.
- **At 46be176 (Stage 9B):**
  - unit + integration 2650, int 773, tz 2650 × 2, evm 42, contracts 47;
  - e2e 952 passed, 0 failed;
  - demo 6/6;
  - TC: 88 PASS, 0 FAIL, 6 BLOCKED (M-003).
- **dd7b0c1** adds the QA-S9 fixes (EXE48). The CI result is in the ledger.
- **Eval:** every gate is identical to baseline-v1, with no regressions:
  - S1 97.7 %, S1-floor 91.7 %;
  - S2 0 %;
  - S6-lib 100 %;
  - S7 Yes;
  - CF 0;
  - S4 max 2473 ms.

  **baseline-v1 is frozen.** A config change needs an `evals/config-changes.md` row whose decision heading ends "— accepted" (EXE34, CR-205).

## Stage 10 — in progress
1. **`/security-review`:** three Fable reviewers, by area:
   - auth and capture: SEC-001–099;
   - public and admin, plus the hash-chain ledger: SEC-100–199;
   - M-002, EVM and infrastructure: SEC-200–299.

   Their brief is the scratchpad `briefs/stage10-sec.md`. Triage → fix (TDD, reviews) or park with a reason → re-run until clean. Reports go to `docs/exec/stage10/`.
2. **Assemble `QA-report.md`** at the repo root. It collates and dedupes the DES (Stage 8), CR and TC/EVAL (Stage 9) and SEC findings into one Unified Findings Register, gives one overall recommendation, and states the release gates. Also generate `evals/reports/eval-report-<version>.md` from the real outputs.
3. **Never weaken a threshold.** The recommendation must not contradict an unresolved Critical.

## Environment notes
- Never run `pnpm dev`; it rewrites CLAUDE.md.
- The sandbox may refuse command lines containing "eval"; call `tsx evals/harness/*.ts` directly.
- A production server needs a throwaway `BETTER_AUTH_SECRET` generated in the shell (EXE38).
- The OG images render with a pinned rasteriser (`scripts/og/fonts.conf`, EXE48). Regenerate them only with `pnpm og:render`.
- Every e2e axe check goes through `e2e/helpers/axe.ts` (an ESLint rule enforces this).
- Keep the disk footprint small: clean up `.next`, `.e2e-data` and clones.

## Owner items (not blocking)
- **Kannada native review:** 617+ strings marked `REVIEW: native speaker`. This can't be delegated.
- **Make the new CI jobs required checks on main:**
  - `eval (harness gates, CF, critical regressions)`;
  - `test-tz (unit + integration in Los Angeles and Kolkata)`;
  - `e2e (Playwright, Chromium, all projects)`.

  See EXE47.
- **Delegated decisions to review whenever convenient:** EXE24–EXE48, including D9/D10, DES-202's per-batch OG words and the buyer graded status in Design.md §28.7.
- **Pre-pilot:**
  - official district boundaries (EXE28);
  - pulping and drying bands (EXE29);
  - FPO yield validation (TP6);
  - the midday sunlight test.
- **Before a public chain:** store only a terms hash (EXE29).
- **A later ticket:** a signed `toOrgType` (EXE32 / DES-201).
- **M-003 (TKT-27..29):**
  - migrate with `pnpm db:migrate` (EXE29);
  - keep the trace check on the standalone build (EXE39);
  - require an https `PUBLIC_BASE_URL` (DES-219);
  - the rehearsal runs on a staging copy (EXE33);
  - S4 on the Oracle A1 host;
  - the owner accounts (Oracle A1, domain, GFW, Copernicus, ArcGIS).

## To sync locally (cloud can't)
- **Campfire:**
  - `docs/exec/campfire-sync.md` §3c–5 (P6–P9, M-002);
  - Stage 8 complete;
  - Stage 9 complete, with the QA-S9-001/002 fixes on TASK-18 and TASK-26.
- **Obsidian vault and auto-memory:** mirror this HANDOFF and the three stage READMEs (`docs/exec/stage7-report.md`, `stage8/README.md`, `stage9/README.md`).

## Preserve
- All DISC#, S#, EV#, D#, TP#, EXE#, M-, TKT-, TC-, EVAL-, DES-, CR-, QA- and SEC- IDs, and the native TASK- IDs.
- The Design Freeze (the OG words changed under EXE43/EXE45 only; EXE48 changed the rasteriser, not the design).
- cfg-1 and baseline-v1 (EV13, EXE34).
- `decisions.md` is append-only.
- The required CI job names: `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`.

Recommend `/clear` before Stage 11.
