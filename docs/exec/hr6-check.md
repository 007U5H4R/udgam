# HR6 / HR2 / HR1 check, docs/exec/m-001-gate.md (branch build/stage7)

Abbreviations as in the file: H = eval-run-0.1.0-eb321a1.json (== baseline-v1.json, byte-identical, cmp OK); HR = eval-report-0.1.0-eb321a1.md; R = eval-run-v1-release-eb321a1.json; RR = eval-report-v1.md; P = baseline-perf-v1.json.

| number | cited source | actual value | match |
|---|---|---|---|
| S1 97.7 % (42/43), 0.9767441860465116 | H gates[0]; R gates[0]; HR 17; RR 25 | H/R gates[0] display "97.7 % (42/43)", value 0.9767441860465116; HR l.17 and RR l.25 same | yes |
| S1-floor 91.7 %, 0.9166666666666666 | H/R gates[1]; HR 18; RR 26 | display "91.7 %", value 0.9166666666666666; detail lists 11/11, 11/12, 10/10, 10/10 as in the gate table; lines match | yes |
| S2 0.0 % (0/40), 0 | H/R gates[2]; HR 19; RR 27 | "0.0 % (0/40)", value 0 | yes |
| S6-lib 100.0 % (7/7), 1 | H/R gates[3]; HR 20; RR 28 | "100.0 % (7/7)", value 1 | yes |
| S7 Yes, true (103 cases, 0 skipped) | H/R gates[4]; HR 21; RR 29 | "Yes", value true, detail "103 cases, 0 skipped" | yes |
| CF 0 | H/R gates[5]; HR 22; RR 30 | "0", value 0 | yes |
| S1 sc.1 11/11 100.0 % Wilson 74.1-100.0 | H detection.perScenario.1; HR 45 | k11 n11 rate 1, wilson 0.7412-1 -> 74.1-100.0; HR l.45 same | yes |
| S1 sc.2 11/12 91.7 % Wilson 64.6-98.5 | perScenario.2; HR 46 | 11/12, 0.9167, 0.6461-0.9851 | yes |
| S1 sc.3 10/10 Wilson 72.2-100.0 | perScenario.3; HR 47 | 10/10, 0.7225-1 | yes |
| S1 sc.4 10/10 Wilson 72.2-100.0 | perScenario.4; HR 48 | 10/10, 0.7225-1 | yes |
| S1 pooled 42/43 Wilson 87.9-99.6 | detection.pooled; HR 49 | 42/43, 0.8794-0.9959 | yes |
| scenario 6 stretch 1/3 | detection.otherScenarios.6; HR "Scenarios 5-6" table | k1 n3, rate 0.3333; HR table row "6 \| 1/3 \| 33.3 %" | yes |
| S2 0/40, Wilson upper 8.8 % | falsePositives; HR 62 | k0 n40, upper 0.08762 -> 8.8; HR l.62 "0.0 %-8.8 %" | yes |
| honest review load 6/47 (12.8 %) | falsePositives.honestReviewLoad; HR 62 | k6 n47 rate 0.12766 -> 12.8; HR l.62 same | yes |
| harness totals 103/99/4/0 skipped | totals; HR 35 | active 103, passed 99, failed 4, skipped 0 (notYetImplemented 1, errored 0); HR l.35 row same | yes |
| CF fired 0 | criticalConditions (empty); HR "Critical conditions" | [] ; HR l.153-155 "None fired." | yes |
| S4 Yes (10 cold loads, 10 verified, 10 < 3000 ms, max 2905) | R gates[6]; RR 31 | display Yes; detail "10 cold loads, 10 verified, 10 verified under 3000 ms, max 2905 ms"; RR l.31 | yes |
| Cases 28/28 (none failed) | R gates[7]; RR 32 | display 28/28, detail "none failed"; RR l.32 | yes |
| S7-release Yes (0 missing; 0 skipped) | R gates[8]; RR 33 | display Yes, detail "0 missing; 0 skipped"; RR l.33 | yes |
| S4 p50/p95/max 2451.5 / 2846.5 / 2905 ms | P summary | p50 2451.5, p95 2846.5, max 2905, thresholdMs 3000, pass true | yes |
| release totals 130/127/3/4/13 | R totals; RR 37 | gated 130, passed 127, failed 3, skipped 0, missing 0, deferred 4, outOfScope 13, notGated 1, cases 148; RR l.37 | yes |
| release exit code 0 | R summary.exitCode; RR "Overall: PASS" | exitCode 0, overall PASS; RR l.5 "Overall: PASS" | yes |
| config hash c91ccb2c...55ac | H provenance.config.hash; HR "Configuration" | identical string; HR l.211 identical | yes |
| seed 222275640 (default) | H provenance.seed, seedPolicy; HR "Provenance" | seed 222275640, seedPolicy "default"; HR l.314 "seed \| 222275640" | yes |

