# Stage 7 report — Execution (Udgam)

Branch `build/stage7` from `main` @ `b397c08`. Report head `eb321a1`, 2026-10-05. Protocol: technical-plan.md §21.2, as modified by EXE1 (the owner waived the stops at the phase gates and at the M-001 gate) and EXE22 (go straight on to Stage 8). Every quality gate still ran. The source of truth is `docs/exec/ledger.md`. Tracking PR: https://github.com/007U5H4R/udgam/pull/1 (not merged in Stage 7).

## 1 · Scope delivered

**M-001: TKT-01..21 and TKT-30.** All are done except TKT-21, whose formal run is pending.

| Ticket | Campfire | Ticket | Campfire |
|---|---|---|---|
| TKT-01 walking skeleton | TASK-2 | TKT-12 admin review, re-run, overrides | TASK-13 |
| TKT-02 tracer bullet | TASK-3 | TKT-13 organic attestation | TASK-14 |
| TKT-03 eval harness v0, baseline-v0 | TASK-4 | TKT-14 batches, custody, buyer list | TASK-15 |
| TKT-04 sign-in, roles, org boundaries | TASK-5 | TKT-15 checkpoints, proof feed | TASK-16 |
| TKT-05 phone enrolment, revocation | TASK-6 | TKT-16 public certificate, in-browser proof | TASK-17 |
| TKT-06 plot registration | TASK-7 | TKT-17 EUDR GeoJSON, print, link preview | TASK-18 |
| TKT-07 satellite checks | TASK-8 | TKT-18 clean-room checker, proof spec | TASK-19 |
| TKT-08 location and time checks | TASK-9 | TKT-19 capture boundary hardening | TASK-20 |
| TKT-09 yield, chain, replay | TASK-10 | TKT-20 Kodagu demo data, demo script | TASK-21 |
| TKT-10 capture app | TASK-11 | TKT-21 M-001 evaluation, baseline-v1 | TASK-22 (**in progress**) |
| TKT-11 outbox, pickings, help, language | TASK-12 | TKT-30 staged photo upload | TASK-31 |

TKT-21's phase A is merged: readiness, the baseline freeze guard and the fail-closed release evaluation. Phase B is the formal baseline-v1 run (`docs/exec/m-001-formal-run.md`); it is in progress, and its results are in section 4.

**M-002: TKT-22..26, all done.**
- TKT-22 Foundry spike: TASK-23.
- TKT-23 design addendum (D9, D10): TASK-24.
- TKT-24 EVM ledger adapter: TASK-25.
- TKT-25 contract farming: TASK-26.
- TKT-26 processor hop: TASK-27.

**M-003 (TKT-27..29 = TASK-28..30): not started.** It is out of scope for this run.

## 2 · How it ran
- **TDD.** Each implementer wrote failing tests first and reported any test that was never seen red.
- **Reviews.** Every task had 2 reviews, by fresh reviewers in their own `git clone --shared` copies at a pinned SHA: spec compliance (Sonnet) and code quality (Opus).
- **Fix rounds.** At most 2 per task. **No ticket hit BLOCKED.** Merges went through the orchestrator after the gates ran (EXE21).
- **Per-phase QA.** An independent QA subagent re-ran the gates and the phase's TC/EVAL cases, then the gate report was written to the ledger.
- **Parallelism.** At most 3 implementers at once, each in its own worktree. Parallel migrations were renumbered at merge by regenerating them (EXE21).
- **Follow-ups.** Review minors and nits were batched into follow-up tasks: P5 follow-ups (merge `a9660b1`), follow-up 2 (`29335b5`) and follow-up 3 (`eb321a1`).
- **Interruptions.** A container restart stopped all agents once (P5). They resumed from their transcripts, and no work was lost.

**Fix rounds per ticket (from the ledger):**

| Fix rounds | Tickets |
|---|---|
| 0 | TKT-08, TKT-13, TKT-14, TKT-18, TKT-22, TKT-26, TKT-30 |
| 1 | TKT-01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 15, 16, 17, 21 (phase A, then re-review residuals), 23, 24, 25 |
| 2 | TKT-19, TKT-20; also the EVAL-086 e2e added to TKT-10 |

## 3 · Gate summary per phase

