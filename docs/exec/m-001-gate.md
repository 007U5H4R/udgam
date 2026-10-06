# M-001 gate — owner review items

TKT-21 (TSK-21.x) completes this file with HR1 (evidence-template snapshots), HR2 (known-limitations wording) and HR6 (every scorecard number traced to its results file). The section below was recorded ahead of that, from the owner's decisions of 2026-09-29.

## Owner items before production (EXE14; not blocking M-001 or M-002)
| # | Item | Why | Where it lands |
|---|---|---|---|
| PRE-1 | Restrict the map tile API key (HTTP referrer = production domain; tile endpoints only) | The key is public in the browser by design; restriction limits abuse | TKT-28 production config |
| PRE-2 | Switch to the live remote-sensing provider and re-record the synthetic provider fixtures with real keys | Everything in Stage 7 runs on fixture data; production refuses the fixture provider (EXE12) | TKT-27/28 |
| PRE-3 | Native-speaker review of every Kannada string marked `REVIEW: native speaker` | Machine-assisted Kannada must not ship unreviewed to farmers | before TKT-29 rehearsals |
| PRE-4 | Caddy overwrites `X-Forwarded-For`; the app trusts only that value; forged-header test passes | Per-IP sign-in and capture limits depend on it | TSK-27.3 (EXE14) |

## Owner decisions needed before baseline-v1 (from the P5 gate, 2026-09-29)
| # | Item | Options | Where |
|---|---|---|---|
| OD-1 | EVAL-122 (23 h EXIF gap) is a lone flag → Verified under EV7, so as written it is a measured miss | keep it as a reported miss, or make it accept Verified (it then tests the flag only) | EXE10, ledger P5 |
| OD-2 | EVAL-116 expects the substring "fail over 7 days"; since EXE10 the evidence reads "fail over 24 h" (the verdict is correct) | authorise the substring change | EXE10 |
| OD-3 | EVAL-049 is unreachable as one picking (3,000 kg on 2 ha > the 500 kg capture limit) | move it to a plot of ≤ 0.35 ha, or have the harness submit several pickings | EXE20 |
| OD-4 | Replay narrowing: a payload refused for X, then Y, then X gets the original X refusal back | acknowledge (it keeps EXE11's three guarantees) or ask for a new row | EXE20 |
| OD-5 | D5: "Needs a check" should say *when* the office will look; the mockup's "Usually within 1 working day" was never confirmed | give a real response time, or amend D5 | ledger P5 |
| OD-6 | TC-073: the clean-room checker's brief cited plan sections besides docs/proof-feed.md (QA-P5-3) | accept (three doc-only sufficiency reviews said YES, plus the import-isolation test), or rebuild the checker from the doc alone at Stage 9 | ledger P5 |
| OD-7 | EVAL-055 / EVAL-056 stay reported scenario-6 stretch misses (owner decision, EXE10) | — (recorded) | EXE10 |
| OD-8 | §18's certificate budget of 150 KB HTML+JS gzip can't be met on Next 16: the framework alone is about 141 KB, the certificate's own JS is 25 KB, and a 50-event batch's HTML is about 100 KB because the feed is embedded. S4 measured p50 2.4 s and max 3.17 s on the loaded VM; TKT-21 makes the formal run | raise the budget to what Next 16 allows, or keep it and accept a recorded miss; measured by the TKT-16 spec review: framework JS 141.3 KB, /verify JS 161.7 KB, HTML 104.2 KB for 50 events (feed data block 43 KB, RSC payload 52 KB), total 265.9 KB. The feed appears twice because the spec'd `<script id="proof-feed">` is a Server Component and Next also serialises it into RSC; removing one copy (passing the feed only as a prop, or fetching `/api/verify`, which breaks §18's no-second-round-trip) saves about 43 KB, leaving about 223 KB. Suggested restatement: page JS above the framework baseline. S4 varied 1.9–4.7 s at load 47 on one build: the formal run needs a quiet host (TKT-21) | TKT-16 report, TKT-21 |
| OD-9 | Harness defaults for M-002: `DEFAULT_MILESTONE` stays M1 and the default ledger stays hashchain. EXE15 said the milestone moves to M2 when M-002 starts, but a plain `pnpm eval` on hashchain would then fail S6-lib at 7/8 (EVAL-103 needs the EVM ledger and Anvil) | keep M1 and hashchain as the defaults, with M2 run via `--ledger=evm --milestone=M2` in contracts.yml (as now); or switch both defaults, making Foundry a requirement for `pnpm eval` | TKT-24 spec review, EXE15 |

**Owner answers, 2026-10-05 (EXE23):** OD-1 b · OD-2 yes · OD-3 b · OD-4 acknowledged · OD-6 a · OD-9 a. Still open: OD-5, OD-8.
**EVAL-122 (EXE27):** OD-1 is superseded; EVAL-122 stays a reported miss (the schema forbids an attack case accepting Verified).
**Delegated decisions, 2026-10-05 (EXE24):** OD-5: Needs a check names who and where, with no time promise. OD-8: budget restated (client JS above the framework ≤ 60 KB gzip; HTML ≤ 120 KB; S4 unchanged and measured in TKT-21). All OD items are now decided.

---

# M-001 gate report (TKT-21 → TASK-22, phase B)

**Formal-run commit:** `d7124cb0036c973b351c3bc04547241e31bfd14d`. It records the run made at gate commit `eb321a1dd63bed90c1d66cf8f52d99ecab104685` (build/stage7 head). Every number below comes from a results file in that commit (CF-12):
- `evals/results/eval-run-0.1.0-eb321a1.json`: the harness run; `baseline-v1.json` is a byte-identical copy;
- `evals/results/baseline-perf-v1.json`: S4;
- `evals/results/eval-run-v1-release-eb321a1.json`: the release.

Nothing was tuned. No threshold, weight, verdict rule, case class, expected verdict, dataset entry or cfg-1 value changed (EV13, CF-13).

**Owner stop:** the M-001 owner gate stop is **waived (EXE1)**: Stage 7 continues without waiting. The M-001 owner review items in this file **remain open** for the owner:
- HR1, the evidence-template rubric;
- HR2, the known-limitations and pair wording;
- HR6, the scorecard trace;
- the Kannada native-speaker review (PRE-3).

