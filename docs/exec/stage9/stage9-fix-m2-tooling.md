# Stage 9 CR fix wave — area `m2-tooling`

- **Worktree:** `/home/user/udgam/.claude/worktrees/agent-a95af5933ced567cd`, branch `worktree-agent-a95af5933ced567cd`, based on `build/stage7` @ `b81bea0`.
- **Commits (6):**
  - `5df2663` Record a not-released settlement once and batch the agreement list reads (CR-203, CR-204) (TASK-26)
  - `2bdbb19` Page the escrow log recovery in bounded block windows (CR-206) (TASK-26)
  - `77cf34f` Judge eval readiness for the run's ledger and cite EXE23 for the default milestone (CR-201, CR-202) (TASK-22)
  - `55005e4` Authorise a config change only by an accepted decision (CR-205) (TASK-22)
  - `30a7346` Run the eval gates, test:tz and the full e2e suite in CI (CR-200) (TASK-2)
  - `ffe2e29` Fail the evidence-text check on scaled or zoomed text (EVAL-086 N7) (TASK-11)
- **No migration** and no schema change.

## CR table

| CR | commit | test / verification | status |
|---|---|---|---|
| CR-200 (major) | 30a7346 | `ci.yml`: new jobs `eval (harness gates, CF, critical regressions)` (`pnpm eval:ready`, `pnpm eval`, `node scripts/ci/check-eval-regressions.mjs`), `test-tz (unit + integration in Los Angeles and Kolkata)` (`pnpm test:tz`), `e2e (Playwright, Chromium, all projects)` (`pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`, report artifact on failure). Existing job names unchanged. `contracts.yml`: path filter + `src/lib/{remote-sensing,media,eudr,capture,processing,batches,custody}/**`, `src/app/api/capture/**`, `src/lib/auth/signing-keys.ts` (push and PR, 30 paths each); adds `pnpm eval:ready --milestone=M2 --ledger=evm` before the EVM eval. Both files parse with PyYAML. Locally at HEAD: `eval:ready` READY, `pnpm eval` PASS exit 0 (CF 0), regression check exit 0, `pnpm test:tz` 2604/2604 twice. New checker covered by `tests/eval-regressions.test.ts` (6 tests). e2e runs in CI (not the full suite here). | FIXED |
| CR-201 | 77cf34f | `DEFAULT_MILESTONE` stays `'M1'`. The stale "MUST move to M2" comment now cites EXE23 (OD-9 → a). | FIXED (comment only) |
| CR-202 | 77cf34f | `eval:ready --ledger=hashchain\|evm` (default hashchain, as `pnpm eval`). `readiness.test.ts`: "with ledger evm, an EVM-only harness-proof case is runnable…", "takes --ledger=…", "the repository dataset is READY for M2 on the EVM ledger…". `eval:release` judges readiness for the ledger its `--harness` file recorded (`release.test.ts`, 3 cases). CLI: `pnpm eval:ready --milestone=M2 --ledger=evm` → `eval:ready (milestone M2, ledger evm) — READY`, exit 0. The header is unchanged for hashchain, so the committed M-001 report lines still match. | FIXED |
| CR-203 | 5df2663 | The reviewer's fake-chain probe is now a test in `settle.int.test.ts`, "two concurrent settles record one row and one anchored entry, and both requests see it" (600 kg agreed against 512 kg). It failed first. Also "a repeated settle with nothing new to judge returns the recorded judgement and sends nothing". A repeat on the same facts sends nothing. A concurrent duplicate is caught inside the writeTx (BEGIN IMMEDIATE), so no DB guard is needed. | FIXED |
| CR-204 | 5df2663 | `read.int.test.ts`: the statement count for 3 agreements × 3 batches with a grade and a settlement equals the count for 1 × 1 (9). It was 41 vs 9 before the fix. A second test checks per-agreement facts, grade, delivery time and settlements, and that the list equals `getAgreementView`. LIMIT/offset was not added: there is no paging UI, so a limit would silently hide agreements. | FIXED (batched) |
| CR-205 | 55005e4 | `tests/config-freeze.test.ts`: a decision heading that is rejected, proposed, has no verdict, says "accepted" only in the title, or says it only in the body does not authorise. An accepted heading with a trailer, or "Accepted", does. 2 fixture headings were updated to the "— accepted" convention. The repository guard still passes; baseline-v1 and cfg-1 are untouched. | FIXED |
| CR-206 | 2bdbb19 | Shared `src/lib/ledger/evm/log-range.ts` (`blockWindows`, `LOG_RANGE_BLOCKS` = 5,000), used by the registry `anchoredLog` (oldest first) and the escrow `earlier()` (newest first). `settle.evm.test.ts`: "the release recovery reads logs in bounded block ranges…" with `logRangeBlocks: 8`. It failed first (one open-ended query). `log-range.test.ts` has 4 tests. | FIXED |
| EVAL-086 N7 | ffe2e29 | Each evidence text line must be drawn ≥ 13 px high. Probes on phone and tablet: `.ev-t{transform:scale(.5)}` fails (drawn 10 px), `.ev-t{display:inline-block;transform:scale(.5)}` fails (10–10.5 px), `.ev-t{zoom:.5}` fails (10–11 px). Unmodified, it passes on phone and tablet. The probe hook was removed before the commit. | FIXED |