| Gate | Tickets | Result | QA head | Key numbers |
|---|---|---|---|---|
| P1 · 2026-09-29 | TKT-01 | PASS | b35168a | test 73; int 3; e2e 12 (4 projects); eval stub (exit 1 as planned); audit high 0 |
| P2 · 2026-09-29 | TKT-02 | PASS | 802e0a2 | test 280; int 53; e2e 32; TC-006–013 PASS |
| P3 · 2026-09-29 | TKT-03 ∥ TKT-04 | PASS | 41384f0 | test 673; int 141; e2e 68; dataset 0.3.0 (109 cases); baseline-v0 reproduces (detection 0/26, CF-01 on all 10 hard-fail attacks) |
| P4 · 2026-09-29 | TKT-05, 06, 08, 15 | PASS with 1 recorded exception | 1a58451 | test 964; int 222; e2e 136 (+4 skipped); S6-lib 7/7. Exception QA-P4-1: EVAL-034 lone time flag (resolved by EXE10) |
| P5 · 2026-09-29 | TKT-07, 09, 10, 13, 14, 18, 19 | PASS | c26bf36 (+2bc4d48) | test 1670; int 477; e2e 320 passed, 0 failed on merged head a93d66c; eval M1 PASS: S1 97.7 % (42/43), lowest scenario 91.7 %, S6-lib 7/7, S7 yes, CF 0 |
| M-002 · 2026-10-05 | TKT-22..26 | PASS | 3b625cd | test 2352; int 746; test:evm 41; contracts 47; `--ledger=evm --milestone=M2` PASS (S6-lib 8/8, EVAL-103); e2e 196/196; TC-082–086 5/5; EVAL-093–105 13/13 |
| P6–P8 · 2026-10-05 | TKT-11, 12, 16 · TKT-17, 30 · TKT-20 | PASS | 3b625cd | test 2352; int 746; harness PASS (S1 97.7 %, S1-floor 91.7 %, S2 0/40, S6-lib 7/7, CF 0); e2e 674 passed, 15 skipped, 3 load failures that pass serially (36/36); `pnpm demo` 6/6; EVAL-070 Submit → verdict 3.9 s staged vs 25.1 s not |
| P9 / M-001 · 2026-10-05 | TKT-21 | PASS (owner review items open) | eb321a1 | Formal run: release exit 0, 127/130 gated cases; see section 4 |

The cases still failing in M1 are the reported ones: EVAL-055/056 (scenario 6, stretch), EVAL-122 (EXE27) and EVAL-103 (M2 only). The open QA findings are in sections 6–8.

## 4 · M-001 formal evaluation

Formal run at the gate commit **eb321a1**, following `docs/exec/m-001-formal-run.md`. Formal commit **d7124cb**, report commit **24d40a8**, merged into build/stage7 at ebb42ce. The owner gate stop is waived (EXE1); the owner review items in `docs/exec/m-001-gate.md` (HR1, HR2, HR6, the Kannada review) remain open.

| Gate | Value | Target | Result |
|---|---|---|---|
| S1 | 97.7 % (42/43) | ≥ 95 % | PASS |
| S1-floor | 91.7 % (11/11, 11/12, 10/10, 10/10) | ≥ 90 % each | PASS |
| S2 | 0.0 % (0/40) | ≤ 5 % | PASS |
| S4 | 10/10 verified < 3 s; p50 2452 ms, p95 2847 ms, max 2905 ms | each < 3 s | PASS |
| S6-lib | 100 % (7/7) | 100 % | PASS |
| S7 / S7-release | Yes / Yes (0 missing, 0 skipped) | Yes | PASS |
| CF | 0 | 0 | PASS |

**The release run** (`evals/results/eval-run-v1-release-eb321a1.json`) exited 0, with 127 of 130 gated cases passing:
- the 3 failures are EVAL-122 (EXE27) and EVAL-055/056 (EXE10, stretch);
- 4 cases are deferred to M-003;
- the suites inside it: integration 261, e2e 260 (8 skipped), demo 4.

**Readiness** was READY, with the HR3/TP29 warning printed: S2 realism and the S3 reference condition are unvalidated assumptions.

