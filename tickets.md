# Tickets — Udgam

**Stage:** 5 · Problem Breakdown · **Status:** Approved by owner 2026-09-29 · **Date:** 2026-09-29
Provisional IDs `TKT-##`, mapped to native Campfire IDs below (Stage 6). `TC-` IDs are in `test-cases.md`; each ticket lists its `TC-` and `EVAL-` cases. Types: Bug · Feature · Enhancement · Task · Chore · Docs · Spike. Priority: P0 Critical · P1 High · P2 Medium · P3 Low. Estimates in story points (`sp`, 1 · 2 · 3 · 5 · 8); no ticket above 8, so each fits one fresh context window.
**Venue:** built in owner-opened claude.ai/code cloud sessions (S11).

## Campfire mapping (Stage 6, 2026-09-29)
Campfire project **Udgam** (`backlog/`, registered in the Campfire manifest). Native IDs were allocated by Backlog.md and are canonical from here on; `TKT-##` stays as the cross-reference in these Markdown artifacts. Milestones: M-001 → `m-0`, M-002 → `m-1`, M-003 → `m-2`. TASK-1 is the Stage 6 planning ticket itself.
Each Campfire task carries: type, priority (P0/P1 → High, P2 → Medium), a `P#` label, an `sp:N` label (the Gantt schedules 1 sp = 1 h), milestone, dependencies, acceptance criteria and a three-item DoD. TKT-21's "all M-001 tickets" dependency is encoded as TASK-19, 21, 4, 14, 18, 20 (TKT-18, 20, 03, 13, 17, 19); every other M-001 ticket is a transitive ancestor of those.
| TKT | Campfire |
|---|---|
| TKT-01 | TASK-2 |
| TKT-02 | TASK-3 |
| TKT-03 | TASK-4 |
| TKT-04 | TASK-5 |
| TKT-05 | TASK-6 |
| TKT-06 | TASK-7 |
| TKT-07 | TASK-8 |
| TKT-08 | TASK-9 |
| TKT-09 | TASK-10 |
| TKT-10 | TASK-11 |
| TKT-11 | TASK-12 |
| TKT-12 | TASK-13 |
| TKT-13 | TASK-14 |
| TKT-14 | TASK-15 |
| TKT-15 | TASK-16 |
| TKT-16 | TASK-17 |
| TKT-17 | TASK-18 |
| TKT-18 | TASK-19 |
| TKT-19 | TASK-20 |
| TKT-20 | TASK-21 |
| TKT-21 | TASK-22 |
| TKT-22 | TASK-23 |
| TKT-23 | TASK-24 |
| TKT-24 | TASK-25 |
| TKT-25 | TASK-26 |
| TKT-26 | TASK-27 |
| TKT-27 | TASK-28 |
| TKT-28 | TASK-29 |
| TKT-29 | TASK-30 |

## Definition of Done (every ticket)
Functional implementation complete · acceptance criteria met · required tests written and passing (TDD) · linked EVAL cases created/automated and passing, or explicitly marked for a later ticket · `pnpm typecheck && pnpm lint && pnpm test` green · no regression in the latest `pnpm eval` run · UI tickets match the frozen `Design.md` + `.design/exploration/final/` (four screen states, 375/768/1440, a11y) · docs updated where behaviour changed · observability added where the ticket creates a failure mode · no secrets committed.

## Dependency DAG (blockers → dependants)
```
TKT-01 ─┬─> TKT-02 ─┬─> TKT-03 ──────────────────────────────┐
        │           ├─> TKT-08 ─┐                             │
        │           ├─> TKT-15 ─┬─> TKT-16 ─> TKT-17          │
        │           │           └─> TKT-18                    │
        │           └─> TKT-19                                │
        ├─> TKT-04 ─┬─> TKT-05 ─┐                             │
        │           ├─> TKT-06 ─┼─> TKT-07 (needs 03)         │
        │           │           ├─> TKT-09 (needs 02, 05)     │
        │           │           ├─> TKT-10 (needs 02, 05) ─> TKT-11
        │           │           └─> TKT-13                    │
        │           ├─> TKT-12 (needs 07, 08, 09)             │
        │           └─> TKT-14 (needs 02) ─> TKT-16           │
        └─> TKT-22 (spike, parallel)                          │
TKT-07 + 10 + 11 + 12 + 14 + 16 ─> TKT-20 ─┐                  │
TKT-18 + TKT-20 + all M-001 ───────────────┴─> TKT-21 <───────┘   (M-001 exit)
TKT-23 (design addendum) ─┬─> TKT-25 ;  TKT-15 + TKT-22 ─> TKT-24 ─> TKT-25 (needs 14)
                          └─> TKT-26 (needs 14, 24)
TKT-21 ─> TKT-27 ─> TKT-28 ─> TKT-29                                (M-003)
```
Build order for M-001 (one phase per line): **01 → 02 → 03 | 04 → 05, 06, 08, 15 → 07, 09, 10, 13, 14, 18, 19 → 11, 12, 16 → 17 → 20 → 21.**

