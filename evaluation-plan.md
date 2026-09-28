# Evaluation Plan — Udgam

**Stage:** 3 · Evaluation Design (build-workflow)
**Status:** Draft for owner sign-off at the Stage 3 gate
**Date:** 2026-09-28
**Inputs:** `Discovery-PRD.md` §6–7 (approved 2026-09-24), `Solution-PRD.md` (approved 2026-09-28), `decisions.md` DISC1–DISC16 and S1–S9
**Decisions appended by this stage:** `decisions.md` EV1–EV16 (those marked `proposed` need an owner decision; see §15)
**Companion files:** `evals/eval-dataset.json` (92 seeded cases, EVAL-001 to EVAL-092) and `evals/eval-dataset.schema.json`
**Method source:** `.claude/workflow/eval-framework.md`. This plan applies that method to Udgam and does not restate it.

This file is the only copy of the evaluation plan. It sits at the project root with the other planning artifacts; `/evals` holds the dataset, its schema, and (from Stage 7) results and reports (EV1).

---

## 1. What would make Udgam unacceptable for release?

Any one of these blocks release. No threshold is relaxed to get a pass (Discovery-PRD §7; eval-framework "Release gates").

1. **It misses fraud.** Detection on the seeded attack set for scenarios 1–4 is below 95 % overall, or below 90 % in any one scenario (S1, §4.1). Or any attack that a hard-fail rule covers comes back anything other than Rejected (CF-01).
2. **It punishes honest farmers.** More than 5 % of the legitimate set is not Verified (S2, §4.2). Or any honest submission is Rejected (CF-02). Or a provider outage or a crashing check produces a Rejected verdict (CF-03).
3. **Its proofs can lie.** The certificate page, or an independent checker written from the proof format alone, reports a tampered record as verified (CF-04). Or any record anchored for a batch cannot be re-verified from its certificate page (S6, §4.6).
4. **Its identity layer can be bypassed.** A capture signed by an unknown or revoked key, or with a payload changed after signing, is accepted (CF-05). Or a hard-failed rejection can be overridden (CF-06).
5. **Its data invariants are only in application code.** An event sits in two batches, a batch score is not the minimum of its events, a transferred batch can be edited (CF-07), or a provenance row exists without its ledger entry (CF-08).
6. **It is too slow to demo or use.** Capture-to-verdict exceeds 30 s on the reference condition (S3, §4.3), certificate verification takes 3 s or more (S4, §4.4), or the live demo cannot be done in under 10 minutes without touching the database (S5, §4.5).
7. **It claims more than it can prove.** Any page says organic status is "verified", or shows any claim the page cannot recompute from evidence (CF-11).
8. **Its evidence is not real.** The evaluation report has a number that did not come from a harness run, or a gated case was skipped or removed (CF-12, S7). Or a threshold, weight, or expected verdict changed without a decision entry (CF-13).
9. **It is insecure.** A secret is in the repo, logs, or client bundle (CF-09); a role or organisation boundary can be crossed (CF-10); or a critical or high security finding is open at Stage 10.

## 2. What is evaluated and why

| Object | Why it matters | Main gates |
|---|---|---|
| Verification pipeline `verify(submission, context)` (Solution-PRD §4) | This is the product thesis: making physical reality trustworthy before it reaches the ledger (Discovery-PRD §2.2) | S1, S2, CF-01–03 |
| Capture boundary (`/api/capture`: signature, device state, upload validation, transaction) | Trust at the edge fails if the boundary accepts forged or tampered input | CF-05, CF-08, CF-14 |
| Ledger and proofs (`Ledger`, `verifyProof`, checkpoints) | A certificate is worth only as much as a stranger's ability to re-check it | S6, CF-04 |
| Certificate page `/verify/[batchId]` | The public verifier's only interface; must be quick and correct on a phone | S4, S6, CF-11 |
| Capture flow on a phone | The field agent's 60-second task (Discovery-PRD §3) and the demo's headline moment | S3 |
| End-to-end demo | The grant-evaluator audience sees it live (DISC1) | S5 |
| Batches, custody, overrides, attestations, EUDR export | Business rules a buyer or importer relies on | CF-06, CF-07, CF-11 |
| Evaluation harness itself | Evaluators must be able to trust the scorecard | S7, CF-12 |
| Auth, secrets, dependencies, public data exposure | Security-sensitive, public-facing system (Full tier) | CF-09, CF-10 |
| UI surfaces (agent, admin, buyer, verify) | N4 responsiveness; web-deliverables gates | Design gate (§6) |

Milestone 2 (EVM adapter, contract farming, processor mass-balance) is not seeded yet. Before M2 starts, its cases are appended here and to the dataset: the proof suite (EVAL-058 to EVAL-066) re-runs against the EVM adapter, and the settlement and mass-balance rules get functional cases. Foundry contract tests are `TC-` tests, not evals.

