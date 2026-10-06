# Campfire sync — Stage 7, as of build/stage7 @ eb321a1 on 2026-10-05 (P1–P8 and M-002 gated; P9 = TKT-21 formal run pending)

Campfire is local-only (TP22). The cloud session never edits `backlog/`, so the **local** session runs this, per technical-plan §21.3. The source of truth is `docs/exec/ledger.md` on `origin/build/stage7`. This sheet is that ledger turned into commands.

## Before you run
```sh
git fetch origin build/stage7
git show origin/build/stage7:docs/exec/ledger.md | less    # skim the gate sections (P1–P5, M-002, P6–P8) and the task rows
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

## 3c · P6–P8 and M-002 gated, P9 in progress (supersedes the TASK-12/13/17 lines at the end of section 3b)
Gate P6–P8 PASS 2026-10-05 and Gate M-002 PASS 2026-10-05, both from independent QA at 3b625cd (docs/exec/ledger.md "Gate P6–P8" and "Gate M-002"). Follow-ups were merged afterwards: a9660b1 (P5 follow-ups and re-review minors), 29335b5 (follow-up 2) and eb321a1 (follow-up 3). The AC counts come from `backlog/tasks`. The number of `--check-ac` flags on each line is the count; where a criterion is left unticked, the note says why.

**P6–P8 (Done):**
```sh
"$CF" task edit TASK-12 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge 1153ae2 (i18n literals 9d46705), fix merge d375a8f; r2 minors 856b67f (in a9660b1). TC-050–053, TC-080/081, EVAL-068, 088 PASS. Spec FAIL → PASS (r2), quality PASS. Kannada awaits native review. EXE37."
"$CF" task edit TASK-13 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 --check-ac 6 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge 9afb24f, fix merge 7fbeaf7 (migration 0021); r2 items 2ac6da6, 5b18736 (migration 0033, in a9660b1). TC-054–057, TC-080/081, EVAL-069, 075, 076 PASS. Re-run retries every unavailable check by kind (EXE18). Spec and quality FAIL → PASS (r2). EXE37."
"$CF" task edit TASK-17 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge 46c628f, fix merge d40f8e0; follow-ups d0ec2df (DK outline out of Kerala), 613b6ff (proof_failed bucket). TC-065–069, TC-080/081, EVAL-064 PASS. EVAL-071 (S4) and verify ≤ 300 ms are measured formally in TKT-21. Spec PASS, quality FAIL → PASS (r2). EXE24, EXE28, EXE37."
"$CF" task edit TASK-18 -s Done --check-ac 1 --check-ac 2 --check-ac 3 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge bcb6650, fix merge 178f78d; EXE26 MultiPoint 7187a88 (in a9660b1). TC-067 (GeoJSON), TC-070, TC-072, EVAL-078 PASS; TC-071 and EVAL-087 PARTIAL (no QR on the printed certificate, QA-P6-8-4 → Stage 8). The frozen OG image says Kodagu Arabica for every batch → Stage 8. Spec PASS, quality FAIL → PASS (r2). EXE26, EXE37."
"$CF" task edit TASK-31 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 --check-ac 5 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge a2ef5d7 (migrations 0022/0023); follow-ups 387dee8 (EXE25, in a9660b1), de18f90 (eb321a1). TC-093, TC-094 (amended by EXE25), EVAL-070 staged split PASS: Submit → verdict 3.9 s staged vs 25.1 s not staged. Both reviews PASS. EXE25, EXE37."
"$CF" task edit TASK-21 -s Done --check-ac 1 --check-ac 2 --check-ac 3 \
  --append-notes "Gate P6–P8 PASS 2026-10-05. Merge 48eff91 (migration 0035), fix merges 94cab86, 3b625cd; doc 1826552 (eb321a1). TC-077, TC-078, EVAL-073, 074 PASS; EVAL-124–149 appended (dataset 0.8.0). pnpm demo 6/6. Spec PASS, quality FAIL → PASS (r2). EXE33, EXE35."
```

**P9 (In Progress):**
```sh
"$CF" task edit TASK-22 -s "In Progress" \
  --append-notes "Phase A merged: readiness, baseline freeze guard, release evaluation (97d2f5b); fix round 1 db18028; re-review residuals 6089c8b. Owner eval decisions merged 87b8547 (dataset 0.7.0; EVAL-116, EVAL-049). Readiness READY with the HR3 warning (TP29). Phase B, the formal baseline-v1 run (docs/exec/m-001-formal-run.md), is pending, so no AC is ticked. EXE23, EXE27, EXE34, EXE36."
```

**M-002 (Done):**
```sh
"$CF" task edit TASK-23 -s Done --check-ac 1 --check-ac 2 \
  --append-notes "Gate M-002 PASS 2026-10-05. Merge 4e0620b; hardening 6b32add, 6531954 (in a9660b1). GO: Foundry 1.8.3 / solc 0.8.37 (docs/spikes/foundry.md). arm64 execution deferred to TSK-27.1. Both reviews PASS. EXE37."
"$CF" task edit TASK-24 -s Done --check-ac 1 \
  --append-notes "Gate M-002 PASS 2026-10-05. Merges 8448deb (D9), 059f9a8 (D10). Review FAIL → PASS (r2). AC #2 is left unticked: D9/D10 were accepted under the owner's blanket waiver (EXE1) and await the owner's review at Stage 8."
