# Decision Log — Udgam

## DISC1 · Evaluators first, pilot-ready second — accepted
**Context.** No design partner, plot data, or draft application exists; the RDI application is the forcing function.
**Decision.** Build for grant evaluators and investors in the next 8–12 weeks, shaped so one design-partner FPO pilot can follow without rework.
**Rejected.** Pilot from day one (burns the FPO relationship before verification is proven); both at once (splits focus).

## DISC2 · Anchor commodity: coffee, Kodagu/Chikkamagaluru — accepted
**Context.** EUDR covers seven commodities; India's EU-exposed ones are coffee, rubber, cocoa, wood.
**Decision.** Coffee in Karnataka's Kodagu/Chikkamagaluru belt.
**Rejected.** Rubber (less FPO density); spices/basmati (no EUDR plot mandate, weaker why-now).

## DISC3 · Threat model — accepted
**Context.** The verifier needs named scenarios to score against.
**Decision.** Must-have: GPS spoofing, replay, plot laundering, yield inflation. Stretch: identity substitution, timestamp manipulation.
**Rejected.** Gating the slice on all six.

## DISC4 · Organic is an attestation, not a verification — accepted
**Context.** No remote-sensing signal proves organic practice.
**Decision.** Hash and anchor the NPOP/APEDA certificate; the provenance certificate says "certified by X, anchored", never "verified organic".
**Rejected.** Dropping organic; input-log capture (roadmap).

## DISC5 · Client-side signing with per-device hash chain — accepted
**Context.** Server-only hashing makes the server a trusted party and weakens the trust-at-the-edge claim.
**Decision.** Non-extractable ECDSA P-256 key per enrolled device (WebCrypto/IndexedDB); each capture signed over photo hash + GPS + timestamp + plot id + previous capture hash; EXIF extracted for cross-checks. Sign exactly the bytes uploaded (downscale first, re-attach EXIF, then hash and sign).
**Rejected.** Server-side only; C2PA embedding (later); hardware attestation (needs native app, roadmap).

## DISC6 · Browser geolocation is scored, not trusted — accepted
**Context.** A PWA only gets the spoofable Geolocation API.
**Decision.** Accept it as input; the verifier scores accuracy radius, geo-fence containment, movement plausibility, EXIF vs browser GPS, and satellite agreement. Native wrapper is an RDI roadmap work package.
**Rejected.** Capacitor native build in the MVP.

## DISC7 · Remote sensing via hosted query APIs — accepted
**Context.** Raster processing in Node is heavy and fragile.
**Decision.** Global Forest Watch Data API for tree-cover loss since 31 Dec 2020; Copernicus Sentinel Hub Statistical API for NDVI; both behind a `RemoteSensingProvider` interface with a fixture provider and a per-plot cache. Cadence: deforestation once per polygon; 12-month NDVI at registration; ±30-day NDVI per harvest event cached per plot per month.
**Rejected.** Google Earth Engine (account approval); downloaded tiles (processing burden); pre-computed rasters only (not credible as live).

## DISC8 · Ledger: hash-chain store first, EVM second, one interface — accepted
**Context.** No EVM toolchain installed; the slice must prove verification, not chain plumbing; contract farming needs real smart contracts for credibility.
**Decision.** Milestone 1: append-only hash-chain store in SQLite with Merkle checkpoints. Milestone 2: Foundry/Anvil adapter with Solidity BatchRegistry, Custody, ContractFarming. Both behind one `Ledger` interface.
**Rejected.** EVM-first (delays the slice); hash-chain only (contract farming would be decorative).

## DISC9 · Contract farming is Milestone 2 — accepted
**Context.** It consumes verified batches and is the least-scrutinised component.
**Decision.** Escrow contract with mock ERC-20 INR; settlement when delivered quantity ≥ agreed, buyer-signed quality grade ≥ agreed, and all included events are Verified. Processor hop with mass-balance in the same milestone.
**Rejected.** Off-chain settlement records only; disputes in MVP.

## DISC10 · Roles — accepted
**Decision.** Field agent, FPO admin, buyer authenticated; public certificate page unauthenticated; farmer is a data entity; auditor is roadmap.
**Rejected.** Farmer login in MVP.

## DISC11 · Persistence and auth — accepted
**Decision.** Drizzle on file-backed libSQL so a hosted swap is config; Better Auth self-hosted with email + password and seeded demo accounts.
**Rejected.** Plain SQLite driver (blocks hosted swap); Auth.js; hosted auth providers (external dependency).

