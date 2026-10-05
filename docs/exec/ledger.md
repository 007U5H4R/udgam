# Stage 7 execution ledger — Udgam

Branch `build/stage7` (from `main` @ `b397c08`). Protocol: technical-plan.md §21.2, as modified by **EXE1**. The owner waived the stops at phase gates and at the M-001 gate; every quality gate still runs, and each gate report is written here. Tracking PR: https://github.com/007U5H4R/udgam/pull/1 (never merged in Stage 7). Campfire (`backlog/`) is never edited from the cloud; sync it locally from this file (§21.3).

**Subagents** (provider Anthropic): implementers use Sonnet for chores and Opus for high-risk slices, spec reviewers use Sonnet, quality reviewers use Opus, and QA uses Sonnet. Implementer briefs and reports travel as files in the session scratchpad.

## Tasks
| TASK | TSK | status (todo\|doing\|review\|done\|blocked) | commit | tests (TC/EVAL ids, result) | evidence (run/screenshot) | notes |
|---|---|---|---|---|---|---|
| TASK-2 (TKT-01) | 01.1 scaffold | done | 414265a | build ok; `pnpm eval` exits 1 (stub) | local | pnpm 12.6.0 + `pnpm-workspace.yaml` allowBuilds (EXE2) |
| TASK-2 | 01.2 tokens + fonts | done | 9db3f98 | TC-004 PASS (34 tokens, 0 mismatches) | QA P1 | |
| TASK-2 | 01.3 env + .env.example | done | 17825c6 | env tests PASS | | lazy env (EXE2) |
| TASK-2 | 01.4 db client, logger, health | done | 37b9ae2 | TC-001 (TKT-01 part) PASS | | ledger block → TKT-15 |
| TASK-2 | 01.5 vitest projects, lib purity | done | dc5feec | TC-005 PASS | planted import fails lint | |
| TASK-2 | 01.6 Playwright + smoke | done | 9586af2 | smoke e2e 12/12 (4 projects) | | VM Chromium 1194 via executablePath (EXE2) |
| TASK-2 | 01.7 cloud-setup.sh | done | df55eef | TC-002 PASS locally (2nd run `ok:` only, porcelain empty) | | |
| TASK-2 | 01.8 CI + gitleaks + audit | done | bb63901, b35168a (fix round 1) | TC-003 PASS locally; EVAL-083 PASS (wiring + local) | gitleaks 8.30.0: repo full history exit 0; canary clone exit 1 `generic-api-key` `canary.txt` | CI unblocked 2026-09-29 once the owner made the repo public. First green run: 36556265660 (@1a01784, all 5 jobs). TC-003 CI proof: canary run https://github.com/007U5H4R/udgam/actions/runs/36556519116 — secrets job failed, "leaks found: 1". The canary commit was made unreachable by force-resetting `ci/secret-canary` to `build/stage7`: the session proxy refuses branch deletion with a 403, so the owner deleted `ci/secret-canary` on 2026-09-29 (it held no unique commits). **TC-003 evidence:** canary commit 586497d made the gitleaks job fail in run 36556519116. The CI gitleaks step now runs with `--verbose` so the flagged file is named (secret still redacted) |
| TASK-2 | 01.9 ledger | done | 8cb00c9 | — | — | |
| TASK-3 (TKT-02) | 02.1 JCS + SHA-256 | done | 72bfd52 | TC-006 (Node) PASS | QA P2 | |
| TASK-3 | 02.2 ECDSA P-256 | done | b3a1996 | TC-006 PASS | | canonical b64u (fix d43d586) |
| TASK-3 | 02.3 browser/Node agreement | done | fe43f4f | TC-006, EVAL-066 PASS (e2e) | | `%5F_test__` route (EXE3) |
| TASK-3 | 02.4 schema + invariants | done | 19a9a1e | TC-008 part, TC-010(b) PASS | | |
| TASK-3 | 02.5 hash-chain append | done | 298db75 | TC-008 PASS (seq 1..23) | | `writeTx` queue (EXE3) |
| TASK-3 | 02.6 cfg-1 + scorer | done | 66285a6 | TC-009 PASS | CONFIG_HASH pinned | |
| TASK-3 | 02.7 evidence templates | done | 0f657a1 | TC-011 (registry) PASS | snapshots | |
| TASK-3 | 02.8 registry + 3 checks | done | ad49bce | TC-012, EVAL-018, 022, 030 PASS | | |
| TASK-3 | 02.9 parse + boundary | done | 5f4922a | TC-007, EVAL-053 PASS | | status mapping (EXE3) |
| TASK-3 | 02.10 media store + context | done | 32f8637 | int tests PASS | | |
| TASK-3 | 02.11 pipeline + NDJSON route | done | c7d3506, d43d586 (fix round 1) | TC-010, EVAL-067 PASS | | |
| TASK-3 | 02.12 tracer page + seed | done | 8927b17, 802e0a2 (E2E_PORT) | TC-013, EVAL-001/002 PASS | scratchpad qa/P2 tracer-verdict-375x812.png | |
| TASK-4 (TKT-03) | 03.1 dataset loader | done | 3f79e16 | TC-017 PASS | QA P3 | |
| TASK-4 | 03.2 plot + RS fixtures | done | 5331107 | fixtures tests PASS | | |
| TASK-4 | 03.3 fixture provider | done | c8e5ad8 | PASS | | `ProviderError` added to RS types |
| TASK-4 | 03.4 mutation engine | done | ff7ccb1 | TC-014 PASS | | `client_clock` sign (EXE4) |
| TASK-4 | 03.5 scorers | done | 71a641e | Wilson/detection/FP tests PASS | | |
| TASK-4 | 03.6 runner + report | done | 7c93ac4, 172ce90 (fix round 1) | TC-015, TC-016, EVAL-091, EVAL-092 PASS | | fails closed; exit 2 = crash |
| TASK-4 | 03.7 baseline-v0 | done | 6b0c538 (merge 85c1861) | reproduces at dataset 0.2.0 | `evals/results/baseline-v0-ledger-only.json` | detection 0/26; CF-01 on 10 hard-fail attacks |
| TASK-5 (TKT-04) | 04.1 Better Auth | done | 9f0b08d, b774c4f | int tests PASS | QA P3 | `auth@1.7.6` CLI (EXE5) |
| TASK-5 | 04.2 guards | done | 35c472a | TC-018 matrix PASS | | |
| TASK-5 | 04.3 route groups | done | 41e5868 | TC-018 PASS | | `src/proxy.ts`; wrong role redirects (EXE5) |
| TASK-5 | 04.4 guard coverage | done | eb8083e, 41384f0 (fix round 1) | PASS (planted fixtures) | | stricter rule (EXE5) |
| TASK-5 | 04.5 seed + org scope | done | c11b7ee | TC-019 PASS (batch part → TKT-14) | | |
| TASK-5 | 04.6 sign-in screen | done | f8ac500 (merge edcf4d3) | TC-020, TC-080/081 PASS | scratchpad qa/P3 sign-in 375/1440 | |
| TASK-6 (TKT-05) | 05.1–05.7 | done | e690212…cd692ff (merge 0594e60), e69b18d (fix round 1) | TC-021–025, EVAL-051, 052, 054, 082 PASS | QA P4 running build 9/9 | EXE7 |
| TASK-7 (TKT-06) | 06.1–06.6 | done | 82976cf…becd162 (merge 6164c32), 19484dc (fix round 1, merge 1a58451) | TC-026, 027, 028 (edit half), 029, EVAL-005/026 PASS; EVAL-044 edit path PASS (cache half → TKT-07) | scratchpad qa/P4 | EXE8 |
| TASK-9 (TKT-08) | 08.1–08.6 | done | 9300814…c5abee6, merge 2fb9927 | TC-035–037 PASS; scenario 1 11/11; EVAL-034/055/056 measured misses (EXE6) | eval local run | dataset 0.3.0 (EVAL-110–113) |
| TASK-16 (TKT-15) | 15.1–15.8 | done | 641de72…99f4042 (merge b617732, migrations renumbered 0003/0004), 68efd3b (fix round 1) | TC-001 (ledger), TC-061–064, EVAL-058–063, 065 PASS | doc-only sufficiency YES ×3 | EXE9 |
| TASK-19 (TKT-18) | 18.1–18.8 + follow-up | done | ea70ec3…3633fd3 (follow-up merge c67b234) | TC-073 PASS (brief part PARTIAL, QA-P5-3), TC-006, EVAL-058–063, 066 PASS; EVAL-103 reported out of M1 scope | both reviews PASS; QA P5 | EXE15 |
| TASK-15 (TKT-14) | 14.1–14.x | done | e9c5bde…46d15a0 (merge 4121cb1) | TC-019 (batch part), TC-059, TC-060, EVAL-077, EVAL-080 PASS | both reviews PASS; QA P5 | EXE16; the organic line is missing on batch detail (QA-P5-2) → follow-up |
| TASK-20 (TKT-19) | 19.1–19.x + fix rounds 1–2 | done | 759a3b5…190858a; d7876dd (merge a340255); 1923903, e884db8 (merge cd7830b) | TC-074, TC-075, TC-076, EVAL-081, 083, 085 PASS | spec PASS; quality FAIL ×2 → PASS in round 2 (r3); QA P5 | EXE17; Stage 10 inputs R1–R4 |
| TASK-8 (TKT-07) | 07.1–07.x + fix round 1 | done | 0699ef8…643882e (merge 7a495b3); 3cf4120 (merge 80fb421) | TC-030–034, EVAL-015, 016, 017, 044, 106–108 PASS | spec PASS; quality FAIL → PASS (r2); QA P5 | EXE12, EXE18 |
| TASK-14 (TKT-13) | 13.1–13.x + follow-up | done | 7480552…5121983; aed1789 (merge 009b96b) | TC-057, TC-058 (plot page; batch detail QA-P5-2), EVAL-079 PASS | both reviews PASS; QA P5 | EXE19 |
| TASK-10 (TKT-09) | 09.1–09.7 + fix round 1 | done | d4ee5e9…4d31e8b (merge 90e8bef, migrations → 0014/0015); f607ba6, 1df1c05, 7291cec (merge 3a65b11) | TC-038–042, TC-011, TC-040, EVAL-012, 030–032, 035, 045–050, 068, 114–121 PASS; EXE11 guarantees (i)–(iii) PASS | spec + quality FAIL → both PASS (r2); QA P5 | EXE11, EXE20; EVAL-049 unreachable (owner) |
| TASK-11 (TKT-10) | 10.1–10.14 + fix round 1 + t1 fix | done | dfd0150…f417f54 (merge 1f53b52); 9412b60 (e2e integration); 4a99748, c7011d9 (merge a93d66c); 2bc4d48 (EV9 t1) | TC-043–049, TC-080/081, EVAL-086, 089 PASS; EVAL-070 marks per EV9 | spec + quality FAIL → quality PASS (r2), spec PASS (r3); QA P5 | EXE12 farmer lines; D5 'when' line → owner |
| TASK-13 (TKT-12) | 12.1–12.x + fix round 1 | done | merge 9afb24f; fix merge 7fbeaf7 (migration 0021); r2 nits in a9660b1 (migration 0033) | TC-052–056, EVAL-075, 076 PASS | spec + quality FAIL → PASS (r2); QA P6–8 | override reason rules; refuse runs after a hard fail (P5 follow-up item 11) |
| TASK-12 (TKT-11) | 11.1–11.x + fix round 1 | done | merge 1153ae2 (i18n literals fix 9d46705); fix merge d375a8f | TC-050, TC-051, EVAL-068, 088 PASS | spec FAIL → PASS (r2), quality PASS; QA P6–8 | outbox lock/send timeouts in a9660b1 |
| TASK-17 (TKT-16) | 16.1–16.x + fix round 1 | done | merge 46c628f; fix merge d40f8e0 | TC-065–072 (certificate), EVAL-057, 069, 071 (S4 indicative), 078, 084, 087 (print, QR → Stage 8) PASS | spec PASS, quality FAIL → PASS (r2); QA P6–8 | EXE24 (OD-8 budget), EXE28 (district outlines, org IDs); Kerala outline fix in a9660b1; verify ≤ 300 ms open for TKT-21 |
| TASK-18 (TKT-17) | 17.1–17.x + fix round 1 | done | merge bcb6650; fix merge 178f78d | TC-070, EVAL-078, 084 (GeoJSON) PASS | spec PASS, quality FAIL → PASS (r2); QA P6–8 | EXE26 (MultiPoint for small multi-part plots, in a9660b1) |
| TASK-31 (TKT-30) | 30.1–30.x | done | merge a2ef5d7 (migrations 0022/0023) | TC-094 (amended EXE25) PASS | both reviews PASS; QA P6–8 | EXE25 implemented in a9660b1 |
| TASK-21 (TKT-20) | 20.1–20.6 + fix rounds 1–2 | done | merge 48eff91 (migration → 0035); fix merges 94cab86, 3b625cd | TC-077, TC-078, EVAL-073, 074 PASS; EVAL-124–149 appended (dataset 0.8.0), S2 0/40 | spec PASS, quality FAIL → PASS (r2); QA P6–8 | EXE33 (demo never in production; rehearsal on staging), EXE35 (seed needs NODE_ENV=development); enrol.ts and seed helpers edited outside owned files (S4, recorded); TP29 replaces "BLOCKED: HR3 pending" |
| TASK-11 (TKT-10) | EVAL-086 e2e + fix round 1 | done | merges 2fe0463, 5643025 | EVAL-086 PASS (375/768 px; reviewer probes fail it) | spec PASS, quality FAIL → r2 running | test only |
| TASK-22 (TKT-21) | phase A: 21.1, 21.2, 21.4/21.5 tooling | doing | merge 97d2f5b | readiness READY (HR3 warning per TP29) | spec + quality FAIL (false PASS) → fix round 1 running | EXE34 (one strict config-change rule; release fails closed); phase B = formal baseline-v1 run |
| TASK-22 | owner eval decisions | done | merge 87b8547 | EVAL-116, EVAL-049 applied (dataset 0.7.0) | eval PASS | EXE23; EXE27 (EVAL-122 stays a reported miss) |
| TASK-23 (TKT-22) | Foundry spike | done | merge 4e0620b | GO: Foundry 1.8.3 / solc 0.8.37 | both reviews PASS; QA M-002 | |
| TASK-24 (TKT-23) | design addendum | done | merges 8448deb (D9), 059f9a8 (D10) | — | review FAIL → PASS (r2); QA M-002 | D9/D10 pending owner review at Stage 8 |
| TASK-25 (TKT-24) | 24.1–24.x + fix round 1 | done | merge 1de887b; fix merge 0d1c4a6 (migrations 0024/0025) | EVAL-103 PASS (`--ledger=evm --milestone=M2`), S6-lib 8/8 | spec PASS, quality FAIL → PASS (r2); QA M-002 | r2 minors in a9660b1 |
| TASK-26 (TKT-25) | 25.1–25.8 + fix round 1 | done | merge 84703f7 (migrations 0026/0027); fix merge b03989e (0031/0032); follow-up 29335b5 | TC-084, TC-085, EVAL-093–099, 105 PASS | spec PASS, quality FAIL (3 majors) → PASS (r2); QA M-002 | EXE29, EXE30 |
| TASK-27 (TKT-26) | 26.1–26.5 + follow-up | done | merge 0c4a38e (migrations 0028–0030); follow-up 29335b5 (0034) | TC-086, EVAL-100–102 PASS | both reviews PASS; QA M-002 | EXE29, EXE31, EXE32 (lone processor-hop gap) |