## 3. Evaluation categories (EV2)

| Category | Applies | Depth | Why |
|---|---|---|---|
| Functional | Yes | Deep | Twelve-check registry, scoring, verdict, ledger, business rules |
| Product acceptance | Yes | Medium | Demo script, review queue, certificate, GeoJSON, organic wording |
| Performance | Yes | Focused | Two hard latency gates (S3, S4); nothing else is performance-critical at MVP load |
| Reliability | Yes | Medium | Provider outages, cloud cover, throwing checks, transaction atomicity, retries |
| Security | Yes | Deep | The attack set is the security evaluation of the verifier; plus boundary, authz, secrets, privacy |
| Design | Yes | Medium | N4 at 375/768 px, four screen states, WCAG 2.2 AA scan, link-preview tags; Stage 4 `Design.md` adds specifics |
| **AI** | **No** | — | The MVP has no ML, LLM, RAG, or agent behaviour. S4 rejected an ML classifier ("no training data"). NDVI and forest-loss inputs are deterministic answers from hosted query APIs, scored by fixed rules. If a learned component is added later (for example a photo-content or near-duplicate model), the AI category turns on with its own EV decision and baseline. |

Tests and evaluations are both needed. `TC-` cases (Stage 6) check that each unit behaves as specified. `EVAL-` cases measure how good the outcome is (detection, false positives, latency, verifiability). Where an EVAL integration case and a TC test cover the same thing, Stage 6 links them rather than writing two.

## 4. Release gates S1–S7: metric, method, threshold

The gate IDs are the success-criterion IDs from Discovery-PRD §7. Each definition below fixes how the number is computed, so it cannot be recomputed more generously later (EV3).

### 4.1 S1 — Detection rate, scenarios 1–4: ≥ 95 %

**Population.** Cases with `suite: harness-verifier`, `case_class: attack`, `scenario` 1–4, `status: active`. Known-limitation cases are listed in the report but are not in this population (EV6). Scenarios 5–6 are reported separately and are not in S1.

**Detected** (EV4). An attack case counts as detected only when both of these hold:
- the verdict is in `acceptable_verdicts` (which never includes Verified), **and**
- at least one of its `catching_checks` returned `flag` or `fail`.

The second condition is attribution. A case that ends up in Needs Review only because a provider was unavailable has not been detected; it was lucky.

**Metrics.**
- S1 pooled = detected ÷ population. Gate: **≥ 95 %**.
- Per-scenario detection. Gate: **≥ 90 % in every scenario** (EV5, proposed). S1 as written is pooled; without a floor, a strong scenario can hide a weak one. At the target of 10 cases per scenario, this allows at most one miss in any scenario and two overall.
- Hard-fail exactness: cases with `expected.verdict: Rejected` and `hard_fail_checks` must be Rejected with `hardFail: true` on those checks. Any miss is **CF-01**, whatever the pooled rate. These rules are deterministic, so a miss is a bug, not a tolerance.

**Sample-size caveat, shown in every report.** With small seeded sets a perfect score does not prove a field detection rate. The report prints a Wilson 95 % interval next to each rate; it is information, not a gate. Worked values: 10/10 gives a lower bound of 72.2 %; 40/40 gives 91.2 %; 38/40 gives 83.5 %. The seeded set shows that each rule catches what it is meant to catch. It does not estimate how often fraud is caught in the field.

**Risk found while designing S1: the verdict maths lets single-signal attacks through.** Solution-PRD §4.3 sets score = 100 × weighted mean and Verified at ≥ 80, and most check failures are not hard fails. Weights are not set yet. Under equal weights, and assuming ok/flag/fail score 1/0.5/0:
- one `fail` (EVAL-022, a capture 2.4 km outside the plot) gives 11/12 = 91.7 → **Verified**;
- one `fail` plus one `flag` gives 10.5/12 = 87.5 → **Verified**;
- two `fail`s give 10/12 = 83.3 → **Verified**.

About half the S1 attack cases are single-signal by design (tag `single-signal`). S1 cannot pass without either (a) a verdict rule that stops a `fail` from ending in Verified, or (b) weights chosen so that it cannot. Option (b) invites tuning weights to the eval set. EV7 (proposed) recommends (a): **any check with status `fail`, or a `flag` on `deforestation_overlap` or `yield_plausibility`, caps the verdict at Needs Review.** It changes the S4 verdict rule, so it is the owner's decision (§15, Q1). The cases express the product requirement ("this attack must not be Verified") whichever option is chosen; the harness shows whether the chosen option meets it.

### 4.2 S2 — False-positive rate on the legitimate set: ≤ 5 %

