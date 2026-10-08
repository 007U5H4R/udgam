# Stage 9B: test and evaluation run (Udgam)

**Commit:** `46be1762833429439798696bbd884c90208acda4` (`build/stage7` HEAD, "Use errFields on the remaining API failure logs (CR-008) (TASK-13)"). Fresh `git clone --shared` into `scratchpad/s9run`. The tree was clean before and after every step: `git status --porcelain --untracked-files=all` printed nothing, and every output went to git-ignored paths.
**Run window:** 2026-10-06 04:42Z to 06:38Z, about 1 h 56 min of wall time.
**Host:** claude.ai/code cloud VM. Intel Xeon @ 2.80 GHz with 4 vCPU, 15 GiB RAM, Linux 6.18.44, Node v22.22.2, pnpm 12.6.0, Chromium 141.0.7390.37 (`/opt/pw-browsers`), Foundry forge 1.8.3.
**Load:** another agent shared the CPU throughout, with a load average of 7 to 20 on 4 cores. **Ports used:** 4400 (e2e), 4410 (demo), 4420 (release suites) and 4430 (S4 perf server, killed by PID; port confirmed free afterwards).
**Constraints followed:** no source edits; no formal files written; no `--baseline=v1`; thresholds, cases, `cfg-1` and baseline-v1 left untouched. No env var or secret was printed. The perf server's `BETTER_AUTH_SECRET` came from `openssl rand` inside the launcher (`scratchpad/s9tools/perf-s4.sh`) and was never echoed.

## Overall: PASS in this run, but CI e2e on 46be176 is red (QA-S9-001, QA-S9-002)

Every command exited 0. The full e2e run had 952 passed, 0 failed and 0 flaky. The M1 harness, the M2/EVM harness and the non-formal M1 release all PASS. Compared with baseline-v1, nothing regressed and one case improved (EVAL-103 under `--ledger=evm`). The only harness misses are the three already accepted (EVAL-055, EVAL-056, EVAL-122), which are unchanged since baseline-v1. Of the 94 TCs, 88 PASS, 0 FAIL, 6 BLOCKED (M-003, deferred) and 0 NA. Four of the PASSes (TC-003, TC-044, TC-073 and TC-079) rest partly on carried or process evidence, as noted in the table.

**But CI on the same commit is not green.** CI's e2e job failed on 46be176 in both runs: 37414924562 (push) and 37414927700 (PR).
- `og-image.spec.ts` [desktop] fails deterministically, with a mean difference of 2.9007 against a limit of < 1 on `/og/verify-kodagu-arabica.png`. That is QA-S9-001.
- The push run also had one flaky test, `m2-processing.spec.ts:48` [desktop], with axe `document-title: html`. That is QA-S9-002.
- Neither reproduced here. The full run passed, and a 5× repeat probe of the three specs on desktop and phone passed 25/25.

## 1. Commands