## Decisions and parked items
- EXE1 (owner gate waiver), EXE2 (TKT-01 toolchain), EXE3 (TKT-02 foundations: `writeTx`, boundary statuses, test route, `E2E_PORT`), EXE4 (harness semantics), EXE5 (auth under Next 16 and Better Auth; `device_not_owned` not anchored), EXE6 (location/time checks; lone time-flag misses), EXE7 (enrolment and device state), EXE8 (plot geometry), EXE9 (proof feed hardening) are in `decisions.md`.
- Owner decisions 2026-09-29, applied before baseline-v1: EXE10 (EXIF gap over 24 h fails, worst photo; EVAL-034 → fail; EVAL-122/123 added; TKT-20 block from EVAL-124), EXE11 (replayed rejected captures re-checked; partial unique index → TKT-09, in flight), EXE12 (production refuses the fixture provider; "(demo data)" suffix → TKT-07 fix round), EXE13 (opaque seeded user IDs; TC-022 wording), EXE14 (Caddy overwrites X-Forwarded-For → TSK-27.3). The code for EXE10 and EXE13 is a separate fix task (TASK-9 and TASK-6 commits).
- Branch protection (owner, 2026-09-29): `main` now requires `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`, and blocks force-push and deletion. **Keep those two CI job names unchanged**, or the rule stops matching.
- `/g1.txt` (stray file a QA agent left at the container root, outside the repo): the orchestrator inspected it on 2026-09-29. It held only scratch gate output: tsc, eslint and vitest lines, 65 files and 673 tests passed, and throwaway test key IDs. It had no instructions, secrets or repo data. The owner approved deleting it, but the session's safety check refuses `rm` at the filesystem root, so it is still there; it goes away with the container.
- QA-P1-1 (low, parked → TKT-15 health work): when env is invalid in production (e.g. no `BETTER_AUTH_SECRET`), `/api/health` answers 503 `db:"error"` and logs `health.config_invalid`, so a config fault reads as a DB fault in the body. No values leak.
- Carried to later tickets from the TKT-02 review: re-evaluating stored boundary rejections for the same `payload_hash` and the duplicate-resend race go to TKT-09; binding the device to the session agent before the replay lookup goes to TKT-04; anonymous ledger growth goes to TKT-04/19; aborting remote checks at the 10 s cap goes to TKT-07; the concurrent same-photo race goes to TKT-19.
- QA-P2-1 (low, parked → TKT-10): the temporary tracer page's file input overflows at 375 px, and TKT-10 replaces the page.
- QA-P1-2 (info): `next build` needs network for `next/font/google` (fonts are self-hosted at build, not at runtime).
- Hazard for all tickets: `pnpm dev` appends an agent notice to `CLAUDE.md`. Don't run it, or run `git checkout CLAUDE.md` afterwards.

