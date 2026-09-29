# Campfire sync — Stage 7, as of build/stage7 on 2026-09-29 (P1–P5 gated, P6 in flight)

Campfire is local-only (TP22). The cloud session never edits `backlog/`, so the **local** session runs this, per technical-plan §21.3. The source of truth is `docs/exec/ledger.md` on `origin/build/stage7`. This sheet is that ledger turned into commands.

## Before you run
```sh
git fetch origin build/stage7
git show origin/build/stage7:docs/exec/ledger.md | less    # skim the gate sections P1–P4 and the P5 task rows
CF="/Volumes/E Drive/Dev/Code/Claude/PM Tools/backlog-md-fork/dist/backlog"
```
Run the commands from the repo root on `main`, where `backlog/` lives. If the fork's CLI has a Definition-of-Done flag, also tick DoD #1–#3 on the tickets marked Done below; if it has none, leave DoD as it is and don't fake the field.

## 1 · Done: phase gates passed (P1–P4)
```sh
"$CF" task edit TASK-2  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 --check-ac 6 --check-ac 7 \
  --append-notes "Gate P1 PASS 2026-09-29. 414265a…8cb00c9, fix bb63901/b35168a. TC-001(part), TC-002, TC-003, TC-004, TC-005 PASS. TC-003 CI proof: canary 586497d failed gitleaks in run 36556519116. First green CI run 36556265660. EXE2."
"$CF" task edit TASK-3  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 --check-ac 6 \
  --append-notes "Gate P2 PASS 2026-09-29. 72bfd52…8927b17, fix d43d586, 802e0a2. TC-006–013, EVAL-001, 002, 018, 022, 030, 053, 066, 067 PASS. EXE3."
"$CF" task edit TASK-4  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P3 PASS 2026-09-29. 3f79e16…6b0c538 (merge 85c1861), fix 172ce90. TC-014–017, EVAL-091, 092 PASS. baseline-v0-ledger-only: detection 0/26. EXE4."
"$CF" task edit TASK-5  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 \
  --append-notes "Gate P3 PASS 2026-09-29. 9f0b08d…f8ac500 (merge edcf4d3), fix 41384f0. TC-018, TC-019 (org part), TC-020, TC-080, TC-081 PASS. EXE5."
"$CF" task edit TASK-6  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P4 PASS 2026-09-29. e690212…cd692ff (merge 0594e60), fix e69b18d. TC-021–025, EVAL-051, 052, 054, 082 PASS. EXE7. Follow-up EXE13 (opaque seeded user IDs, TC-022 wording) in flight as a TASK-6 commit."
"$CF" task edit TASK-7  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 --check-ac 6 \
  --append-notes "Gate P4 PASS 2026-09-29. 82976cf…becd162 (merge 6164c32), fix 19484dc (merge 1a58451). TC-026, 027, 028 (edit half), 029, EVAL-005, 026 PASS. EVAL-044 cache half → TKT-07. EXE8."
"$CF" task edit TASK-16 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P4 PASS 2026-09-29. 641de72…99f4042 (merge b617732; migrations 0003/0004), fix 68efd3b. TC-001 (ledger), TC-061–064, EVAL-058–063, 065 PASS. Clean-room doc sufficiency YES x3. EXE9."
```

## 2 · Reopened by an owner decision
```sh
"$CF" task edit TASK-9  -s "In Progress" --check-ac 1 --check-ac 2 --check-ac 3 \
  --append-notes "Gate P4 PASS 2026-09-29 (9300814…c5abee6, merge 2fb9927; dataset 0.3.0, EVAL-110–113). Reopened by owner decision EXE10: an EXIF gap over 24 h fails, judged by the worst photo; EVAL-034 flag→fail; EVAL-122/123 added. EVAL-055/056 stay scenario-6 stretch misses."
```