**Population.** `case_class: legitimate`, `status: active`: honest captures with complete evidence, all expected Verified. They include the realistic awkward cases a real agent produces: EXIF GPS stripped by the browser (EVAL-007), standing just outside the edge within the GPS buffer (EVAL-009), boundary values just under each threshold (EVAL-010 to EVAL-014).

**False positive** = a legitimate case whose verdict is not Verified (Needs Review or Rejected). Needs Review counts, because it costs an admin's time and delays the farmer.

**Gate:** ≤ 5 %. With the 14 seeded cases no false positive is allowed. At the target of about 40 cases, at most 2 are.

**Not in the S2 population:** `legitimate_edge` cases, which are honest submissions where the correct result is, or may be, Needs Review: cloud-blocked NDVI, a provider outage, a throwing check, 150 m GPS accuracy, the pruning plot, a re-enrolled device (EVAL-015 to EVAL-021). They are scored for correctness against their own `acceptable_verdicts`, and **any Rejected among them is CF-02.** The report also shows *honest review load* (the share of all honest cases, legitimate plus edge, that are not Verified) as information.

**Guard against gaming S2 (EV4).** Moving a case between `legitimate`, `legitimate_edge`, `attack`, and `known_limitation`, or changing its expected verdict, is a major dataset version change and needs an EV or TP decision (CF-13). Realism of the legitimate set is the weakest link in S2, so its jitter (GPS accuracy, EXIF presence, EXIF time offsets, file sizes) is calibrated from a small field sample before the baseline (HR3, §9).

### 4.3 S3 — Capture-to-verdict latency, online, including satellite calls: ≤ 30 s

**Definition (EV9, proposed).** t0 = the agent taps Submit; t1 = the verdict card is visible. This is the latency the agent experiences, and it includes any remaining wait for a GPS fix, hashing and signing, upload, verification with live providers, and the response. Timing from the camera shutter cannot be measured, because a PWA using the native camera input does not see it.

**Reference condition (EV9, proposed).**
- Live providers; at least 5 of 20 runs with a cold harvest-window NDVI cache (deforestation and 12-month NDVI are cached at registration, per F2).
- Three photos at the size the demo phone actually produces, measured in HR3. Until then the placeholder is 3 × 4 MB. **This is an assumption, not a measurement.**
- Network profile *field-reference*: 10 Mbit/s down, 5 Mbit/s up, 80 ms RTT. **Also an assumption**, to be replaced by the HR3 field measurement. The automated runs apply it through Chromium network emulation.
- Deployed build on the Oracle A1 instance (M3), or a production build on equivalent hardware before then.

**Gate:** every one of 20 automated runs ≤ 30 s, **and** every one of 5 manual runs on the demo phone ≤ 30 s. S3 does not name a percentile, so the gate uses the maximum. The report shows p50/p95/max and a per-run split (GPS wait, hash+sign, upload, verify, response). A weak-network profile (1.5 Mbit/s up, 300 ms RTT) is also reported, without a gate, to show how latency degrades.

**Risk found while designing S3.** On the placeholder numbers the budget is already tight: 12 MB is 96 Mbit, about 19 s at 5 Mbit/s up; the GPS wait can add up to 10 s (Solution-PRD §6), and one cold provider call up to 8 s (N1). That is about 37 s before server compute. Stage 6 should evaluate starting the GPS fix when the capture screen opens and uploading photo bytes while the agent is still entering the weight, rather than weakening S3. The actual photo size from HR3 decides how urgent this is.

### 4.4 S4 — Certificate verifies the hash chain in the browser: < 3 s

**Definition (EV10).** From navigation start to the verification panel reaching its final state ("Verified in your browser against checkpoint N…", or the exact failing step). This includes loading the page, fetching the proof feed, any on-demand checkpoint (EVAL-065), and recomputing entry hashes, Merkle paths, and the checkpoint signature.

**Reference profile.** Playwright Chromium at a 375 px viewport, 4× CPU throttling, the network profile from EV9, cold cache, production build, a batch of 50 events (N2). Batches with entries after the last checkpoint are included in the timing.

**Gate:** each of 10 cold loads < 3 s (EVAL-071). Three manual loads on a real phone, reached by scanning the QR, are recorded as evidence at Stage 11.

### 4.5 S5 — Live end-to-end demo with no manual database edits: < 10 min

**Method (EV12).** The Discovery-PRD §7.1 script runs on production from the seeded state (F15): register plot → capture on a phone → verdict → the four attack submissions → batch → transfer → certificate scanned on a second device → GeoJSON → scorecard.

**Gate:** **three consecutive** rehearsals, each < 10 min, with no manual database edit, no shell step, and no retried step (EVAL-072), **plus** the automated Playwright demo (EVAL-073) and the attack-evidence check (EVAL-074) green. Evidence: screen recordings, step timestamps, the seed command log, and ledger verification output before and after each run.

