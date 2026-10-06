# HANDOFF — Udgam

**Stage just completed:** Stage 10 · Security Review + consolidated QA gate, **2026-10-06**. The verdict is **READY WITH ACCEPTED RISKS** (`QA-report.md`).
- Earlier: Stage 9 completed 2026-10-06 (`docs/exec/stage9/README.md`), Stage 8 was clean on 2026-10-06 (`docs/exec/stage8/README.md`), and Stage 7 completed 2026-10-05 (`docs/exec/stage7-report.md`).

**Next stage:** Stage 11 · Deployment + Production Monitoring (`bw-deployment-production-monitoring`, **Opus 5.5 / Standard**). That means M-003 (TKT-27..29).

**Waiting for the owner.** The owner's waivers (EXE44, EXE46) carried the session through Stage 10 only. The Stage 7 brief kept M-003 out of scope, and Stage 11 needs the owner's Oracle A1 instance, domain and provider accounts. Approve this gate and provide the accounts before Stage 11 starts.

## Read first
1. `QA-report.md`: the one release gate. It has the Unified Findings Register, the open issues and the accepted risks (§5).
2. `docs/exec/stage10/`:
   - the three SEC reports;
   - `stage10-sec-rerun.md` (CLEAN);
   - `stage10-eval-run.md` and `eval-report-local-b13dfaf.md`, the non-formal release at b13dfaf (PASS).
3. `tickets.md` M-003: TKT-27 and TKT-28 now carry the Stage 10 carry-ins as acceptance items (EXE51).
4. `decisions.md`: EXE1–EXE51 and D9/D10. The file is append-only.

## State of the branch
- **Branch:** `build/stage7`, tracked by PR 007U5H4R/udgam#1. It is not merged to `main`; merging is the owner's call at Stage 11 (`superpowers:finishing-a-development-branch`).
- **Scope done:** M-001 (TKT-01..21 + TKT-30) and M-002 (TKT-22..26) are built, critiqued, reviewed, tested and security-reviewed.
- **At b13dfaf (all Stage 10 fixes):**
  - `pnpm test`: 278 files, 2694 tests;
  - `test:evm`: 44;
  - `contracts:test`: 47;
  - CI e2e: 952 passed;
  - eval release PASS (S1 97.7 %, S1-floor 91.7 %, S2 0 %, S6-lib 100 %, S7 Yes, CF 0, S4 max 2317 ms, 28/28 cases), with no regression against baseline-v1.
- **baseline-v1 and the formal eb321a1 files are frozen** (EV13, EXE34). The next formal eval report is TKT-29's, from production.

## Stage 11 — start here (after the owner approves)
- **Do M-003 in order: TKT-27, TKT-28, TKT-29.** The Stage 10 carry-ins are acceptance criteria:
  - **TKT-27:**
    - the Caddyfile sets `X-Forwarded-For`, with the forged-header test (SEC-006, TSK-27.3);
    - a Caddy `request_body` cap, plus an admin-path cap (SEC-005);
    - the RPC is not published (SEC-203);
    - Caddy sends HSTS;
    - migrate with `pnpm db:migrate` (EXE29);
    - the trace check runs on the standalone build (EXE39).
  - **TKT-28:**
    - per-account provisioning, with no shared password (SEC-001);
    - a per-agent storage budget and a disk alert (SEC-003);
    - an https `PUBLIC_BASE_URL` (DES-219);
    - the owner confirms SEC-101.
  - **TKT-29:**
    - three production demo runs, S3 and S5;
    - S4 re-measured on the A1 host;
    - the formal eval report published.
- **Stage 11 also covers:**
  - the live OG unfurl check (Stage 8, BLOCKED until then);
  - monitoring and alerting;
  - `lesson-learnt.md`.

## Owner items
- **Approve the Stage 10 QA gate** and start Stage 11 / M-003.
- **Accounts:** Oracle A1, the domain, GFW, Copernicus/Sentinel Hub, ArcGIS/MapTiler.
- **Kannada native review:** 617+ strings marked `REVIEW: native speaker`. This can't be delegated, and it is needed before a field pilot.
- **Required checks on main:**
  - `eval (harness gates, CF, critical regressions)`;
  - `test-tz (unit + integration in Los Angeles and Kolkata)`;
  - `e2e (Playwright, Chromium, all projects)`.

  See EXE47.
- **SEC-101:** confirm that the public feed may carry the 7 dp phone fix and opaque agent and admin IDs, or ask for payload v2, before the first production anchor (`docs/proof-feed.md` §9.2a).
- **Delegated decisions to review whenever convenient:** EXE24–EXE51, including the capture/stage pool of 8 (EXE50) and the M-003 scope additions (EXE51).
- **Pre-pilot:**
  - official district boundaries (EXE28);
  - pulping and drying bands (EXE29);
  - FPO yield validation (TP6);
  - HR3 field calibration (TP29);
  - the midday sunlight test.
- **Before a public chain:** store only a terms hash, and use amount-free events (EXE29, SEC-203).

## Environment notes
- Never run `pnpm dev`; it rewrites CLAUDE.md.
- The sandbox may refuse command lines containing "eval"; call `tsx evals/harness/*.ts` directly.
- A production server needs a throwaway `BETTER_AUTH_SECRET` generated in the shell (EXE38).
- The OG images use a pinned rasteriser (EXE48); regenerate them only with `pnpm og:render`.
- Every e2e axe check goes through `e2e/helpers/axe.ts`.
- Tests create temp folders through `tests/helpers/tmp.ts`.
- CI cancels an in-progress run on a new push, and e2e takes about 30 minutes, so batch your pushes.

## To sync locally (cloud can't)
- **Campfire:**
  - `docs/exec/campfire-sync.md` §3c–3d;
  - Stage 10 complete;
  - add the SEC IDs and commits from the ledger's Stage 10 section to TASK-2, TASK-8, TASK-20, TASK-26 and TASK-31;
  - add the new acceptance items to TASK-28 and TASK-29 (TKT-27, TKT-28).
- **Obsidian vault and auto-memory:** mirror this HANDOFF, `QA-report.md` and the stage READMEs.

## Preserve
- All DISC#, S#, EV#, D#, TP#, EXE#, M-, TKT-, TC-, EVAL-, DES-, CR-, QA- and SEC- IDs, and the native TASK- IDs.
- The Design Freeze.
- cfg-1 and baseline-v1 (EV13, EXE34).
- `decisions.md` is append-only.
- The required CI job names: `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`.

Recommend `/clear` before Stage 11.