| # | Command | Exit | Time | Summary |
|---|---|---|---|---|
| 0 | `pnpm install --frozen-lockfile` | 0 | 1 s | lockfile honoured (shared store) |
| 1 | `pnpm typecheck` | 0 | 26 s | `tsc --noEmit`, no errors |
| 1 | `pnpm lint` | 0 | 28 s | `eslint .`, no findings |
| 2 | `pnpm test` (unit + integration) | 0 | 183 s | Test Files 276 passed (276) · Tests 2650 passed (2650) |
| 2 | `pnpm test:int` | 0 | 113 s | Test Files 108 passed (108) · Tests 773 passed (773) |
| 2 | `pnpm test:tz` (America/Los_Angeles, then Asia/Kolkata) | 0 | 379 s | LA: 276 files / 2650 tests passed · Kolkata: 276 files / 2650 tests passed |
| 3 | `pnpm test:evm` | 0 | 108 s | Test Files 8 passed (8) · Tests 42 passed (42) |
| 3 | `pnpm contracts:test` (`~/.foundry/bin`) | 0 | 1 s | 3 suites, 47 tests passed, 0 failed, 0 skipped: MockINR 7, BatchRegistry 9, ContractFarming 31 |
| 4 | `E2E_PORT=4400 pnpm test:e2e --reporter=list,json` (4 projects, fresh `.e2e-data`, not split) | 0 | 58.2 min | 972 tests: **952 passed, 0 failed, 0 flaky**, 20 skipped (2 workers) |
| 5 | `E2E_PORT=4410 pnpm demo` (bare, no NODE_ENV) | 0 | 119 s | 6 passed (2.0 min). The demo story took 20.3 s at phone-375 and 22.5 s at desktop-1280; attacks took 14.8 s and 9.6 s. Step timings are in `evals/results/local/demo-run-46be17628334.json` (9 steps / 5 steps) |
| 6 | `pnpm eval` (M1 harness) | 0 | 7 s | PASS: 103 active · 99 passed · 4 failed (1 not yet implemented: EVAL-103, M2, out of scope) · 0 errored · 0 skipped |
| 6 | `pnpm eval --ledger=evm --milestone=M2` | 0 | 34 s | PASS: 103 active · 100 passed · 3 failed · 0 not yet implemented · 0 errored · 0 skipped; S6-lib 8/8 |
| 6 | `pnpm eval:ready` | 0 | 5 s | READY (M1). 7/7 checks pass, plus the expected HR3 `WARNING:` line (TP29) |
| 6 | `tsx evals/harness/readiness.ts --milestone=M2 --ledger=evm` (extra) | 0 | ~5 s | READY (M2, ledger evm) |
| 6 | `pnpm build` + throwaway `next start -p 4430`, then `tsx evals/perf/run.ts --target=http://localhost:4430 --only=s4 --runs=10 --data-dir=<scratch>` | 0 / 0 | 24 s / 30 s | S4 PASS: 10/10 verified, p50 1972.5 ms, p95 2333.5 ms, max 2473 ms (threshold 3000 ms). Verify p50 267.5 ms; server response p50 172.5 ms. Written to `evals/results/local/perf-s4-46be176.json`, with `dirty:false` |
| 6 | `E2E_PORT=4420 pnpm eval:release --milestone=M1 --perf=evals/results/local/perf-s4-46be176.json` (non-formal, `--out` local by default) | 0 | 27.9 min | **PASS**: 130 gated · 127 passed · 3 failed · 0 skipped · 0 missing · 4 deferred · 13 out of scope · 1 outside the gates; problems: none. Suites: integration 2650 tests (260 EVAL), exit 0; e2e 292 tests (281 passed, 11 skipped), exit 0; e2e-demo 4 passed, exit 0; harness run `-r3`. Output: `evals/results/local/eval-run-v1-release-46be176.json`, `evals/results/local/eval-report-v1.md` |
| extra | `tsx evals/harness/dataset.ts --validate` | 0 | <5 s | dataset 0.8.0 valid: 148 cases, sha256 930b6bab… |
| extra | `gitleaks git --redact .` (v8.30.0) | 0 | 19 s | 457 commits scanned, no leaks found |
| extra | `pnpm audit --prod --audit-level=high` | 0 | <10 s | 1 moderate finding (below the gate) |
| extra | GitHub Actions on 46be176 (`gh api`, read only; annotations) | n/a | n/a | Contracts: success (×2). CI run 37414924562 (push): every job succeeded except **e2e: failure**. Playwright summary: 1 failed (`og-image.spec.ts:20` desktop), 1 flaky (`m2-processing.spec.ts:48` desktop, axe `document-title`), 20 skipped, 950 passed. CI run 37414927700 (PR): **e2e: failure**, with 1 failed (`og-image.spec.ts:20` desktop), 20 skipped, 951 passed |
| extra | `E2E_PORT=4400 playwright test e2e/m2-processing.spec.ts:48 e2e/m2-agreements.spec.ts:233 e2e/og-image.spec.ts --repeat-each=5 --project=desktop --project=phone` (probe) | 0 | 6.1 min | 25 passed, 5 skipped (og-image on phone, by design). The CI failures were not reproduced, in 5 of 5 repeats each |

### The e2e skips (20) are all project-scoped by design (`test.skip` on the project or viewport)
- `admin-plots.spec.ts:249` (TC-029 click-to-draw): phone and phone-small. Leaflet-draw needs mouse clicks; the button path covers touch.
- `admin-plots.spec.ts:281`: tablet and desktop. This test is phone-only.
- `capture-responsive.spec.ts:209` (EVAL-086): phone-small and desktop. The case names 375 and 768 px.
- `capture-staging.spec.ts:92/136/169` (TC-094 d/e, EVAL-070): run only on phone, so skipped on the other 3 projects × 3 tests.
- `certificate-design.spec.ts:53` (DES-211): phone and phone-small. The table shows from 760 px.
- `og-image.spec.ts:20`: phone, phone-small and tablet. It renders once, in desktop.

### The specs named in the brief, as they are on 46be176
- **`e2e/og-image.spec.ts` (desktop): PASSED in every run here, 7 of 7.** That covers the full e2e run, the release's EVAL e2e suite (21.2 s) and the 5× probe. **On CI at 46be176 it still FAILS** in both runs, with mean difference 2.9007 against < 1, retry included, so it is deterministic there. It does not reproduce on this host's preinstalled Chromium 141.0.7390.37. That points to the Chromium build or fonts that CI downloads with `playwright install`, rather than the code (QA-S9-001). It will be re-tested after the other agent's fix merges.
- **`e2e/m2-agreements.spec.ts:233` (axe `document-title`): PASSED on all 4 projects** in the full run, and 10/10 in the probe (phone and desktop). It did not flake here. The same axe rule did flake on CI at 46be176, but in a different spec: `m2-processing.spec.ts:48` [desktop], which passed on retry. That spec passed 4/4 in the full run and 10/10 in the probe (QA-S9-002). No local e2e test failed, so no `--workers=1` re-run was triggered.