### 4.6 S6 — Every anchored record re-verifiable from the certificate page alone: 100 %

**Scope: the provenance closure of a batch.** `batch_created`; every `custody_transfer`; for each event in the batch: its `harvest_event`, every `verification_run` for it, and any `admin_override` on those runs; for each plot involved: `plot_registered` (including polygon edits) and every `attestation`; for each device involved: `device_enrolled`, and `device_revoked` if present. Records outside every batch (for example rejected captures) are anchored but cannot appear on a certificate; ledger-wide integrity for those is a functional test, not S6.

**Method (EV11).** For every seeded batch:
1. **In-page verifier** (Playwright): the panel verifies every in-scope entry.
2. **Clean-room checker** (`evals/scorers/independent-verifier`, written in Stage 7): a small standalone program that uses only the platform WebCrypto API and its own implementation of JCS canonicalisation and Merkle hashing. It must not import anything from `src/`, and it is written only from the published proof-format document (GAP-9). It catches bugs that the isomorphic `verifyProof` shares between browser and server.
3. **Tamper suite**: payload field, Merkle sibling, checkpoint signature, a key other than the published one, a dropped or reordered entry, a wrong `h` (EVAL-059 to EVAL-064). Both verifiers must reject **every** tamper, and the page must name the failing step.

**Gate:** coverage = entries verified ÷ entries in scope = **100 %** for every seeded batch, by both verifiers; **100 %** of tampers rejected (any miss is CF-04); browser/Node canonical-JSON and signature agreement on all vectors (EVAL-066).

**Trust anchor, stated in the report.** The page checks signatures against the key published at `/.well-known/udgam-ledger-key` on the same server. That proves the records have not changed since they were checkpointed under that key. It does not protect against a server that replaces both the records and the key. Key pinning and transparency are roadmap items.

### 4.7 S7 — Harness runs with one command and reports from real output: Yes

**Gate (EVAL-091, EVAL-092):** on a fresh clone, `pnpm install` followed by `pnpm eval`, with no network and no secrets, writes `evals/results/eval-run-{version}.json` and `evals/reports/eval-report-{version}.md`. It exits 0 only when every gate the harness owns (S1, S2, and the library part of S6) passes and no critical condition fired. The report generator reads only the results file, so regenerating the report from that file reproduces the same numbers. Case totals reconcile with the dataset: nothing is skipped silently, and a case that errors counts as failed. CI runs this on every relevant pull request (§11).

## 5. Critical failure conditions

Any occurrence blocks release, whatever the gate percentages say. The dataset links cases to these through `critical_conditions`.

| ID | Condition |
|---|---|
| CF-01 | An attack case covered by a hard-fail rule is not Rejected with that check's `hardFail: true` |
| CF-02 | A `legitimate` or `legitimate_edge` case is Rejected (an honest farmer rejected) |
| CF-03 | A provider timeout or error, or a throwing check, yields Rejected or crashes the run (S6 decision) |
| CF-04 | A tampered proof is reported as verified by the page or the clean-room checker |
| CF-05 | A capture with an invalid signature, an unknown or revoked key, or a misused enrolment code is accepted, or its rejection is not anchored (Solution-PRD §7 rule 2) |
| CF-06 | A hard-failed Rejected run is overridden |
| CF-07 | An event belongs to two batches, a batch score ≠ min(event scores), or a transferred batch is modified |
| CF-08 | A provenance row persists without its ledger entry in the same transaction, or the reverse (N7) |
| CF-09 | A secret appears in the repo (any commit), logs, or the client bundle |
| CF-10 | A cross-role or cross-organisation read or write succeeds |
| CF-11 | A page claims organic status is verified, or shows a claim it cannot recompute from evidence (DISC4, Discovery-PRD §5.4) |
| CF-12 | A report number is not derived from a results file produced by the harness in that run, or a gated case is skipped, hidden, or deleted |
| CF-13 | A threshold, weight, case class, or expected verdict changes without an EV/TP decision entry |
| CF-14 | Resubmitting an identical signed payload creates a second event or counts its kg twice |

## 6. Category gates beyond S1–S7

- **Functional:** 100 % of `critical`-priority non-attack cases pass every assertion (verdict, check status, hard fail, evidence substrings). Every **detected** attack case also passes its evidence assertions: the evidence line is what the admin and the buyer read, so a correct verdict with generic evidence is a defect.
- **Reliability:** EVAL-015 to EVAL-018 and EVAL-067 to EVAL-069 pass.
- **Security:** EVAL-051 to EVAL-054 (scenario 5 is stretch for S1, but these cases are critical security checks regardless), EVAL-076, EVAL-080 to EVAL-085 pass; no critical or high `SEC-` finding open at Stage 10.
- **Design:** EVAL-086 to EVAL-090 pass at the listed viewports, plus the Stage 8 `DES-` gate against the approved `Design.md`. Stage 4 may make these cases stricter and must not loosen them.
- **Scenarios 5–6:** reported with the same detection definition. No percentage gate in M1 (DISC3 made them stretch), but any CF they trigger still blocks.

