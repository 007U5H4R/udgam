# Stage 10: release evaluation (non-formal) at b13dfaf

**Commit:** `b13dfaf3ed2282318025d55b5c89ee1a5ac8a89b` (`build/stage7`, "Record EXE50: Stage 10 fix outcomes, slot pool and SEC-005 parking"). The run used a fresh `git clone --shared /home/user/udgam` into `scratchpad/s10eval`, checked out at that commit with a detached HEAD.

**Tree:** `git status --porcelain --untracked-files=all` printed nothing before any step, after the harness runs, after perf, after the release, and after cleanup. Every suite run record (`integration`, `e2e`, `e2e-demo` `*.run.json`) shows `dirty: false` and the same commit both before and after its run. The perf file and all harness files show `dirty: false`.

**Constraints followed:**
- Non-formal only. I used no `--out=formal` and no `--baseline=v1`.
- Nothing was written to `evals/results/*.json` or `evals/reports/`. Every output went to `evals/results/local/`, which is git-ignored.
- No source, case, threshold or `cfg-1` was changed. The config hash `c91ccb2c…` and the dataset sha256 `930b6bab…` both match baseline-v1.
- No environment variable or secret was printed. The S4 server's `BETTER_AUTH_SECRET` was generated with `openssl rand` inside the launcher and never echoed (EXE38).
- I used no `pnpm dev`, no `pkill -f` and no `playwright install`.

**Ports:**
- 4660: the S4 perf server. It was stopped by its PID, and the port was free afterwards.
- 4670: `E2E_PORT` for the release suites.
- Before the run, all of 4650–4680 were free. After it, all were free and no process from `s10eval` remained.

## Overall: PASS

Every command exited 0.
- The M1 harness passes: 103 active, 99 passed, 4 failed (1 of them is the M2 case EVAL-103, not yet implemented and out of scope).
- The M2/EVM harness passes: 103 active, 100 passed, 3 failed.
- The local M1 release passes, with all 9 gates green, 0 problems, 0 missing and 0 skipped cases.

**Regressions:** none, against baseline-v1, the formal release `eb321a1` or the Stage 9 local release `46be176`.

**Improvements:**
- EVAL-103 passes under `--ledger=evm --milestone=M2`. This was expected and is the same as at Stage 9.
- S4 is faster than baseline-perf-v1.

**Cases still failing:** EVAL-055, EVAL-056 and EVAL-122. These are the three misses already accepted in baseline-v1, and they are unchanged.

## 1. Commands

All were run from `scratchpad/s10eval`. Logs are in `scratchpad/s10logs/`.

| # | Command | Exit | Time | Summary |
|---|---|---|---|---|
| 0 | `pnpm install --frozen-lockfile` | 0 | 1 s | lockfile honoured (shared store) |
| 1 | `tsx evals/harness/readiness.ts` (`eval:ready`, M1) | 0 | 3 s | `eval:ready (milestone M1) — READY`: 7/7 checks PASS, plus the expected HR3 `WARNING:` line (TP29) |
| 1 | `tsx evals/harness/readiness.ts --milestone=M2 --ledger=evm` | 0 | 3 s | `eval:ready (milestone M2, ledger evm) — READY`: 7/7 PASS, HR3 `WARNING:` line |
| 2 | `tsx evals/harness/run.ts` (`pnpm eval`, M1) | 0 | 5 s | `pnpm eval — PASS (config full, ledger adapter: hashchain, seed 273494354, 2291 ms)`. Cases: 103 active · 99 passed · 4 failed (1 not yet implemented) · 0 errored · 0 skipped. Output: `evals/results/local/eval-run-0.1.0-b13dfaf.json` |
| 2 | `tsx evals/harness/run.ts --ledger=evm --milestone=M2` | 0 | 34 s | `pnpm eval — PASS (config full, ledger adapter: evm, seed 273499087, 31653 ms)`. Cases: 103 active · 100 passed · 3 failed (0 not yet implemented) · 0 errored · 0 skipped. S6-lib 8/8. Output: `…-b13dfaf-r2.json` |
| 3a | `bash scratchpad/s10tools/perf-s4.sh` (Stage 9 launcher with paths and port changed to 4660). It runs `pnpm build`, then a throwaway `next start -p 4660`, then `tsx evals/perf/run.ts --target=http://localhost:4660 --only=s4 --runs=10 --data-dir=scratchpad/s10perf-data`, then kills the server by PID | 0 (build 0, perf 0) | 85 s (build 54 s, perf 27 s) | `S4 PASS: 10 runs, 10 verified, p50 1995 ms, p95 2285.5 ms, max 2317 ms (threshold 3000 ms)`. Verify p50 322 ms, max 359 ms (reported only). Server response p50 75.5 ms. Output: `evals/results/local/perf-s4-b13dfaf.json`, with `dirty:false`. Port 4660 was free afterwards |
| 3b | `E2E_PORT=4670 tsx evals/harness/release.ts --milestone=M1 --perf=evals/results/local/perf-s4-b13dfaf.json` (local `--out` by default; no `--harness`, so the release ran the harness itself) | **0** | 1061 s (17.7 min), 08:23:23Z to 08:41:02Z | **`eval:release (M1) — PASS`**: 130 gated · 127 passed · 3 failed · 0 skipped · 0 missing · 4 deferred · 13 out of scope · 1 outside the gates; problems: none |