## Other tables in the gate report (outside HR6)

| number | cited source | actual value | match |
|---|---|---|---|
| Gate table S1, S1-floor, S2, S6-lib, S7, CF, thresholds | H gates[0..5] | same displays and targets (>= 95.0, >= 90.0 each, <= 5.0, 100.0, Yes, 0) | yes |
| Gate table S4 thresholds, runs | P pass/summary/runs | pass true; 10 runs all "verified" | yes |
| Per-run ms 2775, 2502, 2905, 2539, 2498, 2232, 2259, 2405, 2259, 2316 | P runs[*].ms | identical, in order | yes |
| In-browser verify p50/p95/max 401.5 / 478.2 / 516, budget 300 | P verify | 401.5 / 478.2 / 516, thresholdMs 300, pass false (MISS) | yes |
| Server p50/p95/max 114 / 357.35 / 509 | P server | 114 / 357.35 / 509 | yes |
| Profile 375x812, 10/5 Mbps, 80 ms, 4x CPU, cold | P profile | viewport 375x812, 10/5 Mbps, latency 80, cpuThrottle 4, "cold (fresh context per run)" | yes |
| Host Xeon 2.80GHz, 4 vCPU, x64, 15.7 GB, linux, referenceHost false | P provenance.hardware | identical | yes |
| Commit eb321a1, dirty false | P provenance.git | shortSha eb321a1, dirty false | yes |
| Release 148 cases, 130 gated, 127/3/0/0, 4 deferred, 13 out of scope, 1 outside gates | R totals | 148/130/127/3/0/0/4/13/1 | yes |
| Harness 103 active, 99 passed, 4 failed (1 not yet implemented, EVAL-103, M2), 0 errored, 0 skipped | H totals, scope.outOfScope | 103/99/4, notYetImplemented 1, errored 0, skipped 0; outOfScope EVAL-103 M2 | yes |
| Functional 100.0 % (9/9), Reliability 100.0 % (4/4) | H categoryGates[0], [1] | "100.0 % (9/9)", "100.0 % (4/4)"; HR l.28-29 | yes |
| Deltas baseline-v0: S1 0/26, S1-floor 0.0 %, S2 0/14, S6-lib 0/8, S7 Yes, CF 1 | H comparison.baseline.gates (also baseline-v0-ledger-only.json) | 0.0 % (0/26), 0.0 %, 0.0 % (0/14), 0.0 % (0/8), Yes, 1; HR l.17-22 | yes |
| Changes +97.7 / +91.7 pts; S6-lib 0/8 -> 7/7 | arithmetic from the above | 97.7-0, 91.7-0 | yes |
| Previous formal run none; regressions none; improvements none | H comparison.previous / regressions / improvements | null / [] / [] | yes |
| Release exit 0, overall PASS | R summary | exitCode 0, overall PASS | yes |
| EVAL-122 evidence "Photo time 23 h from capture time" lone exif_time_agreement flag, Verified | H detection.undetected; HR l.88-100 | status flag, verdict Verified, all other checks ok; S1 42/43 | yes |
| Scenario-6 stretch 1/3 (EVAL-055/056 misses) | H detection.otherScenarios.6; HR l.76 | 1/3; HR lists EVAL-055, 056, 122 failed | yes |
| WARNING line (HR3/TP29) | R readiness, RR | text identical to R readiness[-1] | yes |

Not checked (not in a results file): TC test counts (261 / 260 / 4 / 40/40 / 35/35 / 2462), host uptime figures, kn.ts key counts.

## HR2 check

The text in the `markdown` fence of m-001-gate.md (50 lines) was extracted and compared with `evals/reports/eval-report-0.1.0-eb321a1.md` lines 102-151 (50 lines) using `cmp`. Result: byte-identical (exit 0). Line 102 is "## Known limitations", and line 151 is the last row of the EVAL-019/EVAL-040 table. The file's cited range is correct.

## HR1 check

The snapshot block in m-001-gate.md (53 lines, between the plain ``` fences) was compared with `src/lib/verification/__snapshots__/evidence.test.ts.snap` using `cmp`. Result: byte-identical (exit 0). `git diff d7124cb HEAD` shows no change to that file, `evals/results` or `evals/reports`, so the working tree is the formal-run state.

HR CHECK: PASS