## 7. Dataset design (EV8)

### 7.1 Case classes

| Class | Meaning | Counts toward |
|---|---|---|
| `legitimate` | Honest capture, complete evidence; expected Verified | S2 denominator |
| `legitimate_edge` | Honest capture where the correct result is, or may be, Needs Review | Correctness + CF-02; not S2 |
| `attack` | A seeded threat-scenario case; must not be Verified | S1 (scenarios 1–4), scenario report (5–6) |
| `known_limitation` | An attack the MVP cannot catch by design | Listed prominently in the report; never in S1 (EV6) |

**Paired cases.** EVAL-019 (honest shade-coffee pruning, 3.0 % loss) and EVAL-040 (a 3.0 % clearing) give the verifier identical data. Whatever verdict it returns for one, it returns for the other. Needs Review for both is the only result that is right for both, which is part of the reasoning behind EV7. The report prints pairs side by side as an R&D finding (Discovery-PRD R8). EVAL-005/EVAL-026 pair a point inside and a point outside a concave polygon.

**Known limitations, declared up front (EV6, proposed).**
- EVAL-029: GPS spoofed *inside* the plot with matching EXIF and plausible movement. A PWA cannot detect this (R7); native attestation is the roadmap work package.
- EVAL-036: a previously submitted photo re-encoded, so it has new bytes and no EXIF. SHA-256 uniqueness cannot see it; a perceptual near-duplicate check is an open question (Q5).
- EVAL-049 note: earlier captures in a salami sequence are not re-scored when a later one crosses the threshold (GAP-7).

### 7.2 Fixtures

- **Plots.** P01–P10 are legitimate, E01 is honest-edge, X01–X07 are adversarial. The dataset describes them by role, area, shape, and remote-sensing profile, not by coordinates. Stage 7 creates the polygons in Kodagu/Chikkamagaluru. Where accounts allow, P01–P10 fixtures are **recorded from live GFW and Sentinel Hub responses** for real polygons (record and replay) rather than invented. X plots should likewise use real post-2020 loss areas where they can be found, because "a polygon drawn over real clearing was caught" is more credible to evaluators than synthetic numbers.
- **Devices.** D-A1 (enrolled), D-A2 (revoked), D-A3 (re-enrolled), D-B1 (another agent), K-X (never enrolled).
- **Yield reference.** Every yield case is written as a multiple of **U**, the upper bound of the reference row after the cherry-to-clean conversion. No Coffee Board figure appears in the dataset; Stage 6 verifies and seeds the real table (R6), and the cases remain valid.
- **Independence.** Each case gets its own context (plot, device, previous event, season cumulative, seen media hashes, provider fixture). No state carries between cases, so the order of execution does not matter.

### 7.3 Mutation operations

An attack case is a legitimate base case (`base_case`) plus a list of `mutations`, so the only difference between the two is the attack.

| op | Parameters | Effect |
|---|---|---|
| `gps_place` | `where` (`inside_centroid`, `inside_near_edge`, `outside_edge`, `outside_notch`), `distance_m` from the nearest edge | Browser GPS point |
| `gps_accuracy` | `accuracy_m` | Reported accuracy radius |
| `exif_gps` | `mode` (`match`, `absent`, `offset`), `distance_m` | EXIF GPS relative to browser GPS |
| `exif_time` | `mode` (`match`, `absent`, `offset`), `offset_min` relative to client time | EXIF DateTimeOriginal |
| `client_clock` | `offset_from_server_min` | Client capture time versus server receipt |
| `prev_event` | `distance_km`, `minutes_before`, or `none` | The device's previous accepted event |
| `reuse_media` | `from_case`, `which` (`all`, `one`), optional `transform: re-encode` | Media hashes reused from another case; `context.seen_media_from` seeds the global seen set |
| `chain` | `seq_delta`, `prev_hash` (`correct`, `stale`, `genesis`) | Per-device chain position |
| `season_cumulative` | `ratio_after_event`, optional `ratio_before_event`, in U | Season yield on the plot |
| `photos` | `count` | Number of photos (1–3) |
| `provider_fault` | `provider`, `mode` (`timeout`, `http_500`, `malformed`), optional `cache: empty` | Provider behaviour in the fixture adapter |
| `check_throws` | `check`, `error` | Test-only fault injection |
| `device` | `state` | Device used for signing |
| `tamper_after_sign` | `field` | Changes the payload after signing |
| `proof_tamper` | `target`, `variants` | Changes a proof feed (S6 suite) |

