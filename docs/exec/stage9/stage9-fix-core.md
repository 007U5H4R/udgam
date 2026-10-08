# Stage 9 CR fix wave: `core` (CR-001 to CR-007)

- **Worktree:** `/home/user/udgam/.claude/worktrees/agent-aed1ff18b86c28ec0`
- **Branch:** `worktree-agent-aed1ff18b86c28ec0`, based on `build/stage7` @ `b81bea0`. Not pushed.
- **Findings source:** `docs/exec/stage9/stage9-cr-core.md`

## CR table

| CR | Commit | Test / verification | Status |
|---|---|---|---|
| CR-001 | `99696d8` Count distinct photos in the photo_uniqueness evidence (CR-001) (TASK-10) | `src/lib/verification/verify.test.ts` "CR-001: one photo filling all three slots counts as one photo" and "CR-001: a repeated photo is counted once when it was seen before"; `src/lib/capture/uniqueness.int.test.ts` "CR-001: one photo filling all three slots…" (end-to-end through `runCapture`; failed on the old code, now passes) | FIXED (evidence option) |
| CR-002 | `99a59ae` Tie-break the as-of chain head on the first commit at a seq (CR-002) (TASK-13) | `src/lib/capture/context.int.test.ts` "buildContextAsOf › CR-002: two accepted events at one seq…" (rows written in reverse physical order; failed before the fix) | FIXED |
| CR-003 | `2cef0e8` Walk the staging folder outside the write lock (CR-003) (TASK-31) | `src/lib/capture/staging.int.test.ts` "CR-003: the orphan scan (the folder walk) runs outside the write lock" and "CR-003: a file that looked orphaned during the walk but was staged before the delete is kept" (both failed before the fix); the existing review #3 sweep test still passes | FIXED |
| CR-004 | `990c9b9` Build the media, thumbnail and staging roots through runtimePath (CR-004) (TASK-11, TASK-31) | `src/lib/config/runtime-path.test.ts` "every DATA_DIR root goes through runtimePath (EXE39, CR-004)" pins all three files (import present, no bare `resolve(`); failed before the change | FIXED |
| CR-005 | `891e3ce` Answer a replay with the event's final verdict (CR-005) (TASK-10) | `src/lib/capture/idempotency.int.test.ts` "CR-005: a replay after an admin override answers with the decided verdict…" (Needs Review capture, override to Rejected, replay returns Rejected with the run's score and checks; failed before the fix) | FIXED |
| CR-006 | `63c95f5` Cache the thumbnail placeholder only for undecodable photos (CR-006) (TASK-11) | `src/lib/media/thumbs.test.ts`: "CR-006: a transient decode failure serves the placeholder without caching it…", "CR-006: an out-of-memory failure… is not cached", "CR-006: bytes that are not an image at all get the placeholder, cached"; the existing pixel-limit and corrupt-JPEG caching tests still pass | FIXED |
| CR-007 | `0a05f44` Log the driver code on capture failures (CR-007) (TASK-3, TASK-20) | `src/lib/log.test.ts` "errFields (CR-007)" (3 tests: code and rawCode, wrapped cause, no message or odd code); `src/lib/capture/pipeline.int.test.ts` "CR-007: a failed capture logs the driver code (SQLITE_BUSY)…" | FIXED |

## CR-001: which option and why

I chose the **evidence-wording option**: `photo_uniqueness` now counts distinct hashes. Three copies of one photo read "1 of 1 photos are new", not "3 of 3". The status and hard-fail outcome are the same as before (k > 0 exactly when some distinct hash was seen), so no verdict changes and cfg-1 is untouched. The evidence template (technical-plan §6.5, "`{n} of {n} photos are new`") and the farmer-evidence parser (`/of (\d+)/`) are unchanged.