**S4 host:** 4-vCPU Intel Xeon x64 at load 0.3–1.4. This is not the Oracle A1 reference (TKT-29).

**Reported, not gated:** the in-browser verify of a 50-entry feed took p50 402 ms and max 516 ms at 4× throttle, against the 300 ms sub-budget (EXE24). It has a BUG row owned by TKT-16.

**baseline-v1 is frozen** (EV13). The single strict change rule (EXE34) and the config-freeze test now guard it.

**The step-4 env fix** is recorded in EXE38.

## 4b · Final whole-branch review (completion step)
The completion review (Opus, whole branch at ebb42ce) found 0 blockers, 1 major, 2 minors and 6 nits:
- **Major:** an unscoped dynamic path in `deployment.ts` made the server build trace the whole project, `data/keys` included. Not exploitable today, but TKT-27's standalone output would have copied private keys into the deploy artifact.
- **Minors:** an unbounded `/api/enrol` body; three drifting key-file helpers.

It confirmed clean:
- the consistency of ledger kinds across the closure, both verifiers and the docs;
- migrations 0000–0035 from empty;
- production unreachability of every test, demo and E2E surface, probed live;
- guard coverage across all four route groups;
- one `clientIp`, `writeTx` and JCS;
- the escrow invariants and the i18n.

The single fix wave (EXE39, merged at 6a6051d) fixed all 9 findings. It added a CI trace check that fails on any key, secret or data file in a server trace. The reviewer's verification of the fix wave is recorded in the ledger's "Stage 7 completion" section.

## 5 · Decisions

| ID | One line |
|---|---|
| EXE1 | Owner waiver: Stage 7 runs through every phase gate and the M-001 gate without stopping. |
| EXE2 | TKT-01 toolchain adjustments for pnpm 12 and the cloud VM (lazy env, Chromium path). |
| EXE3 | TKT-02 foundations: the `writeTx` write queue, boundary status codes, a test-only route. |
| EXE4 | Eval harness v0 semantics (fails closed; `client_clock` sign). |
| EXE5 | Auth under Next 16 and Better Auth 1.7: proxy, redirects, unanchored ownership refusals, a stricter guard rule. |
| EXE6 | Location and time checks: dataset 0.3.0, a measured lone-flag miss, exifr outside the bundle. |
| EXE7 | Enrolment and device-state rules (TKT-05). |
| EXE8 | Plot geometry and anchoring (TKT-06). |
| EXE9 | Proof feed v1 hardening (TKT-15). |
| EXE10 | An EXIF time gap over 24 h fails, judged by the worst photo (owner; amends TP4). |
| EXE11 | Replayed rejected captures are re-checked, not frozen (owner). |
| EXE12 | Fixture satellite data can't run in production and is labelled "(demo data)" everywhere (owner). |
| EXE13 | `device_enrolled` keeps `agentId`, an opaque random ID (owner). |
| EXE14 | Caddy overwrites X-Forwarded-For, and the app trusts only that value (owner; TKT-27). |
| EXE15 | Clean-room checker and harness milestone scoping (TKT-18). |
| EXE16 | Batches, custody transfer and the buyer list, with extra DB invariants (TKT-14). |
| EXE17 | Capture boundary hardening, CSP and sign-in limits (TKT-19). |
| EXE18 | Satellite checks, caching and honest failure (TKT-07). |
| EXE19 | Organic certificate attestation (TKT-13). |
| EXE20 | Yield, chain and replay under the write lock (TKT-09). |
| EXE21 | How Stage 7 merges parallel work. |
| EXE22 | Owner waiver: go straight from Stage 7 into Stage 8 (owner). |
| EXE23 | Owner decisions OD-1, 2, 3, 4, 6 and 9 before baseline-v1 (owner). |
| EXE24 | OD-5 (no time promise on Needs a check) and OD-8 (budget restated), delegated. |
| EXE25 | A staged photo that fails its re-hash is treated as missing (amends TC-094(b)). |
| EXE26 | A multi-part plot under 4 ha exports one point per part (extends TP24). |
| EXE27 | EVAL-122 stays a reported miss (owner; supersedes OD-1 → b). |
| EXE28 | Hand-drawn district outlines, organisation IDs on the certificate, split-pickings docs. |
| EXE29 | Open M-002 owner items, delegated (public grade, terms in storage, placeholder bands, migrate runner). |
| EXE30 | TKT-25 contract-farming deviations. |
| EXE31 | TKT-26 processor-hop deviations. |
| EXE32 | A lone processor hop with no step is a known certificate gap. |
| EXE33 | The demo page never runs in production; the M-003 rehearsal uses a staging copy. |
| EXE34 | One strict rule authorises a verification-config change after baseline-v1; the release fails closed. |
| EXE35 | The demo seed needs an explicit development or test environment. |
| EXE36 | Formal-release residuals after the TKT-21 re-review. |
| EXE37 | Accepted implementation deviations for TKT-11, 12, 16, 17, 22, 24 and 30, including the §0 row for viem 2.56.9. |
| EXE38 | The S4 perf server gets a throwaway auth secret; the formal M-001 result. |
| EXE39 | Final whole-branch review and fix wave: no keys in server traces (CI check), bounded enrolment, one key-file helper. |
| D9 | M-002 screens addendum (Design.md §28, `contract.html`). Accepted under the waiver; pending owner review at Stage 8. |
| D10 | Addendum revision after review: no buyer rail, touch points T1–T4, field checks, action states. Accepted under the waiver; pending owner review at Stage 8. |