The schema fixes the op names; unknown ops fail validation.

### 7.4 Evidence contract (tested)

Every `CheckResult.evidence` sentence states the measured value and the threshold it was compared against, in fixed formats: distances in whole metres ("182 m"), speeds in whole km/h, loss as a percentage to one decimal ("9.5%"), yield as a multiple of U to two decimals ("2.05x"), counts as "k of n". The scorer lowercases and strips whitespace on both sides before matching `evidence_substrings`. Evidence that says only "location suspicious" fails its case. Stage 6 adopts this contract as a requirement on the check registry (GAP-8).

### 7.5 Composition: seeded now and target

| Group | IDs | Seeded | Target before baseline-v1 |
|---|---|---|---|
| Legitimate (S2) | EVAL-001–014 | 14 | about 40 over 10 plots (Solution-PRD §8) |
| Legitimate edge | EVAL-015–021 | 7 | about 10 |
| Scenario 1 GPS spoofing (S1) | EVAL-022–028 | 7 | ≥ 10 |
| Scenario 2 replay (S1) | EVAL-030–035 | 6 | ≥ 10 |
| Scenario 3 plot laundering (S1) | EVAL-037–043 | 7 (+ EVAL-044 integration) | ≥ 10 |
| Scenario 4 yield inflation (S1) | EVAL-045–050 | 6 | ≥ 10 |
| Known limitations | EVAL-029, EVAL-036 | 2 | as found |
| Scenario 5 identity (stretch, integration) | EVAL-051–054 | 4 | — |
| Scenario 6 timestamps (stretch) | EVAL-055–057 | 3 | ≥ 5 |
| Ledger/proof and certificate (S4, S6) | EVAL-058–066, 071 | 10 | + one per anchor kind |
| Reliability | EVAL-067–069 | 3 | — |
| Performance (S3, S4) | EVAL-070–071 | 2 | — |
| Product acceptance (S5 etc.) | EVAL-072–075, 077–079 | 7 | — |
| Security (non-verifier) | EVAL-076, 080–085 | 7 | — |
| Design | EVAL-086–090 | 5 | + from Design.md |
| Harness (S7) | EVAL-091–092 | 2 | — |

Total seeded: 92. Of these, 26 are S1-gated attack cases and 14 are S2 legitimate cases. Stage 7 appends new cases from EVAL-093 upward, in any order; the table's ID ranges describe the seed only.

Each scenario's attack cases include blatant (several signals), single-signal, and boundary cases: just outside the buffer, 9.5 % and 10.5 % loss, 1.95× and 2.05× U. Each of the twelve checks has at least one case where it fires (`signature_valid` fires at the capture boundary, in integration cases EVAL-051 to EVAL-053). Each numeric threshold has a case on both sides: the geofence buffer (EVAL-009 / EVAL-025), 30 m accuracy (EVAL-010 / EVAL-027), 50 m EXIF GPS (EVAL-014 / EVAL-023), 10 min and 7 days EXIF time (EVAL-011 / EVAL-056, EVAL-034 / EVAL-033), 120 km/h (EVAL-013 / EVAL-028), any loss and 10 % loss (EVAL-006 / EVAL-040, EVAL-039 / EVAL-038), and 1.5× and 2× U (EVAL-012 / EVAL-048, EVAL-047 / EVAL-046).

## 8. Scorers

Specified here and implemented in Stage 7 under `evals/scorers/`. No scorer files are created in Stage 3; an empty stub would carry no information.

| Scorer | Input | Output | Used by |
|---|---|---|---|
| **case-assertions** | one `verify()` result + case `expected` | pass/fail per assertion: verdict ∈ acceptable, `check_status` matches, `hardFail` on `hard_fail_checks`, attribution, evidence substrings (§7.4) | all harness-verifier cases |
| **detection-rate** | attack case results | pooled and per-scenario detection (§4.1), Wilson 95 % interval, list of undetected cases with their full check results | S1, scenario 5–6 report |
| **false-positive-rate** | legitimate results | FP rate, list of FPs with the checks responsible; honest review load across legitimate + edge | S2 |
| **critical-conditions** | all results | each CF that fired, with case IDs; any CF makes the run exit non-zero | §5 |
| **proof-verifier** | proof feeds for all seeded batches + tamper variants | coverage % per batch, tamper rejection %, failing step per tamper, from both the in-page verifier and the clean-room checker | S6 |
| **latency** | per-run timestamps from the perf runner | p50/p95/max, per-phase split, pass if max ≤ threshold | S3, S4 |
| **harness-integrity** | dataset + results | schema valid; totals reconcile (active cases = passed + failed + errored; skipped must be 0); report numbers re-derived from results | S7 |