## DISC12 · Hosting: Oracle Cloud Always Free, Ampere A1, only — accepted
**Context.** Workload needs a long-running chain node, persistent disk, public HTTPS. Hetzner-class VPS (~₹400–700/month) was recommended; user chose the free option exclusively.
**Decision.** Single Always Free A1 instance (2 OCPU, 12 GB, ARM) running Next.js + Anvil + libSQL under Docker Compose behind Caddy. Provision early; keep-busy cron; consider PAYG upgrade to avoid idle reclamation.
**Rejected.** Hetzner/DigitalOcean paid VPS; Vercel + Turso + separate Anvil host; Mac + Cloudflare Tunnel.

## DISC13 · Verdict model — accepted
**Decision.** 0–100 integrity score from named weighted checks with evidence strings; Verified / Needs Review / Rejected; hard-fail checks force Rejected; rejections and signed admin overrides are anchored.
**Rejected.** Binary pass/fail; not anchoring rejections.

## DISC14 · Evaluation harness is in scope — accepted
**Decision.** Seeded legitimate + attack dataset, one command, per-scenario detection and false-positive report. Synthetic images with controlled EXIF for tests; real or generated coffee-plant photos for demo seeding.
**Rejected.** Manual demo only.

## DISC15 · Certificate aligned to EUDR DDS with in-browser verification — accepted
**Decision.** Public `/verify/{batchId}` with QR; browser recomputes the hash chain; print stylesheet; EUDR-conformant GeoJSON download.
**Rejected.** PDF library; server-asserted "verified" badge.

## DISC16 · Name, repo, timeline, cost scope — accepted
**Decision.** Name Udgam (domain unverified). Private proprietary GitHub repo. Six weeks from build start, Milestone 1 at week 3. Cost model = run cost only, three scenarios (demo, pilot, 10-FPO scale-out) in INR with contingency lines.
**Rejected.** Public repo or open licence by default; labour in the run cost.

## S1 · Sign and upload original camera bytes — accepted
**Context.** DISC5's on-device downscale existed only to fit Vercel's 4.5 MB body limit; hosting is now Oracle with no such limit.
**Decision.** Hash and sign the exact original photo bytes (≤ 10 MB each), keep EXIF intact, upload as-is; server generates unsigned display thumbnails. Supersedes the downscale clause of DISC5.
**Rejected.** Downscale + EXIF re-attach (extra step, weaker link between signature and camera output).

## S2 · Verification runs synchronously in the upload request — accepted
**Context.** Phone needs a verdict within 30 s; single free instance; fewest moving parts.
**Decision.** Boundary signature check → local checks → remote-sensing checks (cache first, 8 s timeout each) → score → persist + anchor in one transaction → respond. `verify(submission, context)` is pure and is the seam for a future async worker.
**Rejected.** Job table + in-process worker (B); separate service + queue (C).

## S3 · Single Next.js monolith with four route groups and pure `lib/*` modules — accepted
**Decision.** `/(agent)`, `/(admin)`, `/(buyer)`, `/verify/[batchId]`; Server Actions for forms; route handlers for multipart upload, proof feed, health. Business logic in `src/lib/*` with no Next.js imports.
**Rejected.** Separate apps per surface; API-only backend.

## S4 · Check registry with evidence sentences and three-state verdict — accepted
**Decision.** Twelve M1 checks (see Solution-PRD §4.2). Score = 100 × weighted mean of available checks; hard fail → Rejected; ≥ 80 Verified; 50–79 Needs Review; < 50 Rejected; any unavailable caps at Needs Review. Weights/thresholds in one config, printed in eval reports.
**Rejected.** Binary rules engine without scores; ML classifier in M1 (no training data).

## S5 · Deforestation thresholds: any loss flags, ≥ 10 % hard-fails — accepted
**Context.** EUDR is zero-tolerance in principle; GFW data is noisy on shade-coffee estates.
**Decision.** Any post-2020 loss inside the polygon → flag; ≥ 10 % of plot area → hard fail; both configurable; documented as an R&D finding area.
**Rejected.** Zero-tolerance hard fail (false positives from pruning); ignoring small losses.

## S6 · Provider failures never reject — accepted
**Decision.** Timeout/error → check status `unavailable` → verdict capped at Needs Review → admin re-run button retries only missing providers.
**Rejected.** Treating missing evidence as fraud.