---

## M-001 · Trust at the edge, end to end

### TKT-01 · Walking skeleton that builds and runs in the cloud session
- **Type** Chore · **Priority** P0 · **sp** 3 · **Depends on** — · **Milestone** M-001
- **Objective:** a Next.js App Router + TypeScript app with Tailwind, shadcn/ui, Drizzle on file-backed libSQL, Vitest and Playwright, running end to end in a claude.ai/code cloud session: `/api/health` reports database status and a home page renders with the frozen design tokens.
- **Acceptance criteria:** `pnpm dev` serves `/` and `/api/health` (`{db:"ok"}`); scripts `typecheck`, `lint`, `test`, `test:e2e`, `eval` exist (eval may be a stub that fails loudly until TKT-03); design tokens from Design.md §12 in one CSS file, Figtree + Noto Sans Kannada loaded; `scripts/cloud-setup.sh` installs Node, pnpm, Playwright browsers (Foundry deferred to TKT-22) and is idempotent; `.env.example` names every variable (auth secret, ledger key path, `REMOTE_SENSING_PROVIDER=fixture` default, GFW, Copernicus, ArcGIS/MapTiler keys) with no values; CI workflow runs typecheck + lint + test on push; secret scanning in CI.
- **Notes:** S11 prerequisites live here. No product logic.
- **EVAL:** EVAL-083 (secrets scan wired). **TC:** TC-001, TC-002, TC-003, TC-004, TC-005 · **Campfire:** TASK-2.

### TKT-02 · Tracer bullet: one signed picking becomes a Verified ledger entry
- **Type** Feature · **Priority** P0 · **sp** 8 · **Depends on** TKT-01 · **Milestone** M-001
- **Objective:** the thinnest complete path through the riskiest assumption: a phone signs a capture, the server verifies it, three checks run, the verdict is scored with the S10 caps, and the capture plus verdict are appended to the hash-chain ledger in one transaction.
- **Acceptance criteria:** `lib/crypto` implements RFC 8785 canonical JSON, SHA-256 and ECDSA P-256 sign/verify, identical in browser and Node; `lib/ledger` hash-chain adapter appends entries (`seq, prev_hash, kind, payload_hash, ts, entry_hash`) — checkpoints come in TKT-15; `lib/verification` has the check-registry contract (`CheckResult` per Solution-PRD §4.1), the scorer with thresholds and caps (S4 + S10), and checks `signature_valid`, `geofence`, `photo_uniqueness`; `/api/capture` multipart handler verifies at the boundary, runs `verify()`, writes `harvest_events`, `media`, `verification_runs` and ledger entries in one transaction; a minimal capture page (one seeded device key, one seeded plot) signs and uploads a single photo + kg and shows the verdict and evidence lines; a check that throws reports `unavailable`.
- **Notes:** seeded device and plot, no enrolment or plot UI yet. Resolve GAP-5 (per-check score values and weights) and GAP-8 (evidence sentence format) here, record as TP decisions.
- **EVAL:** EVAL-001, 002, 022, 030, 053, 066, 067, 018. **TC:** TC-006, TC-007, TC-008, TC-009, TC-010, TC-011, TC-012, TC-013 · **Campfire:** TASK-3.