## 2. Eval gates compared with baseline-v1

baseline-v1 is `evals/results/baseline-v1.json` @ eb321a1. The run below is `pnpm eval` @ 46be176. Both use `cfg-1` hash `c91ccb2c8295cfd1b7010964ee83f41e04085a0507674d149a21397b3b3655ac` and dataset 0.8.0 (sha256 `930b6bab…`).

| Gate | Target | baseline-v1 | M1 harness 46be176 | M2/EVM harness 46be176 | M1 release 46be176 (local) | Δ |
|---|---|---|---|---|---|---|
| S1 (scenarios 1–4 pooled) | ≥ 95.0 % | 97.7 % (42/43) | 97.7 % (42/43) PASS | 97.7 % (42/43) PASS | 97.7 % PASS | = |
| S1-floor | ≥ 90.0 % each | 91.7 % | 91.7 % PASS | 91.7 % PASS | 91.7 % PASS | = |
| S2 (false positives) | ≤ 5.0 % | 0.0 % (0/40) | 0.0 % (0/40) PASS | 0.0 % (0/40) PASS | 0.0 % PASS | = |
| S6-lib | 100 % | 100 % (7/7) | 100 % (7/7) PASS | 100 % (8/8) PASS | 100 % (7/7) PASS | = (EVM adds the 8th variant) |
| S7 | Yes | Yes | Yes PASS | Yes PASS | Yes PASS | = |
| CF | 0 | 0 | 0 PASS | 0 PASS | 0 PASS | = |
| S4 (10 cold loads < 3 s) | every load < 3 s | Yes (baseline-perf-v1: p50 2451.5, p95 2846.5, max 2905 ms) | n/a | n/a | Yes (p50 1972.5, p95 2333.5, max 2473 ms) | = (faster) |
| Cases (non-harness, M1) | all | 28/28 (formal release eb321a1) | n/a | n/a | 28/28 PASS | = |
| S7-release | Yes | Yes (formal release eb321a1) | n/a | n/a | Yes PASS | = |

Totals: baseline-v1 has 103 active · 99 passed · 4 failed · 1 not yet implemented · 0 errored · 0 skipped. M1 @ 46be176 is identical. The release's own harness run (`-r3`) is also identical. Critical conditions: none in either run.

## 3. Regressions and improvements (case by case against baseline-v1)
- **M1 harness against baseline-v1:** 0 regressions, 0 improvements, 0 verdict changes across all 103 cases.
- **M2/EVM harness against baseline-v1:** 0 regressions. One improvement: **EVAL-103** (harness-proof, M2) goes from `not_yet_implemented` to `passed`, as expected because it only runs under `--ledger=evm`.
- **Local release @ 46be176 against the formal release @ eb321a1:** every one of the 148 case outcomes is identical.
- **Cases not passing, all already in baseline-v1 and accepted:**
  - EVAL-055 and EVAL-056 are scenario-6 stretch cases (decisions.md lines 437, 467 and 543).
  - EVAL-122 is a 23 h EXIF gap, a reported miss (EXE27).
  - In each one the correct `exif_time_agreement` flag is raised, but under cfg-1/EV7 a lone flag does not cap the verdict, which stays Verified at 95.8. These are not new failures, and no tuning was applied (EV13).

## 4. TC table (all 94)

Vitest, Forge and Playwright results above are from this run. "unit / int / evm" means `pnpm test`, `test:int` and `test:evm` (all passed, no skips). "e2e n" counts Playwright tests passed across the 4 projects in the full run.

