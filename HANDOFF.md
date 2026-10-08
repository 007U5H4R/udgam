# HANDOFF — Udgam

**Current stage:** Stage 11 · Deployment + Production Monitoring (`bw-deployment-production-monitoring`, **Opus 5.5 / Standard**). It covers M-003: TKT-27..29.
- **Status:** the cloud build is done and passes locally. Everything on the instance is BLOCKED on the owner's infrastructure (EXE52).
- **Approvals:** the owner approved the Stage 10 QA gate on 2026-10-06 (EXE52). `QA-report.md` stands at READY WITH ACCEPTED RISKS.
- **Exit criteria not met yet:** the app deployed and verified live, monitoring and alerting live, provenance recorded, rollback ready on the host. Stage 12 starts only after those.

## Read first
1. `docs/exec/ledger.md`, section "Stage 11 · M-003 cloud build": the tasks, reviews, QA findings and the BLOCKED list.
2. `docs/exec/stage11/m003-qa.md`: the independent QA gate (33 criteria: 0 FAIL, the TC-087–092 tests BLOCKED).
3. `docs/ops/deploy.md`: the runbook, including the BLOCKED on-instance commands. Also `docs/ops/monitoring.md` and `docs/ops/oracle-idle.md`.
4. `decisions.md`: EXE52–EXE55 (Stage 11 start, S3 mode, review rulings, probe rule).
5. `lesson-learnt.md`: written at this checkpoint. Append the deploy-time lessons after the live deploy.

## State of the branch
- **Branch:** `build/stage7` (PR 007U5H4R/udgam#1). It is **not merged to `main`**, and merging needs the owner's explicit go. Note that `uptime.yml`'s schedule only runs from `main`.
- **Built in the cloud:**
  - **TKT-27:** the arm64-ready image (pinned digests), Compose (read-only, capabilities dropped), Caddy (HSTS, X-Forwarded-For overwrite, body caps, unbuffered capture), an idempotent bootstrap, encrypted OCI backups with a fail-closed restore, and a health-gated deploy with rollback.
  - **TKT-28:** per-account provisioning (`node /app/accounts-create.mjs`), the per-agent storage budget, the disk check, https-only URLs, the entrypoint config check (EXE55), the hourly checkpoint, and an uptime probe that alerts on the oldest unsealed entry.
  - **TSK-29.1:** the S3 perf runner (EXE53).
- **Gates:**
  - unit and integration: 2976;
  - `test:tz`: both zones;
  - e2e: 952;
  - eval M1: unchanged, S1 97.7 %, S2 0 %, CF 0;
  - trace, bundle-secrets and gitleaks: clean;
  - the local restore drill passes: 18/18, same kid.
- **Open minor (follow-up at TC-089):** the rollback undo briefly restarts the older image before `deploy.sh` retags (ledger).

## Owner: what is needed to finish Stage 11
1. **Infrastructure:**
   - an Oracle A1 Flex instance (2 OCPU / 12 GB, Ubuntu 24.04 aarch64) with a block volume;
   - the domain, with an A record to the instance;
   - VCN ingress on 80 and 443;
   - SSH for the operator;
   - an OCI bucket with an instance-principal policy;
   - an `age` public key.
2. **Secrets, typed on the instance only:** the GFW key, the Copernicus client id and secret, and the map tile key if needed. They go into `/etc/udgam/app.env`.
3. **Choices:**
   - Pay-As-You-Go (recommended) or keep-busy (EXE54 / `oracle-idle.md`);
   - `BACKUP_MEDIA` on or off;
   - SEC-101: the feed's privacy shape;
   - whether to add a Docker CI job for the stack and drill tests (QA-M003-004).
4. **Merging `build/stage7` → `main`.** Required before `uptime.yml` can run on its schedule. The owner's call.
5. **Kannada native review:** 617+ strings, before a field pilot.
6. **The three new CI jobs as required checks on `main`:** `eval`, `test-tz`, `e2e`.

## Then (a session with SSH access to the instance)
1. Follow `docs/ops/deploy.md` "BLOCKED" in order:
   - bootstrap;
   - the arm64 build;
   - TC-087 (certificate issuer, HSTS, streaming, forged header; preferably on the EXE33 staging deployment);
   - TC-088 (the fresh-volume drill, never in place);
   - TC-089.
2. TC-090 (the alert drill once `uptime.yml` is on `main` and `UDGAM_DOMAIN` is set), TC-091 (the unfurl), TC-092.
3. TKT-29 on the EXE33 staging deployment:
   - the formal S3 run (`--formal --target-label=staging`, live providers, at most 100 captures per agent per day);
   - the 5 manual phone runs;
   - three consecutive rehearsals;
   - `eval:release` against the target, then the published report (TSK-29.4) and HR6.
4. Record evidence in the ledger, append to `lesson-learnt.md`, rewrite HANDOFF → Stage 12.

## Environment notes
- Never run `pnpm dev`. The sandbox may refuse command lines containing "eval"; call `tsx evals/...` instead.
- **Docker in the cloud VM:** start `dockerd &` first. Docker Hub rate-limits, so use the mirror build-args from `deploy.md`.
- Never run `deploy/bootstrap.sh` on a host other than the A1, except inside the test container.
- Script tests touching ownership must also pass as non-root (CI is non-root).
- Push in batches: CI cancels in-progress runs on every push, and e2e takes about 30 minutes.

## To sync locally (cloud can't)
- **Campfire:**
  - TASK-28, TASK-29 and TASK-30 move to "built, on-instance BLOCKED", with the ledger's Stage 11 rows as comments;
  - add the EXE52–EXE55 notes;
  - `docs/exec/campfire-sync.md` §3c–3e.
- **Obsidian vault and auto-memory:** mirror this HANDOFF, `QA-report.md`, `lesson-learnt.md` and `docs/exec/stage11/m003-qa.md`.

## Preserve
- All DISC#, S#, EV#, D#, TP#, EXE#, M-, TKT-, TC-, EVAL-, DES-, CR-, QA- and SEC- IDs, and the native TASK- IDs.
- The Design Freeze.
- cfg-1 and baseline-v1 (EV13, EXE34).
- `decisions.md` is append-only.
- The required CI job names.