## 6 · Owner items open
- **M-001 gate (`docs/exec/m-001-gate.md`).**
  - OD-1 to OD-9 are all decided: EXE23, EXE24, EXE27.
  - OD-5 and OD-8 were decided on the owner's behalf (EXE24), and the owner may revisit them at Stage 8.
  - HR1 (evidence-template snapshots), HR2 (known-limitations wording, including GAP-7) and HR6 (each scorecard number traced to its results file) are to be prepared in docs/exec when Stage 7 closes (EXE22). HR3 was waived (TP29), and the release report prints its warning.
- **Before production (PRE-1 to PRE-4):**
  - restrict the map tile key;
  - switch to the live remote-sensing provider and re-record the fixtures;
  - the Kannada native review;
  - the Caddy X-Forwarded-For test (TSK-27.3).
- **D9/D10 review at Stage 8,** including §28.10's request to confirm that touch points T1–T4 are not freeze changes.
- **Kannada native review.** Every string marked `REVIEW: native speaker` needs it, including the TKT-11 drafts and the 169 drafts TKT-25 added.
- **Pre-pilot:**
  - Official district boundaries to replace the hand-drawn outlines (EXE28; for example DataMeet, CC BY 2.5 IN).
  - Confirmed pulping (35–50 %) and drying (40–60 %) bands, from Coffee Board/CCRI or FPO records (EXE29).
  - FPO validation of the yield reference (TP6).
- **Pre-public-chain.** The escrow contract must store only a terms hash before any public-chain deployment (EXE29).
- **toOrgType ticket.** Before any processor pilot, add a signed `toOrgType` to new `custody_transfer` payloads and label hops from it (EXE32).
- **M-003 notes:**
  - The container entrypoint runs `pnpm db:migrate`, never `drizzle-kit migrate` (EXE29); a guard test is queued.
  - The EVAL-072 live rehearsal runs on a staging copy with its own DATA_DIR (EXE33); TKT-29's brief must say so.
  - `PUBLIC_BASE_URL` must be an https value in production (QA-P6-8-3, TKT-28).
  - `next build` traces the whole project through `src/lib/ledger/evm/deployment.ts` (QA-M002-3, TKT-27 image size).
  - Run the arm64 Anvil check (TSK-27.1).
  - Check hard-link support for the ledger key on the Oracle A1 volume.
- **Smaller owner notes:**
  - Cross-check the solc 0.8.37 digests against `binaries.soliditylang.org`; they were trust-on-first-download (TKT-22).
  - EVAL-094–096 say "reverts", where the plan records a not-released outcome (wording only; no EVAL edit).
  - No legitimate case runs on cloud-blocked plot P09.
  - `device_not_owned` visibility on a shared phone (TKT-11).
  - A same-seq second offline picking stays Verified (EXE37). Capping it would be an EV/TP change after baseline-v1.