| TC | Covered by | Expected (test-cases.md) | Actual | Status | Note |
|---|---|---|---|---|---|
| TC-001 | `src/app/api/health/route.int.test.ts`, `src/lib/ledger/health.int.test.ts`, `src/lib/health.test.ts`, `src/lib/remote-sensing/index.test.ts` | 200 with db/ledger/providers; DB closed → 503; key missing → 503 `keyPresent:false`; no secrets | all passed | PASS | |
| TC-002 | `tests/cloud-setup-foundry.test.ts`; CI job `setup-idempotent (TC-002)` on 46be176 | setup script twice → exit 0, second run already satisfied, clean tree | unit passed; CI job success on 46be176 | PASS | the double run itself is CI evidence (read-only check) |
| TC-003 | CI `secrets (gitleaks, full history)` on 46be176; local gitleaks; canary run 36556519116 (ledger, 2026-09-29) | planted secret fails gitleaks naming the file; gates run on every push | gitleaks green on 46be176 in CI and locally (457 commits, no leaks); the failing path is proven by canary run 36556519116 | PASS | the canary was not re-planted in 9B (read-only); failing-path evidence carried from P1 |
| TC-004 | `tests/tokens.test.ts` | tokens equal the mockup `:root`; fonts | passed | PASS | |
| TC-005 | `tests/no-next-in-lib.test.ts`; `pnpm lint` | no Next.js/React import in `src/lib` | passed; lint 0 | PASS | |
| TC-006 | `src/lib/crypto/jcs.test.ts`, `ecdsa.test.ts`; `e2e/crypto-vectors.spec.ts` (e2e 16) | 100 % agreement in Node and the browser; cross-verify; jcs throws on undefined/NaN/Infinity | all passed | PASS | |
| TC-007 | `src/lib/capture/boundary.test.ts` | canonical accepted; re-serialised → `non_canonical`; altered → `signature_valid` fail | passed | PASS | |
| TC-008 | `src/lib/ledger/hashchain.int.test.ts`, `src/lib/db/invariants.int.test.ts` | formula; 20 concurrent appends with no gaps; UPDATE/DELETE abort | passed | PASS | |
| TC-009 | `src/lib/verification/score.test.ts` | weighted mean, thresholds, caps, `CONFIG_HASH` | passed | PASS | |
| TC-010 | `src/lib/capture/pipeline.int.test.ts`, `src/lib/db/invariants.int.test.ts`, `plots.int`, `attach.int` | atomic rollback on ledger failure; anchor FK | passed | PASS | |
| TC-011 | `src/lib/verification/evidence.test.ts`, `checks/satellite.test.ts` | evidence sentence per check × status; dataset substrings | passed | PASS | HR1 rubric scoring from these snapshots is the owner's (manual) |
| TC-012 | `src/lib/verification/verify.test.ts` | throwing check → `unavailable`, Needs Review, `verify()` resolves | passed | PASS | |
| TC-013 | `e2e/tracer.spec.ts` (e2e 4) | seeded phone signs a picking → Verified; rows and entries exist | passed (4/4); also passed in the release e2e suite | PASS | |
| TC-014 | `evals/harness/mutate.test.ts`, `run.test.ts` | each op exact; order-independent | passed | PASS | |
| TC-015 | `evals/harness/run.test.ts` | disabled check → nyi counts failed; throwing → errored; skipped 0; exit ≠ 0 | passed; live harness shows skipped 0 | PASS | |
| TC-016 | `evals/harness/report.int.test.ts`, `release.test.ts` | provenance fields; report re-derives byte-identically; `-r2` on rerun | passed; live runs wrote `-r2`/`-r3` rather than overwriting | PASS | |
| TC-017 | `evals/harness/dataset.test.ts`; `eval:validate`; CI `dataset` job | valid dataset passes; bad copies fail naming the path | passed; validate exit 0; CI success | PASS | |
| TC-018 | `tests/guard-coverage.test.ts`, `src/lib/auth/guards.test.ts`, `src/app/route-groups.int.test.ts`, action int tests; `e2e/batches`, `m2-processing` (e2e 12) | only the owning role succeeds; public routes stay public; no unguarded action | all passed | PASS | |
| TC-019 | `src/lib/auth/org-scope.int.test.ts`, `require.int.test.ts`, `batches/buyer.int`, `read.int`, `plots.int`; e2e admin-plots, batches (e2e 8) | cross-org IDs → 404; no leak | all passed | PASS | |
| TC-020 | `e2e/sign-in.spec.ts` (e2e 44), `sign-in/actions.test.ts`, `sign-in-error.test.ts` | each role lands home; inline error; sign-out; `/verify` public | all passed | PASS | |
| TC-021 | `src/lib/enrolment/codes.int.test.ts` | hashed, single-use, 24 h, 429 limits, no code in logs | passed | PASS | |
| TC-022 | `e2e/enrol.spec.ts` (e2e 4 TC-022), `src/lib/enrolment/enrol.int.test.ts` | non-extractable key; `device_enrolled` payload minimal | passed | PASS | |
| TC-023 | `src/lib/capture/boundary.int.test.ts`, `enrol.int.test.ts` | `unknown_device` / `device_revoked` 4xx, anchored, no run | passed | PASS | |
| TC-024 | `src/lib/capture/boundary.int.test.ts` | 403 `plot_not_assigned`, anchored; accepted after assignment | passed | PASS | |
| TC-025 | `e2e/enrol.spec.ts` (e2e 4 TC-025), `src/lib/i18n/kn.test.ts` | language sheet first; persists; not shown again | passed | PASS | |
| TC-026 | `src/lib/geo/parse.test.ts`; `e2e/admin-plots` (e2e 8) | valid GeoJSON/KML normalised; invalid refused with a reason | passed | PASS | |
| TC-027 | `src/lib/geo/geo.test.ts`, `plots.int`; e2e admin-plots (e2e 4) | area within 0.5 %; 2 dp | passed | PASS | |
| TC-028 | `src/lib/plots/registration.int.test.ts`, `plots.int`, `remote-sensing/index.test.ts`; e2e admin-plots | `plot_edited` anchored; stale; cache miss; next capture Rejected | passed | PASS | |
| TC-029 | `e2e/admin-plots.spec.ts` TC-029 (e2e 10 passed, 2 skipped) | add/remove/move a vertex by buttons and keys; focus visible; save | passed; the click-to-draw variant is skipped on touch projects by design | PASS | |
| TC-030 | `src/lib/remote-sensing/gfw.test.ts` | request shape; parse; key never logged | passed | PASS | |
| TC-031 | `src/lib/remote-sensing/sentinel.test.ts`, `checks/satellite.test.ts` | monthly means; null interval; cloud → unavailable | passed | PASS | |
| TC-032 | `checks/satellite.test.ts`, `remote-sensing/cache.int.test.ts` | 8 s abort; 500/malformed → unavailable; never Rejected | passed | PASS | |
| TC-033 | `src/lib/remote-sensing/cache.int.test.ts` | one call per plot-month; loss once per geometry | passed | PASS | |
| TC-034 | `src/lib/plots/registration.int.test.ts`; e2e admin-plots (e2e 4) | registration checks stored and anchored; provider failure → unavailable with re-run | passed | PASS | |
| TC-035 | `src/lib/media/exif.test.ts` | GPS 6 dp; offsets; +05:30 default; no-EXIF; HEIC magic | passed | PASS | |
| TC-036 | `checks/location.test.ts`, `checks/exif.test.ts` | every threshold pair | passed | PASS | |
| TC-037 | `checks/exif.test.ts`, `checks/movement.test.ts` | every time/speed threshold pair (EXE10) | passed | PASS | |
| TC-038 | `src/lib/yield/season.test.ts`, `season.int.test.ts`, `checks/yield.test.ts` | ratio thresholds; IST season boundary; conversion once | passed | PASS | |
| TC-039 | `src/lib/yield/reference.int.test.ts`, `evals/harness/report.int.test.ts` | Coffee Board rows, cited; provenance labels | passed | PASS | |
| TC-040 | `src/lib/capture/idempotency.int.test.ts` | identical retry idempotent; reuse photos hard-fails | passed | PASS | |
| TC-041 | `checks/chain.test.ts` | continuity / gap / genesis / "23 earlier entries" | passed | PASS | |
| TC-042 | `src/lib/capture/uniqueness.int.test.ts` | seen hash hard-fails; boundary-rejected not counted | passed | PASS | |
| TC-043 | `tests/integration/capture-bytes.int.test.ts`, `parse.staged.int.test.ts` | `media_hash_mismatch`; stored hash equals payload | passed | PASS | |
| TC-044 | `e2e/capture-sweep.spec.ts` (e2e 4 TC-044) | s1–s6 headings/pill/components at 375; no h-scroll; tab bar hidden | passed | PASS | "screenshot per screen attached to the ledger" is a Stage 7/8 process step, not re-checked here |
| TC-045 | `e2e/capture-checking.spec.ts` (e2e 8) | groups tick in stream order with a 2 s NDVI delay; reduced motion | passed | PASS | |
| TC-046 | `e2e/capture-sweep.spec.ts` (e2e 8 TC-046) | primary pill inside 320×568 | passed | PASS | |
| TC-047 | `e2e/capture-photos.spec.ts`, `capture-weight.spec.ts` (e2e 12), `src/client/capture-client.submit.test.ts` | `watchPosition` on mount; weak fix never blocks; denied how-to | passed | PASS | |
| TC-048 | `e2e/capture-verdict.spec.ts` (e2e 4 TC-048); `tests/wording-guard.test.ts` | D5 Not-accepted template; no `--ok`; no accusation words | passed | PASS | |
| TC-049 | `e2e/capture-manifest.spec.ts` (e2e 8) | manifest fields; installable | passed | PASS | |
| TC-050 | `e2e/field-retry.spec.ts` (e2e 12 TC-050), `src/client/outbox-queue.test.ts` | Couldn't-send sheet; outbox survives reload; Try again once | passed | PASS | |
| TC-051 | `e2e/field-pickings.spec.ts` (e2e 12), `field-errors.spec.ts`, `pickings.int`, `picking-detail.int`, `tests/field-error-boundaries.test.ts` | four states; detail | passed | PASS | |
| TC-052 | `tests/i18n-no-literals.test.ts`, `i18n-keys.test.ts`; `e2e/field-language.spec.ts` (e2e 4 TC-052) | no JSX literals; equal key sets; `lang="kn"`; line-height | passed | PASS | |
| TC-053 | `e2e/field-nav.spec.ts` (e2e 12), `field-help.int.test.ts`, `format.test.ts` | tabs by tap and keyboard; `aria-current`; Help content | passed | PASS | |
| TC-054 | `e2e/admin-review.spec.ts` (e2e 20 TC-054), `review/queue.int`, `detail.int` | org queue oldest-first; states; detail; 768/1100 layouts | passed | PASS | |
| TC-055 | `src/lib/review/override.int.test.ts`, `reason.test.ts`; e2e admin-review (e2e 20) | reason rules; signed and anchored override | passed | PASS | |
| TC-056 | `override.int`, `override-guards.int`, `admin/review/actions.int`; e2e admin-review (e2e 20) | no controls; action 409; trigger aborts | passed | PASS | |
| TC-057 | `src/lib/review/rerun.int.test.ts` | only unavailable providers retried; run_no 2 anchored | passed | PASS | |
| TC-058 | `attach.int`, `for-batch.int`, `attestation/route.int`, `AttestationLine.test.ts`, `tests/wording-guard.test.ts`; e2e attestation, batches (e2e 8) | anchored attestation; "Certified by…"; banned words absent | passed | PASS | |
| TC-059 | `tests/integration/batch-invariants.int.test.ts`, `batches/create.int`, `custody/transfer.int`; e2e batches (e2e 24) | DB-enforced batch invariants | passed | PASS | |
| TC-060 | `custody/transfer.int`, `batches/buyer.int`; e2e batches (e2e 44 TC-060) | signed, anchored transfer locks the batch; buyers see only theirs | passed | PASS | |
| TC-061 | `src/lib/ledger/merkle.test.ts` | n = 1..300 proofs; RFC 6962 vectors; tamper fails | passed | PASS | |
| TC-062 | `src/lib/ledger/checkpoint.int.test.ts` | auto checkpoints every 100; on demand; linked and signed | passed | PASS | |
| TC-063 | `feed.int`, `closure.int`, `api/verify/[batchId]/route.int`, `tests/integration/proof-feed-route.int.test.ts` | exact closure; forced checkpoint; identical 404s | passed | PASS | |
| TC-064 | `src/lib/ledger/keys.test.ts`, `.well-known/udgam-ledger-key/route.int.test.ts` | 0600 key outside the repo; reused; never logged; public JWK only | passed | PASS | |
| TC-065 | `e2e/certificate-tamper.spec.ts` (e2e 36), `ProofPanel.test.tsx` | intact verifies; each tamper names its step; no `--ok` | passed | PASS | |
| TC-066 | `e2e/certificate.spec.ts` (e2e 24 TC-066) | proof first at 375; columns at ≥ 1000; no h-scroll; loading steps | passed | PASS | |
| TC-067 | `api/verify/[batchId]/geojson/route.int.test.ts`; `e2e/certificate-privacy.spec.ts` (e2e 4) | no farmer PII in HTML/feed/GeoJSON | passed | PASS | |
| TC-068 | `src/lib/certificate/view-model.test.ts`, `certificate.int.test.ts`; e2e certificate (e2e 4) | view model a pure function of the feed; `#proof-feed` equals the API | passed | PASS | |
| TC-069 | `src/lib/certificate/qr.test.ts`; e2e batches | QR decodes to the absolute URL with `h` = entry-hash prefix | passed | PASS | |
| TC-070 | `src/lib/eudr/geojson.test.ts`, `geojson/route.int.test.ts` | TP24 fields; Point < 4 ha, Polygon ≥ 4 ha; schema-valid | passed | PASS | |
| TC-071 | `e2e/certificate-print.spec.ts` (e2e 16) | print media: light, legible, controls hidden | passed | PASS | |
| TC-072 | `verify/[batchId]/metadata.int.test.ts`, `src/lib/certificate/og-image.test.ts`; `e2e/certificate-metadata.spec.ts` (e2e 16); `e2e/og-image.spec.ts` (desktop 1) | OG/Twitter tags; 1200×630 PNG; noindex | passed, og-image desktop included (twice) | PASS | The TC-072 expectations (tags, 1200×630 PNG, noindex) pass everywhere, CI included. The DES-202 pixel re-render check `og-image.spec.ts` fails on CI at 46be176 (QA-S9-001) and passes here 7/7 |
| TC-073 | `tests/independent-verifier-isolation.test.ts`, `evals/scorers/independent-verifier/verify.test.ts`, `evm-field.test.ts`; harness S6 clean-room 100 % | stdlib-only clean-room checker; 100 % intact and tamper | passed; S6 clean-room 100 % | PASS | "brief contained only docs/proof-feed.md" is process evidence from Stage 7 |
| TC-074 | `sniff.test.ts`, `parse.test.ts`, `parse.limits.int.test.ts`, `rate-limit.int.test.ts` | 413/415/400/429 before `verify()`; anchored when signed | passed | PASS | |
| TC-075 | `src/lib/log.test.ts`, `log.int.test.ts`, `tests/bundle-secrets.test.ts`; CI `bundle-secrets` and `audit` on 46be176; local `pnpm audit` | no secrets in the bundle or logs; audit gate | passed; CI both success; audit exit 0 (1 moderate) | PASS | |
| TC-076 | `src/app/headers.test.ts`; `e2e/csp.spec.ts` (e2e 24), certificate.spec (e2e 28 TC-076 total) | CSP, nosniff, Referrer-Policy, Permissions-Policy; no CSP violations | passed | PASS | |
| TC-077 | `scripts/seed/run.int.test.ts`, `data.test.ts`; `pnpm demo` seed `--reset` | Kodagu state from nothing; refuses without `--reset`; ledger verifies | passed; demo seed ran clean | PASS | |
| TC-078 | `pnpm demo`: `e2e/demo.spec.ts`, `demo-attacks.spec.ts` | full story at 375 and 1280 in < 10 min; step timestamps logged | 6/6 passed; story 20.3 s and 22.5 s; timings file written | PASS | |
| TC-079 | formal `evals/results/eval-run-v1-release-eb321a1.json` + `baseline-v1.json`; this run's local release @ 46be176 | M-001 gate files from real runs; S1/S2/S4/S6/S7 met; no CF; cfg-1 hash | formal eb321a1 PASS (unchanged); local release @ 46be176 PASS with identical case outcomes | PASS | formal files were produced in Stage 7 (TASK-22); HR6 is the owner's signature (manual) |
| TC-080 | e2e (80 TC-080-titled tests across admin-plots, batches, capture-sweep, certificate, enrol, sign-in, phones) | no h-scroll at 320/375/768/1440 | passed | PASS | |
| TC-081 | e2e (84 TC-081-titled axe/keyboard tests) | no serious/critical axe violations; tab order; focus | passed | PASS | |
| TC-082 | `contracts/test/BatchRegistry.t.sol` (9) | operator-only append; no overwrite; reads | 9/9 passed | PASS | |
| TC-083 | `src/lib/ledger/evm/*.evm.test.ts`, `evals/harness/evm.evm.test.ts`; `pnpm eval --ledger=evm` | on-chain hash per append; txHash/block; proof and tamper suites pass; drift detected | test:evm 42/42; M2 harness S6-lib 8/8, EVAL-103 passed | PASS | |
| TC-084 | `contracts/test/ContractFarming.t.sol` (31), `evals/harness/m2/settlement.evm.test.ts` | release only when all 3 conditions hold; reverts; mock-INR reconciles | 31/31 + evm passed | PASS | |
| TC-085 | `e2e/m2-agreements.spec.ts` (e2e 68) | addendum screens; 4 states; no h-scroll; axe clean | 68/68 passed, `:233` included on all 4 projects | PASS | the CI phone flake on 1fae46e (axe `document-title`) did not reproduce, 10/10 in the probe; same class as QA-S9-002 |
| TC-086 | `processing/actions.int`, `mass-balance.test.ts`, `config.test.ts`, `processing-invariants.int`, `evals/harness/m2/mass-balance.int.test.ts`; `e2e/m2-processing.spec.ts` (e2e 20) | signed processor hop; band ok/flag with evidence; journey step | passed | PASS | CI at 46be176: `m2-processing.spec.ts:48` [desktop] flaky (axe `document-title`, passed on retry), QA-S9-002; here 4/4 + 10/10 |
| TC-087 | none (manual, production) | Oracle A1 HTTPS, persistence, streaming | not run | BLOCKED | M-003, deferred to TKT-27 · TASK-28 (no production host) |
| TC-088 | none (manual) | backup and restore drill | not run | BLOCKED | M-003, TKT-27 · TASK-28 |
| TC-089 | none (manual) | one-command redeploy and rollback | not run | BLOCKED | M-003, TKT-27 · TASK-28 |
| TC-090 | none (manual) | health alert reaches the owner | not run | BLOCKED | M-003, TKT-28 · TASK-29 |
| TC-091 | (local tag tests in `metadata.int.test.ts` and `certificate-metadata.spec.ts` pass) | production URL unfurls in LinkedIn and opengraph.xyz | not run | BLOCKED | M-003, TKT-28 · TASK-29 (needs a public URL) |
| TC-092 | (CI audit success on 46be176 covers only the lockfile part) | env-only secrets on the instance; live providers ok; audit clean | not run | BLOCKED | M-003, TKT-28 · TASK-29 |
| TC-093 | `src/app/api/capture/stage/route.int.test.ts`, `src/lib/capture/staging.int.test.ts` | 201 with sha; 415/413/429/401; expiry cleanup; not anchored | passed | PASS | |
| TC-094 | `parse.staged.int.test.ts`, `src/client/stage-client.test.ts`; `e2e/capture-staging.spec.ts` (phone 3 passed; 9 project-skips) | (a)–(e) staged capture equals the normal one; 409 fallback; no bytes after Send | passed | PASS | (d)/(e) run on phone only by design; the EVAL-070 S3 measurement is M-003 (TKT-29) |