### TKT-03 · Evaluation harness v0 and baseline-v0
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-02 · **Milestone** M-001
- **Objective:** `pnpm eval` builds cases from `evals/eval-dataset.json`, runs `verify()` with the fixture provider, and writes a results JSON and a Markdown report from real output, so every later ticket is measured.
- **Acceptance criteria:** one command from a clean clone; per-scenario detection, false-positive rate, per-case status; cases whose checks don't exist yet are reported as `not_yet_implemented`, never dropped; provenance (commit, dataset version, config) in every result; `evals/results/baseline-v0.json` committed (EV13).
- **EVAL:** EVAL-091, 092. **TC:** TC-014, TC-015, TC-016, TC-017 · **Campfire:** TASK-4.

### TKT-04 · Sign-in with roles and organisation boundaries
- **Type** Feature · **Priority** P0 · **sp** 3 · **Depends on** TKT-01 · **Milestone** M-001
- **Objective:** agents, FPO admins and buyers sign in (Better Auth, email + password, seeded demo accounts) and only reach their own surfaces and their organisation's data.
- **Acceptance criteria:** route groups `/(agent)`, `/(admin)`, `/(buyer)` guarded on the server; every query scoped by organisation; `/verify/*` stays public; sign-in screen in the frozen visual language.
- **EVAL:** EVAL-080. **TC:** TC-018, TC-019, TC-020, TC-080, TC-081 · **Campfire:** TASK-5.

### TKT-05 · Phone enrolment, revocation and plot assignment
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-02, TKT-04 · **Milestone** M-001
- **Objective:** an admin issues a one-time code; the agent's phone creates its own non-extractable key and is enrolled; the admin can revoke a phone; agents are assigned plots.
- **Acceptance criteria:** codes single-use, expire after 24 h, rate-limited; enrolment and revocation anchored; revoked or unknown keys hard-fail `signature_valid`; `agent_plots` assignment table added (resolves GAP-2) and captures for unassigned plots fail as scenario 5; first-run language sheet (ಕನ್ನಡ / English) shown during enrolment.
- **EVAL:** EVAL-082, 051, 052, 054, 021. **TC:** TC-021, TC-022, TC-023, TC-024, TC-025, TC-080, TC-081 · **Campfire:** TASK-6.

### TKT-06 · Plot registration on a satellite map
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-04 · **Milestone** M-001
- **Objective:** an admin registers a farmer and draws or uploads a plot boundary; the area is computed and the plot is anchored.
- **Acceptance criteria:** Leaflet + leaflet-draw on Esri World Imagery (MapTiler fallback via one config value); drag-point editing with point add/remove buttons as the non-drag alternative (WCAG 2.5.7); GeoJSON/KML upload; area in hectares on save; `plot_registered` anchored; editing a polygon re-anchors and marks registration checks stale (feeds EVAL-044 in TKT-07).
- **EVAL:** EVAL-044 (edit path), 005, 026 (geometry fixtures). **TC:** TC-026, TC-027, TC-028, TC-029, TC-080, TC-081 · **Campfire:** TASK-7.

### TKT-07 · Satellite checks: forest loss and vegetation, with caching and honest failure
- **Type** Feature · **Priority** P0 · **sp** 8 · **Depends on** TKT-03, TKT-06 · **Milestone** M-001
- **Objective:** plots are checked against Global Forest Watch tree-cover loss since 2021 and Copernicus Sentinel-2 NDVI; provider failures never become rejections.
- **Acceptance criteria:** `RemoteSensingProvider` interface with fixture (default), GFW and Sentinel Hub Statistical API adapters; per-plot per-month cache; 8 s timeout per call; checks `deforestation_overlap` (any loss flag, ≥ 10 % hard fail, S5), `ndvi_cultivation`, `ndvi_harvest_window`; timeouts, HTTP errors and cloud-blocked windows return `unavailable` and cap at Needs Review (S6); registration runs the deforestation query and the 12-month history (F2).
- **EVAL:** EVAL-006, 015, 016, 017, 019, 037–043, 044. **TC:** TC-011, TC-028, TC-030, TC-031, TC-032, TC-033, TC-034 · **Campfire:** TASK-8.