## Gates (final tree, ffe2e29)
- `pnpm typecheck` 0, `pnpm lint` 0.
- `TZ=UTC pnpm test`: 269 files, 2604 tests passed. `pnpm test:tz` (Los Angeles, Kolkata): 2604/2604 each (both include the integration project).
- `pnpm test:evm`: 42/42. `pnpm contracts:test`: 47/47.
- `pnpm eval`: PASS, exit 0, CF 0. `pnpm eval --ledger=evm --milestone=M2`: PASS, S6-lib 8/8.
- e2e on port 4500 with fresh `.e2e-data`:
  - capture-responsive: 2 passed, 2 skipped by design.
  - m2-agreements + batches: 110 passed, 2 failed under load (load average ≈ 28). Both passed serially (17/17 on phone), then m2-agreements passed 68/68 on all projects.
- Cleanup: `.next`, `.e2e-data` and the Playwright output were removed, and my server was killed by PID. The ad-hoc runs in the gitignored `evals/results/local/` were left in place (never delete in evals/results).

## Owner actions
- **Branch protection:** to make the new CI jobs block merges, add `eval (harness gates, CF, critical regressions)`, `test-tz (unit + integration in Los Angeles and Kolkata)` and `e2e (Playwright, Chromium, all projects)` as required status checks on `main`. Keep the existing `audit` and `bundle-secrets` checks. Do this once they have run green on GitHub. `contracts.yml` is path-filtered, so it can't be a required check without a filter-less fallback.
- Record the new required job names in ledger.md when the owner sets them.

## Deviations / candidate EXE
- One full unit+integration run on the final tree stands in for a run before each commit, because a run takes about 15 min under load. typecheck, lint and the targeted tests ran per change.
- CR-204 has no LIMIT (see above). CR-203 has no DB guard (the BEGIN IMMEDIATE re-read already serialises it).
- The eval CI job adds a critical-regression check (EV14) beyond the exit code.

## Summary
1. All 7 CRs (CR-200…206) and EVAL-086 N7 are fixed in 6 commits on `worktree-agent-a95af5933ced567cd`. There are no migrations.
2. CI now runs eval:ready + eval + a critical-regression check, test:tz and the full e2e suite. contracts.yml covers the EV14 paths.
3. A not_released settle is idempotent, the list reads are batched, and escrow log recovery is paged in 5,000-block windows.
4. Readiness takes `--ledger`, so M2/evm is READY. Config changes need an accepted decision. DEFAULT_MILESTONE stays M1 per EXE23.
5. All gates are green in UTC, LA and Kolkata, plus evm, contracts and eval. The owner must add the 3 new CI jobs to branch protection.
