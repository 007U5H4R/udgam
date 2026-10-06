# HANDOFF — Udgam

**Stage just completed:** Stage 8 · Design Critique, **clean 2026-10-06** (`docs/exec/stage8/README.md`). Stage 7 · Execution completed 2026-10-05 (`docs/exec/stage7-report.md`).
**Next stage:** Stage 9 · Code Review + Test & Evaluation Execution (`bw-code-review-test-eval`, **Fable 5.1 / Low**). It starts directly in the same cloud session (EXE44, owner: "don't wait for my approval"). Then Stage 10 · Security Review.

## Read first
1. `docs/exec/stage8/README.md`: the DES register, the parked items and the done-gates.
2. `docs/exec/stage7-report.md`: scope, gates, the M-001 formal result, decisions and carry-overs (§8 lists the Stage 9 inputs).
3. `docs/exec/ledger.md`: task rows, phase gates (P1–P8, M-002, M-001), the Stage 7 completion and the Stage 8 summary.
4. `decisions.md`: EXE1–EXE45 and D9/D10 (append-only).

## State of the branch
- **Branch:** `build/stage7`. Tracking PR 007U5H4R/udgam#1. Never merge to `main` before Stages 9–10 clear.
- **Scope:** M-001 (TKT-01..21 + TKT-30) and M-002 (TKT-22..26) are built, reviewed and QA'd. M-003 (TKT-27..29) has not started; it runs after the Stage 10 gate.
- **At 5e1a390 / 8d83b8b:** 2578 unit + integration tests, `test:evm` 41, `contracts:test` 47, `pnpm build` with 0 warnings, the trace check and bundle-secrets clean, the production audit clean (`source-map-js` override, GHSA-68fv-2mgg-jv7q), and CI green.
- **M-001 formal evaluation** (eb321a1, formal commit d7124cb):
  - S1 97.7 %, S1-floor 91.7 %;
  - S2 0/40;
  - S4 10/10 under 3 s;
  - S6-lib 100 %;
  - S7 and S7-release Yes;
  - CF 0.

  **baseline-v1 is frozen.** A config change needs an `evals/config-changes.md` row (EXE34).

## Stage 9 — start here
- **9A Code review.** Run `/code-review` over `git diff b397c08..build/stage7`; it's large, so delegate to code-reviewer subagents by area. Record findings as **`CR-###`**.
  - The Stage 7 final whole-branch review already covered:
    - the cross-ticket integration;
    - the trace and key leak (EXE39);
    - production gating;
    - guard coverage.

    Don't redo them; look for what remains.
  - **Inputs to fold in:**
    - DES-030: the Kannada photo slot is 3 px too wide at 320 px (`.slots` → `minmax(0, 1fr)`);
    - EVAL-086 N7: scale/zoom is not caught by the evidence-text check;
    - the remaining bare `resolve`/`join` DATA_DIR paths: attestation route, `media/store`, `media/thumbs`, `capture/staging`, `demo/attacks`. Move them to `runtimePath`;
    - the EXE36 residuals: R-6, a "Rejected" EV heading still authorises a config change;
    - CI does not run `pnpm test:tz`;
    - the review nits marked "later" in `docs/exec/stage7-report.md` §8.
- **9B Test & eval.** Run the whole planned suite from real output, with one top-level command where possible:
  - `test-cases.md`: every TC- gets PASS / FAIL / BLOCKED / NA;
  - `pnpm test`, `test:int`, `test:tz`, `test:evm`, `contracts:test` and the full `test:e2e`;
  - `pnpm demo`;
  - the eval harness for M1 (`pnpm eval`), and for M2 (`--ledger=evm --milestone=M2`);
  - the release reconciliation (`eval:release`, non-formal, into the git-ignored `local/`).

  baseline-v1 is never rewritten. A Stage 9 eval run is a new, non-formal run, compared against baseline-v1.
  - **On FAIL:** root cause → ticket → `QA-###` → fix → retest. Never hide a failing case.
  - **Owner-held misses** (EVAL-122 EXE27; EVAL-055/056 stretch) stay reported.
- **Environment notes:**
  - Never run `pnpm dev`; it rewrites CLAUDE.md.
  - The sandbox may refuse command lines containing "eval"; call `tsx evals/harness/*.ts` directly.
  - A production server needs a throwaway `BETTER_AUTH_SECRET` generated in the shell (EXE38).
  - Keep the disk footprint small: the disk filled once, so clean up `.next`, `.e2e-data` and clones.

## Owner items (not blocking)
- **Kannada native review:** 617+ strings marked `REVIEW: native speaker`. This can't be delegated.
- **Delegated decisions to review whenever convenient:** EXE24–EXE45, including D9/D10, DES-202's per-batch OG words and the buyer graded status in Design.md §28.7.
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
  - require an https `PUBLIC_BASE_URL` (DES-219 / QA-P6-8-3);
  - the rehearsal runs on a staging copy (EXE33);
  - S4 on the Oracle A1 host;
  - the owner accounts (Oracle A1, domain, GFW, Copernicus, ArcGIS).

## To sync locally (cloud can't)
- **Campfire:** `docs/exec/campfire-sync.md` §3c–5 (P6–P9, M-002), plus a note that Stage 8 is complete.
- **Obsidian vault and auto-memory:** mirror this HANDOFF, `docs/exec/stage7-report.md` and `docs/exec/stage8/README.md`.

## Preserve
- All DISC#, S#, EV#, D#, TP#, EXE#, M-, TKT-, TC-, EVAL-, DES- and native TASK- IDs.
- The Design Freeze (the OG words changed under EXE43/EXE45 only).
- cfg-1 and baseline-v1 (EV13, EXE34).
- `decisions.md` is append-only.
- The required CI job names: `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`.