### TKT-08 · Location and time checks
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-02 · **Milestone** M-001
- **Objective:** complete scenario 1 (GPS spoofing) and scenario 6 (timestamp manipulation) detection.
- **Acceptance criteria:** checks `gps_accuracy`, `exif_gps_agreement`, `exif_time_agreement`, `movement_plausibility`, and the geofence buffer rule (min(accuracy, 25 m)) with concave-polygon correctness; GAP-1 resolved (absent EXIF time → flag; 7-day fail rule defined) and recorded; evidence sentences in the §7.4 format.
- **EVAL:** EVAL-003, 004, 005, 007, 008, 009, 010, 011, 013, 014, 020, 023–029, 033, 034, 055–057. **TC:** TC-011, TC-035, TC-036, TC-037 · **Campfire:** TASK-9.

### TKT-09 · Yield, chain and replay checks; idempotent retry
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-02, TKT-05, TKT-06 · **Milestone** M-001
- **Objective:** complete scenario 2 (replay) and scenario 4 (yield inflation) detection and make a retried identical payload safe.
- **Acceptance criteria:** `crop_yield_reference` table seeded from a verified Coffee Board of India source (cited); `yield_plausibility` season rule (> 1.5× U flag, > 2× hard fail) with GAP-3 resolved (season window, cherry-to-clean conversion point); `chain_continuity` (flag); `photo_uniqueness` across agents and plots; an identical signed payload resubmitted returns the original verdict without a new event (EV15, resolves GAP-4); GAP-7 recorded as a declared limitation.
- **EVAL:** EVAL-012, 031, 032, 035, 036, 045–050, 068. **TC:** TC-011, TC-038, TC-039, TC-040, TC-041, TC-042 · **Campfire:** TASK-10.

