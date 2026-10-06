# Stage 9 CR fix wave — area `web` (CR-100–CR-106)

- **Worktree:** `/home/user/udgam/.claude/worktrees/agent-a9ecab00fa50ef515`
- **Branch:** `worktree-agent-a9ecab00fa50ef515`, based on build/stage7 `b81bea0`. Not pushed.
- **Container restart:** the run was interrupted once. The uncommitted work survived and was reviewed, then committed as planned. Stale `.next` and `.e2e-data` were deleted before e2e.

## CR table

| CR | Commit | Test / verification | Status |
|---|---|---|---|
| CR-100 | `a65548b` Give the admin, enrol and sign-in routes designed error boundaries (CR-100) (TASK-7); `44f3024` Check the Phones page's recovery by its error state, not any alert (CR-100) (TASK-7) | `tests/field-error-boundaries.test.ts`: new describe block. It checks that each route-group root (admin, buyer, processor, enrol, field, sign-in) has an error.tsx, and that every page under src/app sits under one. Exempt: `verify`, `/` and `__test__`. No boundary shows `error.message/digest/stack`. Failed first: 3 roots and 9 pages uncovered. `src/app/(admin)/admin/plots/transitions.test.tsx` (jsdom): Check again, Save plot and Save boundary with a rejected action. Failed first: unhandled TypeError / REJECTED. `src/app/(admin)/admin/phones/PhonesClient.test.tsx` (jsdom): Issue code, Revoke, Remove and Add with a rejected action. Failed first: the error was rethrown. `e2e/office-errors.spec.ts` (`?state=throw`, the existing gate): 6 admin routes in the shell (h1, rail aria-current, no overflow), Try again re-renders, sign-in in en+kn, /enrol. Passes on phone and desktop. | FIXED |
| CR-101 = DES-030 | `3b0efb6` Let the photo slots shrink and wrap at 320 px in Kannada (CR-101, DES-030) (TASK-11) | The `e2e/capture-photos.spec.ts` test "photos step at 320 px in Kannada" failed first with scrollWidth **323** > 320 and passes after the fix (phone and desktop projects; viewport forced to 320×568). | FIXED |
| CR-102 | `cbf58e3` Build the demo and certificate DATA_DIR paths through runtimePath (CR-102) (TASK-21) | `tests/runtime-path-app.test.ts`: no src/app file imports `join`/`resolve` from node:path, and both readers use `runtimePath`. Failed first: attacks.ts:join, route.ts:resolve. `demo.int.test.ts` and the attestation `route.int.test.ts` stay green. `node scripts/ci/check-trace.mjs .next` → "48 trace files, no data, key or secret file traced". | FIXED |
| CR-103 | `e91eb13` Delete the unused TKT-04 placeholder shell (CR-103) (TASK-5) | `grep` finds no reference; typecheck and build are green. | FIXED |
| CR-104 | `bd4ce6a` Decide the test-only forced states by one shared rule (CR-104) (TASK-12) | `src/lib/config/test-surfaces.test.ts` covers the gate, the whitelist and throwIfForced. A grep test fails if any src file re-implements `NODE_ENV … 'production' … E2E … '1'`. Failed first: the module was missing. The existing `route-state.test.ts`, `plots/state.test.ts` and `dev-state.int.test.ts` stay green. | FIXED |
| CR-105 | — | Not cheap. 22 client modules import `t` directly, and shared server components pulled into client graphs (Rail, VerdictChip, TabBar) call it with a runtime language. Keeping `kn` out of the office bundles needs either async dictionary loading (Suspense/hydration change on every signed-in page) or threading words as props through about 20 components. Both are broad, risky changes for a nit that is inside the 200 KB budget (technical-plan §18). | SKIPPED (not cheap/safe) |
| CR-106 | `518d702` Log the error code beside the class on web failures (CR-106) (TASK-13) | `tests/err-fields.test.ts` covers `errFields` (class + `errCode`; no message; codes must be plain identifiers ≤ 64). A grep test fails if a web-area `log.*` call builds `errClass` by hand. Failed first: the module was missing. The existing `sign-in/actions.test.ts` and `demo.int.test.ts` log assertions stay green. 13 server files are covered; `api/` and `.well-known` are left to core (CR-007). | FIXED (web side) |

## Gates (final tree, HEAD `44f3024`)
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0.
- `TZ=UTC pnpm test`: 271 files, 2601 tests passed.
- `TZ=America/Los_Angeles pnpm test`: 271 files, 2601 tests passed.
- e2e (port 4480, fresh `.e2e-data`, `--project phone --project desktop`): office-errors, capture-photos, field-errors, phones, admin-plots, sign-in, enrol, attestation, m2-agreements, admin-review, m2-processing, field-pickings, capture-home, office-shell and certificate-states. Result: **214 passed, 2 skipped** (pre-existing project-conditional skips in admin-plots), 0 failed. Build clean.
- `check-trace.mjs .next`: clean.
- No EVM/agreements code touched, so `test:evm` and `contracts:test` were not run.
- Cleanup: `.next`, `.e2e-data`, `test-results` and `playwright-report` were deleted.

## Deviations (candidate EXE#)
1. **CR-100 copy.**
   - The admin boundary is English-only and has its copy inline, like the other admin plot copy (N5). The new i18n prefixes `rail.`/`phones.` are reserved as English-only, so the copy did not go into en.ts.
   - Sign-in and enrol got new keys `signIn.crash.*` and `enrol.crash.*` in en.ts and kn.ts. The Kannada strings are drafts marked `REVIEW: native speaker`, which adds them to the pending native review (EXE43).
   - The admin boundary picks the rail section from the path: Agreements → Batches and Demo tools → Review, as those pages do. It reuses the batch screens' StateCard and the amber Pill (TP17).
   - The sign-in screen gains one `.retry` layout class, a copy of enrol's `.done`. It uses no new tokens.
2. **CR-100 `?state=throw`.** This is now honoured on the admin Plots (list/new/detail), Phones and Agreements (list/detail) pages, on /enrol and on /sign-in, through the shared CR-104 gate. It is off in a production deployment without E2E=1, as today. Demo tools is not wired: it is 404 in e2e.
3. **CR-100 scope.** No `global-error.tsx` was added, and the root `/` (redirect-only) is exempt. Buyer and processor already had root boundaries. Their `reset`-only retry (no `router.refresh`) was left unchanged; a follow-up could switch them to `useRetry`.
4. **CR-106.** Only `errClass` + `errCode` are logged. The CR also suggested logging `err.message` for non-libSQL errors; that was not done, because messages can carry SQL text or user data (§15 privacy). The helper lives in `src/app/_log/err-fields.ts` so it cannot collide with core's CR-007 changes in `src/lib/log.ts`. The two may be merged later. The client `console.error` calls (EnrolClient, RecordFlow, send-picking) are unchanged.
5. **CR-104.** Each screen keeps its exported helper name and whitelist as a one-line wrapper, which keeps call sites unchanged. The rule itself exists once.

## Shared files touched
`src/lib/i18n/en.ts` and `kn.ts` (additive: 6 keys each).