## S7 · Hash-chain ledger with signed Merkle checkpoints and isomorphic proof verification — accepted
**Decision.** entry_hash over canonical {seq, prev_hash, kind, payload_hash, ts}; checkpoint every 100 entries or on demand (verify page forces one when needed); server ledger key generated at first boot, stored outside repo, public key at a well-known route; `verifyProof` shared with the browser.
**Rejected.** Anchoring individual entries without checkpoints (no batch proof); trusting server-asserted verification on the certificate.

## S8 · Batch and custody invariants enforced in the database — accepted
**Decision.** An event belongs to at most one batch (unique constraint); batch score = min(event scores); batch locked after custody transfer; all provenance writes anchored in the same transaction.
**Rejected.** Application-only checks.

## S9 · Canonicalisation and signature primitives — accepted
**Decision.** RFC 8785 (JCS) canonical JSON, SHA-256, ECDSA P-256 with SHA-256 via WebCrypto on both browser and server; ISO-8601 UTC timestamps.
**Rejected.** Ed25519 (WebCrypto support uneven across mobile browsers as of 2026); ad-hoc JSON stringify.

## EV1 · One evaluation plan, at the project root — accepted
**Context.** build-workflow names `evaluation-plan.md` both as a root artifact and inside the `/evals` package; two copies would drift.
**Decision.** `evaluation-plan.md` at the project root is the only copy. `/evals` holds `eval-dataset.json`, `eval-dataset.schema.json`, and (from Stage 7) `scorers/`, `results/`, `reports/`. No empty placeholder files.
**Rejected.** A copy in `/evals` (the same fact in two places); a pointer file (carries no content).

## EV2 · Evaluation categories; AI category not applicable — accepted
**Context.** eval-framework turns on only the categories the architecture warrants.
**Decision.** Functional, product acceptance, performance, reliability, security, design. No AI category: the MVP has no ML/LLM/RAG/agent behaviour (S4 rejected an ML classifier), and remote-sensing inputs are deterministic API answers scored by fixed rules. A learned component added later turns the AI category on, with its own decision and baseline.
**Rejected.** Applying every category mechanically; treating NDVI thresholds as an AI evaluation.

## EV3 · Release gates are S1–S7 with fixed measurement definitions, plus critical failure conditions CF-01 to CF-14 — accepted
**Context.** S1–S7 are the release gates (Discovery-PRD §7), but they did not say how each number is computed, which leaves room to recompute them generously later.
**Decision.** evaluation-plan.md §4 fixes the population, formula, and evidence for each gate. §5 lists fourteen critical conditions, each of which blocks release whatever the percentages say (for example a hard-fail attack not Rejected, an honest case Rejected, a tampered proof shown as verified, a report number not from a harness run).
**Rejected.** Percentage gates alone (a 95 % pass rate can hide a bug in a deterministic rule, or a proof that lies).

## EV4 · Detection needs attribution; false positives include Needs Review; case classes are fixed — accepted
**Context.** A Needs Review verdict caused by an unavailable provider would look like detection. A legitimate set full of edge cases would make S2 meaningless. Moving cases between classes could game both gates.
**Decision.** An attack counts as detected only if its verdict is in `acceptable_verdicts` (never Verified) and at least one expected catching check returned flag or fail. A false positive is a `legitimate` case that is not Verified. Honest submissions whose correct result may be Needs Review form a separate `legitimate_edge` class, outside S2, where any Rejected verdict is CF-02. Changing a case's class or expected verdict is a major dataset version change and needs a decision.
**Rejected.** Counting any non-Verified attack as detected; counting only Rejected as detected; excluding Needs Review from false positives.

## EV5 · Per-scenario detection floor of 90 % alongside the pooled 95 % — accepted
**Context.** S1 is a pooled rate. With about 10 cases per scenario, a strong scenario can hide a weak one.
**Decision.** Keep S1 pooled at ≥ 95 % and add a gate that each of scenarios 1–4 reaches ≥ 90 %. This is stricter than S1, never looser.
**Rejected.** Pooled only (hides a blind spot); ≥ 95 % per scenario (at 10 cases that means zero misses everywhere, which one ambiguous case can break).

## EV6 · Known limitations are declared, reported, and excluded from S1 — accepted
**Context.** The MVP cannot catch some attacks by design: GPS spoofed inside the plot with consistent EXIF (R7), a re-encoded replayed photo (SHA-256 uniqueness cannot see it), and retroactive re-scoring of salami yield. Leaving them in S1 guarantees failure; dropping them silently is dishonest to evaluators.
**Decision.** A `known_limitation` case class, run and listed prominently in every report with its verdict, and never counted in S1. Reclassifying an attack as a known limitation needs its own decision.
**Rejected.** Counting them in S1; leaving them out of the dataset.

