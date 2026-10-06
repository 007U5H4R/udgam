# Lessons learnt — Udgam (Stages 7–11, cloud session, 2026-10-05 → 2026-10-06)

This file was written at the Stage 11 cloud checkpoint. The live deployment (TKT-27..29 on the owner's Oracle A1) has not happened yet, so the deploy-time lessons get appended when it does. Each entry runs: situation → decision → outcome → lesson → future rule.

## 1. Fail-closed review found the real bugs in the "plumbing"
- **Situation.** Scripts that looked boring (backup retention, deploy health gate, restore) passed their authors' own local drills.
- **Decision.** Every task got two fresh reviewers: one checked it against the spec, one checked quality and security. Only two fix rounds were allowed.
- **Outcome.** The TKT-27 reviewers found four failure-path defects that every happy-path drill had missed:
  - `RETENTION_DAYS=0` would have deleted every backup;
  - a failed `compose up` passed the health gate on the old container;
  - a half-finished restore left no database or keys, and the next boot would quietly mint a new ledger key;
  - a failed build overwrote the rollback snapshot pointer.

  The S3 reviewers found a false-PASS path (a refusal timed as a verdict).
- **Lesson.** Drills prove the happy path. Reviews that ask "what if this step fails halfway?" find the expensive bugs.
- **Future rule.** Every operational script gets stub-based tests for its failure paths (retention, partial swap, gate on the wrong image) before it counts as done.

## 2. CI cancels in-progress runs, and a long e2e job turns pushes into lost evidence
- **Situation.** `ci.yml` cancels in-progress runs on each push to the branch, and e2e takes about 30 minutes. Pushing docs-only commits back to back cancelled the e2e run three times before a fix was ever verified on CI.
- **Decision.** Batch pushes. When a fix needs CI evidence, let one run finish before pushing again.
- **Outcome.** The QA-S9 fixes were confirmed only after pushes were held back.
- **Lesson.** Cancelling in-progress runs saves runner minutes but costs evidence when several agents push often.
- **Future rule.** Push at phase boundaries. Hold docs-only commits while a fix's e2e evidence is pending.

## 3. Pixel tests need a pinned rasteriser, not a looser threshold
- **Situation.** The OG image test passed locally and failed on CI with a mean difference of 2.9/255. Full Chrome follows the host's fontconfig, while CI's headless shell hints fonts differently.
- **Decision.** Pin fontconfig and the Chromium hinting flags in the renderer itself (EXE48). The threshold stayed where it was.
- **Outcome.** Renders became byte-identical across 12 combinations of binary and host config.
- **Future rule.** Any committed visual golden must be rendered by the same pinned pipeline the test uses.

## 4. Streaming frameworks race accessibility scanners
- **Situation.** axe reported a missing `document-title` in 1–2 of 16 runs. Next 16 commits the metadata boundary 30–66 ms after the page body.
- **Decision.** Every axe call goes through one helper that waits for a non-empty title, and a lint rule enforces it (EXE48).
- **Future rule.** Wrap third-party scanners behind one helper that waits for a settled page, and enforce it with lint.

## 5. Health-probe rules must match how the system ages
- **Situation.** The planned alert, "checkpoint older than 24 h", would have emailed every 15 minutes on any quiet pilot day, because checkpoints only seal new entries.
- **Decision.** Alert on the age of the oldest unsealed entry, and add an hourly sealing timer (EXE54, EXE55).
- **Future rule.** For every alert, ask what a healthy idle system reports, and add a test fixture for the quiet day.

## 6. Tests can touch the host
- **Situation.** A new test ran the real `bootstrap.sh` as root on the VM. The script ignored an unknown flag and started installing packages. It was reverted.
- **Decision.** Scripts parse their arguments before doing anything and refuse unknown ones. Host-changing scripts refuse a non-target architecture unless overridden. Tests run scripts only inside a sandbox with stubs on `PATH`.
- **Future rule.** A script that changes a host must refuse unknown arguments and the wrong host before any side effect.

## 7. Secret scanners scan history, so fake secrets in tests are forever
- **Situation.** A test's made-up string matched gitleaks' generic-api-key rule. Because the scan covers full history, a later edit could not remove it.
- **Decision.** A narrow allowlist for that exact line, rule and file. New fake secrets in tests are built at run time.
- **Future rule.** Never write secret-shaped literals in tests. Build them at run time.

## 8. Delegation needs explicit, recorded decisions
- **Situation.** The owner delegated decisions ("decide on my behalf") and waived the stage gates through Stage 10.
- **Decision.** Every delegated call became an append-only EXE entry (EXE24–EXE55), and the items that cannot be delegated were kept with the owner: the Kannada review, the accounts, merging to main and the public deploy.
- **Outcome.** The reviewers could check rulings against the record. Contradictions were caught and amended in later entries, such as EXE54 → EXE55.
- **Future rule.** Record a delegated decision before acting on it. Never delegate irreversible or externally visible actions.

## 9. Tests that pass as root can fail on CI's unprivileged runner
- **Situation.** A new rollback test injected a `chown` failure. The script only runs `chown` as root, and the cloud VM runs tests as root, so the test passed here and failed on GitHub's non-root runner.
- **Decision.** The test now declares the uid it needs through a stub. Its stubs are no-ops when they would only fail unprivileged. The CI failure was reproduced as uid 65534 before the fix.
- **Future rule.** Before trusting a script test that touches ownership or permissions, run it once as a non-root user.

## 10. Checks that need Docker drift if CI never runs them
- **Situation.** The restore drill and the stack tests run only where Docker is available, which is not in `pnpm test` or CI. A later production-URL rule broke the drill, and nothing noticed until the independent QA gate (QA-M003-001).
- **Future rule.** Every check that needs Docker gets one runner, either local or a CI job. Run it at every gate that touches deploy code.

## Reusable Rules for Future Projects
1. Every operational script needs failure-path tests run against stubs: retention, partial swap, a gate checking the right image, rollback with nothing to roll back to.
2. Two fresh reviewers per task (spec and quality/security), with a cap of two fix rounds.
3. Visual goldens use a pinned rendering pipeline. Accessibility scans wait for a settled page through one enforced helper.
4. Alert rules ship with a "healthy but idle" test fixture.
5. Host-changing scripts refuse unknown arguments and the wrong host before any side effect.
6. No secret-shaped literals in tests.
7. With cancel-in-progress CI, batch pushes and let evidence runs finish.
8. Script tests that touch permissions run once as a non-root user, and Docker-only checks get one runner used at every gate.

## Candidate Global CLAUDE.md Improvements
These are recommendations only; the global file must not be edited automatically.

| Suggestion | Evidence | Scope | Recommendation |
|---|---|---|---|
| Add "operational scripts need failure-path tests with stubs" to the Definition of Done | TKT-27 review Q1–Q4 | Generalisable | Adopt |
| Add "batch pushes when CI cancels in-progress runs and e2e is long" | Stage 9 and 10: three cancelled e2e runs | Generalisable to repos with long e2e | Adopt as guidance |
| Add "tests must never run host-changing scripts outside a sandbox" | Stage 11 bootstrap incident | Generalisable | Adopt |
| Add "every alert rule needs an idle-system fixture" | EXE55 | Generalisable | Adopt |