**Analyses reported without a gate:**
- **Ledger-only baseline** (`baseline-v0`, §10): the same dataset with only `signature_valid` enabled. It shows what "just put it on a ledger" catches, which is the oracle problem in Discovery-PRD §2.2, measured.
- **Leave-one-check-out ablation:** detection per scenario with each check disabled in turn, showing which check carries which scenario. Cheap, because `verify()` is a pure function.
- **Threshold sweeps:** verdict against a swept parameter (GPS distance outside the edge 0–200 m, loss 0–20 %, yield 1.0–3.0× U), plotted to show where each boundary lies.
- **Live-provider agreement** (`pnpm eval --provider=live`, needs keys, never in CI): live responses for P01–P10 compared with the recorded fixtures. A divergence means refreshing the fixture, not changing the expectation.

## 9. Automated, manual, and human review

| What | How | When |
|---|---|---|
| Harness suites (verifier, proof) | `pnpm eval`, offline, CI | every relevant PR; Stage 7 per-phase QA; Stage 9 |
| Integration cases | Vitest with a temporary libSQL file | CI; Stage 9 |
| e2e and design cases | Playwright + axe-core | CI (main branch); Stage 9 |
| Performance (S3, S4) | perf runner against a production build; S3 also on the demo phone | M1 end (S4), M3 on Oracle (S3, S4); Stage 11 |
| Secrets, dependencies, clean-clone run | CI jobs | every PR; Stage 10 |
| Demo rehearsal (S5) | manual, recorded | M3; before any external demo |

**Human review (owner):**
- **HR1 · Evidence-line rubric.** For each evidence template (check × status): states the measured value; states the threshold; plain words an FPO admin understands; tells the reader what to check next. Pass = 4/4 for every template. Done at Stage 9 and whenever templates change.
- **HR2 · Known limitations and pairs.** The owner approves the wording in which the report discloses EVAL-029, EVAL-036, the salami limitation, and the pruning/clearing pair to evaluators.
- **HR3 · Field calibration (before baseline-v1).** About 10 real captures on the demo phone at any outdoor location: record EXIF GPS present or absent, EXIF time offset, GPS accuracy, photo file sizes, and Submit-to-upload-complete time. These calibrate the legitimate-set jitter (S2 realism) and the S3 reference condition. It does not have to be in Kodagu.
- **HR4 · Demo rehearsals** (S5).
- **HR5 · Design critique** (Stage 8, `DES-`).
- **HR6 · Scorecard sign-off.** Before a scorecard goes to any evaluator, the owner checks that every number traces to a committed results file.

## 10. Baseline strategy (EV13)

| Baseline | What | When |
|---|---|---|
| `baseline-v0-ledger-only.json` | Full dataset, only `signature_valid` enabled | As soon as the harness runs (early M1) |
| `baseline-v1.json` | Full dataset at target size, full registry, **frozen config** | When all twelve M1 checks are implemented, before any weight or threshold tuning |
| `baseline-perf-v1.json` | First S3 and S4 measurements on the reference condition | S4 at M1 end; S3 at M3 on Oracle |

**Config freeze and overfitting guard.** Weights, thresholds, and verdict rules live in one config object (S4). It is hashed, and the hash is printed in every result. After baseline-v1, any config change needs (1) an EV/TP decision that gives a threat-model reason, not "the eval passed", and (2) at least two new attack cases per affected scenario, **committed before** the re-run that justifies the change. Improvements are always stated against baseline-v1, never against "seems better".

## 11. Regression strategy (EV14)

- **Triggers.** Changes to `src/lib/verification`, `crypto`, `ledger`, `remote-sensing`, `media`, `eudr`, the capture route, the dataset, or the config run `pnpm eval` in CI. UI changes to the capture flow or the certificate page run the e2e and design cases.
- **Regression** = a case that passed in the previous formal run and fails now. A regression on a critical case, or any CF, blocks merge. Other regressions are reported and need a `QA-` finding before release.
- **Dataset versioning** (semver in `dataset_version`): patch = wording or evidence-substring fix; minor = cases added; major = a class, expected verdict, or gate membership changed (needs a decision, CF-13). Cases are never deleted: they are set to `status: retired` with a reason, and their IDs are never reused.
- **Production failures become cases.** Stage 12 appends regression cases (new EVAL IDs) using the eval-framework loop, and they are kept permanently.

## 12. Results, reports, and provenance

**Result file** `evals/results/eval-run-{appVersion}-{shortSha}.json`, with `-r2`, `-r3` appended rather than overwriting. It is generated by the harness, never edited by hand. Formal runs (gates, baselines, stage evidence) are committed; ad-hoc local runs go to a git-ignored `evals/results/local/`, which Stage 7 adds to `.gitignore`. Contents: totals (cases, passed, failed, errored, skipped = 0), each gate's value, threshold, and pass/fail, per-scenario rates with intervals, CFs fired, per-case raw `verify()` output with assertion results and duration, regressions and improvements against the previous formal run and baseline-v1, and runtime.