"$CF" task edit TASK-25 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 \
  --append-notes "Gate M-002 PASS 2026-10-05. Merge 1de887b, fix merge 0d1c4a6 (migrations 0024/0025); r2 minors 34c2286 (in a9660b1). EVAL-103 PASS (--ledger=evm --milestone=M2), S6-lib 8/8. viem 2.56.9. Spec PASS, quality FAIL → PASS (r2). EXE23 (OD-9), EXE37."
"$CF" task edit TASK-26 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 \
  --append-notes "Gate M-002 PASS 2026-10-05. Merge 84703f7 (migrations 0026/0027), fix merge b03989e (0031/0032), follow-up 29335b5; dd99c0c. TC-084, TC-085, EVAL-093–099, 105 PASS. Spec PASS, quality FAIL → PASS (r2). EXE29, EXE30."
"$CF" task edit TASK-27 -s Done --check-ac 1 --check-ac 2 --check-ac 3 --check-ac 4 \
  --append-notes "Gate M-002 PASS 2026-10-05. Merge 0c4a38e (migrations 0028–0030), follow-up 29335b5 (0034); 2e786d1, 0531b89. TC-086, EVAL-100–102 PASS. Both reviews PASS. Pulping and drying bands are placeholders (pre-pilot). EXE29, EXE31, EXE32."
```

**Notes on tickets already Done (no status change):**
```sh
"$CF" task edit TASK-11 --append-notes "EVAL-086 capture e2e at 375/768 px: merges 2fe0463, 5643025, 0b1fb29 (2 fix rounds, final review PASS). P5 follow-ups in a9660b1 (OD-5 copy 7b1ef3a, no-break spaces, hydration waits); 1405f36 (eb321a1)."
"$CF" task edit TASK-15 --append-notes "QA-P5-2 fixed: the organic line shows on batch detail (71f86b9, in a9660b1)."
"$CF" task edit TASK-9  --append-notes "QA-P5-5 fixed: time-gap evidence stays on the right side of its limit (14ba2a9, in a9660b1)."
```

## 3d · Stages 8 and 9 complete (2026-10-06)
- **Stage 8 · Design Critique:** clean (`docs/exec/stage8/README.md`). Its fixes landed on the existing TASK cards (see the commit subjects); no new cards.
- **Stage 9 · Code Review + Test & Eval:** complete (`docs/exec/stage9/README.md`). Add a comment to each touched card with the CR/QA ID and the commit:
  - TASK-3, TASK-10, TASK-11, TASK-13, TASK-20, TASK-31: CR-001–008, CR-107;
  - TASK-5, TASK-7, TASK-12, TASK-14, TASK-21: CR-100–104;
  - TASK-2, TASK-4, TASK-19, TASK-22, TASK-25, TASK-26: CR-200–206, CR-100 retry;
  - TASK-18: QA-S9-001, bdf8469;
  - TASK-26 and TASK-27: QA-S9-002, 97a08a4.
- Stage 10 is in progress; no card changes until its gate.

## 3e · Stage 10 complete (2026-10-06): the QA gate is READY WITH ACCEPTED RISKS
- Add a comment with the SEC ID and commit to each touched card. The full list is in the ledger's Stage 10 section.
  - TASK-2: SEC-102, SEC-201, SEC-202, QA-S10-001.
  - TASK-8: SEC-100, SEC-103.
  - TASK-20: SEC-002, SEC-004, SEC-007.
  - TASK-26: SEC-200.
  - TASK-31: SEC-004, the stage slots.
- Add the new acceptance items from `tickets.md` (EXE51) to TASK-28 (TKT-27) and TASK-29 (TKT-28).
- M-003 waits for the owner's approval of the gate.

## 3f · Stage 11 cloud build (2026-10-06): M-003 built locally, on-instance work BLOCKED
- **TASK-28 (TKT-27), TASK-29 (TKT-28) and TASK-30 (TKT-29, the TSK-29.1 part only):** move each to "built, on-instance BLOCKED". Add the ledger's Stage 11 table rows as comments, with the merge SHAs 85945ab, c4a434f, f0da2fe and 37efa1e.
- **Note EXE52–EXE55** on those cards.
- **On TASK-28,** list the BLOCKED tests TC-087, TC-088 and TC-089; **on TASK-29,** TC-090, TC-091 and TC-092; **on TASK-30,** TSK-29.2 to 29.4.

## 4 · Not touched
- M-003 (TASK-28, 29, 30) stays To Do. It is out of scope for this Stage 7 run.
- There are no BUG rows in the ledger, so there are no Campfire bugs to create.
- Decisions EXE1–EXE37, D9 and D10 are in `decisions.md` on `build/stage7`. Campfire's Decisions view reads the checkout it runs on. They appear once `build/stage7` reaches `main`, or when you point Campfire at a checkout of that branch.

## 5 · Obsidian vault and memory (local)
Mirror these to the vault:
- the gate sections of the ledger: P1–P5, M-002 and P6–P8;
- the owner decisions EXE10–EXE14, EXE22, EXE23 and EXE27, and the delegated decisions EXE24, EXE28 and EXE29;
- D9/D10, which await the owner's review at Stage 8;
- `docs/exec/stage7-report.md`, once the formal M-001 run fills its results;
- branch protection on `main` (required checks `audit (production dependencies)` and `bundle-secrets (no server secret in the client bundle)`; keep those job names).