## 7 · Carried to Stage 8 (design and copy)
- **QA-P6-8-4:** EVAL-087/TC-071 expect a QR on the printed certificate, which has none. Add a print-only QR, or amend the case text through the owner (CF-13).
- **QA-P6-8-5:**
  - the tab bar floats mid-screen on short Pickings pages;
  - "What can I do?" is underlined;
  - queue IDs wrap;
  - review detail doesn't mark the photo used before;
  - certificate map plots have no labels.
- **QA-M002-1:** after grading, the buyer reads "Funded · waiting for delivery" while the admin reads "Ready to settle". §28.7 has no word for this state; the suggestion is "Graded · waiting for the FPO to settle".
- **OG image:** the frozen `og/verify.png` says "Kodagu Arabica" for every batch. Use a neutral image, or one per district or crop (Design Freeze item).
- **The Not accepted halo:** the brand SVG's mint halo, pool and rim still show on Not accepted (TC-048 checks text colour only).
- **EVAL-086 N8:** the e2e does not catch `color: transparent` evidence text. It is a contrast check for the Stage 8/9 accessibility pass.
- **QA-P5-8 visuals:**
  - the weight keypad and Send pill are not anchored to the bottom;
  - the "No network here" sheet lacks its backdrop, icon and bold text;
  - the Home place line shows the farmer label;
  - "150 m" and "(demo data)" wrap. No-break spaces were added in a9660b1; re-check.
- **TKT-11 spec nit 10:**
  - the s7 under-layer lacks the mockup's Back button and "Your last pickings" hint, and puts the eyebrow on the left;
  - the Help verdict rows' text start varies with chip width;
  - "Send now" wraps at 320 px.
- **The journey shows `ORG-…` IDs, not names (EXE28).** Names need each party's consent and a signed feed field.
- **D9/D10 and the delegated decisions** EXE24 (OD-5 copy) and EXE29 are open for the owner to revisit.

## 8 · Carried to Stage 9 (code review)
- **EXE36 residuals:**
  - R-6: a config-changes row citing a "Rejected" EV/TP heading still authorises a change.
  - A formal harness run can be repeated at one HEAD (it writes `-r2`).
  - A report edited together with its run record's SHA-256 can't be detected without signing.
- **EVAL-086 N7:** `transform: scale`/`zoom` on `.ev-t` is not caught. Check that the drawn line height is ≥ 13 px.
- **TKT-21 quality B-8:** after baseline-v1, compare each baseline case's class and expected verdict with the dataset, not only `CONFIG_HASH`.
- **TKT-11 nits left unchanged:**
  - the same-seq order in `submitCapture`;
  - `putOutbox` uses `getAll`;
  - photo order by rowid;
  - `HomeError`'s Try again is a link, not a button.
- **TKT-16 r2:** the perf `server` summary's `pass` field reuses the 3 s threshold and means nothing.
- **TKT-17 A7:** optionally add P06 to the mixed batch, so EVAL-078's literal input is exercised.
- **TKT-22 B-4:** optionally cache Foundry and solc in CI, keeping 1 uncached path.
- **Proof-feed doc round-4 minors** (reports/TASK-16-doc-sufficiency.md).
- **CI does not run `pnpm test:tz`.**
- **For Stage 10 (recorded in EXE17 and the P5 gate):**
  - R1–R4 capture-slot and body-memory limits;
  - per-instance state assumes one app instance;
  - browser-exposed tile keys (PRE-1);
  - anonymous ledger growth from unattributed boundary refusals.

## 9 · Numbers
- **Commits on the branch** (`git rev-list --count b397c08..HEAD` at eb321a1): 389 (335 non-merge, 54 merges).
- **Files changed** (`git diff --shortstat b397c08..HEAD`): 1041 files, 248,331 insertions, 29 deletions.
- **Migrations:** 0000–0035, 36 files in `src/lib/db/migrations/`.
- **Final test counts:** 2462 unit + integration on the gate commit eb321a1.
- **Eval dataset:** 0.8.0, 148 cases.
- **Decisions:** EXE1–EXE39, plus D9 and D10.
- **Final test count at the Stage 7 head (6a6051d):** 2513 unit + integration; `test:evm` 41; `contracts:test` 47; `pnpm build` with 0 warnings.