### The suites inside the release (3b)

| Suite | Command (from run record) | Exit | Result |
|---|---|---|---|
| integration | `vitest run --project unit --project integration -t EVAL-[0-9]{3}` | 0 | Test Files 52 passed, 226 skipped (278). Tests 267 passed, 2427 filtered (2694). `success: true`. The release maps 260 EVAL tests |
| e2e | `playwright test --grep EVAL-[0-9]{3}` (4 projects) | 0 | **281 passed, 11 skipped, 0 unexpected, 0 flaky** (14.4 min). 292 tests, 264 of them EVAL-titled. `og-image.spec.ts` [desktop] passed (EVAL-090) |
| e2e-demo | `playwright test -c playwright.demo.config.ts --grep EVAL-[0-9]{3}` | 0 | 4 passed (56.3 s): EVAL-073 and EVAL-074 at phone-375 and desktop-1280 |
| harness | the release's own run (`--milestone=M1`, local) | 0 | `eval-run-0.1.0-b13dfaf-r3.json`: 103 active · 99 passed · 4 failed (1 nyi) · identical to baseline-v1 |
| perf | `perf-s4-b13dfaf.json` (from 3a) | n/a | S4 re-derived from raw runs: 10 cold loads, 10 verified, all under 3000 ms, max 2317 ms |

**Release outputs** (in the clone, git-ignored), copied byte for byte (`cmp` identical) to `scratchpad/reports/stage10-eval/`:
- `evals/results/local/eval-run-v1-release-b13dfaf.json`, sha256 `2e7893b64278a637e551e8eca1fbd4e97cfeb614f3b4210016e327615a71b6e6`
- `evals/results/local/eval-report-v1.md`, sha256 `58b408d9bd339c0d1cea9b6a6d54059a13be385aeec7d7e8176b9912ff8063c0`. It contains the HR3 `WARNING:` line as required.

The harness files, perf file, suite run records and demo timings are also kept in `scratchpad/s10logs/`.

**Range titles:** the release lists 8 integration titles and 36 e2e titles that name EVAL ranges, such as `EVAL-058..063` and `EVAL-059–063`. The release reports them for information. It recorded 0 problems, and every case in the range has a status, with none missing.

## 2. Gate table, against baseline-v1

baseline-v1 is `evals/results/baseline-v1.json` @ eb321a1. The baselines for the release-only gates come from the formal release `eval-run-v1-release-eb321a1.json` and from `baseline-perf-v1.json`.

| Gate | Target | baseline-v1 | M1 harness b13dfaf | M2/EVM harness b13dfaf | M1 release b13dfaf (local) | Δ |
|---|---|---|---|---|---|---|
| S1 (scenarios 1–4 pooled) | ≥ 95.0 % | 97.7 % (42/43) | 97.7 % (42/43) PASS | 97.7 % (42/43) PASS | 97.7 % (42/43) PASS | = |
| S1-floor | ≥ 90.0 % each | 91.7 % | 91.7 % PASS | 91.7 % PASS | 91.7 % PASS (sc1 11/11, sc2 11/12, sc3 10/10, sc4 10/10) | = |
| S2 (false positives) | ≤ 5.0 % | 0.0 % (0/40) | 0.0 % (0/40) PASS | 0.0 % (0/40) PASS | 0.0 % (0/40) PASS | = |
| S6-lib | 100 % | 100 % (7/7) | 100 % (7/7) PASS | 100 % (8/8) PASS | 100 % (7/7) PASS | = (EVM adds the 8th variant) |
| S7 | Yes | Yes | Yes PASS | Yes PASS | Yes PASS (103 cases, 0 skipped) | = |
| CF | 0 | 0 | 0 PASS | 0 PASS | 0 PASS | = |
| S4 (10 cold loads < 3 s) | every load < 3 s | Yes (baseline-perf-v1: p50 2451.5, p95 2846.5, max 2905 ms) | n/a | n/a | Yes PASS (p50 1995, p95 2285.5, max 2317 ms) | = (faster) |
| Cases (non-harness, M1) | all | 28/28 (formal release eb321a1) | n/a | n/a | 28/28 PASS | = |
| S7-release | Yes | Yes (formal release eb321a1) | n/a | n/a | Yes PASS (0 missing, 0 skipped, 0 problems) | = |