---

## Gate P1 — TKT-01 (TASK-2) · PASS · 2026-09-29
- **Reviews:** spec compliance PASS (0 blocker/major, 5 minor, 3 nit; minors folded into EXE2). Code quality FAIL → fix round 1 (b35168a) → PASS. The two majors were fixed: the CI setup-idempotency step lacked `pipefail`, and the gitleaks action didn't scan full history (replaced by a pinned, checksum-verified gitleaks 8.30.0 CLI). The six minors were fixed too: env read-only and non-enumerable, logger `[Redacted]` with header paths, DB pragma errors rethrown, health env parsing inside try.
- **Gate commands (independent QA, @ b35168a):** `pnpm typecheck && pnpm lint && pnpm test` pass (73 tests); `pnpm test:int` 3 passed; `pnpm test:e2e` 12 passed (phone, phone-small, tablet, desktop); `pnpm eval` is the loud stub, exit 1 as planned until TKT-03; `pnpm audit --prod --audit-level=high` exit 0 (1 moderate: esbuild via drizzle-kit).
- **TC/EVAL:** TC-001 (TKT-01 part) PASS · TC-002 PASS (local) · TC-003 PASS (local), CI URL BLOCKED · TC-004 PASS · TC-005 PASS · EVAL-083 PASS (wiring + local).
- **Eval delta:** none (harness arrives in P3).
- **Open issues:** GitHub Actions has no runners for this repo, so CI can't go green on GitHub until the owner checks Settings → Actions and billing. Until then, the gates run locally in the VM, and results are recorded here.