**Report** `evals/reports/eval-report-{version}.md`, generated from the result file only: overall PASS/FAIL; release recommendation; baseline/current/target table (eval-framework format); failed case IDs; undetected attacks with evidence; known limitations; pairs; the sample-size caveat; the config printout.

**Provenance fields** in every result: app version; git commit; branch; dirty flag; environment (local / CI / production); dataset version and SHA-256 of `eval-dataset.json`; fixture-set version and hash; config object and hash; provider mode (fixture / live); yield-reference table version and source (placeholder or Coffee-Board-verified); ledger adapter (hash-chain / EVM); Node version; OS and CPU architecture (aarch64 on Oracle matters); harness version; UTC timestamp; duration. Model, prompt, and retrieval fields do not apply (no AI category).

## 13. `/evals` layout and commands

```text
evaluation-plan.md                  # this file (project root, authoritative)
evals/
  eval-dataset.json                 # seeded cases (Stage 3), extended in Stage 7
  eval-dataset.schema.json          # JSON Schema 2020-12; CI validates the dataset against it
  scorers/                          # Stage 7: scorers from §8, incl. independent-verifier/
  results/                          # Stage 7+: generated, versioned, never overwritten
  reports/                          # Stage 7+: generated from results
```

Proposed commands, which Stage 6 finalises: `pnpm eval` (harness suites, offline, gates S1/S2/S6-lib/S7); `pnpm eval --config=ledger-only`; `pnpm eval --provider=live`; `pnpm eval:e2e`; `pnpm eval:perf --target=<url>`; `pnpm eval:release`, which orchestrates everything and writes the combined release report used by `QA-report.md`.

## 14. Spec gaps found (for Stage 6)

| ID | Gap | Assumption the dataset makes until resolved |
|---|---|---|
| GAP-1 | `exif_time_agreement`: behaviour when EXIF time is absent; which gap the "> 7 days fail" applies to | Absent → flag; the 7-day fail applies to both the EXIF–client and client–server gaps |
| GAP-2 | F4 says "assigned plot" but the data model has no agent-to-plot assignment | EVAL-054 is `pending_decision` |
| GAP-3 | The season window for `yield_plausibility`, and where the cherry-to-clean conversion is applied | Cases use a season ratio in U after conversion |
| GAP-4 | A retry of an identical signed payload (the §6 manual-retry path) would hard-fail on `photo_uniqueness` | EV15 (proposed): idempotent; EVAL-068 |
| GAP-5 | Per-check score values for flag/fail, and the weights | Worked example in §4.1; EV7 |
| GAP-6 | Whether a wrong or missing `h` also stops the proof feed serving data (batch enumeration) | EVAL-064 assumes it does |
| GAP-7 | Earlier events are not re-scored when a later event pushes cumulative yield over a threshold | Listed as a known limitation |
| GAP-8 | Evidence sentence format (§7.4) | Required by the dataset |
| GAP-9 | The proof-feed format must be documented well enough for a third party to write a checker | Clean-room checker is written from that document only |

## 15. Open questions for the owner

Decide these at the Stage 3 gate. The recommendation for each is in `HANDOFF.md` and in the EV entry.

- **Q1 · EV7** Verdict caps (any `fail`, or a deforestation/yield `flag`, caps at Needs Review).
- **Q2 · EV5** Per-scenario detection floor of 90 % in addition to the pooled 95 %.
- **Q3 · EV6** Declare known limitations and exclude them from S1.
- **Q4 · EV9** S3 timing start point and reference condition; do HR3 field calibration.
- **Q5** Perceptual near-duplicate photo check for re-encoded replays (not in M1 scope today).
- **Q6 · EV15** Idempotent handling of an identical signed payload.
- **Q7 · EV16** The public certificate and GeoJSON show no farmer name or identifier, only a pseudonymous producer ID.

## 16. Definition of Done additions

On top of the eval-framework base template: every ticket that touches the verifier, ledger, capture boundary, or certificate lists its related EVAL IDs; those cases pass; `pnpm eval` is green with no regression against the previous formal run. Performance-sensitive tickets (capture upload, certificate verify) add "S3/S4 perf case run and recorded". Security-sensitive tickets add "related CF cases pass".

## 17. Sign-off

- [ ] Release gates, critical failure conditions, dataset design and seeded cases approved by Tushar Pathak
- [ ] Proposed decisions EV5, EV6, EV7, EV9, EV15, EV16 decided (accepted / rejected / amended)
- [ ] Next: Stage 4 UI/UX Design (`bw-ui-ux-design`), Sonnet 5 / Medium