**HR3 / TP29 readiness warning** (printed by `pnpm eval:ready` and in `evals/reports/eval-report-v1.md`):

> WARNING: docs/exec/hr3-field-calibration.md is absent: HR3 field calibration was waived (decisions.md TP29), so S2 realism (the legitimate-set jitter) and the S3 reference condition are unvalidated assumptions. The gate report must print this line.

## Gate table

| Gate | Value | Threshold | Pass | Source (file → JSON path) |
|---|---|---|---|---|
| S1 | 97.7 % (42/43) | ≥ 95.0 % | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[0]` |
| S1-floor | 91.7 % (scenario 1: 100.0 % (11/11); scenario 2: 91.7 % (11/12); scenario 3: 100.0 % (10/10); scenario 4: 100.0 % (10/10)) | ≥ 90.0 % each | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[1]` |
| S2 | 0.0 % (0/40) | ≤ 5.0 % | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[2]` |
| S4 | Yes (10 cold loads, 10 verified, 10 verified under 3000 ms, max 2905 ms) | every load < 3 s | PASS | `evals/results/baseline-perf-v1.json` → `pass`, `summary`, `runs[0..9]` |
| S6-lib | 100.0 % (7/7) | 100.0 % | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[3]` |
| S7 | Yes (103 cases, 0 skipped) | Yes | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[4]` |
| S7-release | Yes | Yes | PASS | `evals/results/eval-run-v1-release-eb321a1.json` → `gates[8]` (from `cases`) |
| CF | 0 | 0 | PASS | `evals/results/eval-run-0.1.0-eb321a1.json` → `gates[5]` |
| Cases | 28/28 | all | PASS | `evals/results/eval-run-v1-release-eb321a1.json` → `gates[7]` (from `cases`) |

**Release:** `pnpm eval:release --milestone=M1 --out=formal` exited **0** (overall PASS) → `evals/results/eval-run-v1-release-eb321a1.json` → `summary`.
- 148 dataset cases; 130 in the M1 gates: 127 passed, 3 failed, 0 skipped, 0 missing.
- 4 deferred to M-003, 13 out of scope (M2) and 1 outside the gates (EVAL-084, pending decision) → `totals`.
- Harness: 103 active cases; 99 passed, 4 failed (of which 1 not yet implemented: EVAL-103, M2), 0 errored, 0 skipped → `evals/results/eval-run-0.1.0-eb321a1.json` → `totals`.

Category gates, reported only and outside the harness exit code:
- Functional 100.0 % (9/9) (target 100.0 %, PASS) → `categoryGates[0]`.
- Reliability 100.0 % (4/4) (target 100.0 %, PASS) → `categoryGates[1]`.

## Eval deltas vs baseline-v0

baseline-v0 is `baseline-v0-ledger-only.json`, the ledger-only baseline. Source: `evals/results/eval-run-0.1.0-eb321a1.json` → `comparison.baseline.gates` (baseline) and `gates` (current); the same figures are in `evals/reports/eval-report-0.1.0-eb321a1.md` lines 17–22.

| Gate | baseline-v0 | baseline-v1 (this run) | Change |
|---|---|---|---|
| S1 | 0.0 % (0/26) | 97.7 % (42/43) | +97.7 pts (attack set 26 → 43) |
| S1-floor | 0.0 % | 91.7 % | +91.7 pts |
| S2 | 0.0 % (0/14) | 0.0 % (0/40) | unchanged rate; legitimate set 14 → 40 |
| S6-lib | 0.0 % (0/8) | 100.0 % (7/7) | +100 pts (count 0/8 → 7/7; EVAL-103, M2, is now outside the M1 scope) |
| S7 | Yes | Yes | unchanged |
| CF | 1 | 0 | 1 → 0 |

Previous formal run: none. Regressions: none. Improvements list: none. Source: `comparison.previous`, `comparison.regressions`, `comparison.improvements`. baseline-v1 is the first formal run.

## TCs passed and failed (release reconciliation)

The release reconciles EVAL IDs, not TC IDs. These TCs are named in the titles of the EVAL-titled tests that the release ran. The source files are:
- `evals/results/local/integration.json`: vitest, success true, 261 passed, 0 failed;
- `evals/results/local/e2e.json`: Playwright, 260 expected, 8 skipped, 0 unexpected, 0 flaky;
- `evals/results/local/e2e-demo.json`: 4 expected, 0 unexpected.

Each has a run record at commit `eb321a1`, clean before and after. They are git-ignored, so they are not in the formal commit; their SHA-256 values are listed under "Sources" in `evals/reports/eval-report-v1.md`.

- **Passed (49):** TC-006, TC-007, TC-010, TC-012, TC-013, TC-015, TC-017, TC-018, TC-019, TC-021, TC-023, TC-024, TC-028, TC-031, TC-032, TC-036, TC-037, TC-038, TC-040, TC-041, TC-042, TC-044, TC-046, TC-050, TC-051, TC-052, TC-054, TC-055, TC-056, TC-057, TC-058, TC-059, TC-060, TC-063, TC-065, TC-066, TC-067, TC-068, TC-070, TC-071, TC-072, TC-074, TC-075, TC-076, TC-078, TC-080, TC-081, TC-086, TC-094.
- **Failed (0):** none. No TC-titled test failed, was flaky, or was only skipped.
- **Also from this run:**
  - TC-016 passed: `report.ts baseline-v1.json` re-rendered byte-identical to `eval-report-baseline-v1.md` (`cmp` exit 0).
  - TC-079 passed: this formal run and `eval-run-v1-release` (exit 0).
  - TC-011 passed at the formal-run commit: `src/lib/verification/evidence.test.ts`, 40/40 (see HR1).
  - The TSK-21.2 freeze guard passed with baseline-v1 now present: `tests/config-freeze.test.ts`, 35/35.
  - Full `pnpm test`: 2462/2462.
- TCs not named in any EVAL-titled test are outside the release reconciliation. They are covered by the phase gates in `docs/exec/ledger.md`.

## S4: certificate latency (EVAL-071)

Source: `evals/results/baseline-perf-v1.json`.

| Measure | Value | JSON path |
|---|---|---|
| cold loads, verified | 10 runs, 10 verified | `runs[*].finalState` |
| navigation → verified, p50 / p95 / max | 2451.5 / 2846.5 / 2905 ms (threshold 3000 ms) → **PASS** | `summary` |
| each run (ms) | 2775, 2502, 2905, 2539, 2498, 2232, 2259, 2405, 2259, 2316 | `runs[*].ms` |
| in-browser verify (proof-start → proof-final), p50 / p95 / max | 401.5 / 478.2 / 516 ms (§18 budget 300 ms, reported only) → **MISS** | `verify` |
| server response (requestStart → responseStart), p50 / p95 / max | 114 / 357.35 / 509 ms (reported only) | `server` |
| profile | 375×812, 10/5 Mbps, 80 ms latency, 4× CPU throttle, cold (fresh context per run) | `profile` |
| host | Intel(R) Xeon(R) Processor @ 2.80GHz, 4 vCPU, x64, 15.7 GB, linux; referenceHost false | `provenance.hardware` |
| commit, dirty | `eb321a1`, false | `provenance.git` |

- **Host load** (`uptime`, recorded in the run log; the perf file does not store it):
  - 0.30 / 1.93 / 4.39 at 18:10:59 UTC, just before the 10 runs;
  - 1.43 / 2.00 / 4.31 at 18:11:43 UTC, just after.
  - That is under the quiet-host limit of 4 (OD-8), with no other implementer running.
- **Server:** a production build on port 3960 with a fixture provider and a scratch DATA_DIR. The auth secret was a throwaway generated in the shell (runbook step 4, as amended).
- Measured on this host, not the Oracle A1 reference instance (S3, and S4 on the reference host, are TKT-29 at M-003).

## Open issues

BUG rows are in `docs/exec/ledger.md` → "Gate M-001"; the local session creates them as Campfire bugs.

1. **EVAL-122:** a reported miss, owner-held (EXE27). It is Verified with a lone `exif_time_agreement` flag ("Photo time 23 h from capture time"). It is S1's only miss (42/43). Owner: TKT-08.
2. **EVAL-055 and EVAL-056:** scenario-6 stretch misses, owner-held (EXE10, OD-7). Each is Verified with a lone `exif_time_agreement` flag. They are not in S1.
3. **§18 in-browser verify budget:** p50 401.5 ms and max 516 ms at 4× throttle, against ≤ 300 ms (EXE24). It is reported only, and S4 passes. Owner: TKT-16.
4. **EVAL-086:** passed, but its `phone-small` and `desktop` project runs are skipped. The case targets 375 and 768 px (release report, "Passed, with skipped tests").
5. **Range-written titles:** 17 test titles name EVAL IDs as ranges (for example `EVAL-059–063`, `EVAL-058..063`), so the release does not read them (release report, "Titles with range-written IDs"). The cases still pass on other titles. Naming each ID in full would make that evidence count.
6. **Deferred to M-003:** EVAL-070 and EVAL-072 (TKT-29), and EVAL-085 and EVAL-090 (TKT-28). EVAL-084 is pending a decision and sits outside the gates (it passed).
7. **HR3/TP29:** field calibration was waived, so S2 realism and the S3 reference condition are unvalidated assumptions (the warning above).
8. **S4 host:** measured on the cloud VM, not the Oracle A1 reference host; S4 on the reference host and S3 are TKT-29.
9. **Runbook gap (candidate EXE):** step 4's server command lacked `BETTER_AUTH_SECRET`, so the production server refused to boot. The run stopped and resumed at step 4 with the orchestrator-authorised env line, and `docs/exec/m-001-formal-run.md` now carries it. Step 3 was not rerun.
10. **Carried over:** QA-P6-8-4 (EVAL-087/TC-071 QR on the printed certificate, Stage 8) and the EXE36 residuals (R-6, repeatable harness run, edit-plus-hash forgery; Stage 9). PRE-1 to PRE-4 are above.
11. **Not done here:** screenshots vs `.design/exploration/final/` (technical-plan TSK-21.6) are left to the Stage 8 design critique.

## HR6: every scorecard number, traced

File abbreviations:
- **H** = `evals/results/eval-run-0.1.0-eb321a1.json`, with **HR** = `evals/reports/eval-report-0.1.0-eb321a1.md`;
- **R** = `evals/results/eval-run-v1-release-eb321a1.json`, with **RR** = `evals/reports/eval-report-v1.md`;
- **P** = `evals/results/baseline-perf-v1.json`.

| Number | Value | File → JSON path | Printed at |
|---|---|---|---|
| S1 | 97.7 % (42/43) (value 0.9767441860465116) | H → `gates[0]`; R → `gates[0]` | HR line 17; RR line 25 |
| S1-floor | 91.7 % (value 0.9166666666666666) | H → `gates[1]`; R → `gates[1]` | HR line 18; RR line 26 |
| S2 | 0.0 % (0/40) (value 0) | H → `gates[2]`; R → `gates[2]` | HR line 19; RR line 27 |
| S6-lib | 100.0 % (7/7) (value 1) | H → `gates[3]`; R → `gates[3]` | HR line 20; RR line 28 |
| S7 | Yes (value true) | H → `gates[4]`; R → `gates[4]` | HR line 21; RR line 29 |
| CF | 0 (value 0) | H → `gates[5]`; R → `gates[5]` | HR line 22; RR line 30 |
| S1 scenario 1 | 11/11 (100.0 %; Wilson 74.1–100.0 %) | H → `detection.perScenario.1` | HR line 45 |
| S1 scenario 2 | 11/12 (91.7 %; Wilson 64.6–98.5 %) | H → `detection.perScenario.2` | HR line 46 |
| S1 scenario 3 | 10/10 (100.0 %; Wilson 72.2–100.0 %) | H → `detection.perScenario.3` | HR line 47 |
| S1 scenario 4 | 10/10 (100.0 %; Wilson 72.2–100.0 %) | H → `detection.perScenario.4` | HR line 48 |
| S1 pooled | 42/43 (Wilson 87.9–99.6 %) | H → `detection.pooled` | HR line 49 |
| scenario 6 (stretch) | 1/3 | H → `detection.otherScenarios.6` | HR "Scenarios 5–6" table |
| S2 | 0/40 (Wilson upper 8.8 %) | H → `falsePositives` | HR line 62 |
| honest review load | 6/47 (12.8 %) | H → `falsePositives.honestReviewLoad` | HR line 62 |
| harness totals | 103 active / 99 passed / 4 failed / 0 skipped | H → `totals` | HR line 35 |
| CF fired | 0 | H → `criticalConditions` (empty) | HR "Critical conditions" |
| S4 | Yes (10 cold loads, 10 verified, 10 verified under 3000 ms, max 2905 ms) | R → `gates[6]` | RR line 31 |
| Cases | 28/28 (none failed) | R → `gates[7]` | RR line 32 |
| S7-release | Yes (0 missing; 0 skipped) | R → `gates[8]` | RR line 33 |
| S4 p50 / p95 / max | 2451.5 / 2846.5 / 2905 ms | P → `summary` | — |
| release totals | 130 gated / 127 passed / 3 failed / 4 deferred / 13 out of scope | R → `totals` | RR line 37 |
| release exit code | 0 | R → `summary.exitCode` | RR "Overall: PASS" |
| config hash (cfg-1) | `c91ccb2c8295cfd1b7010964ee83f41e04085a0507674d149a21397b3b3655ac` | H → `provenance.config.hash` | HR "Configuration" |
| seed | 222275640 (default) | H → `provenance.seed`, `provenance.seedPolicy` | HR "Provenance" |

## HR2: known limitations and the pruning/clearing pair (for owner approval)

This is the text exactly as printed in the formal report `evals/reports/eval-report-0.1.0-eb321a1.md`, lines 102–151. The same text is in `evals/reports/eval-report-baseline-v1.md`. The data is in `evals/results/eval-run-0.1.0-eb321a1.json` → `knownLimitations` and `pairs`.
- **Pruning/clearing pair:** EVAL-019 (honest shade-coffee plot, 3.0 % loss from pruning) against EVAL-040 (plot laundering, 3.0 % loss from a small clearing, on the same data). Both read Needs Review with a `deforestation_overlap` flag.
- **Geofence pair:** EVAL-005 against EVAL-026, the concave-plot notch.

**Owner: approve this wording, or give the change.** A wording change goes into the report generator, never into a results file.

````markdown
## Known limitations

Attacks the MVP cannot catch by design (EV6). Recorded with their verdicts, never counted in S1.

| Case | Scenario | Verdict | Why |
|---|---|---|---|
| EVAL-029 | 1 | Verified | Recorded, not scored. A PWA cannot tell a system-level mock location from a real fix (risk R7); hardware attestation is the roadmap work package. The report lists this case and its verdict under Known limitations. |
| EVAL-036 | 2 | Verified | Recorded, not scored. photo_uniqueness compares SHA-256, so any re-encode evades it. A perceptual near-duplicate check is a candidate for Stage 6 (open question Q5). |
| GAP-7 (EVAL-049) | 4 | Rejected | Earlier captures in a season are not re-scored when a later one crosses a yield threshold (TP6, EV6): in the salami case the five earlier captures up to 1.80x U keep their verdicts (flagged from 1.50x U) and only the capture that takes the season past 2.00x U is rejected. EVAL-049 itself is an S1 case; its verdict is shown. |

## Paired cases (same signal, opposite ground truth)


|  | EVAL-005 | EVAL-026 |
|---|---|---|
| class | legitimate | attack |
| outcome | passed | passed |
| verdict | Verified | Needs Review |
| score | 100 | 91.7 |
| signature_valid | ok | ok |
| chain_continuity | ok | ok |
| photo_uniqueness | ok | ok |
| geofence | ok | fail |
| gps_accuracy | ok | ok |
| exif_gps_agreement | ok | ok |
| exif_time_agreement | ok | ok |
| movement_plausibility | ok | ok |
| deforestation_overlap | ok | ok |
| ndvi_cultivation | ok | ok |
| ndvi_harvest_window | ok | ok |
| yield_plausibility | ok | ok |

|  | EVAL-019 | EVAL-040 |
|---|---|---|
| class | legitimate_edge | attack |
| outcome | passed | passed |
| verdict | Needs Review | Needs Review |
| score | 95.8 | 95.8 |
| signature_valid | ok | ok |
| chain_continuity | ok | ok |
| photo_uniqueness | ok | ok |
| geofence | ok | ok |
| gps_accuracy | ok | ok |
| exif_gps_agreement | ok | ok |
| exif_time_agreement | ok | ok |
| movement_plausibility | ok | ok |
| deforestation_overlap | flag | flag |
| ndvi_cultivation | ok | ok |
| ndvi_harvest_window | ok | ok |
| yield_plausibility | ok | ok |
````

## HR1: evidence-template snapshots (TC-011), for the rubric

- **Snapshot file:** `src/lib/verification/__snapshots__/evidence.test.ts.snap`, written by `src/lib/verification/evidence.test.ts` → "evidence templates (TC-011) › render every §6.5 row (snapshot)".
- **Also in that file:** "carry the dataset evidence substrings" checks the `evidence_substrings` of the TC-011 cases, and "a shown value never sits on the wrong side of its threshold" checks the value against the threshold.
- **Live counterparts:** the same templates as rendered in this formal run are in `evals/results/eval-run-0.1.0-eb321a1.json` → `cases[*].result.checks[*].evidence`. For example, EVAL-122's evidence is under "Undetected attacks, with evidence" in the report.

**Owner: score HR1 from these sentences at Stage 9.** The snapshot at the formal-run commit:

```
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`evidence templates (TC-011) > render every §6.5 row (snapshot) 1`] = `
{
  "any.unavailable threw": "Check could not run: TypeError",
  "chain_continuity.flag new_device": "First entry from a new phone; this agent has 14 earlier entries on another phone",
  "chain_continuity.flag out_of_order": "Expected entry 7 after 3f9a1c0b, got entry 9",
  "chain_continuity.ok": "Entry 7 follows entry 6 from this phone",
  "deforestation_overlap.fail": "25.0% of plot area lost since 2021 (hard fail at 10.0%)",
  "deforestation_overlap.flag": "9.5% of plot area lost since 2021 (hard fail at 10.0%)",
  "deforestation_overlap.ok": "0.0% of plot area lost since 2021 (hard fail at 10.0%)",
  "deforestation_overlap.ok fixture source": "0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)",
  "deforestation_overlap.unavailable": "Forest-loss data unavailable: timeout; an admin re-run will retry",
  "exif_gps_agreement.fail": "Photo location 3200 m from phone location (limit 50 m)",
  "exif_gps_agreement.flag": "Photo has no location data",
  "exif_gps_agreement.ok": "Photo location 10 m from phone location (limit 50 m)",
  "exif_time_agreement.fail": "Photo time 2 min from capture time (limit 10 min); phone clock 9 days from server (limit 24 h) (fail over 7 days)",
  "exif_time_agreement.fail exif": "Photo time 3 days from capture time (limit 10 min); phone clock 1 min from server (limit 24 h) (fail over 24 h)",
  "exif_time_agreement.flag gap": "Photo time 3 h from capture time (limit 10 min); phone clock 1 min from server (limit 24 h)",
  "exif_time_agreement.flag no exif": "Photo has no time data; phone clock 3 min from server (limit 24 h)",
  "exif_time_agreement.ok": "Photo time 2 min from capture time (limit 10 min); phone clock 0 min from server (limit 24 h)",
  "geofence.fail": "2400 m outside the plot edge (allowance 25 m)",
  "geofence.flag": "12 m outside the plot edge, within the 20 m GPS allowance",
  "geofence.ok": "Inside the plot, 42 m from the edge",
  "gps_accuracy.fail": "GPS accuracy 150 m (good under 30 m, limit 100 m)",
  "gps_accuracy.flag": "GPS accuracy 60 m (good under 30 m, limit 100 m)",
  "gps_accuracy.ok": "GPS accuracy 8 m (good under 30 m, limit 100 m)",
  "movement_plausibility.fail": "Implied speed 338 km/h from the previous entry 45000 m away 8 min earlier (limit 120 km/h)",
  "movement_plausibility.fail clock": "Capture time did not advance from the previous entry 100 m away (-5 min apart; limit 120 km/h)",
  "movement_plausibility.ok": "Implied speed 0 km/h from the previous entry 100 m away 45 min earlier (limit 120 km/h)",
  "movement_plausibility.ok first": "First entry from this phone",
  "ndvi_cultivation.fail low": "No year-round canopy over 10 clear months: lowest month NDVI 0.21 (needs ≥ 0.50); seasonal swing 0.45 (limit 0.35)",
  "ndvi_cultivation.fail swing": "No year-round canopy over 10 clear months: seasonal swing 0.38 (limit 0.35)",
  "ndvi_cultivation.ok": "Canopy all year: monthly NDVI 0.62–0.81 over 11 clear months (needs ≥ 0.50, swing ≤ 0.35)",
  "ndvi_cultivation.unavailable few months": "Only 4 clear months of satellite data (needs 6)",
  "ndvi_cultivation.unavailable provider": "Satellite NDVI data unavailable: http_500; an admin re-run will retry",
  "ndvi_harvest_window.fail": "Living canopy around the picking date: NDVI 0.22 (needs ≥ 0.45, fail below 0.30)",
  "ndvi_harvest_window.flag": "Living canopy around the picking date: NDVI 0.38 (needs ≥ 0.45)",
  "ndvi_harvest_window.ok": "Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45)",
  "ndvi_harvest_window.unavailable cloud": "Satellite view blocked by cloud for ±30 days",
  "ndvi_harvest_window.unavailable provider": "Satellite NDVI data unavailable: timeout; an admin re-run will retry",
  "photo_uniqueness.fail": "1 of 3 photos seen before",
  "photo_uniqueness.ok": "3 of 3 photos are new",
  "signature_valid.fail bad_signature": "Signature does not match phone DV-7K2M9Q4D",
  "signature_valid.fail revoked": "Phone DV-7K2M9Q4D was revoked on 2026-10-01",
  "signature_valid.fail unknown_key": "Phone key is not enrolled",
  "signature_valid.ok": "Signed by enrolled phone DV-7K2M9Q4D",
  "yield_plausibility.fail": "Season total 2.50x the reference upper bound (flag above 1.50x, hard fail above 2.00x)",
  "yield_plausibility.flag": "Season total 1.75x the reference upper bound (flag above 1.50x, hard fail above 2.00x)",
  "yield_plausibility.ok": "Season total 0.30x the reference upper bound (flag above 1.50x, hard fail above 2.00x)",
  "yield_plausibility.unavailable": "No yield reference for robusta",
}
`;
```

## Kannada strings awaiting native-speaker review (PRE-3)

`src/lib/i18n/kn.ts` has **617 keys** marked `// REVIEW: native speaker`. That is every Kannada entry; the file's 618th marker is its header comment. None has been reviewed. Per namespace:

| Namespace | Keys |
|---|---|
| `agreements` | 169 |
| `app` | 1 |
| `attest` | 1 |
| `batches` | 63 |
| `buyer` | 11 |
| `capture` | 2 |
| `crop` | 2 |
| `dt` | 10 |
| `enrol` | 18 |
| `fe` | 42 |
| `gps` | 5 |
| `grp` | 6 |
| `help` | 14 |
| `home` | 30 |
| `lang` | 6 |
| `pend` | 6 |
| `pk` | 8 |
| `processor` | 88 |
| `rec` | 67 |
| `refusal` | 37 |
| `shell` | 6 |
| `signIn` | 8 |
| `signOut` | 1 |
| `tabs` | 4 |
| `v` | 9 |
| `verdict` | 3 |
| **total** | **617** |

<details><summary>Every key, by namespace</summary>

- **agreements** (169): `agreements.link.buyer`, `agreements.link.admin`, `agreements.toBatches`, `agreements.back`, `agreements.eyebrow`, `agreements.detailEyebrow`, `agreements.details`, `agreements.row.id`, `agreements.kg`, `agreements.mock`, `agreements.retry`, `agreements.and`, `agreements.nothingChanged`, `agreements.crop.arabica`, `agreements.crop.robusta`, `agreements.empty.title`, `agreements.buyer.title`, `agreements.buyer.sub`, `agreements.buyer.loading`, `agreements.buyer.errTitle`, `agreements.buyer.emptyBody`, `agreements.buyer.listLabel`, `agreements.buyer.pick`, `agreements.fpo.title`, `agreements.fpo.sub`, `agreements.fpo.loading`, `agreements.fpo.errTitle`, `agreements.fpo.emptyBody`, `agreements.fpo.pick`, `agreements.notFound.title`, `agreements.notFound.titleId`, `agreements.notFound.body`, `agreements.status.released`, `agreements.status.notReleased`, `agreements.status.releasedOn`, `agreements.status.refunded`, `agreements.status.notFunded`, `agreements.status.buyerNotFunded`, `agreements.status.deadlineTakeBack`, `agreements.status.deadlineNotSettled`, `agreements.status.needsGrade`, `agreements.status.needsGradeShort`, `agreements.status.notReleasedYet`, `agreements.status.notReleasedYetCount`, `agreements.status.notReleasedCount`, `agreements.status.waitingDelivery`, `agreements.status.ready`, `agreements.status.waitingBuyerGrade`, `agreements.status.waitingBuyerGradeShort`, `agreements.status.waitingGrade`, `agreements.notMetCount.one`, `agreements.notMetCount.many`, `agreements.row.facts`, `agreements.row.cropArabica`, `agreements.row.cropRobusta`, `agreements.row.by`, `agreements.row.takenBack`, `agreements.changed.title`, `agreements.changed.body`, `agreements.meta.created`, `agreements.meta.funded`, `agreements.meta.endedNothing`, `agreements.meta.endedNotSettled`, `agreements.meta.delivered`, `agreements.meta.createdOnly`, `agreements.meta.adminCreated`, `agreements.meta.adminFunded`, `agreements.meta.adminDelivered`, `agreements.terms.title`, `agreements.terms.crop`, `agreements.terms.kg`, `agreements.terms.minGrade`, `agreements.terms.minGradeValue`, `agreements.terms.amount`, `agreements.terms.deadline`, `agreements.terms.with`, `agreements.cond.title`, `agreements.cond.before`, `agreements.cond.sum`, `agreements.cond.checked`, `agreements.cond.met`, `agreements.cond.notMet`, `agreements.cond.name.qty`, `agreements.cond.name.grade`, `agreements.cond.name.verified`, `agreements.cond.qty`, `agreements.cond.short`, `agreements.cond.graded`, `agreements.cond.min`, `agreements.cond.notGraded`, `agreements.cond.verified`, `agreements.trust`, `agreements.released.body`, `agreements.ledgerLine`, `agreements.notRel.one`, `agreements.notRel.many`, `agreements.notMet.qty`, `agreements.notMet.grade`, `agreements.notMet.verified`, `agreements.notRel.whereBuyer`, `agreements.notRel.whereFpo`, `agreements.notRel.later`, `agreements.refunded.line`, `agreements.new.pill`, `agreements.new.title`, `agreements.new.meta`, `agreements.new.with`, `agreements.new.kg`, `agreements.new.kgHint`, `agreements.new.chooseGrade`, `agreements.new.gradeHint`, `agreements.new.amount`, `agreements.new.noFpoTitle`, `agreements.new.noFpoBody`, `agreements.create.note`, `agreements.create.idle`, `agreements.create.busy`, `agreements.create.errTitle`, `agreements.create.errBody`, `agreements.fund.title`, `agreements.fund.body`, `agreements.fund.c1`, `agreements.fund.c2`, `agreements.fund.c3`, `agreements.fund.balance`, `agreements.fund.note`, `agreements.fund.idle`, `agreements.fund.busy`, `agreements.fund.errTitle`, `agreements.fund.errBody`, `agreements.refund.title`, `agreements.refund.body`, `agreements.refund.balance`, `agreements.refund.note`, `agreements.refund.idle`, `agreements.refund.busy`, `agreements.refund.errTitle`, `agreements.refund.errBody`, `agreements.delivered.title`, `agreements.delivered.batch`, `agreements.delivered.certificate`, `agreements.delivered.delivered`, `agreements.delivered.kgWhen`, `agreements.delivered.pickings`, `agreements.delivered.pickingsValue`, `agreements.grade.title`, `agreements.grade.legend`, `agreements.grade.atMin`, `agreements.grade.belowMin`, `agreements.grade.hint`, `agreements.grade.note`, `agreements.grade.idle`, `agreements.grade.sign`, `agreements.grade.busy`, `agreements.grade.errTitle`, `agreements.grade.errBody`, `agreements.grade.emptyTitle`, `agreements.grade.emptyBody`, `agreements.settle.idle`, `agreements.settle.busy`, `agreements.settle.working`, `agreements.settle.hint`, `agreements.settle.errTitle`, `agreements.settle.noAnswer`, `agreements.settle.turnedAway`, `agreements.card.title`, `agreements.card.under`, `agreements.card.link`, `agreements.card.status`
- **app** (1): `app.name`
- **attest** (1): `attest.certifiedBy`
- **batches** (63): `batches.eyebrow`, `batches.title`, `batches.sub`, `batches.new`, `batches.list.label`, `batches.row.open`, `batches.row.transferred`, `batches.row.facts`, `batches.pickings.one`, `batches.pickings.many`, `batches.plots.one`, `batches.plots.many`, `batches.kg`, `batches.loading`, `batches.empty.title`, `batches.empty.body`, `batches.error.title`, `batches.error.body`, `batches.error.retry`, `batches.pick`, `batches.back`, `batches.detail.eyebrow`, `batches.detail.created`, `batches.detail.score`, `batches.detail.facts`, `batches.detail.members`, `batches.detail.member`, `batches.detail.memberFacts`, `batches.detail.certificate`, `batches.detail.certificateNote`, `batches.transfer.title`, `batches.transfer.buyer`, `batches.transfer.choose`, `batches.transfer.hint`, `batches.transfer.group.buyers`, `batches.transfer.group.processors`, `batches.transfer.note`, `batches.transfer.submit`, `batches.transfer.working`, `batches.transfer.noBuyers`, `batches.transfer.error.not_open`, `batches.transfer.error.not_buyer`, `batches.custody.title`, `batches.custody.link`, `batches.custody.when`, `batches.custody.locked`, `batches.builder.eyebrow`, `batches.builder.title`, `batches.builder.sub`, `batches.builder.label`, `batches.builder.row`, `batches.builder.rowFacts`, `batches.builder.otherCrop`, `batches.builder.none`, `batches.builder.create.one`, `batches.builder.create.many`, `batches.builder.working`, `batches.builder.note`, `batches.builder.empty.title`, `batches.builder.empty.body`, `batches.builder.error.empty`, `batches.builder.error.not_eligible`, `batches.builder.error.mixed_crop`
- **buyer** (11): `buyer.eyebrow`, `buyer.sub`, `buyer.list.label`, `buyer.row.facts`, `buyer.row.from`, `buyer.detail.producers`, `buyer.detail.producer`, `buyer.pick`, `buyer.empty.body`, `buyer.detail.eyebrow`, `buyer.detail.from`
- **capture** (2): `capture.rejected.plot_not_assigned`, `capture.nothingLost`
- **crop** (2): `crop.arabica`, `crop.robusta`
- **dt** (10): `dt.back`, `dt.title`, `dt.received`, `dt.photo`, `dt.seeAll`, `dt.state.ok`, `dt.state.flag`, `dt.state.fail`, `dt.state.unavailable`, `dt.state.none`
- **enrol** (18): `enrol.title`, `enrol.titleWord`, `enrol.lede`, `enrol.code`, `enrol.submit`, `enrol.working`, `enrol.error.invalid`, `enrol.error.expired`, `enrol.error.used`, `enrol.error.rate_limited`, `enrol.error.network`, `enrol.error.other`, `enrol.error.unsupported`, `enrol.error.saveFailed`, `enrol.done.title`, `enrol.done.titleWord`, `enrol.done.lede`, `enrol.done.next`
- **fe** (42): `fe.plot.default`, `fe.location.inside`, `fe.location.edge`, `fe.location.outside`, `fe.gps.weak`, `fe.photoGps.none`, `fe.photoGps.far`, `fe.photoTime.none`, `fe.photoTime.far`, `fe.photoTime.clock`, `fe.move.far`, `fe.move.clock`, `fe.photos.new`, `fe.photos.newToday`, `fe.photos.new1`, `fe.photos.new1Today`, `fe.photos.used`, `fe.seal.ok`, `fe.seal.bad`, `fe.seal.revoked`, `fe.seal.unknown`, `fe.chain.order`, `fe.chain.newPhone`, `fe.forest.none`, `fe.forest.loss`, `fe.forest.down`, `fe.canopy.ok`, `fe.canopy.none`, `fe.canopy.few`, `fe.sat.ok`, `fe.sat.cloud`, `fe.sat.down`, `fe.sat.low`, `fe.yield.high`, `fe.yield.none`, `fe.threw`, `fe.demo`, `fe.office`, `fe.todo.photos`, `fe.todo.seal`, `fe.todo.location`, `fe.todo.office`
- **gps** (5): `gps.finding`, `gps.weak`, `gps.denied`, `gps.step1`, `gps.step2`
- **grp** (6): `grp.seal`, `grp.inside`, `grp.photos`, `grp.forest`, `grp.satellite`, `grp.harvest`
- **help** (14): `help.title`, `help.record`, `help.photos`, `help.gallery`, `help.verified`, `help.check`, `help.rejected`, `help.call`, `help.callLink`, `help.language`, `help.thisPhone`, `help.phoneLoading`, `help.phoneSetUp`, `help.phoneId`
- **home** (30): `home.record`, `home.recent`, `home.kg`, `home.greet.morning`, `home.greet.afternoon`, `home.greet.evening`, `home.plotName`, `home.inside`, `home.outside`, `home.finding`, `home.denied`, `home.deniedHelp`, `home.facts`, `home.factsNew`, `home.changePlot`, `home.choosePlot`, `home.close`, `home.you`, `home.mapLabel`, `home.mapLabelNoFix`, `home.empty`, `home.noPlots.title`, `home.noPlots.body`, `home.error.title`, `home.error.body`, `home.error.retry`, `home.loading`, `home.setUp`, `home.greeting`, `home.plotChoice`
- **lang** (6): `lang.label`, `lang.kn`, `lang.en`, `lang.kannada`, `lang.sheet.kn`, `lang.sheet.en`
- **pend** (6): `pend.label`, `pend.saved`, `pend.send`, `pend.sending`, `pend.kept`, `pend.unreadable`
- **pk** (8): `pk.title`, `pk.loading`, `pk.emptyBody`, `pk.count`, `pk.count1`, `pk.noKg`, `pk.why.check`, `pk.whatCanIDo`
- **processor** (88): `processor.title`, `processor.sub`, `processor.eyebrow`, `processor.loading`, `processor.emptyH`, `processor.emptyP`, `processor.errorH`, `processor.errorP`, `processor.retry`, `processor.reload`, `processor.back`, `processor.pick`, `processor.detailLabel`, `processor.railLabel`, `processor.signOut`, `processor.meta.list`, `processor.meta.detail`, `processor.kg`, `processor.row.id`, `processor.row.from`, `processor.row.handedOn`, `processor.row.ready`, `processor.row.ok`, `processor.row.flag`, `processor.chip.handedOn`, `processor.chip.withYou`, `processor.chip.within`, `processor.chip.flagged`, `processor.process.pulping`, `processor.process.drying`, `processor.process.hulling_parchment`, `processor.process.hulling_dry_cherry`, `processor.done.pulping`, `processor.done.drying`, `processor.done.hulling_parchment`, `processor.done.hulling_dry_cherry`, `processor.crop.arabica`, `processor.crop.robusta`, `processor.hint.pulping`, `processor.hint.drying`, `processor.hint.band`, `processor.band.none`, `processor.band.placeholder`, `processor.band.usual`, `processor.detail.eyebrow`, `processor.detail.meta`, `processor.detail.picking`, `processor.detail.pickings`, `processor.detail.stepH`, `processor.detail.stepSum`, `processor.recordH`, `processor.processLegend`, `processor.inputLabel`, `processor.inputHint`, `processor.outputLabel`, `processor.outputHint`, `processor.signedNote`, `processor.record`, `processor.recording`, `processor.recordErrB`, `processor.recordErrP`, `processor.weightName`, `processor.nothingRefused`, `processor.handH`, `processor.buyerLabel`, `processor.chooseBuyer`, `processor.handNote`, `processor.handOn`, `processor.handingOn`, `processor.handErrB`, `processor.handErrP`, `processor.recorded`, `processor.handedMeta`, `processor.noBuyers`, `processor.refused.alreadyRecordedB`, `processor.refused.alreadyRecordedP`, `processor.refused.notHeldB`, `processor.refused.notHeldP`, `processor.refused.noStepB`, `processor.refused.noStepP`, `processor.refused.notFoundB`, `processor.refused.notFoundP`, `processor.field.process`, `processor.field.inputNeeded`, `processor.field.inputFormat`, `processor.field.outputNeeded`, `processor.field.outputFormat`, `processor.field.buyer`
- **rec** (67): `rec.back`, `rec.photos.eyebrow`, `rec.photos.title`, `rec.photos.count`, `rec.photos.lede`, `rec.photos.more`, `rec.photos.yours`, `rec.photos.counter`, `rec.photos.slots`, `rec.slot.branch`, `rec.slot.scale`, `rec.slot.pile`, `rec.slot.added`, `rec.slot.next`, `rec.slot.example`, `rec.camera`, `rec.continue1`, `rec.continueN`, `rec.needOne`, `rec.review.eyebrow`, `rec.review.alt`, `rec.review.title`, `rec.review.clear`, `rec.review.check`, `rec.review.focus`, `rec.review.seen`, `rec.review.dark`, `rec.review.use`, `rec.review.again`, `rec.review.type`, `rec.review.size`, `rec.review.read`, `rec.kg.eyebrow1`, `rec.kg.eyebrowN`, `rec.kg.title`, `rec.kg.unit`, `rec.kg.hint`, `rec.kg.keys`, `rec.kg.decimal`, `rec.kg.delete`, `rec.kg.send`, `rec.kg.type`, `rec.chk.title`, `rec.chk.sub1`, `rec.chk.subN`, `rec.chk.bar`, `rec.chk.progress`, `rec.chk.done`, `rec.chk.now`, `rec.chk.wait`, `rec.chk.caption`, `rec.chk.announce`, `rec.chk.ready`, `rec.chk.see`, `rec.saved.offline`, `rec.saved.server`, `rec.saved.body`, `rec.saved.retry`, `rec.saved.later`, `rec.saved.waitSec1`, `rec.saved.waitSec`, `rec.saved.wait1`, `rec.saved.waitMin`, `rec.photos1`, `rec.photosN`, `rec.noDevice`, `rec.noFix`
- **refusal** (37): `refusal.plot_not_assigned.happened`, `refusal.plot_not_assigned.todo`, `refusal.device_revoked.happened`, `refusal.device_revoked.todo`, `refusal.unknown_device.happened`, `refusal.unknown_device.todo`, `refusal.device_not_owned.happened`, `refusal.device_not_owned.todo`, `refusal.bad_signature.happened`, `refusal.bad_signature.todo`, `refusal.media_hash_mismatch.happened`, `refusal.media_hash_mismatch.todo`, `refusal.media_count.happened`, `refusal.media_count.todo`, `refusal.media_too_large.happened`, `refusal.media_too_large.todo`, `refusal.media_type.happened`, `refusal.media_type.todo`, `refusal.length_required.happened`, `refusal.length_required.todo`, `refusal.body_too_large.happened`, `refusal.body_too_large.todo`, `refusal.bad_schema.happened`, `refusal.bad_schema.todo`, `refusal.non_canonical.happened`, `refusal.non_canonical.todo`, `refusal.bad_form.happened`, `refusal.bad_form.todo`, `refusal.rate_limited.happened`, `refusal.rate_limited.todo`, `refusal.rate_limited.todo1`, `refusal.unauthenticated.happened`, `refusal.unauthenticated.todo`, `refusal.forbidden.happened`, `refusal.forbidden.todo`, `refusal.other.happened`, `refusal.other.todo`
- **shell** (6): `shell.field.title`, `shell.field.empty`, `shell.admin.title`, `shell.admin.empty`, `shell.buyer.title`, `shell.buyer.empty`
- **signIn** (8): `signIn.title`, `signIn.lede`, `signIn.email`, `signIn.password`, `signIn.submit`, `signIn.working`, `signIn.error`, `signIn.unavailable`
- **signOut** (1): `signOut`
- **tabs** (4): `tabs.label`, `tabs.home`, `tabs.pickings`, `tabs.help`
- **v** (9): `v.sub`, `v.subBad`, `v.kg`, `v.evidence.ok`, `v.evidence.check`, `v.evidence.bad`, `v.check.title`, `v.check.saved`, `v.done`
- **verdict** (3): `verdict.verified`, `verdict.needsReview`, `verdict.rejected`

</details>

## Owner review items: decided 2026-10-06 (EXE43, owner delegated)
- **HR1** (evidence-template snapshots) and **HR2** (known-limitations and pruning/clearing-pair wording): **accepted as written.**
- **HR6** (number traceability): **accepted.** An independent check (`docs/exec/hr6-check.md`, `HR CHECK: PASS`) found:
  - every scorecard and gate-table number matches its results file, JSON path and report line;
  - the HR2 block is byte-identical to `eval-report-0.1.0-eb321a1.md` lines 102–151;
  - the HR1 block is byte-identical to `src/lib/verification/__snapshots__/evidence.test.ts.snap`.

  Not traceable to a results file, as expected: the test-suite counts, the host load figures and the Kannada key counts.
- **Kannada native review** (617 strings): **open.** It needs a native speaker and can't be delegated.