---

## Gate P2 — TKT-02 (TASK-3) · PASS · 2026-09-29
- **Reviews:**
  - Spec compliance: PASS (6 minor, 5 nit).
  - Code quality: FAIL, then fix round 1 (d43d586, 802e0a2), then PASS. Two majors were fixed:
    1. Rollback cleanup could delete a content-addressed photo that a committed row shared. The fix adds per-path holds and a DB reference check, with an interleaving test.
    2. A client disconnect made the NDJSON emits throw and logged committed captures as failed. Emits now never throw, and the post-commit line is sent outside the failure path.

    Five minors were also fixed: canonical base64url signatures, signed size vs upload, a nested-`writeTx` guard, cleanup-failure logging and `Object.hasOwn`.
- **Gate commands (independent QA, @ 802e0a2):** `pnpm typecheck && pnpm lint && pnpm test` pass (280 tests); `pnpm test:int` 53 passed; `E2E_PORT=3102 pnpm test:e2e` 32 passed (4 projects); `pnpm eval` is still the stub (exit 1). Running build: `/api/health` 200 `db:ok`; `/__test__/crypto` 404 without `E2E=1`.
- **Independent checks:** the stored payload equals the signed string; the signature verifies with the enrolled key; the ledger chain recomputes by hand; a tampered POST gets 401 `bad_signature` and is anchored; the cfg-1 hash was recomputed outside the code.
- **TC/EVAL:** TC-006 through TC-013 PASS (TC-011 registry part); EVAL-001, 002, 018, 022, 030, 053, 066, 067 PASS. For EVAL-001/002, only the three registry checks are asserted; the other checks arrive later and TKT-03 reports them as `not_yet_implemented`.
- **P1 regressions:** TC-001 (TKT-01 part), TC-002 (local), TC-004, TC-005 PASS.
- **Eval delta:** none yet (harness in P3).
- **Open:** GitHub Actions still assigns no runners (commented on PR #1); QA-P2-1 parked to TKT-10.

---

## Gate P3 — TKT-03 (TASK-4) ∥ TKT-04 (TASK-5) · PASS · 2026-09-29
- **Reviews:**
  - TKT-03: spec PASS. Quality FAIL → fix round 1 (172ce90) → PASS. Two majors fixed: an unreadable baseline no longer fails open (it now fails integrity and fires CF-13), and a case with zero assertions no longer passes. Minors fixed: per-case watchdog, `InvalidMutationParam`, report names validated with no overwrite, crash exit code 2.
  - TKT-04: spec PASS. Quality FAIL → fix round 1 (41384f0) → PASS. Major fixed: a swallowing `catch` no longer bypasses the guard-coverage test. Minors fixed: role matches group, pages and layouts guarded, all `'use server'` files scanned, sign-in error classes, exact refusal codes, seed default only in dev/test, cookie-attribute test.
- **Gate commands (independent QA, @ 41384f0, which also holds P4's TKT-08 and TKT-15):**
  - `pnpm typecheck && pnpm lint && pnpm test`: 673 passed. `pnpm test:int`: 141 passed.
  - `pnpm eval:validate`: dataset 0.3.0, 109 cases.
  - `E2E_PORT=3103 pnpm test:e2e`: 68 passed. `pnpm build` ok.
- **`pnpm eval` (exit 1 expected while checks are missing):** 64 active · 20 passed · 44 failed (41 `not_yet_implemented`) · 0 errored · 0 skipped. Gates: S1 50.0 % (15/30) FAIL · S1-floor FAIL · S2 FAIL (14/14 legitimate cases still wait on 5 unbuilt checks) · S6-lib 0/8 FAIL (proof suite registration in the TKT-15 fix round) · S7 PASS · CF 0.
- **Baseline:** baseline-v0 (ledger only, dataset 0.2.0, seed 20260929) reproduces exactly. Detection 0/26 and CF-01 fire on all 10 hard-fail attacks — the "just put it on a ledger" number.
- **Eval delta vs baseline-v0:** S1 0/26 → 15/30 (includes TKT-08's scenario 1: 11/11).
- **Running build:** all three roles sign in and land home. A wrong password gets the inline error. The wrong role is redirected. Signed-out users get 307 to `/sign-in`. `/verify/x` is public. `/api/capture` answers 401 without a session and 403 for admin/buyer.
- **TC/EVAL:**
  - PASS: TC-014–020, TC-080/081 (sign-in and shells), EVAL-080, 091, 092.
  - TC-019: batch and HTTP-level cross-org parts wait for TKT-14 (QA-P3-2).
  - P1–P2 regressions: PASS.
- **Open:** QA-P3-1 (compare later runs to baseline-v0 by case ID, since the dataset grew); QA-P3-2 → TKT-14. GitHub Actions still has no runners.

---

## Gate P4 — TKT-05 (TASK-6), TKT-06 (TASK-7), TKT-08 (TASK-9), TKT-15 (TASK-16) · PASS with one recorded exception · 2026-09-29
- **Reviews:**
  - **TKT-08:** spec and quality both PASS on the first round.
  - **TKT-15:** spec FAIL (proof suite not wired into `pnpm eval`) and quality FAIL (payload not hashed as received, so `__proto__` bypassed the check). Fix round 1 → both PASS. The doc-only sufficiency review was run three times, SUFFICIENT: YES each time.
  - **TKT-05:** spec PASS; quality FAIL on three security majors: key re-encoding allowed re-enrolment of a revoked phone, a revoke racing the capture commit, and 10 code attempts instead of 5. Fix round 1 → PASS.
  - **TKT-06:** spec FAIL (the admin rail was missing) and quality FAIL (a nested MultiPolygon double-counted area). Fix round 1 → both PASS.
- **Gate commands (independent QA, @ 1a58451):**
  - `pnpm typecheck && pnpm lint && pnpm test`: 964 passed.
  - `pnpm test:int`: 222 passed.
  - `pnpm eval:validate`: dataset 0.3.0, 109 cases.
  - `E2E_PORT=3104 pnpm test:e2e`: 136 passed, 4 skipped by design.
  - `pnpm build`: ok.
- **`pnpm eval`:** 64 active · 27 passed · 37 failed (34 `not_yet_implemented`) · 0 errored · 0 skipped.

  | Gate | Result |
  |---|---|
  | S1 | 50.0 % (15/30) FAIL |
  | S1-floor | FAIL |
  | S2 | FAIL (not-yet-built checks) |
  | S6-lib | **100 % (7/7) PASS** |
  | S7 | PASS |
  | CF | 0 |

  Per scenario: 1: 11/11 · 2: 4/6 · 3: 0/7 · 4: 0/6 · 6 (stretch): 1/3.
- **Eval delta since P3:** S6-lib 0/8 → 7/7; passed cases 20 → 27.
- **Running build (9/9):**
  - enrol at 375 px, then an unassigned-plot capture gets 403 `plot_not_assigned`, anchored;
  - revoke, then the next capture gets 403 `device_revoked`, anchored;
  - `plot_registered` then `plot_edited`, both carrying `polygon`;
  - `/.well-known` returns the public key only;
  - all three 404 bodies are byte-identical, and a correct feed verifies in the clean-room CLI;
  - health has the ledger block and returns 503 when the key is missing;
  - the 11th wrong code gets 429.
- **Exception (QA-P4-1, owner decision):** EVAL-034 (high priority, not critical), plus stretch cases EVAL-055/056. A lone `exif_time_agreement` flag is correct, but under cfg-1 / EV7 it does not cap the verdict, so the verdict stays Verified. Changing that means moving cfg-1, which needs a TP/EV decision and new attack cases first (EV13). It is deferred to the baseline-v1 decision at TKT-21 with the full numbers (EXE6); no threshold, weight or expected verdict was touched.
- **Other QA findings:**
  - QA-P4-2 (P2): TC-022 wording vs the `agentId` in `device_enrolled` → owner item.
  - QA-P4-3 (P2): add a route-level test for the identical 404s → TKT-16.
  - QA-P4-4 (info): drag editing is checked manually.
  - QA-P4-5 (info): the S2 FAIL reflects not-yet-built checks.
- **Test infrastructure:** under the load of parallel agents, some heavy tests exceeded the default 5 s timeout. Root cause: child-process suites plus the default timeout. The fix is queued in the TKT-18 follow-up. QA ran with no timeouts.
- **Open:** GitHub Actions still has no runners.

---

## Gate P5 — TKT-07 (TASK-8), TKT-09 (TASK-10), TKT-10 (TASK-11), TKT-13 (TASK-14), TKT-14 (TASK-15), TKT-18 (TASK-19), TKT-19 (TASK-20) · PASS · 2026-09-29
- **Head:** QA ran at c26bf36; the one P1 finding was fixed in 2bc4d48 (EV9 t1) and re-checked there. CI is green on 2bc4d48 (all 6 jobs; `main` now requires `audit` and `bundle-secrets`).
- **Gates at c26bf36:**
  - typecheck and lint pass;
  - `pnpm test` 1670/1670 (155 files) and `pnpm test:int` 477/477 (63 files);
  - `eval:validate`: dataset 0.6.0, 122 cases;
  - full e2e 319 passed, 1 failed, 4 skipped. The failure was one phone test that set a photo before hydration under load; it passed 14/14 serially (QA-P5-7).
  - Orchestrator runs on the merged heads: a93d66c e2e 320 passed, 0 failed; cd7830b 316 passed, 0 failed.
- **`pnpm eval` (M1): PASS.**
  - S1 97.7 % (42/43), lowest scenario 91.7 %, S2 0/14, S6-lib 7/7, S7 yes, CF 0.
  - Scenarios: 1 → 11/11, 2 → 11/12, 3 → 10/10, 4 → 10/10.
  - Delta from P4: S1 up from the P4 measure, scenario 4 from 0/6 to 10/10, and EVAL-034 now passes (EXE10).
- **Owner-held eval cases (not build defects; decide before baseline-v1):**
  - **EVAL-055, EVAL-056:** scenario-6 lone-flag stretch misses, reported, no tuning.
  - **EVAL-122:** a 23 h EXIF gap is a lone flag → Verified under the EV7 rule. My EXE10 brief copied EVAL-034's verdict expectation. Keep it as a reported miss, or have it accept Verified?
  - **EVAL-116:** its expected substring "fail over 7 days" is now worded "fail over 24 h" (EXE10); the verdict is correct. Authorise the substring change?
  - **EVAL-049:** unreachable as one picking (3,000 kg on 2 ha > the 500 kg capture limit). Options: a plot of ≤ 0.35 ha, or several pickings in the harness.
  - **EVAL-103:** M2, out of M1 scope.
- **Owner decisions verified by QA:**
  - EXE10–EXE14;
  - EXE11's three guarantees each have a named passing test;
  - EXE12 refuses the fixture provider in production (including with `DEMO_MODE=1`) and labels fixture evidence "(demo data)" on the server and farmer screens;
  - EXE15–EXE21 are recorded.
- **Owner acknowledgements asked:**
  - EXE20's X-Y-X replay narrowing;
  - D5's "when" line on Needs a check (a real response time, or amend D5);
  - QA-P5-3 (below).
- **QA findings:**
  - QA-P5-1 (P1): the EVAL-070 end mark fired before the card was visible, because the orchestrator's fix brief moved it. **Fixed** in 2bc4d48 and re-reviewed PASS.
  - QA-P5-2 (P2): TC-058's organic line "Certified by … — certificate on record" is missing on `/admin/batches/[id]` and `/buyer/batches/[id]` → P5 follow-up task.
  - QA-P5-3 (P2, process): TC-073 requires the clean-room checker's brief to contain only `docs/proof-feed.md`. `briefs/TASK-19.md` also cited plan sections and the reference verifier. The mitigations are three doc-only sufficiency reviews (YES) and the import-isolation test. **Owner:** accept it, or have the checker rebuilt from the doc alone (candidate for Stage 9).
  - QA-P5-4 (P3): under EXE12 the server stays up and returns 500 on every route instead of exiting. It fails closed, but Docker sees no crash → TKT-28 (production configuration).
  - QA-P5-5 (P3): at 24 h 1 min the evidence reads "Photo time 24 h … (fail over 24 h)", a value on the wrong side of the cited limit (EXE18's rounding rule) → P5 follow-up.
  - QA-P5-6 (docs): TC-034, TC-076 and EVAL-116's substring lag EXE18, EXE17 and EXE10. The TC wording is updated with this gate; EVAL-116 is an owner item.
  - QA-P5-7: the capture e2e helpers can set a file before hydration → P5 follow-up.
  - QA-P5-8 (Stage 8 visuals):
    - the weight keypad and Send pill aren't anchored to the bottom as in the mockup;
    - the "No network here" sheet lacks its backdrop, icon and bold text;
    - the Home place line shows the farmer label;
    - "150 m" and "(demo data)" wrap;
    - the Not accepted halo (known).
- **Ledger notes:**
  - Two offline pickings signed with the same seq → the second is Needs Review (§9); TKT-11's queue handles it.
  - A plot geometry edit during an in-flight capture is not re-read.
  - CI does not run `pnpm test:tz`.
  - Per-instance state (throttles, capture slots, dev secret) assumes one app instance (TKT-27 runs one).
  - Browser-exposed tile keys (PRE-1).
  - Stage 10 inputs R1–R4 (EXE17).
  - The ledger key uses `link()`: check hard links on the Oracle A1 volume (TKT-27).
- **Deferred to a P5 follow-up task** (after P6 merges):
  - QA-P5-2, QA-P5-5, QA-P5-7;
  - TKT-09 re-review N1 (a test for the accepted-count re-read) and nits;
  - TKT-10 nits (a no-break space in "(demo data)", log `onSaved` errors, t1 via `useLayoutEffect`);
  - TKT-07 re-review nits.

  `sharp.cache(false)` rides with TKT-12.
- **Orchestration notes:**
  - A container restart at about 15:00 UTC stopped all agents; they resumed from their transcripts, and no work was lost.
  - Semantic merge fixes are named in their merge commits (EXE21).
  - `/g1.txt` remains (the root-level `rm` is refused by the session's safety check).
