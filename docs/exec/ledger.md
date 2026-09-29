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
| TASK-2 | 01.8 CI + gitleaks + audit | done | bb63901, b35168a (fix round 1) | TC-003 PASS locally; EVAL-083 PASS (wiring + local) | gitleaks 8.30.0: repo full history exit 0; canary clone exit 1 `generic-api-key` `canary.txt` | **CI run URL BLOCKED**: GitHub Actions assigns no runner (run 36521636091, every job `runner_id 0`, no steps). This is account-side (billing/Actions availability); the owner must fix it |
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

## Decisions and parked items
- EXE1 (owner gate waiver), EXE2 (TKT-01 toolchain), EXE3 (TKT-02 foundations: `writeTx`, boundary statuses, test route, `E2E_PORT`) are in `decisions.md`.
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