**Totals:**
- baseline-v1 and the M1 harness: 103 active · 99 passed · 4 failed · 1 not yet implemented · 0 errored · 0 skipped.
- M2/EVM harness: 103 active · 100 passed · 3 failed · 0 not yet implemented.
- Release totals equal the formal release eb321a1: 148 cases · 130 gated · 127 passed · 3 failed · 0 skipped · 0 missing · 4 deferred (M3: EVAL-070, 072, 085, 090) · 13 out of scope (M2: EVAL-093 to 105) · 1 not gated.
- Critical conditions: none in any run.

**S4 informational lines (not gated):**
- Verify (proof-start to proof-final): p50 322 ms against the §18 budget of 300 ms. That is over budget, as it was in baseline-perf-v1 (401.5 ms). It is better than baseline and is reported only.
- Server response: p50 75.5 ms (baseline 114 ms).

## 3. Regressions and improvements, case by case

The tools are `scratchpad/s9tools/compare.py` for harness runs and `scratchpad/s10tools/compare_release.py` for release files. Their outputs are `s10logs/compare-m1.json`, `compare-m2.json` and `compare-release.json`.

- **M1 harness against baseline-v1:** 0 regressions, 0 improvements and 0 verdict changes across 103 cases. The same holds for the release's own harness run (`-r3`).
- **M2/EVM harness against baseline-v1:** 0 regressions. One improvement: **EVAL-103** (harness-proof, M2) goes from `not_yet_implemented` to `passed`. This was expected, because it only runs under `--ledger=evm`, and it is the same as at Stage 9.
- **Local release b13dfaf against the formal release eb321a1:** every one of the 148 case outcomes is identical, with 0 regressions and 0 improvements.
  - Four cases have more evidence than at eb321a1, all still passing, from tests added after eb321a1. These are the same differences Stage 9 saw at 46be176:
    - EVAL-068: vitest 4 → 5.
    - EVAL-087: playwright 56 → 64.
    - EVAL-088: playwright 36 → 48 and vitest 7 → 11.
    - EVAL-090: playwright 16 → 17 passed, plus 3 skipped, which is og-image on phone, phone-small and tablet by design; vitest 4 → 5. The case is M3 and deferred either way.
- **Local release b13dfaf against the Stage 9 local release 46be176:** identical in both case outcomes and evidence counts.
- **Release harness cases against baseline-v1:** 0 regressions and 0 improvements. EVAL-103 is `out_of_scope` in M1 as expected.
- **Cases not passing, all already in baseline-v1 and accepted:**
  - EVAL-055 and EVAL-056 are scenario-6 stretch cases (decisions.md).
  - EVAL-122 is a 23 h EXIF gap, a reported miss (EXE27).
  - Each still raises the correct flag, but under cfg-1/EV7 a lone flag does not cap the verdict. No tuning was applied (EV13).

## 4. Runtime and host

- **Wall time:** 2026-10-06 08:20:23Z to 08:41:41Z, about 21 min. The release accounts for 17.7 min of that: integration 2.2 min, e2e 14.4 min (including the `next build` webServer), demo 1.0 min, then the harness.
- **Host:** claude.ai/code cloud VM.
  - Intel Xeon @ 2.80 GHz, 4 vCPU, 15 GiB RAM.
  - Linux 6.18.44-fc-v70, Node v22.22.2, pnpm 12.6.0.
  - Preinstalled Chromium in `/opt/pw-browsers`.
- **Load:** the 1-minute load average was 0.8 to 4.5 on 4 cores during the run, which is quieter than Stage 9's 7 to 20.

## 5. Cleanup

The following were removed from the clone:
- `.next` (261 MB)
- `.e2e-data` (62 MB)
- `test-results`
- `node_modules` (751 MB)
- the perf data dir `scratchpad/s10perf-data`

`evals/results/local/` is left in the clone. It is git-ignored, and its key files are copied to `s10logs/` and `reports/stage10-eval/`. The tree is clean after cleanup.