### TKT-10 · Capture app to the frozen design
- **Type** Feature · **Priority** P1 · **sp** 8 · **Depends on** TKT-02, TKT-05, TKT-06 · **Milestone** M-001
- **Objective:** the farmer-facing capture flow exactly as approved: Home with the plot card, photo slots, review, weight keypad, checking screen, three verdict screens.
- **Acceptance criteria:** matches `.design/exploration/final/index.html` screens s1–s6; native camera via file input with capture (F4), original bytes hashed and signed (S1); checking screen shows the real checks as they finish (transport — streaming vs polling — decided in Stage 6 within S2's synchronous model); tab bar hidden in the record flow; all strings externalised; installable PWA manifest; 320 × 568 keeps the primary action visible.
- **EVAL:** EVAL-086, 089 (capture pages), 070 (instrumented here, measured in M-003). **TC:** TC-043, TC-044, TC-045, TC-046, TC-047, TC-048, TC-049, TC-080, TC-081 · **Campfire:** TASK-11.

### TKT-11 · Saved-on-phone retry, pickings list, help and language
- **Type** Feature · **Priority** P1 · **sp** 5 · **Depends on** TKT-10 · **Milestone** M-001
- **Objective:** nothing is lost when the network drops, and farmers can see all their pickings and get help.
- **Acceptance criteria:** failed sends keep the signed payload and photos in IndexedDB with the amber "Couldn't send" sheet (s7) and a working Try again; Pickings tab (s8) with verdict chips and Not-accepted reasons; Help tab (verdict meanings, photo tips, call the office, language, this phone); ಕನ್ನಡ/English switch with Kannada strings marked for native review; four screen states on data-backed views.
- **EVAL:** EVAL-068 (client side), 088 (capture views). **TC:** TC-050, TC-051, TC-052, TC-053, TC-080, TC-081 · **Campfire:** TASK-12.

### TKT-12 · Admin review queue with re-run and signed overrides
- **Type** Feature · **Priority** P1 · **sp** 5 · **Depends on** TKT-04, TKT-07, TKT-08, TKT-09 · **Milestone** M-001
- **Objective:** the FPO office sees every Needs-a-check picking with its evidence, re-runs unavailable checks, and accepts or rejects with a reason that is signed and anchored.
- **Acceptance criteria:** matches `.design/exploration/final/admin.html` (queue, detail, score with cap reason, all checks with evidence, photos, plot card); re-run retries only the unavailable providers; override needs a reason ≥ 10 characters, is signed and anchored as `admin_override`; hard-failed rejections show no override; loading / empty / error states; 768 px list→detail.
- **EVAL:** EVAL-069, 075, 076, 088 (admin). **TC:** TC-054, TC-055, TC-056, TC-057, TC-080, TC-081 · **Campfire:** TASK-13.

### TKT-13 · Organic certificate as an attestation
- **Type** Feature · **Priority** P2 · **sp** 2 · **Depends on** TKT-06 · **Milestone** M-001
- **Objective:** an admin attaches an organic certificate to a plot; it is hashed and anchored and always described as an attestation.
- **Acceptance criteria:** file hash, issuer, validity dates stored and anchored; every surface wording "Certified by <issuer> — certificate on record", never "verified organic" (DISC4).
- **EVAL:** EVAL-079. **TC:** TC-058, TC-080, TC-081 · **Campfire:** TASK-14.

### TKT-14 · Batches, custody transfer and the buyer list
- **Type** Feature · **Priority** P1 · **sp** 5 · **Depends on** TKT-02, TKT-04 · **Milestone** M-001
- **Objective:** the admin groups Verified pickings into a batch and hands it to a buyer, who sees it in their list.
- **Acceptance criteria:** batch from Verified events of one crop only; quantity = Σ kg; score = min(event scores); an event in at most one batch (unique constraint); custody transfer signed and anchored; batch locked after transfer; buyer list shows batches transferred to their organisation only, each linking to its certificate.
- **EVAL:** EVAL-077, 080 (buyer boundary). **TC:** TC-059, TC-060, TC-080, TC-081 · **Campfire:** TASK-15.

### TKT-15 · Ledger checkpoints and the proof feed
- **Type** Feature · **Priority** P0 · **sp** 5 · **Depends on** TKT-02 · **Milestone** M-001
- **Objective:** entries are sealed under signed Merkle checkpoints and served as proofs anyone can verify.
- **Acceptance criteria:** checkpoint every 100 entries or on demand; server ledger key generated at first boot outside the repo, public key at `/.well-known/udgam-ledger-key`; `getProof` / isomorphic `verifyProof`; `/api/verify/[batchId]` proof feed forces a checkpoint when the batch has newer entries (S7); feed format documented (feeds GAP-9).
- **EVAL:** EVAL-058–063, 065. **TC:** TC-061, TC-062, TC-063, TC-064 · **Campfire:** TASK-16.

### TKT-16 · Public certificate page with in-browser proof
- **Type** Feature · **Priority** P1 · **sp** 8 · **Depends on** TKT-14, TKT-15 · **Milestone** M-001
- **Objective:** anyone scanning the QR sees where the coffee came from and has their own browser confirm the records match the sealed ledger.
- **Acceptance criteria:** matches `.design/exploration/final/verify.html` (proof first on phones, map, journey, origin table, entries, organic line, honest limits); proof recomputed in the browser with the loading and mismatch states; wrong or missing `h` stops the feed from serving data (resolves GAP-6); pseudonymous producer IDs only (EV16); QR generation for a batch.
- **EVAL:** EVAL-064, 071, 084, 087, 088, 089 (certificate). **TC:** TC-065, TC-066, TC-067, TC-068, TC-069, TC-080, TC-081 · **Campfire:** TASK-17.

### TKT-17 · EUDR map file, printable certificate and link-preview metadata
- **Type** Feature · **Priority** P1 · **sp** 3 · **Depends on** TKT-16 · **Milestone** M-001
- **Objective:** the buyer can download the EUDR due-diligence map file, print the certificate, and share a link that previews properly.
- **Acceptance criteria:** GeoJSON FeatureCollection with commodity, HS code, quantity, country, producer ID, polygon (or point under 4 ha) — field list verified against the EU primary source in Stage 6; light print stylesheet (warnings ≥ 7.4:1); server-rendered OG + Twitter tags with the approved `og/verify.png` asset.
- **EVAL:** EVAL-078, 087 (print), 090 (tags present; unfurl verified in M-003). **TC:** TC-067, TC-070, TC-071, TC-072, TC-080, TC-081 · **Campfire:** TASK-18.

### TKT-18 · Clean-room proof checker and the proof-feed specification
- **Type** Task · **Priority** P0 · **sp** 3 · **Depends on** TKT-15 · **Milestone** M-001
- **Objective:** prove S6 independently: a small standalone checker, written only from the published feed specification and sharing no code with the app, verifies (and rejects tampered) proofs.
- **Acceptance criteria:** `docs/proof-feed.md` specification (resolves GAP-9); `evals/scorers/independent-verifier` uses only platform WebCrypto; passes the intact batch and fails every tamper case.
- **EVAL:** EVAL-058–063 (checker side). **TC:** TC-073 · **Campfire:** TASK-19.

### TKT-19 · Capture-boundary hardening and dependency hygiene
- **Type** Chore · **Priority** P1 · **sp** 3 · **Depends on** TKT-02 · **Milestone** M-001
- **Objective:** the upload endpoint rejects anything malformed, oversized or of the wrong type before it reaches verification, and dependencies stay free of known high-severity issues.
- **Acceptance criteria:** per-photo 10 MB cap, content-type and magic-byte checks, count ≤ 3, payload schema validation, rate limiting; rejected attempts still anchored as rejected `harvest_event` where signed (Solution-PRD §7 rule 2); `pnpm audit` gate in CI; no secrets in logs or client bundle.
- **EVAL:** EVAL-081, 083, 085. **TC:** TC-074, TC-075, TC-076 · **Campfire:** TASK-20.

### TKT-20 · Kodagu demo data and the automated demo script
- **Type** Task · **Priority** P0 · **sp** 5 · **Depends on** TKT-07, TKT-10, TKT-11, TKT-12, TKT-14, TKT-16 · **Milestone** M-001
- **Objective:** one command seeds a believable Hosahalli FPO and runs the whole grant demo end to end without manual database edits.
- **Acceptance criteria:** seed: 1 FPO, 1 buyer, ≥ 10 Kodagu plots, agents, devices, legitimate history, the four attack cases ready to submit; Playwright demo script (register plot → capture → verdict → batch → transfer → certificate verified) at 375 px and 1280 px; the four attacks show the evidence that caught them.
- **EVAL:** EVAL-073, 074. **TC:** TC-077, TC-078 · **Campfire:** TASK-21.

### TKT-21 · M-001 evaluation run, baseline-v1 and gate review
- **Type** Task · **Priority** P0 · **sp** 3 · **Depends on** TKT-18, TKT-20, all M-001 tickets · **Milestone** M-001
- **Objective:** measure M-001 against its gates and freeze the baseline for everything after.
- **Acceptance criteria:** `evals/results/eval-run-v1.json` + `evals/reports/eval-report-v1.md` from real output; S1 (≥ 95 % pooled, ≥ 90 % per scenario), S2, S4, S6, S7 met; CF-01–CF-14 clear; `baseline-v1.json` frozen (EV13); failures open Bug tickets, thresholds never lowered.
- **EVAL:** all M1 cases; gates S1, S2, S4, S6, S7. **TC:** TC-079 · **Campfire:** TASK-22.

---

## M-002 · Contract farming on real smart contracts

### TKT-22 · Spike: Foundry and Anvil in the cloud environment and on ARM
- **Type** Spike · **Priority** P2 · **sp** 2 · **Depends on** TKT-01 · **Milestone** M-002
- **Objective:** confirm before any contract work that Foundry installs and Anvil runs in the claude.ai/code environment (x86) and on Oracle A1 (linux-aarch64).
- **Acceptance criteria:** written answer with the exact install commands, versions and any blockers; `cloud-setup.sh` extended if it works. Throwaway code only.
- **EVAL:** — (feeds EVAL-093–104). **TC:** — · **Campfire:** TASK-23

### TKT-23 · Design addendum for contract-farming and processor screens
- **Type** Docs · **Priority** P2 · **sp** 3 · **Depends on** — · **Milestone** M-002
- **Objective:** the agreement, settlement and processor-transfer screens are not in the frozen design; add them through a short Stage 4 re-entry before they are built.
- **Acceptance criteria:** Design.md addendum + mockups in `.design/exploration/final/` in the frozen visual language; owner approval recorded as a D# decision.
- **EVAL:** EVAL-105 (design gates for the addendum screens). **TC:** — · **Campfire:** TASK-24

### TKT-24 · EVM ledger adapter and BatchRegistry contract
- **Type** Feature · **Priority** P2 · **sp** 5 · **Depends on** TKT-15, TKT-22 · **Milestone** M-002
- **Objective:** the same `Ledger` interface also writes entry hashes to a `BatchRegistry` contract on Anvil; proofs gain a transaction hash and block number.
- **Acceptance criteria:** adapter switchable by config; hash-chain store remains the payload system of record; Foundry tests; the M-001 proof and tamper cases pass against the EVM adapter too.
- **EVAL:** EVAL-058–063 (re-run on EVM), EVAL-103, EVAL-104. **TC:** TC-082, TC-083 · **Campfire:** TASK-25.

### TKT-25 · Contract farming escrow with automatic settlement
- **Type** Feature · **Priority** P2 · **sp** 8 · **Depends on** TKT-14, TKT-23, TKT-24 · **Milestone** M-002
- **Objective:** a buyer funds an agreement in mock INR; payment releases only when delivered kg ≥ agreed, the buyer's signed quality grade ≥ agreed, and every included picking is Verified.
- **Acceptance criteria:** `ContractFarming` + mock ERC-20 INR contracts with Foundry tests for every condition combination; buyer quality attestation signed; agreement and settlement screens per TKT-23; no release on any failed condition.
- **EVAL:** EVAL-093–099, EVAL-105. **TC:** TC-084, TC-085 · **Campfire:** TASK-26.

### TKT-26 · Processor hop with a mass-balance check
- **Type** Feature · **Priority** P2 · **sp** 5 · **Depends on** TKT-14, TKT-23, TKT-24 · **Milestone** M-002
- **Objective:** a batch can pass through a processor (pulping, drying) with input and output weights recorded, and an implausible loss or gain is flagged.
- **Acceptance criteria:** processor custody transfer signed and anchored; configurable mass-balance band per process; outside-band results flagged with an evidence sentence; certificate journey shows the extra step.
- **EVAL:** EVAL-100–102, EVAL-105. **TC:** TC-086 · **Campfire:** TASK-27.

---

## M-003 · Public deployment and demo

### TKT-27 · Oracle Cloud Always Free deployment
- **Type** Chore · **Priority** P1 · **sp** 5 · **Depends on** TKT-21 (and owner: Oracle account + A1 instance, domain) · **Milestone** M-003
- **Objective:** the app, Anvil and Caddy run on the owner's Oracle A1 instance with HTTPS on the product domain.
- **Acceptance criteria:** Docker Compose for linux-aarch64; Caddy + Let's Encrypt; ledger key and database on persistent block storage with an off-instance backup; keep-busy cron against idle reclamation; one-command redeploy.
- **EVAL:** — (enables EVAL-070, 072, 085, 090). **TC:** TC-087, TC-088, TC-089 · **Campfire:** TASK-28.

### TKT-28 · Production configuration and monitoring
- **Type** Task · **Priority** P1 · **sp** 3 · **Depends on** TKT-27 · **Milestone** M-003
- **Objective:** real providers, absolute-URL link previews and failure you can see at 3 AM.
- **Acceptance criteria:** provider keys as environment secrets; OG and canonical URLs absolute HTTPS on the domain; `/api/health` monitored with an alert to the owner; structured logs retained; dependency audit clean in production.
- **EVAL:** EVAL-085, 090. **TC:** TC-090, TC-091, TC-092 · **Campfire:** TASK-29.

### TKT-29 · Production rehearsals and published evaluation report
- **Type** Task · **Priority** P1 · **sp** 3 · **Depends on** TKT-28 · **Milestone** M-003
- **Objective:** show the product works where evaluators will see it.
- **Acceptance criteria:** three consecutive production demo runs under 10 minutes (S5, EV12); capture-to-verdict ≤ 30 s on the reference condition (S3, EV9); evaluation report published in `/evals/reports`.
- **EVAL:** EVAL-070, 072. **TC:** — · **Campfire:** TASK-30.

---

## Totals
| Milestone | Tickets | Story points |
|---|---|---|
| M-001 | 21 | 102 |
| M-002 | 5 | 23 |
| M-003 | 3 | 11 |
| **All** | **29** | **136** |