## EV7 · A `fail`, or a deforestation or yield `flag`, caps the verdict at Needs Review — accepted
**Context.** Under S4's weighted mean with Verified at ≥ 80, a single non-hard `fail` barely moves the score (with equal weights, one fail gives 91.7 and two fails give 83.3, both Verified). About half the S1 attack cases are single-signal, so S1 would fail, or the weights would end up tuned to the eval set. Honest pruning and a small clearing produce identical satellite data (EVAL-019 / EVAL-040), so human review is the only result that is right for both.
**Decision.** Recommend amending the S4 verdict rule: any check with status `fail`, or a `flag` on `deforestation_overlap` or `yield_plausibility`, caps the verdict at Needs Review; hard fails still force Rejected. The owner decides at the Stage 3 gate. If rejected, Stage 6 must set weights that meet S1 without tuning on the eval set (EV13).
**Rejected.** Leaving the verdict to weights alone (overfitting risk, and no weights exist yet); turning every fail into a hard fail (honest 150 m GPS fixes under canopy would be Rejected).

## EV8 · Dataset design: mutation-based attack cases over role-described fixtures — accepted
**Context.** Cases have to be written before plots, coordinates, or real yield figures exist, and each attack case must differ from its honest base case only in the attack.
**Decision.** One `eval-dataset.json`, validated by `eval-dataset.schema.json`; each case names a suite (harness-verifier, harness-proof, integration, e2e, perf, ci, manual). An attack case is a legitimate base case plus typed mutations. Plots are described by role, area, shape, and remote-sensing profile; P01–P10 fixtures are recorded from live API responses for real polygons where accounts allow. Yield is written in multiples of U, the reference upper bound, so no Coffee Board figure is assumed (R6). Cases do not depend on execution order. Evidence sentences follow a fixed value-and-threshold format that the scorer checks.
**Rejected.** One file per suite (splits one fact); hand-written coordinates now (no fixtures exist yet); invented yield figures.

## EV9 · S3 is timed from the Submit tap to the verdict card, on a stated reference condition — accepted
**Context.** "Capture-to-verdict, online" does not say where timing starts or what network is assumed. With original photos (S1), upload dominates: on placeholder numbers (3 × 4 MB at 5 Mbit/s up), upload alone takes about 19 s, before a GPS wait of up to 10 s and a cold provider call of up to 8 s.
**Decision.** t0 = Submit tap; t1 = verdict card visible. Reference condition: live providers; at least 5 of 20 runs with a cold harvest-window cache; three photos at the demo phone's real size; a 10/5 Mbit/s, 80 ms RTT network profile. Photo size and network are placeholders until the owner's field calibration (HR3). Gate: every one of 20 automated runs and 5 manual runs on the demo phone ≤ 30 s. Stage 6 evaluates starting GPS when the capture screen opens and uploading photos during weight entry, rather than weakening S3.
**Rejected.** Timing from the camera shutter (a PWA cannot observe it); timing server-side only (not what the agent experiences); p95 (S3 names no percentile, so the stricter maximum applies).

## EV10 · S4 is timed from navigation start to the final verification-panel state — accepted
**Decision.** A 50-event batch (N2); Playwright Chromium at 375 px with 4× CPU throttling; the EV9 network profile; cold cache; production build; on-demand checkpoints included. Each of 10 cold loads must be < 3 s. Real-phone QR loads are recorded at Stage 11.
**Rejected.** Timing only the in-browser computation (the visitor waits for the whole page).

## EV11 · S6 is checked by the page and by a clean-room checker, over a batch's provenance closure, with a tamper suite — accepted
**Context.** `verifyProof` is shared between browser and server, so a bug on both sides would cancel out. "Every anchored record" also needs a defined scope.
**Decision.** Scope = the batch's provenance closure (evaluation-plan.md §4.6). Both the in-page verifier and a standalone checker (no imports from `src/`, written only from the published proof format) must verify 100 % of in-scope entries and reject 100 % of tamper variants. The report states the trust-anchor limit: the key is published by the same server.
**Rejected.** In-page verification only; a global "all ledger entries" scope (rejected captures never appear on a certificate).