I did not add a boundary refusal, for two reasons:
1. **The phone can send a repeated photo.** The reviewer assumed it never does, but `RecordFlow.tsx` has three independent `<input type="file">` slots and does not dedupe. A gallery chooser or desktop file picker can put the same file in two slots. `bad_schema` is a final refusal in `capture-client.ts` (`APP_REFUSAL`), so the phone would drop the outbox copy and the farmer would lose the picking. That contradicts TP28 and EXE25 ("the farmer never loses a photo"). Deduping in the UI is outside `core`.
2. **Eval check (requested).** No eval case would change under either option. A probe built every harness case with `buildCase` (101 built, 106 submissions including split pickings) and found 0 payloads with a repeated `media[].sha256`. The harness never parses payloads with `capturePayloadV1`; it calls `verifyWith` directly. `pnpm eval` after the change matches `baseline-v1.json` case for case (103 common cases, 0 differences in outcome, verdict or score).

## Other design notes (candidate EXE entries)

- **CR-003:** `sweepStaging` = `sweepExpired` (one locked delete), then `store.list()` outside the lock, then, only when old files were found, one `writeTx` that re-reads the owned paths and removes the unowned ones. This is safe without a re-stat under the lock: a stage renames its file into place and inserts its row in the same locked transaction, every row delete also removes its file, and a temp file's UUID name is never reused. In the common case of no old files, the second transaction is skipped.
- **CR-004:** the inner `resolve(root, rel)` path guards and the `join(root, 'staging', …)` walks also moved to `runtimePath`. Relative joins (`join('staging', agent, sha)`, `join('thumbs', …)`) are left as they are, since they are not rooted at DATA_DIR.
- **CR-005:** the replay verdict is `harvest_events.final_verdict ?? run.verdict`, while `score` and `checks` stay the latest run's. This matches `listPickings` (`pickings.ts:135`).
- **CR-006:** the new log reason `decode_failed` is not cached. It covers an errno `code`, `/memory|alloc|resource|too many open files/` and any unrecognised error. `undecodable` (cached) is now limited to sharp's content errors: unsupported image format, corrupt header, premature end, no image, `heif:`. A genuinely corrupt file with an unrecognised message is re-decoded on each request, which is bounded by the 2 decode slots.
- **CR-007:** a new shared helper, `errFields(err)` in `src/lib/log.ts` (additive), returns `{ errClass, code?, rawCode? }`. It walks the cause chain (depth 5) and accepts only constant-style codes (`/^[A-Z][A-Z0-9_]{1,63}$/`), never a message. It is used for `capture.failed` and both `capture.route_failed` lines.

## Gates (final HEAD `0a05f44`)

- `pnpm typecheck`: pass.
- `pnpm lint`: pass (exit 0).
- `TZ=UTC pnpm test`: 266 files, 2595 tests passed.
- `TZ=America/Los_Angeles pnpm test`: 266 files, 2595 tests passed.
- `pnpm eval` (local, fixture, hashchain): PASS, 103 active, 99 passed, 4 failed (EVAL-055, 056, 103, 122). These are the same 4 failures as in baseline-v1, and every case's outcome, verdict and score is identical to baseline-v1. Results are in `evals/results/local/` (git-ignored).
- e2e (`E2E_PORT=4460`, fresh `.e2e-data`, Playwright-managed server, stopped on exit): capture-staging, capture-sweep, capture-verdict, capture-photos, field-pickings, field-retry, admin-review and demo-attacks gave 127 passed, 9 skipped, 0 failed (17.5 min). I then removed `.next`, `.e2e-data`, `test-results` and `playwright-report`.
- `pnpm test:evm` and `contracts:test`: not run, because EVM and agreements code was not touched.

## Deviations

- The full suite takes about 15 minutes on this loaded VM. CR-001's commit ran the full `typecheck && lint && test`. CR-002 to CR-007 were each committed after typecheck, eslint on the touched files and the affected unit and integration files. The full gates in both time zones were run once on the final HEAD, and all passed.
- The container restarted mid-run, after the CR-004 edits and before its commit. The edits were intact, and I re-verified them (lint, typecheck, tests) before committing.
