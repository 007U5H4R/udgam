# Stage 9 · Code Review + Test & Evaluation — Udgam (complete 2026-10-06)

Stage 9 started directly after Stage 8 (EXE44) and closes straight into Stage 10 (EXE46).
- **Code review:** the branch diff `b397c08..build/stage7` was split across three Fable reviewers (core, web, M-002 + tooling), followed by three fix waves and a fresh re-run reviewer.
- **Test and eval:** one runner executed the whole planned suite from real output on the final code.

## Reports
| Part | File |
|---|---|
| 9A first review | `stage9-cr-core.md` (CR-001–007), `stage9-cr-web.md` (CR-100–106), `stage9-cr-m2-tooling.md` (CR-200–206) |
| 9A fixes | `stage9-fix-core.md`, `stage9-fix-web.md` (includes the follow-ups CR-107, CR-008), `stage9-fix-m2-tooling.md` |
| 9A re-run | `stage9-cr-rerun.md`: **CR RE-RUN: CLEAN** (one new nit, CR-008, fixed afterwards) |
| 9B run | `stage9-run.md` (commands, TC table, eval gates, QA-S9 findings), `stage9-eval-run.json` (machine-readable summary) |

## 9A · Code review (CR-)
| | Count |
|---|---|
| Findings | 23 (CR-001–008, CR-100–107, CR-200–206) |
| Severity | 1 major (CR-200: CI ran no eval or e2e) · the rest minor or nit · 0 blocker |
| Fixed and verified | 22 |
| Skipped and accepted | 1: CR-105, the two i18n dictionaries share one client chunk. The office pages stay inside the 200 KB budget, and a split is not cheap or safe (EXE47). |

How each fix was verified:
- **CR-001–007, CR-100–104, CR-106 and CR-200–206:** VERIFIED-FIXED by the fresh re-run reviewer.
- **CR-107** (the phone keeps one photo out of two slots; a follow-up to CR-001 per EXE47) and **CR-008** (the remaining API logs use `errFields`): their tests failed first, and both pass in the 9B full run at 46be176.

Decisions: EXE47, plus CR-205 closing EXE36 R-6.

## 9B · Test and evaluation
- **Commit:** `46be176`, cloned fresh. Wall time was about 1 h 56 min on the cloud VM; details are in `stage9-run.md`.
- **Commands (all exit 0):**
  - typecheck and lint;
  - `pnpm test`: 2650 tests;
  - `test:int`: 773;
  - `test:tz`: 2650 in Los Angeles and 2650 in Kolkata;
  - `test:evm`: 42;
  - `contracts:test`: 47;
  - full `test:e2e`: 952 passed, 0 failed, 0 flaky, 20 skipped (each skip project-scoped by design);
  - `pnpm demo`: 6/6;
  - `eval:validate`: 148 cases;
  - gitleaks: clean;
  - `audit --prod`: no high finding.
- **TC- results (all 94):** 88 PASS, 0 FAIL, 6 BLOCKED (TC-087–092 are M-003: TKT-27 · TASK-28 and TKT-28 · TASK-29), 0 NA.
- **Eval:** cfg-1 and dataset 0.8.0 are identical to baseline-v1. The Stage 9 runs are non-formal and baseline-v1 was not rewritten (EV13, EXE34).

| Gate | baseline-v1 | M1 harness | M2 harness (`--ledger=evm`) | M1 release (local, non-formal) |
|---|---|---|---|---|
| S1 | 97.7 % | 97.7 % | 97.7 % | 97.7 % |
| S1-floor | 91.7 % | 91.7 % | 91.7 % | 91.7 % |
| S2 | 0 % | 0 % | 0 % | 0 % |
| S6-lib | 100 % | 100 % | 100 % (8/8) | 100 % |
| S7 | Yes | Yes | Yes | Yes (S7-release Yes) |
| CF | 0 | 0 | 0 | 0 |
| S4 | max 2905 ms | – | – | Yes: p95 2333.5 ms, max 2473 ms against 3000 ms |

- **Regressions:** none, case by case.
- **Improvements:** one, EVAL-103 under `--ledger=evm`. The local release matches the formal eb321a1 release exactly (130 gated, 127 passed, 3 failed).
- **Misses:** the only ones are EVAL-055, EVAL-056 and EVAL-122, all reported, held by the owner and already in baseline-v1 (EXE27, QA-P4-1).
- **Critical cases:** all pass.

## QA-S9 findings
| ID | Finding | Root cause | Ticket | Resolution | Retest |
|---|---|---|---|---|---|
| QA-S9-001 | `e2e/og-image.spec.ts` (TC-072) failed on CI only: mean difference 2.9/255 against a limit of 1 | The committed PNGs were rasterised by full Chrome with the VM's fontconfig (hintslight); CI uses Playwright's headless shell with full hinting | TKT-17 · TASK-18 | `bdf8469`: the render pins its own fontconfig and Chromium hinting flags, used by both the script and the spec; PNGs regenerated. Limits and EVAL-090 are unchanged (EXE48). | Locally, 12/12 binary × host-config combinations are byte-identical (11/12 failed before). CI e2e on dd7b0c1: see the ledger. |
| QA-S9-002 | Axe `document-title` flakes on CI (m2-agreements:233 phone, m2-processing:48 desktop) | Next 16 commits the streamed metadata boundary 30–66 ms after the page body on a client navigation or a `revalidatePath` action, and axe ran in that window. The app sets every title. | TKT-25 · TASK-26, TKT-26 · TASK-27 | `97a08a4`: every axe run goes through `e2e/helpers/axe.ts` `axeOn()`, which waits for a non-empty title, and an ESLint rule enforces it (EXE48) | 40/40 and 20/20 repeats. CI e2e on dd7b0c1: see the ledger. |

**Also observed** in the fix agent's full e2e run on the final code: one `[tablet] admin-plots.spec.ts:152` `page.goto` load timeout under 3 workers. That spec holds every map tile request, so `load` can wait on tiles. It passed 10/10 on re-run and did not occur in the 9B run or on CI. It is watched in CI and was **not** dismissed as a flake: if it recurs, fix the wait (`domcontentloaded` plus a settled-page check).

## Exit criteria
- `/code-review` is clean; one finding is skipped with a reason.
- The planned suite was executed from real output.
- The critical test and eval cases pass.

**Stage 9: COMPLETE → Stage 10** (EXE46).