**Counts:** PASS 88 (of which TC-003, TC-079 and the process parts of TC-044 and TC-073 rest partly on carried evidence) · FAIL 0 · BLOCKED 6 (TC-087–092, M-003) · NA 0. No TC lacks a test except the 6 manual M-003 cases.

## 5. Failures (QA-S9-###)
No command, test, TC or gate failed in this run at 46be176. The two findings below come from CI on the same commit (read via `gh api` annotations). Neither reproduced here.

- **QA-S9-001: `e2e/og-image.spec.ts:20` [desktop] fails on CI, deterministically.**
  - Evidence: CI runs 37414924562 and 37414927700 at 46be176 report a `/og/verify-kodagu-arabica.png` mean difference of 2.9007 against a limit of < 1, with the retry failing too. Here it passed 7/7.
  - Root-cause hypothesis: the committed PNGs were rendered with the claude.ai VM's preinstalled Chromium 141.0.7390.37 and its system fonts. CI renders with the Chromium that `playwright install --with-deps` downloads, on ubuntu-latest fonts, so anti-aliasing and glyph rasterisation differ. The spec compares pixels across two different renderers.
  - Traces to: TKT-17 · TASK-18 (DES-202 link-preview images; TC-072). EVAL-090 itself is M-003-deferred (TKT-28 · TASK-29).
  - Status: another agent is fixing it on a separate branch. Re-test after the merge.