## EV12 · S5 needs three consecutive production rehearsals under 10 minutes — accepted
**Decision.** Three consecutive recorded runs of the Discovery-PRD §7.1 script on production, from seeded state, each < 10 min, with no manual DB edit, no shell step, and no retried step; plus the automated Playwright demo and attack-evidence cases green.
**Rejected.** A single successful run (says little about how reliable the demo will be in front of evaluators).

## EV13 · Baselines: ledger-only v0 and frozen-config v1; config changes need new cases first — accepted
**Decision.** `baseline-v0-ledger-only` (only `signature_valid` enabled) shows what a ledger alone catches. `baseline-v1` is the first full run with the complete registry and a frozen, hashed config, before any tuning. `baseline-perf-v1` holds the first S3/S4 measurements. After v1, any change to weights, thresholds, or verdict rules needs a threat-model reason in a decision entry, plus at least two new attack cases per affected scenario committed before the re-run.
**Rejected.** Tuning against the whole seeded set (overfits the gate); a held-out split at this sample size (too few cases per partition to mean anything).

## EV14 · Regression and dataset versioning — accepted
**Decision.** CI runs `pnpm eval` on changes to verification, crypto, ledger, remote-sensing, media, EUDR export, the capture route, the dataset, or the config. A case that passed in the previous formal run and fails now is a regression; a regression on a critical case, or any CF, blocks merge. `dataset_version` is semver: patch for wording, minor for added cases, major for class, verdict, or gate changes (which need a decision). Cases are retired with a reason, never deleted, and IDs are never reused.
**Rejected.** Running evals only at Stage 9 (regressions are found late).

## EV15 · An identical signed payload is idempotent — accepted
**Context.** Solution-PRD §6 keeps the signed payload so the agent can retry manually after a network failure. If the first upload succeeded but the response was lost, the retry would hard-fail `photo_uniqueness` and reject an honest agent.
**Decision.** The server recognises an already-accepted payload hash and returns the original event and verdict, without creating a new event or counting kg twice (EVAL-068, CF-14). A replay with new metadata but reused photos still hard-fails.
**Rejected.** Treating every resubmission as a replay attack (rejects honest retries); client-side dedupe only (only the server knows whether the first upload landed).