## 3 · P5 in flight
```sh
"$CF" task edit TASK-19 -s "In Review" --append-notes "Merged ea70ec3…3633fd3 + follow-up (merge c67b234). Both reviews PASS. TC-073, EVAL-058–063 PASS. Awaiting QA P5."
"$CF" task edit TASK-15 -s "In Review" --append-notes "Merged e9c5bde…46d15a0 (merge 4121cb1). Both reviews PASS. TC-059, 060, EVAL-077, 080 PASS. Awaiting QA P5."
"$CF" task edit TASK-14 -s "In Review" --append-notes "Merged 7480552…5121983, CI green. Both reviews PASS; minor/nit follow-up queued. TC-058, EVAL-079 PASS. Awaiting QA P5."
"$CF" task edit TASK-20 -s "In Progress" --append-notes "Merged 759a3b5…190858a. Spec review PASS; quality review FAIL → fix round 1 running. SQLITE_BUSY root cause fixed (shared DB handle)."
"$CF" task edit TASK-8  -s "In Progress" --append-notes "Merged 0699ef8…643882e (merge 7a495b3). Spec review PASS; quality review FAIL → fix round 1 queued, now also carrying owner decision EXE12 (production refuses the fixture provider; '(demo data)' suffix)."
"$CF" task edit TASK-10 -s "In Progress" --append-notes "Implementer running. Owner decision EXE11 (re-check replayed rejected captures; partial unique index) sent to it."
"$CF" task edit TASK-11 -s "In Progress" --append-notes "Implementer running."
```

## 3b · P5 gated (supersedes section 3; run these instead of section 3's commands)
Gate P5 PASS 2026-09-29 (docs/exec/ledger.md "Gate P5"). AC counts from `backlog/tasks`; tick all.
```sh
"$CF" task edit TASK-8  -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 --check-ac 6 --append-notes "Gate P5 PASS. Merge 7a495b3, fix 3cf4120 (merge 80fb421). TC-030–034, EVAL-015–017, 044, 106–108 PASS. EXE12, EXE18."
"$CF" task edit TASK-9  -s Done --append-notes "EXE10 (EXIF gap over 24 h fails, worst photo) merged 425a146; EVAL-034 now passes. EVAL-122 and EVAL-116's substring are owner items (m-001-gate.md OD-1, OD-2)."
"$CF" task edit TASK-10 -s Done --append-notes "Gate P5 PASS. Merge 90e8bef (migrations 0014/0015), fix merge 3a65b11. TC-038–042, EVAL-068, 114–121 PASS; EXE11 guarantees tested. EXE20. EVAL-049 → owner (OD-3)."
"$CF" task edit TASK-11 -s Done --append-notes "Gate P5 PASS. Merge 1f53b52, fix merge a93d66c, EV9 t1 2bc4d48. TC-043–049, TC-080/081, EVAL-086, 089 PASS. D5 'when' line → owner (OD-5)."
"$CF" task edit TASK-14 -s Done --append-notes "Gate P5 PASS. 7480552…5121983, follow-up merge 009b96b. TC-057, TC-058 (plot page), EVAL-079 PASS; the batch-detail organic line is a follow-up (QA-P5-2). EXE19."
"$CF" task edit TASK-15 -s Done --append-notes "Gate P5 PASS. Merge 4121cb1. TC-019 (batch part), TC-059, TC-060, EVAL-077, 080 PASS. EXE16."
"$CF" task edit TASK-19 -s Done --append-notes "Gate P5 PASS. Merge c67b234. TC-073, EVAL-058–063 PASS; TC-073's brief part → owner (OD-6). EXE15."
"$CF" task edit TASK-20 -s Done --append-notes "Gate P5 PASS after 2 fix rounds (merges a340255, cd7830b; migration 0016). TC-074–076, EVAL-081, 083, 085 PASS. EXE17."
"$CF" task edit TASK-12 -s "In Progress" --append-notes "P6 implementer running (base c26bf36)."
"$CF" task edit TASK-13 -s "In Progress" --append-notes "P6 implementer running (base c26bf36)."
"$CF" task edit TASK-17 -s "In Progress" --append-notes "P6 implementer running (base c26bf36)."
```
Tick every acceptance criterion on TASK-10, 11, 14, 15, 19 and 20 with `--check-ac 1 … n`; get n with `grep -c '^- \[' ` inside the AC block, as in section 1. The acceptance criteria were demonstrated at Gate P5.

## 4 · Not touched
- TASK-12, 13, 17, 18, 21, 22, 31 (P6–P9) and the M-002 tickets TASK-23–27 stay To Do. M-003 (TASK-28–30) is out of scope for this Stage 7 run.
- There are no BUG rows in the ledger yet, so there are no Campfire bugs to create.
- Decisions EXE1–EXE14 are in `decisions.md` on `build/stage7`. Campfire's Decisions view reads the checkout it runs on, so they appear once `build/stage7` reaches `main`, or when you point Campfire at a checkout of that branch.

## 5 · Obsidian vault and memory (local)
Mirror these to the vault:
- the P1–P4 gate sections of the ledger;
- the owner decisions EXE10–EXE14;
- branch protection on `main` (required checks `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`; keep those job names).