- **QA-S9-002: axe `document-title` flake on CI, a class of failure not tied to one spec.**
  - Evidence: CI run 37414924562 at 46be176 has `e2e/m2-processing.spec.ts:48` [desktop] fail axe with `document-title: html`, then pass on retry (flaky). On 1fae46e the same rule flaked on `m2-agreements.spec.ts:233` [phone]. Here, m2-processing:48 passed 4/4 plus 10/10 and m2-agreements:233 passed 4/4 plus 10/10.
  - Root-cause hypothesis: the axe scan runs before `<title>` is in the DOM. Next 16 streams `generateMetadata` output for non-bot user agents, so on a slow runner the title can arrive after the page's ready signal that the spec waits on. That makes it a race in the test's readiness wait (or in metadata streaming), not missing markup.
  - Traces to: TKT-26 · TASK-27 (m2-processing, TC-086, EVAL-101) and TKT-25 · TASK-26 (m2-agreements, TC-085). The fix should cover every spec that runs axe on M2 pages, not just `:233`.
  - Status: the other agent's fix targets m2-agreements:233. **Make sure it also covers m2-processing:48.**

Not new failures:
- EVAL-055, EVAL-056 and EVAL-122 are accepted reported misses that already sit in baseline-v1 (decisions EXE27; ledger QA-P4-1).

## 6. Artifacts (scratchpad, outside the repo)
- Logs: `scratchpad/logs/` contains typecheck, lint, test, test-int, test-tz, test-evm, contracts-test, e2e-full.log/.json/-summary.json, demo.log/.json, demo-run-46be17628334.json, harness-m1.log, harness-m2.log, ready.log, ready-m2.log, perf-s4.log, release-m1.log, eval-run-0.1.0-46be176.json (M1), eval-run-0.1.0-46be176-r2.json (M2), eval-run-v1-release-46be176.json, eval-report-v1.md, compare-m1.json and compare-m2.json.
- Tools: `scratchpad/s9tools/pw_summary.py`, `compare.py`, `perf-s4.sh`.
- Machine summary: `scratchpad/reports/stage9-eval-run.json`.
- Clean-up: removed `s9run/.next`, `.e2e-data`, `test-results`, `playwright-report`, `node_modules` and the perf scratch data dir. Ports 4400–4430 are confirmed free. `s9run` is still at 46be176 with a clean tree, and its git-ignored `evals/results/local/` reports are kept.