## EV16 · Public certificate and GeoJSON show no farmer personal data — accepted
**Context.** The certificate page is public and unauthenticated. The Solution-PRD lists a producer_id but does not say whether farmer names or identifiers appear.
**Decision.** Public outputs carry only a pseudonymous producer_id, never a farmer name or `farmers.identifier` value (EVAL-084). The plot polygon stays public, per F12.
**Rejected.** Showing farmer names publicly (needless exposure of smallholders; the importer's due-diligence need is met by the producer_id and the polygon).

## S10 · Verdict caps close the single-signal gap — accepted
**Context.** Stage 3 found that under S4's equal-weight scoring one non-hard `fail` scores about 91.7 and two about 83.3, both Verified, so single-signal attacks (e.g. capture outside the plot) pass and S1 cannot be met. Adopted from EV7 at the Stage 3 gate, 2026-09-28.
**Decision.** Any check with status `fail`, any `deforestation_overlap` or `yield_plausibility` `flag`, or any `unavailable` check caps the verdict at Needs Review regardless of score. Amends S4; Solution-PRD §4.3 and F6 updated.
**Rejected.** Tuning weights until the test set passes (overfits the eval set); making every `fail` a hard fail (rejects honest agents on noisy GPS).

## S11 · Stage 7 Execution runs in a claude.ai/code cloud session — accepted
**Context.** Owner requirement, 2026-09-28: "I want the execution stage should happen in cloud session anyhow." A background cloud agent launched from the local session fell back to a local worktree in Stage 3, so the reliable route is a session the owner opens at claude.ai/code on the private repo `007U5H4R/udgam`.
**Decision.** All Stage 7 build work (code, tests, eval runs, per-phase QA) happens in owner-opened cloud sessions on the GitHub repo. Stage 6 must therefore deliver: a cloud environment setup script (Node, pnpm, Foundry for Milestone 2, Playwright browsers), `.env.example` naming every variable, the fixture remote-sensing provider as the default so the build and eval harness run with no API keys, and a "To sync locally" list in HANDOFF for Campfire and the Obsidian vault after each phase. Provider keys (GFW, Copernicus, ArcGIS) are entered only as cloud environment secrets, never committed.
**Rejected.** Running Stage 7 locally (owner requirement); background cloud agents launched from the local session (fell back to local in Stage 3); committing keys to make the cloud build work.

## D1 · Visual direction: Opal-inspired glow, made Udgam's own — accepted
**Context.** Stage 4 explored three directions (Estate Record Book, Your Plot Proven, One Thing at a Time) in a gallery; the owner rejected all three and named the Opal iOS app as the reference, then approved the built final on 2026-09-29.
**Decision.** Near-black green-biased ground with a coffee-leaf ambient glow, frosted dark cards with hairline borders, Figtree + Noto Sans Kannada, one gradient-lit word or number per screen, glowing pill buttons, floating glass tab bar, tinted sheets for serious states. Tokens in Design.md §12; mockup `.design/exploration/final/`.
**Rejected.** A (record book: cream-palette risk, owner preference); B (plot map: recommended, owner preferred Opal); C (bilingual one-question flow: plainest look); copying Opal literally (no gem, logo, names, copy).
**Evidence.** Mobbin Opal screens (`.design/exploration/ref/`, local only); 48 measured page states pass; body text 13.9–15.9:1 on cards.
**Consequence.** Dark UI in direct sun is a field-test risk (Design.md §22) with a light "Sunlight" token set as fallback; glass/glow justified in Design.md §24.

## D2 · Brand object: a three-cherry coffee cluster — accepted
**Context.** The first object, a single round cherry, read as a plum or apple at large sizes.
**Decision.** `final/cherry.svg` v2: three small oval cherries with flower scars at a branch node, two long glossy leaves, iridescent rim light, light pool beneath; green rim on Verified, amber on Needs a check, absent on failure states (no green allowed there).
**Rejected.** Single cherry (misread); Opal-style gem (not ours); generated raster image (not needed; SVG scales and is deterministic).

## D3 · Plot card is the Home hero; proof card is the certificate hero — accepted
**Context.** Opal leads with one hero data card. Udgam's most meaningful fact for a farmer is "you are inside your plot"; for a buyer it is "this proof checked out on your device".
**Decision.** Home hero = the plot outline glowing with the live location dot and "You're inside Plot 2". Certificate hero = the in-browser proof result, above any map on phones (EVAL-087).
**Rejected.** KPI or earnings summary on Home (dashboard-by-default); map-first certificate on phones.

## D4 · Capture app IA: three-tab floating bar, full-screen record flow — accepted
**Decision.** Tabs Home · Pickings · Help; the record flow (photos → review → weight → checking → verdict) is a full-screen stack with the tab bar hidden. One primary action per screen.
**Rejected.** Single stack with no tabs (loses quick access to past pickings and help); more tabs.

## D5 · Farmer-facing verdict words and the verdict template — accepted
**Decision.** Verified · Needs a check · Not accepted (system states stay Verified / Needs Review / Rejected). One template for all three: brand object or mark, the lit verdict word, up to three evidence lines with icons, one pill. Needs a check always says who checks, when, and that nothing is needed from the farmer; Not accepted always names the reason and what to do.
**Rejected.** "Rejected" shown to farmers (reads as an accusation); verdicts by colour alone.

## D6 · Capture uses the phone's own camera, with slots before and review after — accepted
**Context.** Solution-PRD F4 requires the native camera so EXIF survives; there is no custom viewfinder to design.
**Decision.** Three labelled slots with example drawings (The branch · Basket on the scale · The day's pile), minimum one photo, a "Check:" review with Use this photo / Take again. Weight via big lit number, custom keypad and "Send 42.5 kg"; hint shows the farmer's own recent range, never the fraud threshold.
**Rejected.** Custom in-app viewfinder (breaks F4); wheel or ruler pickers for weight.

## D7 · Certificate prints light; admin overrides need a reason — accepted
**Decision.** The certificate has a light print stylesheet (warnings ≥ 7.4:1 on paper, controls hidden). Admin Accept/Not accepted opens a required reason (≥ 10 characters) and states the decision is signed and recorded permanently; hard-failed items show no override controls.
**Rejected.** Printing the dark screen design; one-click overrides.

## D8 · Phone roles unchanged pending owner decision — accepted
**Context.** The owner said farmers will mostly use the app; DISC10 made the field agent the login and the farmer a record. Asked twice at the Stage 4 gate; the owner approved the design without changing roles.
**Decision.** Keep DISC10. The capture app is designed for a farmer's comfort level regardless of who holds the phone. Revisit if the owner decides farmers should log in (affects enrolment and Home, not the visual design).
**Rejected.** Changing roles without an explicit owner decision.
