# QA-report — Udgam (M-001 + M-002)

**Stage 10 · consolidated pre-deployment gate.** It was assembled 2026-10-06 on `build/stage7` (PR 007U5H4R/udgam#1) and draws on Stage 8 (`DES-`), Stage 9 (`CR-`, `TC-`, `EVAL-`, `QA-S9-`) and Stage 10 (`SEC-`, `QA-S10-`).
- **Scope:** M-001 (TKT-01..21, TKT-30) and M-002 (TKT-22..26).
- **Out of scope:** M-003 (TKT-27..29: production hosting, the domain and the pilot). It has not started and runs after this gate.

## 1. Executive summary

**Recommendation: READY WITH ACCEPTED RISKS (for M-003 deployment work under the carry-ins in §5)**

The M-001 and M-002 build passes every stage:
- the design critique is clean;
- the code review is clean (22 of 23 fixed, 1 accepted);
- every TC case in scope passes (0 FAIL; the 6 BLOCKED are M-003);
- every evaluation gate matches baseline-v1 with no regression (S1 97.7 %, S2 0 %, CF 0, S4 max 2317 ms);
- the security re-run is clean, with **0 Critical and 0 High** findings open.

The accepted risks are deployment-time items. Each is now an acceptance criterion on an M-003 ticket (TKT-27, TKT-28; EXE49–EXE51), plus owner confirmations: the SEC-101 feed privacy shape, the Kannada native review, and the required CI checks.

**Not ready for a field pilot** until the Kannada strings are reviewed and the TKT-27/28 carry-ins land. This gate does not cover production; Stage 11 and M-003 do.

## 2. Per-stage results

### 2.1 Stage 8 · Design critique (`docs/exec/stage8/README.md`)
- **Findings:** 70 DES findings (P0 0 · P1 7 · P2 31 · P3 32). 64 were fixed and verified on the running app.
  - DES-030 was fixed in Stage 9 (CR-101).
  - DES-202 was resolved (EXE43/45).
  - 4 are parked with a reason: DES-005, DES-201, DES-204, DES-219.
- **Final re-run:** CLEAN.
- **Done-gates:**
  - responsive, screen states, accessibility (axe 0 violations) and mockup fidelity: PASS;
  - OG: PASS for tags, images and words. The live unfurl and the https URL are BLOCKED until Stage 11.

### 2.2 Stage 9A · Code review (`docs/exec/stage9/`)
- **Findings:** 23 CR findings (major 1: CR-200, CI ran no eval or e2e; the rest minor or nit; 0 blocker).
- **Outcome:** 22 fixed and verified; CR-105 skipped and accepted (EXE47).
- **Fresh re-run:** CLEAN. Its one new nit, CR-008, is fixed.

### 2.3 Stage 9B · Functional tests and evaluation (`docs/exec/stage9/stage9-run.md`)
| Suite | Result (46be176) |
|---|---|
| typecheck · lint | clean |
| `pnpm test` (unit + integration) · `test:int` | 2650 · 773 passed |
| `test:tz` (Los Angeles, Kolkata) | 2650 × 2 passed |
| `test:evm` · `contracts:test` | 42 · 47 passed |
| `test:e2e` (4 viewport projects) | 952 passed · 0 failed · 20 skipped (project-scoped) |
| `pnpm demo` | 6/6 |
| TC- cases (94) | 88 PASS · 0 FAIL · 6 BLOCKED (TC-087–092, M-003) · 0 NA |

QA-S9-001 (OG pixel test, CI only) and QA-S9-002 (axe title race, CI only) are fixed (EXE48). CI e2e is green on 9918ab1 (952 passed, twice) and on b13dfaf, which carries every Stage 10 fix (952 passed).

### 2.4 Evaluation
**Sources:**
- the formal record: `evals/reports/eval-report-v1.md` (eb321a1);
- Stage 9: `docs/exec/stage9/stage9-run.md`;
- the final non-formal release: `docs/exec/stage10/eval-report-local-b13dfaf.md`, a byte-identical copy of the report `evals/harness/release.ts` generated from `eval-run-v1-release-b13dfaf.local.json`, with the commands in `stage10-eval-run.md`.

The final release ran:
- integration: 267 EVAL tests;
- e2e: 281 passed, 0 unexpected;
- the demo;
- the harness, three times;
- S4.

Its result: 130 gated, 127 passed, 3 failed (the accepted misses), 0 missing, problems none.

baseline-v1 and the formal files are untouched (EV13, EXE34). The next formal eval report is TKT-29's, published from production.
| Area | Baseline (baseline-v1 / formal eb321a1) | Stage 9 (46be176) | Final (b13dfaf, local release) | Target |
|---|---|---|---|---|
| S1 detection, pooled | 97.7 % | 97.7 % | 97.7 % | ≥ 95 % |
| S1-floor, lowest scenario | 91.7 % | 91.7 % | 91.7 % | ≥ 90 % each |
| S2 false positives | 0 % | 0 % | 0 % | ≤ 5 % |
| S6-lib proof suite | 100 % | 100 % (M2/EVM 8/8) | 100 % (M2/EVM 8/8) | 100 % |
| S7 harness integrity | Yes | Yes | Yes | Yes |
| CF critical failures | 0 | 0 | 0 | 0 |
| S4 certificate < 3 s (10 cold loads) | max 2905 ms | max 2473 ms | p95 2285.5 ms, max 2317 ms | every load < 3 s |
| Release cases / S7-release | 28/28 · Yes | 28/28 · Yes | 28/28 · Yes | all · Yes |

- **Failed evaluation IDs:** EVAL-055, EVAL-056 and EVAL-122. These are reported misses, held by the owner and already in baseline-v1 (EXE27, QA-P4-1). They are not critical, and no gate fails because of them.
- **Regressions:** none since baseline-v1, across all 103 harness cases and all 148 release cases.
- **Improvements:** EVAL-103 passes on the EVM ledger, and S4 is faster.
- **Reported, not gated:** S4 verify time has a p50 of 322 ms against the §18 budget of 300 ms (baseline: 401.5 ms).

### 2.5 Stage 10 · Security review (`docs/exec/stage10/`)
- **First pass** on dd7b0c1, by three reviewers: 0 Critical · 0 High · 2 Medium · 9 Low · 4 Info. SEC-103 (Low) was found during the fixes.
- **Fixed with the failing test first:** SEC-002, SEC-004, SEC-007, SEC-100, SEC-102, SEC-103, SEC-200, SEC-201, SEC-202, plus QA-S10-001.
- **Parked or accepted:** see §5.
- **Re-run:** **SEC RE-RUN: CLEAN** at b13dfaf (`stage10-sec-rerun.md`). All 10 fixes are VERIFIED-FIXED with probes, the parked items are recorded with an owner and a ticket, and there are no new findings.

## 3. Unified findings register
There is one row per underlying problem. Severity is the strongest any stage gave it, normalised: Critical / High / Medium / Low / Info. Only the open or notable rows are listed in full. The closed DES and CR findings are in their stage registers and are counted in §4.

| ID(s) | Problem | Sev | Sources | Status |
|---|---|---|---|---|
| SEC-002 | Multipart part-count parse cost: 3.6 s of event-loop stall per request | Medium | S10 | Fixed (140d4be) |
| SEC-001 | Every seeded account shares one password; there is no per-account provisioning path | Medium | S10 | Parked → TKT-28 (EXE49) |
| SEC-004 | Two agents could hold every capture and stage slot | Low | S10 | Fixed (5de3953; pool 8, cap 2, EXE50) |
| SEC-005 | 3 MB Server Action bodies are buffered before any guard | Low | S10 (also an EXE flag) | Parked → TSK-27.3 (EXE50) |
| SEC-003 | No per-phone storage quota | Low | S10 | Parked → TKT-28 (EXE49, corrected in EXE51) |
| SEC-006 · EXE14 | Per-IP limits trust the last X-Forwarded-For hop; no proxy config yet | Low | S10 | Parked → TSK-27.3 (EXE49) |
| SEC-100 · SEC-103 | Remote-sensing clients followed cross-origin redirects carrying the key or secret | Low | S10 | Fixed (24a1c96, 1da9300) |
| SEC-101 | The public feed shows the signed phone GPS fix (7 dp) and opaque IDs | Low | S10 | Accepted as public by design; owner to confirm before production data (EXE49, `docs/proof-feed.md` §9.2a) |
| SEC-200 | EVM sends from one account collided on the nonce | Low | S10 | Fixed (4cf943f) |
| SEC-201 | `*.jwk` and `data-ci/` were not git-ignored; gitleaks missed JWKs | Low | S10 | Fixed (0b86098) |
| SEC-202 | Actions and pnpm were pinned by mutable tag | Low | S10 | Fixed (7913817) |
| SEC-007 · SEC-102 | No HSTS from the app; `X-Powered-By` was sent | Info | S10 | Fixed (44d25ba, 1e27c6a) |
| SEC-203 | Escrow events and terms are readable on chain | Info | S10 | Parked → TKT-27; the RPC stays private (EXE29, EXE49) |
| SEC-204 | esbuild dev-server advisory via drizzle-kit (moderate) | Info | S10 | Accepted: dev-only, below the CI gate (EXE49) |
| CR-200 | CI ran no eval, tz or e2e | Medium (CR major) | S9A | Fixed (30a7346); owner to make the jobs required checks (EXE47) |
| CR-105 | Both i18n dictionaries are in one client chunk | Low | S9A | Accepted: inside the budget (EXE47) |
| QA-S9-001 | OG pixel test failed on CI's Chromium | Low | S9B | Fixed (bdf8469, EXE48) |
| QA-S9-002 | Axe ran before the streamed `<title>` | Low | S9B | Fixed (97a08a4, EXE48) |
| QA-S10-001 | Tests leaked temp folders (~2.2 GB a day) | Low | S10 | Fixed (f181a4a) |
| DES-030 · CR-101 | Kannada photo slot overflowed by 3 px at 320 px | Low (P3) | S8, S9A | Fixed (3b0efb6) |
| DES-219 | `PUBLIC_BASE_URL` falls back to localhost | Low | S8 | Parked → TKT-28 (https required in production) |
| DES-005 · DES-201 · DES-204 | No time promise; a lone processor hop's label; org IDs, not names, on the certificate | Low | S8 | Parked by decision (EXE24, EXE32, EXE28) |
| EVAL-055 · EVAL-056 · EVAL-122 | Reported detection misses (stretch or owner-held) | Low | Eval | Accepted and reported (EXE27, QA-P4-1); in baseline-v1 |
| TC-087–092 | M-003 cases | — | S9B | BLOCKED: M-003 not started (TKT-27, TKT-28) |
| Kannada strings | 617+ strings drafted, not reviewed by a native speaker | Low | S8, S7 | Owner item; cannot be delegated |

## 4. Severity summary
| Severity (SEC) | Raised | Fixed | Parked or accepted | Open |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 |
| Medium | 2 | 1 (SEC-002) | 1 (SEC-001 → TKT-28) | 0 |
| Low | 10 | 6 (SEC-004, 100, 103, 200, 201, 202) | 4 (SEC-003, 005, 006 → M-003; SEC-101 accepted) | 0 |
| Info | 4 | 2 (SEC-007, 102) | 2 (SEC-203 → TKT-27; SEC-204 accepted) | 0 |

Stage totals: DES 70 (64 fixed, 4 parked, 2 resolved through Stage 9 or by decision) · CR 23 (22 fixed, 1 accepted) · TC 94 (88 PASS, 6 BLOCKED) · SEC 16 (11 fixed, 5 parked to M-003, 2 accepted; SEC-101 accepted, owner to confirm) · QA 3.

## 5. Open issues and accepted risks
Nothing is silently omitted. Each item has an owner and a trigger.
- **Before any production deployment (M-003 · Stage 11)**, as TKT-27/28/29 acceptance items:
  - SEC-001: per-account provisioning, no shared password;
  - SEC-005 and SEC-006: Caddy `request_body` cap and X-Forwarded-For, with the forged-header test (TSK-27.3);
  - SEC-003: storage budget and disk alert;
  - SEC-203: the RPC stays private;
  - DES-219: an https `PUBLIC_BASE_URL`;
  - migrate with `pnpm db:migrate`; the trace check on the standalone build;
  - S4 re-measured on the Oracle A1 host.
- **Owner confirmations:**
  - SEC-101: the feed's privacy shape, before the first production anchor;
  - the Kannada native review;
  - the three new CI jobs as required checks on main;
  - the delegated decisions EXE24–EXE50.
- **Pre-pilot inputs:**
  - official district boundaries (EXE28);
  - pulping and drying bands (EXE29);
  - FPO yield validation (TP6);
  - HR3 field calibration (waived in TP29, so S2 realism is an assumption);
  - the midday sunlight test.

## 6. Formal QA gate
| Gate | Evidence | Result |
|---|---|---|
| Design | Stage 8 RE-RUN: CLEAN; done-gates PASS (live unfurl → Stage 11) | PASS |
| Code quality | CR RE-RUN: CLEAN; 22/23 fixed, 1 accepted | PASS |
| Functional test | 94 TC: 0 FAIL; every suite green; CI e2e green | PASS |
| Evaluation | Every M1 gate passes and matches baseline-v1; no regressions; CF 0 | PASS |
| Security | 0 Critical/High open; Medium/Low fixed or parked with owner and ticket | PASS (with accepted risks) |
| **Overall** | | **READY WITH ACCEPTED RISKS** |

**Release-gate check** (eval-framework): no critical functionality fails; no critical security issue exists; every mandatory acceptance criterion in scope passes; every required evaluation suite ran; no critical regression; no threshold weakened (cfg-1 and baseline-v1 are frozen, EV13, EXE34).
