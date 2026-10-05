# M-001 formal run (TKT-21 Phase B): runbook

This is the order that produces the M-001 gate's formal results. Every number in the gate report must come from one commit (CF-12), and `pnpm eval:release` checks that. It fails closed on anything else.

- **Simulated end to end:** `evals/harness/m001-sequence.test.ts` runs this sequence in a temporary git repository with fixture runners.
- **Where the guards live:**
  - `evals/harness/tree-state.ts` decides what counts as a clean tree.
  - `evals/harness/test-suites.ts` writes the suite run records.
  - `evals/harness/release.ts` checks provenance, and `run.ts` `regate` re-derives the gates.

## What "clean" means here

During the sequence the tree must hold the gate commit, unchanged. The only extra files allowed are the untracked formal outputs that the sequence itself writes:

- `evals/results/eval-run-*.json` (this includes the release file `eval-run-v1-release-*.json`)
- `evals/results/baseline-v1.json`
- `evals/results/baseline-perf-v1.json`
- `evals/reports/eval-report-*.md`

Anything else makes the tree dirty: a modified tracked file (a committed results file included) or any other untracked file. So does a tracked file flagged `--skip-worktree` or `--assume-unchanged` (`git ls-files -v` shows `S` or a lower-case tag), because `git status` cannot see its edits. Clear such flags with `git update-index --no-skip-worktree --no-assume-unchanged <file>` before step 1. Git-ignored files never count, so the suite reports under `evals/results/local/` are fine.

## The sequence

Run every step in the same checkout, at the same HEAD. Do not commit, check out, stash or edit anything between step 1 and step 6.

1. **Clean tree at the gate commit.**
   - `git status --porcelain --untracked-files=all` prints nothing.
   - Run `pnpm install --frozen-lockfile`.
   - No server may be listening on the Playwright ports: `E2E_PORT` if set, else 3100 for e2e and 3330 for the demo. `eval:e2e` refuses a port that is already served, because Playwright would reuse that server and it may run other code.
2. **`pnpm eval:ready`.** It must print READY, with the HR3 `WARNING:` line (TP29). Steps 3 and 5 check this themselves and refuse a NOT READY dataset; the HR3 warning stays a warning, and the release report prints it.
3. **`pnpm eval --baseline=v1`.**
   - It refuses a tree that is not fully clean, a NOT READY dataset, and `--seed` (the formal run takes the harness's default seed, recorded as `provenance.seedPolicy: default`). It also refuses if the baseline already exists.
   - It writes:
     - `evals/results/eval-run-{appVersion}-{sha}.json`
     - `evals/results/baseline-v1.json` (a byte-identical copy)
     - `evals/reports/eval-report-{appVersion}-{sha}.md`
     - `evals/reports/eval-report-baseline-v1.md`
   - TC-016: `tsx evals/harness/report.ts evals/results/baseline-v1.json > /tmp/r.md && cmp /tmp/r.md evals/reports/eval-report-baseline-v1.md`. Write the rendered copy outside the repo, never into `evals/reports/`.
4. **`pnpm eval:perf`.**
   - Start a production server outside the Playwright ports:
     - `pnpm build`
     - `DATA_DIR=<scratch dir outside the repo> E2E=1 ./node_modules/.bin/next start -p <port> &`. Record its PID.
   - Then run `pnpm eval:perf --target=http://localhost:<port> --only=s4 --runs=10 --data-dir=<same scratch dir> --out=evals/results/baseline-perf-v1.json`.
   - Stop the server by its PID.
   - The perf file records the git commit and a `dirty` flag. `dirty` counts the formal outputs from step 3 as clean.
   - Run on a quiet host (OD-8).
5. **The suites and the release, at the same HEAD:**

   ```
   E2E_PORT=<free port> pnpm eval:release --milestone=M1 --out=formal \
     --harness=evals/results/eval-run-{appVersion}-{sha}.json \
     --perf=evals/results/baseline-perf-v1.json
   ```

   - It refuses (exit 2, nothing run) when:
     - the tree is dirty;
     - `--reuse` is given, or the milestone is not M1;
     - `pnpm eval:ready` is NOT READY;
     - a formal release file of this commit already exists (`eval-run-v1-release-{sha}.json` or any `-rN`): a formal release runs once per commit, so a failed attempt is recorded, never retried until it passes;
     - `--harness` or `--perf` is missing, not in `evals/results/`, or not a regular file (a symlink is refused);
     - the `--harness` file was not made with the step 3 options: full config, fixture provider, both harness suites, the hash-chain ledger, milestone M1 and the default seed.
   - Then it runs `eval:integration` and `eval:e2e` itself, into `evals/results/local/`. Each report gets a run record (`*.run.json`) with the commit and tree state before and after, the exit code and the report's SHA-256.
   - It writes `evals/results/eval-run-v1-release-{sha}.json` and `evals/reports/eval-report-v1.md`.
   - Exit 1 is a gate result, not an error. Record it; do not change thresholds or cases (TSK-21.6).
6. **One commit with every formal file.**
   - `git status --porcelain --untracked-files=all` must list only the formal outputs of steps 3–5. That is seven files.
   - `git add evals/results evals/reports`
   - `git commit` with the subject `Record the M-001 formal evaluation, baseline-v1 and the S4 baseline (TASK-22)`.
   - This replaces the plan's three separate commits for TSK-21.3, 21.4 and 21.5. The release must run before any of these files is committed, or HEAD would no longer be the commit the harness and perf files name.

If a step fails or is refused before step 6, stop and report it. Never edit, move or delete an output file, and never rerun step 3: `baseline-v1` is written once (EV13).

## What makes the release fail

Each of these is a problem. A problem fails `S7-release`, and the harness-integrity scorer (`releaseIntegrity`) decides that gate.

- **The release tree.** The tree is dirty at the start or the end, or HEAD moved during the run.
- **The harness file.**
  - It is from another commit or from a dirty tree.
  - Its stored gates, critical conditions or exit code disagree with what its own cases give. `regate` re-derives each verifier case's outcome from its stored `verify()` result, using the dataset's expectations and the thresholds in code.
- **The perf file.**
  - It is from another commit or from a dirty tree.
  - Its stored `pass` or threshold disagrees with its raw runs. S4 needs at least 10 loads, each `verified` and under `S4_THRESHOLD_MS`.
- **A suite report.**
  - It has no run record, or its record names another commit or a dirty tree before or after the run.
  - The run was refused or exited non-zero.
  - Its SHA-256 differs from the one its run left. The run record guards against a stale report or an accident, not against forgery: whoever edits the git-ignored report can also edit its record.
  - Vitest reports `success` other than true.
  - Playwright reports `stats.unexpected > 0`, reports errors, or has no `stats`.
- **A test title.**
  - It names an EVAL ID that is not in the dataset.
  - EVAL IDs are read only as whole IDs. An ID written as part of a range (`EVAL-058..063`, `EVAL-100–102`) maps to nothing; the report lists such titles.
- **The M3 deferral.** An M3 case has no deferral ticket.
