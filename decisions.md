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

## TP1 · Stack and pinned versions — accepted
**Context.** Stage 7 runs in fresh cloud sessions, where an unpinned major version (Next 16, React 19, zod 4, Vitest 5) would change behaviour between sessions.
**Decision.** Next.js 16.3.6 (App Router), React 19.3.0, TypeScript strict, Node 22, pnpm, Tailwind 4.3.3 carrying the Design.md tokens verbatim, Drizzle 0.45.3 on @libsql/client 0.18.0, Better Auth 1.7.6, zod 4.6.5, canonicalize 5.1.0 with WebCrypto, exifr, sharp (with linux-arm64 prebuilds), @turf/turf, Leaflet 1.9.4 + react-leaflet 5 + leaflet-draw 1.0.4 (admin editor only), idb, pino, Vitest 5.0.2, Playwright 1.63 + axe. Everything is pinned exactly (technical-plan §0, checked with `npm view` on 2026-09-29).
**Rejected.** Caret ranges (a cloud session would drift silently). next-intl (a dictionary is enough, TP18). leaflet-geoman as the default (TKT-06 names leaflet-draw; geoman is the fallback if leaflet-draw breaks, recorded as an EXE decision).

## TP2 · Verdict config cfg-1: status scores 1 / 0.5 / 0 and equal weights — accepted (resolves GAP-5)
**Context.** S4 and S10 fix the verdict rules but not the per-status score values or the weights. EV13 forbids tuning weights to the eval set.
**Decision.** ok = 1, flag = 0.5, fail = 0; `unavailable` is excluded from the mean. All twelve weights are 1. Verified ≥ 80, Rejected < 50; hard fail → Rejected; the S10 caps apply. The config is one object, `cfg-1`, hashed with SHA-256 over its JCS form and printed in every result. It is frozen at baseline-v1.
**Rejected.** Hand-set unequal weights (no evidence to set them, and they invite tuning on the eval set); fail = −1 (the caps already prevent Verified).

## TP3 · Evidence sentences name the measured value and the threshold — accepted (resolves GAP-8)
**Decision.** One English template per check and status (technical-plan §6.5), in the evaluation-plan §7.4 unit formats, with snapshot tests (TC-011). Farmer-facing copy rewrites them in plain words with the same numbers. HR1 scores the templates at Stage 9.
**Rejected.** Free-form evidence per check author (it can't be tested and drifts from the dataset's `evidence_substrings`).

## TP4 · `exif_time_agreement` rules — accepted (resolves GAP-1)
**Decision.** ok only when EXIF–client ≤ 10 min and client–server ≤ 24 h. flag when EXIF time is absent, EXIF–client > 10 min, or client–server > 24 h. fail when either gap is > 7 days. This matches the dataset's assumption (EVAL-011, 033, 034, 035, 055–057).
**Rejected.** Absent EXIF time → fail (browsers and apps strip EXIF; honest agents would be capped).

## TP5 · Plot assignment is enforced at the capture boundary — accepted (resolves GAP-2)
**Context.** F4 says "assigned plot", but the data model had no assignment, and EVAL-054 was pending.
**Decision.** Add an `agent_plots` table. A capture for a plot not currently assigned to the device's agent is refused at the boundary (HTTP 403 `plot_not_assigned`) and anchored as a rejected `harvest_event`, like a bad signature (Solution-PRD §7 rule 2). The twelve-check registry and cfg-1 are unchanged. EVAL-054 becomes `active` (dataset 0.2.0).
**Rejected.** A thirteenth scored check (it changes S4's registry and scoring for what is an authorisation question); no enforcement (the identity-substitution scenario would stay open).

## TP6 · Yield season, conversion point and reference values — accepted (resolves GAP-3; R6)
**Decision.**
- Season = the Indian coffee year, 1 Oct – 30 Sep IST, bucketed by server receipt time.
- Cumulative = this plot's accepted, non-Rejected events plus this event.
- The conversion is applied once, at comparison: s = (Σ cherry kg × ratio ÷ area_ha) ÷ max_kg_ha.
- Reference `max_kg_ha` = the highest Kodagu/Chikkamagaluru district average, 2018-19 to 2023-24 (Coffee Board *Database on Coffee*, July 2024, Tables 1.10–1.11): Arabica 783, Robusta 1,494 kg/ha clean.
- `cherry_to_clean_ratio` = 1/6 (industry range 5–6:1, conservative end; recorded as unverified because the Coffee Board publishes only dry-cherry outturn).
**Consequence / risk.** District averages are not upper bounds, so exceptional honest estates can be flagged, and above 2× rejected. The design-partner FPO validates the numbers before any pilot, and per-plot yield history is the roadmap fix. GAP-7 (no retroactive re-scoring) stays a declared limitation.
**Rejected.** Client capture time for the season (attacker-controlled); inventing an upper bound with no source; a 5:1 ratio (more honest estates flagged).

## TP7 · Idempotent retry keyed on the payload hash — accepted (implements EV15; resolves GAP-4)
**Decision.** `harvest_events.payload_hash` is UNIQUE. Before verification, the pipeline looks up the hash: an accepted event streams its original verdict with `idempotent:true`; a boundary-rejected one returns the same rejection. No new rows or anchors are written. EVAL-068 becomes `active`.
**Rejected.** A client-side dedupe key (only the server knows whether the first upload landed).

## TP8 · The proof feed hides unknown batches and wrong short hashes identically — accepted (resolves GAP-6)
**Decision.** An unknown batch, a missing `h`, and an `h` that doesn't equal the batch's 12-hex short hash (constant-time compare) all return the same 404 body from both the feed and the page. EVAL-064 is confirmed.
**Rejected.** Serving the feed without `h` (batch IDs would become enumerable); a distinct "wrong hash" error (an oracle for guessing).

## TP9 · Proof feed v1 and RFC 6962 Merkle checkpoints — accepted (resolves GAP-9)
**Decision.**
- Leaves are `SHA-256(0x00 ‖ entry_hash)` and nodes `SHA-256(0x01 ‖ l ‖ r)`, split at the largest power of two below n.
- A checkpoint statement is `jcs({v,id,fromSeq,toSeq,merkleRoot,prevCheckpointHash,ts})`, signed with ECDSA P-256, P1363, base64url, and identified by an RFC 7638 `kid`.
- Checkpoints are made every 100 entries (in the same transaction) or on demand.
- The feed format `udgam-proof-feed/1` is documented in `docs/proof-feed.md` well enough for the clean-room checker (TKT-18).
**Rejected.** Duplicating the odd leaf (Bitcoin style; second-preimage ambiguity); unsigned roots; a DER signature encoding (WebCrypto emits P1363 natively).

## TP10 · `chain_continuity` rules, including re-enrolment — accepted
**Decision.** ok: seq = last + 1 and prev hash = the device's last accepted hash, or genesis when the agent has no prior accepted events. flag: a wrong seq or prev hash, or genesis on a new device when the agent already has accepted events on another device (EVAL-021). Never a fail, because a lost IndexedDB is honest (Solution-PRD §12).
**Rejected.** Failing chain breaks (would penalise honest re-enrolment).

## TP11 · Initial NDVI and forest-loss parameters — accepted (frozen at baseline-v1)
**Decision.**
- `ndvi_cultivation`: needs ≥ 6 clear months; fail if the minimum monthly NDVI is < 0.50 or the seasonal swing is > 0.35; unavailable if there are fewer clear months.
- `ndvi_harvest_window`: mean NDVI over ±30 days ≥ 0.45 → ok; 0.30–0.45 → flag; < 0.30 → fail; no clear observation → unavailable.
- Clouds are masked with Sentinel-2 SCL classes 3, 8, 9, 10 and 11.
- GFW loss uses canopy density ≥ 10 % in 2000 (the EUDR forest definition), years ≥ 2021, dataset pinned at v1.13.
**Consequence.** These are initial, literature-level values for perennial shade canopy, not fitted to the eval set. Live-provider agreement runs report divergence; any change after baseline-v1 follows EV13.
**Rejected.** GFW's 30 % default (it undercounts loss in the >10 % canopy that EUDR calls forest); unmasked NDVI (monsoon cloud would read as bare ground).

## TP12 · Remote calls happen outside the write transaction; progress streams as NDJSON — accepted
**Context.** S2 keeps verification in the upload request, and the checking screen must show the real checks (Design.md §9). A SQLite write lock held across an 8 s provider call would block every other writer.
**Decision.** Parse → boundary → idempotency → media → context reads → `verify()` (remote phase capped at 10 s) → one `BEGIN IMMEDIATE` transaction for rows plus anchors → response. `/api/capture` streams `application/x-ndjson` events: `check` as each check finishes, `verdict` only after COMMIT, or a retryable `error`. Caddy uses `flush_interval -1` in production.
**Rejected.** Polling a job endpoint (needs job state S2 rejected); verifying inside the transaction (lock contention); server-sent events (a POST body plus a stream is simpler with fetch).

## TP13 · GPS starts with the record flow; staged photo upload proposed as a new ticket — proposed (owner decision)
**Context.** EV9 placeholder budget: 3 × 4 MB at 5 Mbit/s up is about 19 s, GPS can add 10 s and a cold provider 8 s, so the worst case is on or over 30 s.
**Decision.** In TKT-10: `watchPosition` starts when `/field/record` opens, so the fix is ready at Submit. **Proposed, TKT-30:** upload each photo to a staging endpoint when "Use this photo" is tapped (content-addressed, 1 h TTL, session-authenticated, verified by hash against the signed payload), taking upload off the Submit-to-verdict path. Enhancement, P1, 3 sp, depends on TKT-10 and TKT-19. HR3's measured photo size decides urgency. It is not created in Campfire until the owner approves the added scope.
**Rejected.** Weakening S3 (EV9 forbids it); downscaling photos (S1 signs the original bytes).

## TP14 · Provenance invariants live in the database — accepted (S8, N7)
**Decision.** Every provenance table has `anchor_seq NOT NULL REFERENCES ledger_entries(seq)` with foreign keys enabled. Triggers make the ledger append-only, keep `final_verdict` current, block overrides of hard-failed runs, admit only Verified same-crop events to open batches, recompute batch quantity and minimum score, and lock transferred batches. `batch_events.event_id` is UNIQUE.
**Rejected.** Application-only checks (S8 rejected them; CF-07 and CF-08 must be impossible, not merely unlikely).

## TP15 · Overrides and custody are signed with server-held per-user keys — accepted
**Context.** Solution-PRD §4.4 says "signed with the admin's server-bound key".
**Decision.** On first use, the server generates a P-256 key per admin (or buyer, for M-002 quality grades) at `DATA_DIR/keys/users/<id>.jwk` (mode 0600). It signs the JCS statement and anchors the statement, the signature and the `kid`. UI and docs say plainly that the server signs on behalf of the signed-in account: this attests which account decided, not possession of a personal device.
**Rejected.** Per-admin browser keys (a second enrolment flow for a desk user in M1); unsigned overrides (D7 and S4 require signing).

## TP16 · The certificate renders only from the proof feed; public payloads carry no personal data; noindex — accepted
**Decision.**
- `/verify/[batchId]` derives every displayed fact from the feed payloads that the browser verifies, and embeds that feed in the page (no second request, which helps S4).
- Ledger payloads carry IDs, hashes, numbers and `producer_id` only (EV16).
- The page is `noindex, nofollow`, with OG tags kept (the Design.md §25 deferred decision).
- Admin override reasons are public, and the reason panel says so.
**Rejected.** Rendering from separate DB queries (the displayed facts could diverge from what was verified, CF-11); indexing certificates (supply-chain pages don't belong in search).

## TP17 · Screens without a mockup are composed from frozen components — accepted
**Context.** `.design/exploration/final/` covers capture s1–s8, the admin review queue and the certificate. It has no Not-accepted verdict screen, sign-in, enrolment, Help, plot editor, batch builder, phones or buyer list, all of which the M-001 tickets need.
**Decision.** Build them only from ported components and the same layout grammar: field is one column with one pill; admin is rail + list + detail. No new colours, sizes, radii, motion or icons. Not accepted uses the D5 template (no green, reason plus what to do). Stage 8 critiques them against Design.md. This is not a design change; any new visual concept goes back to design review.
**Rejected.** A Stage 4 re-entry before M-001 (it would delay the riskiest slice for screens with no new design problem); leaving the composition to each implementer (drift).

## TP18 · i18n with typed dictionaries, English shipped, Kannada marked for review — accepted
**Decision.** `src/lib/i18n/{en,kn}.ts` with identical key sets (tested), `t(key, vars)`, the language in a cookie, and `<html lang>` set. Kannada strings carry `REVIEW: native speaker` until the owner's review. There is no i18n library.
**Rejected.** next-intl (routing and message loading the MVP doesn't need).

## TP19 · Satellite tiles only in the admin plot editor, through the keyed Esri service — accepted
**Decision.** Leaflet is loaded only on `/admin/plots*`, with Esri World Imagery via the ArcGIS Location Platform (`ARCGIS_API_KEY`, free tier) and its required attribution; MapTiler Satellite is the one-config fallback. The Home plot card and the certificate draw inline SVG from GeoJSON (Design.md §25). e2e stubs tiles.
**Rejected.** The unkeyed legacy `server.arcgisonline.com` URL (licence for a public demo unverified); tiles on the certificate (S4 weight, third-party requests from a public page).

## TP20 · Evaluation architecture and commands — accepted
**Decision.**
- `pnpm eval` is the single top-level command: offline, fixture provider, harness-verifier and harness-proof suites, gates S1/S2/S6-lib/S7 plus CFs, and results and reports under `evals/` per evaluation-plan §12.
- Plus `--config=ledger-only`, `--provider=live [--record]`, `--ledger=evm` (M-002), `eval:validate`, `eval:integration`, `eval:e2e`, `eval:perf --target`, and `eval:release`.
- Integration and e2e tests carry EVAL-/TC- IDs in their titles, and the release aggregator maps them.
- CI runs `pnpm eval` on the EV14 paths.
- New cases are appended from EVAL-106 by the owning tickets before baseline-v1.
**Rejected.** Separate commands per suite as the only entry point (no single gate); running evals only at Stage 9 (EV14).

## TP21 · Observability without third-party services — accepted
**Decision.** pino JSON logs with a request ID and redaction; `/api/health` (db, ledger checkpoint age, key present, provider probes); `certificate.viewed` and `certificate.proof_failed` as structured log events; in M-003, a scheduled GitHub Actions probe of `/api/health` every 15 minutes that notifies the owner by failing.
**Rejected.** Hosted analytics on the public certificate page (privacy, third-party requests); a paid uptime service (DISC12 free-only).

## TP22 · Campfire is local-only; the cloud session keeps an execution ledger — accepted
**Decision.** Campfire (`backlog/`, onboarded in Stage 6, TKT-01..29 → TASK-2..30) is edited only by the owner's local session. The cloud session records task status in `docs/exec/ledger.md` and never edits `backlog/`. The local session syncs Campfire, the vault and memory at each phase gate (technical-plan §21.3).
**Rejected.** Editing `backlog/` from the cloud (merge conflicts with local Campfire edits and no running PWA there).

## TP23 · Milestone 2 evaluation cases EVAL-093–105 added; dataset 0.2.0 — accepted
**Context.** milestones.md requires M-002 EVAL cases to be added in Stage 6.
**Decision.** Append EVAL-093–099 (settlement conditions, double settlement, unauthorised caller, bad quality signature), EVAL-100–102 (mass balance within, below and above band), EVAL-103–104 (proof suite on the EVM adapter; divergence detection) and EVAL-105 (M-002 screens meet the design gates). Add the schema feature value `contract-farming`. Activate EVAL-054 (TP5) and EVAL-068 (TP7). Dataset version 0.1.0 → 0.2.0 (minor: cases added; no class or verdict changed).
**Rejected.** Deferring M-002 cases to M-002 start (milestones.md exit criteria reference them).

## TP24 · EUDR GeoJSON follows the Commission's file description v1.5 with a pseudonymous ProducerName — accepted
**Decision.**
- The file is a FeatureCollection in WGS84 with [lon, lat] at 6 decimals and one Feature per plot.
- A plot of 4 ha or more exports as a Polygon (outer ring, closed, no self-intersection); a smaller plot exports as a Point with a numeric `Area`.
- EU properties: `ProducerName` = `producer_id` (EV16), `ProducerCountry` `IN`, `ProductionPlace` = district, Karnataka.
- Udgam extras (ignored by the EU system): `commodity`, `hs_code` "0901 11", `quantity_kg_cherry`, `crop`, `batch_id`, `certificate_url`.
- Sources: the EUDR GeoJson File Description v1.5 (5 May 2025) and Reg. 2023/1115 Art. 2(28).
**Rejected.** Farmer names in `ProducerName` (EV16); a point at exactly 4 ha (allowed, but Solution-PRD says < 4 ha and a polygon is always accepted).

## TP25 · EXIF time without a zone is read as IST — accepted
**Decision.** `DateTimeOriginal` uses `OffsetTimeOriginal` when present; otherwise it is interpreted as +05:30, because the phones are in India. The evidence sentence reports the gap in the §7.4 format.
**Rejected.** Reading it as UTC (every honest capture would be 5 h 30 min off and flagged).

## TP26 · On-chain attestations use EIP-712 with server-held secp256k1 keys — accepted (M-002)
**Context.** `ContractFarming` must check the buyer's quality grade and the operator's "all included events Verified" attestation on chain. Solidity checks secp256k1 signatures natively (`ecrecover`). Checking the P-256 signatures used everywhere else needs a precompile that Anvil may not provide reliably.
**Decision.** For M-002 on-chain inputs only, the server holds a secp256k1 key per buyer organisation and one operator key (`DATA_DIR/keys/evm/`, mode 0600), and signs EIP-712 typed data that the contract verifies with `ecrecover`. The honest wording of TP15 applies: the server signs on behalf of the signed-in account. The operator key is the oracle for verification status, and the certificate and docs say so. Off-chain records keep P-256 (S9).
**Rejected.** On-chain P-256 verification (unreliable precompile support on Anvil); an unsigned grade (DISC9 requires a buyer-signed grade).

## TP27 · The four demo attacks are submitted from an in-app demo panel behind DEMO_MODE — accepted
**Context.** S5 and EV12 require the live demo to run with no shell step and no manual database edit. F15 seeds the four attack cases "ready to submit", but no screen submits them.
**Decision.** Add `/admin/demo`, rendered only when `DEMO_MODE=1` and only for admins. It lists the four staged attack captures (each pre-built and signed by a seeded demo device) and submits them through the real `/api/capture` path, so each gets a genuine verdict and anchor. It is composed from frozen components (TP17), labelled "Demo tools", and is absent from production builds unless the flag is set for rehearsals (EVAL-072).
**Rejected.** A CLI script during the demo (a shell step breaks S5); a second phone faking attacks live (unreliable in front of evaluators and slower).

## TP28 · TP13 approved: staged photo upload becomes TKT-30 — accepted
**Context.** The owner approved TP13 on 2026-09-29. The EV9 placeholder budget puts capture-to-verdict at about 30 s worst case, with photo upload the largest part.
**Decision.** Add TKT-30 "Stage photo uploads when a photo is accepted" (Enhancement, P1, 3 sp, M-001, Campfire TASK-31; depends on TKT-10 and TKT-19; TKT-21 now depends on it). The capture payload and its signature are unchanged (S1). Staged files belong to one agent, expire after 1 h, are never provenance and never count as seen. A missing staged file makes the client resend the bytes once. Test cases TC-093 and TC-094; plan in technical-plan.md §22.
**Rejected.** Deferring until HR3 (HR3 was waived, TP29, so the measurement that would have decided it will not come).

## TP29 · HR3 field calibration waived; AI-generated demo photos used instead — accepted
**Context.** evaluation-plan.md §9 HR3 asked for about 10 real captures on the demo phone, to calibrate the legitimate set's jitter (S2 realism) and the S3 reference condition. On 2026-09-29 the owner chose generated photos instead of real captures.
**Decision.**
- Eight AI-generated photos covering the three D6 slots (4 branch, 3 scale, 1 pile) are committed in `assets/demo-photos/`, with a manifest recording provider, model, prompt and SHA-256. They are used for seed data (with synthetic EXIF written per capture, `source: "generated-demo"`) and capture e2e fixtures, and are never presented as real evidence. Four further prompts are pending until the providers' daily limits reset.
- **Consequences, stated in every eval report:** the S3 reference condition keeps its placeholders (3 × 4 MB photos, 10/5 Mbit/s, 80 ms) as assumptions, not measurements. The legitimate set's GPS-accuracy, EXIF-presence and EXIF-time jitter uses the values already in the dataset, not field data. S2 realism is therefore an unvalidated assumption.
- The five manual demo-phone S3 runs (EV9) and the midday sunlight test are **not** waived.
**Rejected.** Stock photos (licence terms and the Design.md anti-reference); leaving the seed without photos (the capture flow and admin review need them).

## EXE1 · Owner waiver: Stage 7 runs through every phase gate and the M-001 gate without stopping — accepted (owner, 2026-09-29)
**Context.** CLAUDE.md and technical-plan §21.2 stop the cloud session after each §20 phase and at the M-001 gate for owner approval.
**Decision.** On 2026-09-29, in the Stage 7 cloud session, the owner waived these stops. The session completes M-001 (P1–P9, including TKT-30 = TASK-31) and then M-002 (TKT-22 spike, TKT-23 design addendum, TKT-24, TKT-25, TKT-26) without waiting. Every quality gate still runs: per-task TDD with a spec-compliance review and a code-quality review; per phase `pnpm typecheck && pnpm lint && pnpm test`, `pnpm eval` (from P3) and `pnpm test:e2e` (UI phases), plus an independent QA pass. Each gate report is written to `docs/exec/ledger.md`, and `build/stage7` is pushed after each phase. The TKT-23 addendum is recorded as a D# decision "approved under the owner's blanket waiver, pending owner review at Stage 8". M-003 (TKT-27–29) is out of scope: it needs an Oracle instance, a domain and provider keys, and it follows the Stage 10 gate. Owner review items HR1, HR2 and HR6 are prepared in `docs/exec/` without waiting for them. A fix loop that hits its cap writes a `BLOCKED` ledger row, and work moves to the next unblocked ticket. Unchanged: no threshold, weight, expected verdict or case class is lowered, `cfg-1` is not moved after baseline-v1, no Design Freeze item changes, `backlog/` is not edited, and no secret is printed.
**Rejected.** Stopping at each gate as CLAUDE.md prescribes, which the owner overrode for this session.

## EXE2 · TKT-01 toolchain adjustments for pnpm 12 and the cloud VM — accepted
**Context.** Implementing TKT-01 (TASK-2) in the claude.ai/code VM surfaced tool behaviour the plan did not anticipate.
**Decision.**
- **pnpm.** `packageManager` is `pnpm@12.6.0` (the corepack default). A `pnpm-workspace.yaml` lists `allowBuilds` for esbuild, sharp and unrs-resolver, set to `false`, because pnpm 12 refuses to install with unreviewed build scripts. All three ship prebuilt binaries.
- **Playwright.** `@playwright/test` 1.63.0 expects Chromium revision 1243; the VM ships 1194 at `/opt/pw-browsers`. `playwright.config.ts` uses `PW_CHROMIUM_PATH`, else `/opt/pw-browsers/chromium` when it exists outside CI, else Playwright's own browser. `playwright install` is never run in the VM; CI installs normally.
- **Playwright webServer.** Uses `next start` directly, because `pnpm start` under pnpm 12 outlives Playwright's teardown.
- **Env and logger are lazy.** They are parsed on first use, so `next build` succeeds without production secrets. The `window` guard stays eager.
- **`.gitleaks.toml`.** Uses a path-scoped `[allowlist]` (older-gitleaks syntax) instead of the plan's path+rule form.
- **Build-time injection.** `commit` in `/api/health` comes from `git rev-parse --short HEAD` at build.
**Rejected.** Downgrading `@playwright/test` to match the VM's Chromium, because the §0 pins stay.

## EXE3 · TKT-02 foundations: an in-process write queue, boundary status codes and a test-only route path — accepted
**Context.** The tracer bullet (TKT-02, TASK-3) fixed shapes that every later ticket builds on. Four points needed a choice the plan did not make.
**Decision.**
- **Writes go through `writeTx(db, fn)`** (`src/lib/db/client.ts`). This is an in-process FIFO queue in front of `BEGIN IMMEDIATE`. It exists because the `@libsql/client` 0.18 file driver busy-waits on the event loop when the lock is taken: with 20 concurrent `db.transaction()` calls, the holder could never finish and the calls failed with SQLITE_BUSY. Across processes, `BEGIN IMMEDIATE` and `busy_timeout` still serialise writers. A nested `writeTx` throws immediately rather than deadlocking. Reads may use `db` directly.
- **Boundary status codes:**
  - 400: `non_canonical`, `bad_schema`, `bad_form` (a malformed form with no payload is not anchored);
  - 401: `unknown_device`, `bad_signature`;
  - 403: `device_revoked`, `plot_not_assigned`;
  - 409: `media_hash_mismatch`, which also covers a signed size that differs from the upload.

  Base64url signatures must use canonical encoding, so each signature has exactly one accepted string.
- **Minimal idempotency.** A payload that was already stored gets its original answer and writes nothing, because `payload_hash` is UNIQUE. TKT-09 still owns EVAL-068 and decides whether a stored boundary *rejection* may be re-evaluated. Today a stored rejection is sticky: for example, a `bad_signature` rejection blocks a later genuine submission of the same payload.
- **Test-only route.** The test-only crypto page lives at `src/app/%5F_test__/crypto/`, which serves `/__test__/crypto`, because Next.js does not route folders that start with `_`. It returns 404 unless `E2E=1`. `E2E` is an env flag that is deliberately absent from `.env.example`.
- **Playwright port.** The e2e server port comes from `E2E_PORT` (default 3100), so parallel worktrees never reuse each other's server.
**Rejected.** Retry loops on SQLITE_BUSY, because they don't fix the event-loop starvation. A `public/` HTML page for the crypto vectors, because public files cannot be turned off by env.

## EXE4 · Eval harness v0 semantics — accepted
**Context.** TKT-03 (TASK-4) built `pnpm eval`. The spec left several scoring details open, and one plan sentence contradicts the dataset.
**Decision.**
- **When a case counts as not yet built.** A case is `not_yet_implemented`, and counts as failed, when a check it needs is missing from the registry. A legitimate case needs all twelve checks, because "Verified" asserts that every check stays quiet. A check that `--config=ledger-only` switches off does not count as missing. `not_yet_implemented` cases fire no CF, but they fail every gate they belong to. S2 counts a `not_yet_implemented` or `errored` legitimate case as a false positive, which is stricter than §4.1.
- **Stretch cases.** Scenario 6 cases (EVAL-055–057) run and are reported separately. They are never pooled into S1, but any CF they fire still blocks.
- **Extra gate row.** The gate table has an `S1-floor` row (≥ 90 % per scenario, EV5) and a CF row. Neither loosens an existing gate.
- **`client_clock` sign.** `capturedAt = serverReceivedAt + offset_from_server_min`, so a negative offset means the phone clock is behind. This matches the dataset's case titles (−4320 is "3 days behind"). technical-plan §22 TSK-03.4's "serverReceivedAt − offset" wording is superseded here; the gap magnitude is the same.
- **Chain mutations.** `correct` and `stale` count `seq_delta` from a device head of 12 entries; `genesis` counts from seq 1.
- **Geometry the plot cannot fit.** EVAL-013 asks for a point 40 m inside P02, but the 0.6 ha plot cannot hold it. The engine uses the deepest reachable point (37 m) and records a case note; the expected outcome is unchanged.
- **Oversized picking.** EVAL-049 needs one 3,000 kg picking under the placeholder U. That is above the 500 kg capture-boundary limit, and `verify()` does not re-check the limit. TKT-09 must not add a per-capture kg cap inside `verify()` without revisiting this case (owner visibility).
- **Baseline naming.** The baseline file is `evals/results/baseline-v0-ledger-only.json` (technical-plan §13 and TSK-03.7) and its report is `eval-report-baseline-v0.md`. tickets.md's `baseline-v0.json` refers to the same artifact. The baseline came from a real run at `7c93ac4` with seed 20260929. That commit is kept reachable by a merge commit, not a cherry-pick.
**Rejected.** Dropping or skipping cases whose checks are not built yet (CF-12). Editing EVAL-013/049 to fit the geometry or the boundary (CF-13).

## EXE5 · Auth under Next 16 and Better Auth 1.7: proxy, redirects, unanchored ownership refusals and a stricter guard rule — accepted
**Context.** Building sign-in with roles and organisation boundaries (TKT-04, TASK-5) meant adapting the plan to Next 16 and Better Auth 1.7.6. The build also needed a rule for captures from another agent's phone.
**Decision.**
- **Tooling names.** The Better Auth CLI is published as `auth@1.7.6`; `@better-auth/cli@1.7.6` does not exist. Next 16 replaces `middleware.ts` with `src/proxy.ts`, which only redirects unauthenticated navigation and is never the security boundary (§10).
- **Wrong-role page visits redirect.** A signed-in user who opens another role's page is redirected to their own home, as TC-018 and TSK-04.3 specify, not given `notFound()` as §10 suggests. Server Actions and route handlers still answer 401/403 JSON. Cross-org IDs return 404 (CF-10).
- **Better Auth writes are serialised.** They go through `writeTx` (`serialisedWrites`), so a sign-in during an open capture transaction cannot hit SQLITE_BUSY.
- **A capture from another agent's phone is refused, not anchored.** It gets 403 `device_not_owned`, checked after the signature verifies and before the idempotent replay, and nothing is written. Anchoring it would let an agent put rows into another org's device history and block the owner's upload through `payload_hash` uniqueness. Replaying would leak the owner's verdict. This narrows Solution-PRD §7 rule 2 / §3.1 ("boundary rejections are anchored") for authorisation refusals only. Signature and schema rejections are still anchored.
- **Stricter guard coverage (TC-018).** The guard's role must match its route group. Every page and layout in a group guards itself. Every `'use server'` file under `src/app` is scanned; `(public)/sign-in/actions.ts` is the only public action, and any future public action must be added to `PUBLIC_ACTIONS`. A guard inside `try` counts only if every catch rethrows or returns. Database helpers called before the guard are flagged, on a best-effort basis by import source. Because of this rule, the temporary tracer page is split into a guarded server page and a client component.
- **Sign-in errors and the seed.** Only credential refusals show "Email or password is not right". Other Better Auth failures show "Couldn't sign in right now. Try again." and are logged by status and code only; that string goes to the Stage 8 copy review. `SEED_PASSWORD` lives in `env.ts` but not in `.env.example`, which is pinned to the §17 names. Its demo default applies only when `NODE_ENV` is explicitly `development` or `test`.
- **Handed on.** Rate limiting the sign-in Server Action goes to TKT-19. Foreign keys from `devices.agent_id` and `harvest_events.agent_id` to `user` go to TKT-05.
**Rejected.** Anchoring `device_not_owned` (it creates a cross-agent blocking vector). Relying on the proxy or on layouts alone for authorisation.

## EXE6 · Location and time checks: dataset 0.3.0, a measured lone-flag miss and exifr outside the bundle — accepted
**Context.** TKT-08 (TASK-9) added the five location and time checks. EXIF parsing, the scenario-1 cases and three honest misses needed decisions.
**Decision.**
- **Dataset 0.3.0.** Scenario 1 now has at least 10 attack cases: EVAL-110–113 were appended in the reserved block, and `dataset_version` moved 0.2.0 → 0.3.0. No existing case changed.
- **Duration wording follows §6.5.** A 120-minute gap is "2 h", because "N min" applies only under 120 min. The TSK-08 bullet saying "120 min" contradicted §6.5.
- **Build details.**
  - exifr runs outside the Next bundle (`serverExternalPackages: ["exifr"]`), because bundling broke its fs loader.
  - The HEIC fixture is exifr's MIT-licensed `heic-single.heic`; its source and licence are in `evals/fixtures/photos/README.md`.
  - The fixture JPEGs are generated with sharp, so no new dependency was added.
- **A lone time flag is a measured miss.** EVAL-034, EVAL-055 and EVAL-056 each raise the correct `exif_time_agreement` flag, but the verdict stays Verified: under cfg-1 a lone flag other than deforestation or yield does not cap the verdict (EV7). The dataset's own note on EVAL-034 says the case "measures that". These are recorded as undetected, and cfg-1 is unchanged.
- **Owner item for the baseline-v1 decision (TKT-21).**
  1. Whether a lone time flag should cap the verdict.
  2. Whether `exif_time_agreement` should judge the worst photo rather than the latest, as `exif_gps_agreement` does. Today an old, unseen photo sent alongside one fresh photo passes the time check.

  Changing either needs a TP/EV decision and two new attack cases per affected scenario first (EV13, CF-13).
**Rejected.** Editing the expected verdicts or moving cfg-1 to make these cases pass.

## EXE7 · Enrolment and device-state rules (TKT-05) — accepted
**Context.** TKT-05 (TASK-6) built enrolment, revocation and plot assignment. The review then found key re-encoding and a race against the capture commit.
**Decision.**
- **Boundary order** is unknown key → signature → revoked → plot assignment → media. All of these run before the idempotent replay. Checking the signature before revocation means only a holder of the phone's key can learn, or record, that the phone is revoked or unassigned.
- **Revocation and assignment are re-checked inside the capture's write transaction.** If either changed during the request, the capture is anchored as rejected instead. This closes a race where a revoke landed during media storage.
- **Device JWKs are canonical.** A key must be exactly `{kty:'EC', crv:'P-256', x, y}` with 43-character base64url coordinates. The server re-exports it and uses that form for both the stored JWK and the thumbprint, so a revoked key cannot be re-enrolled under a different encoding.
- **Enrolment codes.**
  - Five attempts over the code's whole life, enforced on `enrollment_codes.attempts`, independent of the rate-limit window.
  - Issuing a new code retires the agent's older unused codes.
  - The per-IP limit uses the last X-Forwarded-For hop only; the reverse proxy must overwrite that header (TKT-27).
- **`device_enrolled` payload** is `{deviceId, agentId, thumbprint}` and carries no public key, so the proof feed does not check capture signatures. doc §1 lists capture signatures as out of scope. QA-P4-2 noted that TC-022's wording ("only the device ID and thumbprint") omits `agentId`; that's an owner item.
- **Deferred.**
  - To TKT-09: an accepted payload re-sent after revocation or un-assignment currently answers `rejected`.
  - To TKT-19: the foreign keys from `devices.agent_id` and `harvest_events.agent_id` to `user`.
**Rejected.** Checking revocation before the signature, which would let anyone probe device state.

## EXE8 · Plot geometry and anchoring (TKT-06) — accepted
**Context.** TKT-06 (TASK-7) built plot registration and editing. Downstream tickets need each plot's outline from the ledger, and the review found geometry the validator let through.
**Decision.**
- **Payloads carry the outline.** `plot_registered` and `plot_edited` payloads carry `polygon`; `plot_edited` also carries `producerId` and `crop`. The certificate, the EUDR export and proof feed §9 read each plot's outline from its latest plot entry. No farmer name or identifier is ever included (EV16). **TKT-07 and any later plot entry must keep `polygon`.**
- **Additional geometry refusals** (reasons, all tested):
  - `has_holes`: a MultiPolygon part nested inside another part. Before, its area was counted twice.
  - `degenerate`: a part under 1 m².
  - `out_of_region`: a vertex outside the India box `PLOT_REGION` (lat 6–37, lng 68–98), or a ring spanning more than 1°. This also catches swapped lat/lng and antimeridian rings.
  - `not_polygon`: nesting deeper than 32 levels.
  - `unsupported_kml`: any KML containing `<!DOCTYPE`, which blocks XXE and billion-laughs attacks.
- **Area** is spherical (`@turf/area`), about 0.39 % high at Kodagu, within TC-027's 0.5 %.
- **Tile keys.** `ARCGIS_API_KEY` and `MAPTILER_KEY` are visible to signed-in admins in tile URLs, which TP19 accepts. The owner must restrict each key by referrer, to basemaps only, with a usage cap.
- **Server Action body limit.** The Next 16 limit is global (3 MB), is documented in `next.config.ts`, and is revisited in TKT-19.
- **Admin rail.** Admin screens render `RailShell` per page, not in the layout, because `current` differs per page.

## EXE9 · Proof feed v1 hardening (TKT-15) — accepted
**Context.** The TKT-15 (TASK-16) review showed the verifier could accept unhashed data and that closure completeness was weaker than the doc claimed.
**Decision.**
- **Payload integrity.** `verifyFeed` hashes each payload as received. It rejects `__proto__`, `constructor` and `prototype` keys at any depth at the `format` step. Ledger payload authors must never use those keys.
- **Closure completeness.** Every `harvest_event` in the closure requires its `device_enrolled` and `plot_registered` entries. `batch_created.events[].payloadHash` must equal the capture hash. A custody transfer for another batch is ignored. doc §1 lists the omissions the verifier cannot detect.
- **Signed payloads** (`batch_created`, `custody_transfer`, `admin_override`) embed `kid`, `publicJwk` (exactly `{kty,crv,x,y}`) and `signature`. The statement is the payload minus those three members, and `kid` is the RFC 7638 thumbprint.
- **Test-step mapping for tampers.** A dropped entry fails at `closure-incomplete` and a swapped pair fails at `merkle-path`, following §8.3 and the doc. The TSK-18.5 plan text saying otherwise is superseded.
- **Ledger key.**
  - Created atomically (temp file, fsync, then `link`); the Oracle A1 filesystem must support hard links (TKT-27).
  - A checkpoint signed by a kid that is no longer published makes `/api/health` return 503 with `keyMismatch`.
  - An invalid environment reads as `config:"error"`, not a database fault (QA-P1-1).
- **`pnpm eval` never touches `./data`.** It isolates `DATA_DIR`/`LEDGER_KEY_PATH` in a temp directory.
- **Doc sufficiency.** Three rounds of review by a clean-room reviewer who read only the doc and vectors all concluded SUFFICIENT: YES (`scratchpad` report `TASK-16-doc-sufficiency.md`, summarised in the ledger).

## TP30 · The GitHub repo stays public — accepted (supersedes DISC16's private-repo clause)
**Context.** DISC16 chose a private proprietary repo. On 2026-09-29 `007U5H4R/udgam` was found to be public already (created 2026-09-28), and the owner confirmed it should stay public. A scan of all 113 commits on every branch found no secrets; the only key material is the test-only vectors in `evals/fixtures/crypto-vectors.json`, plus a planted canary string used by the secret-scan test.
**Decision.** The repo stays public. Consequences:
- Commit author emails, the vendored `.claude/workflow/` files (including the owner's personal global rules and vault path) and the full planning record (PRDs, grant strategy, cost model) are public.
- There is no LICENSE, so the code is visible but all rights are reserved. Choosing an open licence is a separate owner decision.
- Nothing about secrets changes: they come only from env or `.secrets/`; gitleaks runs in CI (TKT-01); the pre-commit habit of scanning stays.
**Rejected.** Switching back to private (the owner chose public).

## EXE10 · EXIF time gap over 24 h fails, judged by the worst photo — accepted (owner, 2026-09-29; amends TP4)
**Context.** At the P4 gate EVAL-034 (a photo taken 3 days before submission) was a measured miss: under TP4 an EXIF gap under 7 days was only a flag, and a lone flag does not stop Verified. The check also judged by the latest photo, so one old photo among fresh ones passed.
**Decision (owner).** Applied now, before baseline-v1:
- EXIF-to-capture gap, per photo, judged by the worst photo (largest gap), like `exif_gps_agreement`. The rule is:
  - up to 10 min → ok;
  - over 10 min, up to 24 h → flag;
  - over 24 h → fail;
  - flag when no photo has an EXIF time.
- Client-to-server gap unchanged: over 24 h → flag, over 7 days → fail, because an honest outbox retry can arrive days later.
- 24 h is chosen so a time-zone misread (up to about 14 h) never fails an honest farmer.
- cfg-1 `exifTime` splits into separate EXIF and client-server fail limits. This tightens the check before baseline-v1, so no threshold is weakened (CF-13).
- Dataset changes:
  - EVAL-034's expected `exif_time_agreement` status changes from flag to fail.
  - Two boundary cases are added: EVAL-122 (23 h → flag) and EVAL-123 (25 h → fail). They are the next IDs past TKT-09's reserved block, so TKT-20's block now starts at EVAL-124.
  - The dataset minor version is bumped.
- EVAL-055 and EVAL-056 stay reported scenario-6 stretch misses, with no further tuning.
- Updated to match: technical-plan §6.3 (rule table, config, evidence), TC-036, and the Solution-PRD check table.
**Rejected.** Keeping the 7-day EXIF fail (the P4 miss stands); failing at 10 min (time-zone misreads would reject honest farmers).

## EXE11 · Replayed rejected captures are re-checked, not frozen — accepted (owner, 2026-09-29; refines TP7 and TSK-09.6)
**Decision (owner).**
- **Accepted payload:** an identical one returns the same verdict as before (`idempotent:true`), with no new rows and no new anchor.
- **Rejected payload:** the boundary checks run again.
  - Same reason as the stored rejection → the original rejection is returned, with no new row and no new anchor.
  - Different reason → a normal new rejection.
  - Now passes (for example after re-enrolment or plot assignment) → processed as a new capture.
- `harvest_events.payload_hash` is unique for accepted rows only (partial unique index); the concurrent-race handling stays on that index.
**Guarantees any alternative design must keep:**
- no double-counted kg;
- no ledger spam from replays;
- an honest agent is never stuck behind an old rejection.

Each guarantee has a named test in TKT-09.
**Rejected.** Returning the original rejection forever (an honest agent stays stuck after the cause is fixed).

## EXE12 · Fixture satellite data cannot run in production and is labelled everywhere — accepted (owner, 2026-09-29; moved forward from TKT-27/28)
**Decision (owner).**
- `env.ts` refuses to start when `NODE_ENV=production` and `REMOTE_SENSING_PROVIDER=fixture`.
- Every evidence sentence derived from fixture remote-sensing data ends with "(demo data)". So no public certificate presents fixture results as real satellite evidence (CF-11).
- The only exception to the start refusal is `E2E=1`. Playwright runs `next build && next start` (production mode) with the fixture provider. `E2E=1` also exposes the test-only routes, so it is never set in a real deployment.
- `DEMO_MODE=1` is not an exception.
- Implemented in the TKT-07 fix round (TASK-8).
**Rejected.** Waiting for TKT-27/28 (fixture evidence could reach a public certificate before then); an exception for `DEMO_MODE` (a demo deployment is still public).

## EXE13 · device_enrolled keeps agentId, which is an opaque random ID — accepted (owner, 2026-09-29)
**Decision (owner).**
- `device_enrolled` keeps `agentId` alongside the device ID and thumbprint. In production it is Better Auth's random `user.id`.
- The demo seed hard-coded readable IDs (for example `USR-HOSAHALLI-AGENT`), which put an organisation name and role into anchored payloads, against EV16. Seeded user IDs become fixed opaque values: `USR-` plus 8 Crockford base32 characters.
- A test pins the payload's keys and checks that agentId carries no email, name or organisation name.
- TC-022's wording is updated to match the code.
**Rejected.** Dropping agentId from the payload (the owner kept it; it links an enrolment to the responsible account without personal data).

## EXE14 · Caddy overwrites X-Forwarded-For and the app trusts only that value — accepted (owner, 2026-09-29; added to TKT-27)
**Decision (owner).**
- In production, Caddy sets `X-Forwarded-For` to the real remote address, with `trusted_proxies` unset.
- The app trusts only that value (`src/lib/client-ip.ts`, last hop), and the app port is never published.
- TSK-27.3 gains a test showing that client-supplied `X-Forwarded-For` or `X-Real-IP` headers cannot dodge the per-IP sign-in and capture limits.
- Map-key restrictions, the live provider with re-recorded fixtures, and the Kannada native review stay owner items before production (docs/exec owner review file).

## EXE15 · Clean-room checker and harness scoping (TKT-18) — accepted
- **Milestone scoping.** The harness runs `--milestone=M1` by default. Out-of-scope cases (EVAL-103, M2) are built and reported separately and counted in the totals, but never pooled into that milestone's gates and never dropped (CF-12). `inMilestone` fails closed, and `DEFAULT_MILESTONE` moves to M2 at M-002.
- **Verification outcomes.** `docs/proof-feed.md` is authoritative: a dropped entry fails at `closure-incomplete`, and a reordered pair at `merkle-path`.
- **Harness and checker structure.**
  - The tamper generator moved to `src/lib/ledger/testing/tamper.ts`, and the proof suite moved to `evals/harness/suites/proof.ts`.
  - The checker CLI adds `--batch` and `--vectors` modes, so the suite uses one or two child processes.
  - S6-lib keeps its id and name but now requires both verifiers to agree.
- **Test budgets.** Vitest budgets are 20 s per unit test and 60 s for the integration hooks. The root cause was the cold Better Auth import cost under parallel load, not flakiness.

## EXE16 · Batches, custody transfer and the buyer list (TKT-14) — accepted
- **List routes.** They sit in `(list)` route groups, so another org's batch detail returns a real 404 rather than a streamed 200 (EVAL-080, TC-019).
- **Database invariants beyond §4.2:**
  - members belong to the batch's org;
  - membership is fixed once written;
  - a batch is inserted open and empty;
  - batch identity is immutable, and batches are never deleted;
  - aggregates equal the `batch_aggregates` view;
  - custody moves only from the holding org while the batch is open, and `custody_transfers` is append-only;
  - a new verification run on a batched event aborts, because its verdict is frozen in `batch_created`. TKT-12's re-run and override screens must explain this.
- **Extra columns:** `batches.created_at` and `custody_transfers.admin_id` (FK to user). With `admin_id`, a transfer's signature verifies from the row alone.
- **Display values.** The plot label is the plot id, because plots have no name column. `integrityScore` is each member's latest run.

## EXE17 · Capture boundary hardening, CSP and sign-in limits (TKT-19, fix rounds 1–2) — accepted
- **Anchoring and refusals.**
  - A refusal is anchored only for a canonical, schema-valid payload whose signature verifies, or whose key is unknown (EVAL-051/053). Unsigned or garbled bodies are only logged.
  - New refusal reasons: `media_count` (400), `media_too_large` (413), `media_type` (415), `length_required` (411), `body_too_large` (413) and `rate_limited` (429).
  - AVIF is refused. The signed mime must equal the sniffed type, read from up to 4 KB of the ftyp box; box sizes 0 and 1 are refused.
- **CSP and routing.**
  - The CSP uses a per-request nonce plus `'strict-dynamic'`, with `object-src 'none'`. `style-src 'self' 'unsafe-inline'` stays, because Next renders style attributes that no nonce can cover.
  - Every page renders dynamically. The proxy lives in `src/proxy.ts` (Next 16) and excludes `/api`, so capture bodies are not buffered.
  - The map-tile host is allowed on every `/admin*` page. A successful sign-in ends in a full document load; the `AdminDocument` guard reloads any admin page reached by client navigation from a non-admin document.
- **Auth and sign-in limits.**
  - `/api/auth` answers only GET get-session and POST sign-out; everything else is 404.
  - Limits are 10 per (email, address), 50 per email and 30 per address in 15 minutes. Each attempt is reserved atomically and refunded unless the password was wrong.
  - Trade-off: an attacker can lock one email out for 15 minutes.
  - IPv6 is keyed by /64, and an IPv4-mapped address by its IPv4 address.
- **Capture slots.**
  - At most 4 captures in flight overall and 2 per agent. The per-IP and per-agent checks run before a slot is taken, and a busy 503 counts against the IP budget.
  - The body has a 60 s read deadline; exceeding it gives a retryable 408 line, so the phone keeps its copy.
  - Phone buckets are keyed per (agent, device).
- **Foreign keys by trigger.** Agent foreign keys (`devices`, `harvest_events` → `user`) are enforced by triggers, because a drizzle table rebuild fails on dependent triggers. Migration 0016 refuses REPLACE of a referenced user, with FK semantics.
- **SQLITE_BUSY root cause.** `next start` loaded the DB module twice. The handle and write queue are now shared per process via `globalThis`.
- **Recorded for Stage 10:** two agents behind one address can hold all 4 slots; a 503 spends a shared address's budget; the body is read into memory (about 3× per slot); per-instance state (throttles, slots, dev secret) assumes one app instance.

## EXE18 · Satellite checks, caching and honest failure (TKT-07, fix round 1) — accepted
- **Geometry and fixtures.** `PlotGeom` keeps `polygon` (not `geometry`) and adds `geometryHash`. Fixture mode matches plots by geometry hash; the fallback profile is limited by EXE12.
- **Timeouts and provider versions.**
  - Per-call 8 s timeouts use a timer and AbortController and honour the caller's signal. The 10 s remote cap uses the provider's own unavailable sentence.
  - The GFW dataset version defaults to cfg-1's pinned `v1.13`, and the resolved version is recorded.
- **Unavailable results.** Cloud-blocked windows and histories with fewer than 6 clear months are `unavailable` with no provider named, and are never cached. So TKT-12's re-run must retry every unavailable remote check by kind, not only those naming a provider.
- **Registration anchor.** It is a `plot_edited` entry that carries the full current geometry (including `polygon`) plus `registrationChecksHash`. "Check again" anchors only when the result changed.
- **Cache behaviour.**
  - The harvest-window centre is the IST date of the server receipt time.
  - Cache writes run in the background through `writeTx`, and failures are logged.
  - A corrupt cache row is treated as a miss.
- **Evidence and hard fails.**
  - Rounding in evidence never shows a value on the wrong side of its threshold.
  - Any finite loss of 10 % or more is a hard fail, above 100 % included; NaN, infinite or negative values are `unavailable`.

## EXE19 · Organic certificate attestation (TKT-13 and follow-up) — accepted
- **Upload route.** The upload is a route handler, not a Server Action, because the action body cap is global. The proxy matcher excludes only `admin/plots/<id>/attestation`.
- **Issuer validation.** Issuer text refuses:
  - control characters and Unicode format characters (bidi and zero-width);
  - the banned wording (case-insensitive, after NFKC);
  - over-long values.

  It renders inside `<bdi>`.
- **Validity dates.** They must fall between 2000-01-01 and today (IST) plus 10 years.
- **Database guards.** `attestations` also has `attestations_no_update`, and its payload carries `attestationId`.
- **Requests without CSRF headers.** A POST with neither `Sec-Fetch-Site` nor `Origin` is accepted: it is a non-browser client, and the session cookie is `SameSite=lax`.

## EXE20 · Yield, chain and replay under the write lock (TKT-09, fix round 1) — accepted (the X-Y-X rule is pending owner acknowledgement)
- **Replay (EXE11).** A rejected payload is also unique per (payload_hash, boundary_reason). So a payload refused for X, then Y, then X again gets the original X refusal back, keeping all three guarantees; **the owner is asked to acknowledge this narrowing**. The plan's `findPriorOutcome` became `findAcceptedOutcome` plus `findRejection`.
- **Boundary order:** signature → device ownership → replay of an accepted payload → revocation → plot assignment → media. A replay of an accepted payload keeps its verdict after a later revocation or un-assignment.
- **Under-lock re-check.**
  - Inside the write transaction the capture re-reads everything a concurrent capture can change: season kg, chain head, the agent's accepted count, seen photos and the previous capture. It then re-runs `yield_plausibility`, `chain_continuity`, `photo_uniqueness` and `movement_plausibility` and re-scores.
  - Adding movement was directed by the orchestrator beyond the fix brief.
- **Yield reference.** It is seeded at boot. `VerifyContext.yieldReference` may be null, giving an `unavailable` yield check.
- **Harness and tests.**
  - The harness gains `reuse_media.which` (1–3) and `input.context.crop`.
  - A client `x-request-id` is accepted only if it matches `^[A-Za-z0-9._-]{1,64}$`.
  - `pnpm test:tz` runs the unit suite under Los Angeles and Kolkata; CI does not run it yet.
- **Owner items:** EVAL-049 is unreachable as one picking; the GAP-7 wording needs HR2.

## EXE21 · How Stage 7 merges parallel work — accepted
- **Who merges.** Implementers commit on their own worktree branches, and the orchestrator merges them into `build/stage7` after running the gates. The owner approved this route on 2026-09-29, after the permission check blocked subagent merges.
- **Migrations.** Parallel migrations are renumbered at merge by regenerating with drizzle-kit, with custom SQL re-added unchanged; meta files are never hand-edited.
- **Fixes after a merge.**
  - Semantic merge breaks, such as type changes across branches or e2e expectations, are fixed by the orchestrator in the merge or in a separate commit, and named in the message.
  - Fix rounds start fresh implementers at the current head instead of resuming old worktrees.
- **Reviews.** Reviewers work read-only in their own `git clone --shared` copies at a pinned SHA.
- **Container restarts.** After a restart, interrupted agents resume from their transcripts, and their uncommitted work is reviewed before it is committed.

## D9 · M-002 screens addendum — accepted (approved under the owner's blanket waiver, pending owner review at Stage 8)
**Context.** The M-002 screens for contract farming (F17) and the processor hop (F18) are not in the frozen design. TKT-23 (TASK-24) is a short Stage 4 re-entry to add them before TSK-25.8 and TSK-26.5 build them. This entry was accepted under the owner's blanket Stage 7 waiver (EXE1). The owner has not yet reviewed the addendum; that review happens at Stage 8.
**Decision.**
- **Screens.** Design.md §28 and `.design/exploration/final/contract.html` define seven screens in the frozen visual language, each in loading, empty, error, working and data states:
  1. the buyer's agreement list;
  2. a new agreement (crop, agreed kg, minimum grade, amount in mock INR, deadline);
  3. fund, with a refund after the deadline;
  4. grade a delivered batch;
  5. the FPO admin's agreement detail, whose settlement panel shows each of the three conditions as value vs threshold;
  6. the processor's record-a-step and hand-on screen;
  7. the processing step in the certificate journey.
- **Settlement outcome.** *Payment released* uses `--ok`. *Not released* uses `--check` and names every condition that was not met. No accusation words are used.
- **Components.** The mockup reuses `final/admin.html`'s `:root` tokens, CSS and icons verbatim, and `final/verify.html`'s journey component verbatim. It adds no new colour, radius, type size, motion or icon (TP17). No frozen M-001 item changes.
- **Processor entry point.** A new `/processor` surface with its own `processor` role, using the admin rail component with one item (hidden on phones). A scoped admin view is not used.
- **Grade scale.** The buyer picks one of five labels, each mapped to a 0–100 number: Excellent 90 · Very good 80 · Good 70 · Fair 60 · Low 40. The agreement minimum uses the same labels. The app signs the number, the contract stores it as a `uint8`, and the server refuses any other value.
- **IA.**
  - The buyer surface gains the rail with Batches and Agreements.
  - The admin reaches `/admin/agreements` under Batches; the four-item rail is unchanged.
  - The admin Transfer custody list adds processor organisations.
  - The public certificate shows the processing step but no agreement or payment.
- EVAL-105's expected behaviour now names these screens (dataset 0.6.1, wording only).
**Rejected.**
- A scoped admin view for processors: every admin guard and query would need an org-type filter, one miss would expose FPO data, and the frozen four-item rail would have to change.
- Processing inside the buyer surface: a buyer must not record processing.
- Free numeric grade entry: inconsistent and falsely precise.
- SCA cupping scores: they need roasted samples at delivery.
- Letter grades: confused with Indian bean-size grades such as "Plantation A".
- A fifth admin rail item for agreements: it changes the frozen IA.
- Showing agreement terms or payments on the public certificate: commercial terms are private.

## EXE22 · Owner waiver: go straight from Stage 7 into Stage 8 — accepted (owner, 2026-10-05)
**Context.** CLAUDE.md requires a human gate after every stage. The owner also asked for speed ("Time matters").
**Decision (owner).** "Once stage 7 is done, directly move to stage 8." When Stage 7 is complete, the session:
- writes the final Stage 7 report;
- prepares HR1, HR2 and HR6 in docs/exec/;
- rewrites HANDOFF.md;
- pushes, then starts Stage 8 (Design Critique, skill bw-design-critique) without waiting for approval.

The owner's open review items stay listed for the owner and are not treated as approved. These are the M-001 owner decisions (docs/exec/m-001-gate.md OD-1 to OD-8), D9/D10, which are pending owner review at Stage 8, and the Kannada native review.
**Rejected.** Stopping at the Stage 7 gate (the owner asked not to).

## D10 · M-002 addendum revision after review — accepted (approved under the owner's blanket waiver, pending owner review at Stage 8)
**Context.** The spec and quality reviews of TASK-24 (TKT-23) both failed the addendum recorded in D9. Two findings were major. First, D9 gave the buyer surface a two-item rail (a floating tab bar on phones), which changes the frozen buyer IA in Design.md §5, while §28 said no frozen item changed. Second, the forms had no field-level validation state (WCAG 2.2 SC 3.3.1 and 3.3.3). The reviews also found that refund, settle, record step and hand on lacked error or working states; that "Ready to settle" used the amber Needs-a-check mark; that input formats were underspecified; that the touch points outside TKT-25's and TKT-26's owned files had no owner; and that EVAL-105 left out three routes. This entry was accepted under the owner's blanket Stage 7 waiver (EXE1). The owner has not yet reviewed it; that review happens at Stage 8. D9 stays as recorded; this entry supersedes the parts named below.
**Decision.**
- **Buyer IA.** The buyer has no rail and no tab bar, as frozen in §5. Agreements is reached from a ghost pill link, "Agreements with FPOs", in the buyer Batches header, just as admin reaches its agreements. The Agreements header links back to Batches. This supersedes D9's "The buyer surface gains the rail with Batches and Agreements".
- **Touch points on existing M-001 screens.** Design.md §28 now lists all four, each a content-level addition with no frozen visual or IA change:
  - T1, the buyer Batches header link;
  - T2, the admin Batches header link "Agreements with buyers";
  - T3, the admin batch detail's Agreement card and link;
  - T4, processors in the Transfer custody recipients, with the label "Hand to".
  This supersedes D9's "No frozen M-001 item changes". §28.10 asks the owner to confirm at Stage 8 that none of them counts as a freeze change.
- **Ownership (§28.9).** T1, T2, T3 and `/admin/agreements/page.tsx` go to TKT-25 (TSK-25.8). T4, the processor's sign-in home and the certificate journey item go to TKT-26. Three files are shared by the two parallel tickets and are resolved at merge (EXE21): the admin batch detail page, the i18n files and the guard-coverage test.
- **Field checks.**
  - Every input has a designed invalid state: agreed kg, minimum grade, amount, deadline, quality grade, process, and input and output kg. Each uses `aria-invalid`, a message under the field linked by `aria-describedby`, and focus on the first such field. The value is kept.
  - The plain, blame-free copy is in §28.7.
  - Output above input is accepted and flagged as a gain in weight (EVAL-102), never refused.
- **Action states.**
  - Create, fund, take the money back, grade, settle, record step and hand on each have a working state and an action-error state. The refund variant honours every state.
  - A settle that does not go through keeps the neutral *Ready to settle* chip. It is never shown as *Not released*.
- **Status marks.** The list rows and the detail chip for *Ready to settle*, and for *Delivered · needs your grade* / *Needs your grade*, use the neutral `mk-na` mark. `mk-check` is kept for Not met, Not released and Flagged, and the full mapping is in §28.7.
- **Input formats.**
  - The amount field shows exactly what was typed, with no live grouping. Commas and paise are optional, and the hint reads the amount back as "₹1,50,000.00". The server stores paise.
  - The deadline uses the native date picker for entry, and every display, including the hint, writes it as "31 Dec 2026", meaning the end of that day in IST.
- **Processor name.** "Processor C-03" is used everywhere.
- **EVAL-105.** It now also names the refund variant, `/admin/agreements` and `/processor/batches/[batchId]`. This is dataset 0.6.2, wording only; the gates, class and failure conditions are unchanged.
**Rejected.**
- Keeping the buyer rail and asking the owner to approve it as an IA extension: a header link meets the need without touching a frozen item, and admin already does the same.
- A fifth admin rail item: the reason is unchanged from D9.
- Live Indian digit grouping inside the amount field: the caret jumps, and many decimal keypads have no comma key.
- A custom text date field in "31 Dec 2026" form: it is harder to enter on a phone than the native picker and needs its own parsing.
- The amber Needs-a-check mark for statuses that wait on someone: in the frozen system that mark means something is not as agreed.
- An error summary box above the forms: no form has more than six fields, and focus moves to the first field that needs a change.

## EXE23 · Owner decisions OD-1, 2, 3, 4, 6 and 9 before baseline-v1 — accepted (owner, 2026-10-05)
**Decision (owner),** answering docs/exec/m-001-gate.md:
- **OD-1 → b.** EVAL-122 (a 23 h EXIF gap) tests the check status `flag` and accepts Verified, since a lone flag stays Verified under EV7. My EXE10 brief had copied EVAL-034's verdict expectation by mistake.
- **OD-2 → yes.** EVAL-116's expected evidence substring changes from "fail over 7 days" to "fail over 24 h" (EXE10). The verdict is unchanged.
- **OD-3 → b.** The harness can submit EVAL-049 as several pickings, so the season total reaches 0.30×U without any single picking exceeding the 500 kg capture limit. The case's expected verdict and class are unchanged.
- **OD-4 → acknowledged.** Replay X, Y, X returns the original X refusal (EXE20).
- **OD-6 → a.** The TC-073 brief deviation is accepted. Three doc-only sufficiency reviews (YES) and the import-isolation test stand in for a doc-only rebuild.
- **OD-9 → a.** `DEFAULT_MILESTONE` stays M1 with the hashchain ledger. M-002 runs via `--ledger=evm --milestone=M2` in contracts.yml.

**Still open:** OD-5 (D5's "when" line on Needs a check) and OD-8 (the certificate size budget and S4 host).

**Rejected.** Changing any threshold, weight or cfg-1 value: none of these decisions touches them (CF-13).

## EXE24 · OD-5 and OD-8, decided by the orchestrator on the owner's behalf — accepted (owner delegated, 2026-10-05)
**Context.** The owner said: "for remaining decisions take decision on my behalf". These choices are recorded as delegated; the owner may revisit them at Stage 8.

**OD-5: the "when" on Needs a check (amends D5).** Needs a check names who checks (the FPO office) and where the answer will appear (Pickings), and says nothing is needed from the farmer. It promises no time.
- The farmer copy is: "The office will look at this. You'll see the answer in Pickings. You don't need to do anything." This is implemented in the follow-up task, with Kannada marked for native review.
- A per-FPO response time can be added later, once an FPO commits to one: an org-level setting shown only when set.
- **Rejected:** "Usually within 1 working day". No FPO has committed to it, and an unkept promise to farmers erodes trust (DISC/Design.md trust principles).

**OD-8: the certificate size budget (amends technical-plan §18).** A combined HTML+JS ≤ 150 KB gzip can't be met on Next 16, because the framework alone is about 141 KB. The budget is restated:
- the certificate's own client JS above the framework baseline is ≤ 60 KB gzip (it measures about 25 KB);
- the /verify HTML for a 50-event batch is ≤ 120 KB gzip (it measures about 104 KB);
- verifying 50 entries takes ≤ 300 ms at 4× throttle (unchanged);
- S4 < 3 s (EV10) is unchanged and is measured formally in TKT-21 on a quiet host, with server response time reported separately.

The feed embed contract (technical-plan §8.4, docs/proof-feed.md) is unchanged. Removing the RSC duplicate of the feed is a later optimisation.
- **Rejected:** keeping the unmeetable 150 KB, which would be a permanent recorded miss; and fetching the feed in a second round trip, which breaks §18 and S4.

S4's threshold and every cfg-1 value are unchanged (CF-13).

## EXE25 · A staged photo that fails its re-hash is treated as missing — accepted (orchestrator, under the owner's delegation, 2026-10-05; amends TC-094(b))
**Context.** TKT-30's quality review found the following. The phone only names staged hashes that the server confirmed, so a staged file whose bytes no longer match at capture can only have changed on the server. TC-094(b) anchored this as the device's `media_hash_mismatch` rejection, and the phone then dropped a correct outbox copy. That contradicts TP28: the farmer never loses a photo.
**Decision.** At capture, a re-hash mismatch on a staged file answers 409 `media_not_staged`, with nothing anchored and the file discarded. The phone resends the bytes inline, which are then verified normally. A mismatch on bytes the phone itself sent is still an anchored `media_hash_mismatch`.
**Rejected.** Anchoring the server-side mismatch as the agent's refusal, which blames the agent and loses the photo.

## EXE26 · A multi-part plot under 4 ha exports one point per part — accepted (orchestrator, under the owner's delegation, 2026-10-05; extends TP24)
**Context.** TKT-17's fix re-review (A9) found that a plot registered as several parts (a MultiPolygon) and under 4 ha in total exported as ONE Point, placed on one of its parts. EUDR requires every plot of land to be geolocated. If the parts are separate parcels, the other parcels had no location in the DDS file, and a buyer's due diligence would be incomplete. The owner said: "Decide on my behalf".
**Decision.** Under 4 ha, a multi-part plot exports as a `MultiPoint` with one interior point per part (the same `interiorPoint` rule as a single Point), in part order, with the plot's `Area` (two decimals) unchanged. Both rules below stand as exported:
- a single-part plot under 4 ha stays a `Point`;
- a plot of 4 ha or more stays a `Polygon`/`MultiPolygon` (outer rings, RFC 7946 orientation).

The EU file description accepts Point, MultiPoint, Polygon and MultiPolygon. docs/eudr-geojson.md and the export schema are updated to match, with tests that use fixed literals. This is implemented in the follow-up task (item 16).

Also recorded from TKT-17's fix round, both accepted by the re-reviewer:
- a plot of 4 ha or more in several parts exports as `MultiPolygon` (it extends TP24's "Polygon");
- a ring of a plot of 4 ha or more that collapses under 6-dp rounding makes the export answer 503 rather than silently downgrading to a Point. Registration cannot produce that state.

**Rejected:**
- Keeping one Point: it leaves separate parcels unlocated.
- Exporting the full MultiPolygon under 4 ha: allowed, but it is more than the Regulation asks for under 4 ha, and it diverges from the single-part Point rule.
- Splitting the parts into separate Features: one plot keeps one Feature and one ProducerName row.

No threshold, eval case or cfg-1 value changes (CF-13).

## EXE27 · EVAL-122 stays a reported miss — accepted (owner, 2026-10-05; supersedes EXE23's OD-1 → b)
**Context.** OD-1 → b (EXE23) asked EVAL-122, a 23 h EXIF gap that is a lone flag and so Verified under EV7, to accept Verified. Applying it showed that `evals/eval-dataset.schema.json` forbids an attack-class case from accepting Verified. It would have needed either a class change or a relaxed schema, and either one raises S1 through a dataset edit alone (EVAL-122 is S1's only miss, 42/43).
**Decision (owner).** EVAL-122 is unchanged and stays a reported miss. S1 stays 97.7 % (42/43), which passes the ≥ 95 % target. EVAL-116 and EVAL-049 were applied as EXE23 says (dataset 0.7.0).
**Rejected.** Reclassifying EVAL-122 as a non-attack flag test (S1 42/42), and relaxing the schema so that an attack case may accept Verified (S1 43/43 by counting a Verified as a detection).
**Noted.** EVAL-049 now runs as six pickings of 500 kg on P01. In the live system, rejected pickings don't count toward the season total (TP6). Picking 5 already reaches 2.05× U, so the last picking would see 2.05× U, not the harness's 2.10× U. The verdict (Rejected, yield_plausibility) is the same. `split_kg_max` is still to be documented in evaluation-plan §7.3 and TSK-03.4 (owner docs).

## EXE28 · District outlines, organisation names and the split-pickings docs — accepted (orchestrator, under the owner's delegation, 2026-10-05)
**Context.** The owner said "take decisions on behalf of me" for the open items after TKT-16's fix round.
**Decisions.**
- **District outlines.** The MVP keeps the conservative hand-drawn outlines for Kodagu, Chikkamagaluru, Hassan and Dakshina Kannada in `src/lib/certificate/district.ts`, labelled as such in the file. A point outside every outline reads "Karnataka", so the certificate never names a wrong district. Swapping in an official licensed boundary set (e.g. DataMeet, CC BY 2.5 IN) is a **pre-pilot human item**: the cloud sandbox can't download it. It is listed in HANDOFF.
- **Organisation names on the certificate.** The journey keeps showing organisation IDs (`ORG-…`), and the public proof feed contract is unchanged. Names can be added later as an additive, signed feed field, once each FPO and buyer agrees to be named publicly.
- **`split_kg_max`.** The harness option added for EVAL-049 (EXE23/EXE27) is now documented in evaluation-plan §7.3 and technical-plan TSK-03.4.

**Rejected:**
- Shipping coarse bounding boxes: they named wrong districts.
- Adding organisation names to the feed now: it changes the proof contract and publishes counterparties without their consent.

## EXE29 · Open M-002 owner items, decided by the orchestrator on the owner's behalf — accepted (owner delegated, 2026-10-05)
**Context.** The owner said "sure go ahead and take decision on my behalf". These choices are recorded as delegated, and the owner may revisit them at Stage 8.
**Decisions.**
- **The buyer's grade on the public certificate (TKT-25).** It stays public. The grade is an observed quality result about the batch, which is what a certificate reader wants. The agreed kg, the minimum grade, the price and the deadline stay private, and the anchored settlement carries only condition codes and observed values (TKT-25 fix round 1).
- **Terms readable from contract storage (TKT-25).** This is accepted for the MVP. The chain is a local Anvil chain with mock INR, never a public network. Before any public-chain deployment, the contract must store only a terms hash; this is a **pre-public-chain item** in HANDOFF.
- **Placeholder pulping (35–50 %) and drying (40–60 %) bands (TKT-26).** They stay as versioned config, labelled "placeholder range, to be confirmed" on the screens and the certificate. Confirming them from Coffee Board/CCRI or FPO records is a **pre-pilot human item**. The hulling bands are cited.
- **Stale-screen copy (TKT-25).** "This agreement changed. Nothing moved. Reload to see its current state." is accepted. It is English, with a Kannada draft for native review.
- **Settlement reasons as condition codes (TKT-25 fix round 1).** This change to the payload contract is accepted. docs/proof-feed.md §9.1 is updated, and no EVAL or vector pinned the old text.
- **Migration runner (TKT-26 quality review).** The `user` rebuild in 0029 is safe only with foreign keys off. `technical-plan.md` §6 and TSK-27.x now say the container entrypoint runs the app's runner (`pnpm db:migrate`), never `drizzle-kit migrate`. A guard test is queued in follow-up 2.
- **TKT-26's candidate deviations a–m** (reports/TASK-27-impl.md) are accepted as reviewed: the quality review passed; the spec review's verdict is recorded in the ledger.

**Rejected:**
- Hiding the grade: it removes the certificate's quality evidence.
- Changing the contract now to hash the stored terms: it re-opens a reviewed ticket for a chain that isn't public in the MVP.
- Inventing pulping and drying figures.

## EXE30 · TKT-25 contract-farming deviations — accepted (orchestrator under the owner's waiver and delegation, 2026-10-05; reviews PASS after fix round 1)
- The schema is in its own commit (TSK-25.4 split) under the parallel-merge rule.
- A new `agreement_refunded` ledger kind: a refund needs its own signed anchor.
- Agreement entries (`agreement_created`/`_funded`/`_refunded`) stay out of the public batch closure. Only `quality_attestation` and `settlement` are in it, and those carry condition codes and observed values only, never the agreed kg, the minimum grade, the price or the deadline (Design §28.4, D9; this supersedes technical-plan §8.3 on this point). The contract's creation event emits a terms hash.
- Settle reverts after the deadline; after the deadline only a refund works. `fund` also reverts after the deadline.
- The ERC-20 and EIP-712 checks are hand-written (forge runs offline; no OpenZeppelin). They check low-s, v, length and the zero address, and are tested.
- One server-held key per buyer org serves as both its wallet and its grade attestor (TSK-25.5).
- Each batch releases at most one escrow: the contract's `batchReleased` mapping, a partial unique index (migration 0031) and a stricter grade trigger (0032).
- A settlement left half-done after a chain payout is recovered from the `Settled` event and recorded once.
- `agreements.*` has Kannada drafts awaiting native review. There is no batch picker (Design §28.10 item 4); settle takes the first graded, unsettled batch.
- The migrations were renumbered at merge to 0026/0027 and 0031/0032, regenerated with the custom SQL unchanged.

## EXE31 · TKT-26 processor-hop deviations — accepted (orchestrator under the owner's waiver and delegation, 2026-10-05; spec and quality reviews PASS)
- The schema needs two custom migrations around one generated one. 0028 drops the 0009 triggers that name `user`. 0029 rebuilds `user` for the `processor` role and adds `processing_steps`. 0030 recreates the 0009 and 0016 triggers verbatim and adds the custody and step guards. The merge renumbered them from 0026–0028. The rebuild is safe only under the app's migration runner (EXE29).
- TSK-26.3 is split into a schema-only commit and the plan's commit.
- The step is rendered through the verify page's journey steps, with an optional `flag` on the shared Timeline (the plan's `journey.tsx` does not exist). The FPO→processor hop folds into the step, as in the mockup. evaluation-plan §4.6's closure list is updated for M-002 here.
- Custody rules replace the 0007/0008 triggers. The first hop goes from the FPO to a buyer or a processor. A second hop goes only from a processor to a buyer, and a buyer's batch is locked.
- One step per batch per processor. "Hand on only after a step" is enforced in the library; a database trigger for it is queued in follow-up 2.
- The signed `processing_step` carries the processor's display name. The hand-on keeps the `custody_transfer` shape, and both verifiers treat `processing_step` as signed.
- The ratio is rounded to one decimal and the band edges are inclusive. Deterministic tenths arithmetic is queued in follow-up 2.
- The process radios have no `aria-invalid` (a11y lint); the message is linked from the fieldset. No process is preselected.
- The processor screens reuse `admin.css`, with a `processor.css` copied from the mockup. The rail gains optional props.
- The batch detail page has no `loading.tsx`, so an unknown batch returns a real 404.
- The demo seed adds `ORG-PROC-C03` "Processor C-03".
- T4: the transfer label is "Hand to", with Buyers and Processors groups.
- An output above input is accepted and flagged, as the spec says (the brief's "never more than input" was a wording slip).

**Open, with follow-up queued:** if the step is missing, a hand-on to a processor can show publicly as "Handed to buyer". The certificate should label the recipient by its org type, which the feed carries, and verifiers don't detect step omission. Recorded for the owner.

## EXE32 · A lone processor hop with no step is a known certificate gap — accepted (orchestrator, under the owner's delegation, 2026-10-05)
**Context.** Follow-up 2 now labels a hop "Handed to a processor" with the flag "No processing step recorded" whenever the recipient later hands the batch on. The signed `custody_transfer` payload carries no organisation type, so one case remains: a batch with a single FPO→processor hop, no later hop, and no step in the feed. It still reads "Handed to buyer". This happens either because the step isn't recorded yet, or because a server leaves it out.
**Decision.** The gap is accepted for the MVP and documented in docs/proof-feed.md's limitations and in HANDOFF. The fix is a **later ticket** (before any processor pilot): add a signed `toOrgType` (`buyer`|`processor`) to new `custody_transfer` payloads (an additive field; old entries keep verifying), and have both verifiers label a hop from it.
**Rejected:**
- Changing the custody payload contract inside a review follow-up.
- Treating every unfollowed hop as incomplete: that would flag every legitimate buyer hop.

## EXE33 · The demo page never runs in production; the M3 rehearsal uses a staging copy — accepted (orchestrator, under the owner's delegation, 2026-10-05; narrows TP27)
**Context.** TKT-20's `/admin/demo` turns on only with `DEMO_MODE=1` and either `E2E=1` or a non-production server. E2E=1 must never be set in a deployment (EXE12), so the page can never run in a production deployment. TP27 allowed the flag "for rehearsals (EVAL-072)".
**Decision.** The narrowing is kept. A page that submits as another user stays out of production entirely. The M-003 live rehearsal (EVAL-072, TKT-29) runs on a separate staging deployment of the same image with its own DATA_DIR and `DEMO_MODE=1 E2E=1`, never on the production data. TKT-29's brief must say so (HANDOFF).
**Also accepted** (TKT-20 reviews and fix round 1):
- **`media.source`:** written only by the seed, outside the capture transaction; the capture path takes no source from callers. Migration 0035.
- **Demo-only plot Y01:** the yield attack uses a 12th plot.
- **The seed's clock:** the timeline runs on an injected clock, and the seed refuses in the first 10 minutes of a coffee season.
- **Organisation scope:** `/admin/demo` is limited to the admin's own organisation.
- **Shared enrolment write:** the seed helpers share enrolment's own `device_enrolled` write.
- **Test files:** the demo specs are excluded from `pnpm test:e2e` by a file-name pattern.
- **HR3:** TP29 replaces the plan's "BLOCKED: HR3 pending" step; the gate report prints the readiness warning.

## EXE34 · One strict rule authorises a verification-config change after baseline-v1 — accepted (orchestrator, under the owner's delegation, 2026-10-05; tightens EV13/CF-13)
**Context.** The TKT-21 Phase A review found two config-change rules. The harness's CF-13 check accepted any line of decisions.md that names the new hash, so even a "Rejected: … <hash>" line authorised the change permanently, decisions.md being append-only. The stricter rule in `tests/config-freeze.test.ts` never ran in the release.
**Decision.** One shared function decides. A new config hash is authorised only by a row in `evals/config-changes.md` that names the hash, an existing TP/EV decision ID, and ≥ 2 new attack-case IDs per affected scenario already in the dataset (EV13). A mention in decisions.md alone authorises nothing. This only tightens the rule; it touches TKT-03's harness minimally, and behaves the same until baseline-v1 exists.
**Also decided.** `eval:release` fails closed: every input must come from HEAD on a clean tree (except the formal output files), each gate is recomputed rather than trusted, and suite failures fail the release. Phase B follows the runbook in docs/exec/m-001-formal-run.md.
**Rejected.** Keeping two rules.

## EXE35 · The demo seed needs an explicit development or test environment — accepted (orchestrator, under the owner's delegation, 2026-10-05; narrows EXE12 and amends the TSK-20.2 verify step)
**Context.** TKT-20's quality review found that `pnpm seed --reset` on a production host with NODE_ENV unset would wipe the database and ledger.
**Decision.** The seed runs only when the raw `NODE_ENV` is exactly `development` or `test`, or `E2E=1`. A bare `pnpm seed` is refused, so the documented command is `NODE_ENV=development pnpm seed [--reset]`. `--reset` refuses unless DATABASE_URL is `DATA_DIR/udgam.db`, and refuses before any write or delete.
**Rejected.** Defaulting an unset NODE_ENV to development for the seed.

## EXE36 · Formal-release residuals after the TKT-21 re-review — accepted (orchestrator, under the owner's delegation, 2026-10-05)
**Decided (implemented in the residuals merge).** A formal release:
- is M1-only, and refuses a second release file for the same commit;
- needs a READY readiness check, with the HR3/TP29 warning printed;
- refuses `skip-worktree` or `assume-unchanged` files;
- accepts only regular, non-symlink inputs under `evals/results/`, produced with the M-001 formal options and the default seed policy (`--baseline=v1` refuses `--seed`). Older results files without a `seedPolicy` are not formal inputs.

The freeze rule counts only active attack cases. Config-change rows in HTML comments and code blocks do not count.
**Accepted residuals, recorded for the Stage 9 review:**
- **R-6:** a config-changes row citing an EV/TP decision whose heading says "Rejected" still authorises. It matters only after baseline-v1, when a config change is proposed, and an owner reviews any such change. To tighten later: require the decision's heading to read "accepted".
- **Repeated harness run:** a formal `pnpm eval` harness run can be repeated at the same HEAD (it writes `-r2`). The default seed makes the run deterministic, so a repeat can't seed-shop.
- **Edit-plus-hash forgery:** editing a report together with its run record's SHA-256 can't be detected without signing.

## EXE37 · Accepted implementation deviations for TKT-11, TKT-12, TKT-16, TKT-17, TKT-22, TKT-24 and TKT-30 — accepted (orchestrator under the owner's waiver, 2026-10-05; reviews PASS)
**Context.** The implementers of these 7 tickets listed candidate deviations, and the spec and quality reviewers accepted them. None was in decisions.md. Items already recorded are left out: the closure-incomplete step (EXE15), the batched-run refusal (EXE16), re-run by check (EXE18), OD-8 and the certificate budget (EXE24), the staged re-hash rule (EXE25), the MultiPoint, MultiPolygon and ring-collapse export rules (EXE26), district outlines and organisation IDs (EXE28), and `DEFAULT_MILESTONE` (EXE23, OD-9). Report paths are in the session scratchpad. No threshold, weight, expected verdict, case class or cfg-1 value changes (CF-13).

**TKT-11 (TASK-12)**
- **Keep policy.** `forbidden`, `device_not_owned` and `length_required` keep the signed outbox copy, because they depend on the session or the proxy, not the picking. This narrows plan §9's "4xx refusals delete the copy" (TASK-12-impl.md D1; spec review accepted).
- **429 wait.** `retryAfterSec` is capped at 60 s at the source, so the saved sheet never promises a longer wait than the phone keeps (D2; tested in fix round 1).
- **Same-seq pickings.** A second offline picking signed with the same seq stays Verified, with only `chain_continuity` flagged (87.5 under cfg-1). It is not Needs Review: a lone chain flag does not cap under EV7. This corrects the P5 ledger note. Changing it would be an EV/TP decision on cfg-1 (D3; spec review: "not a defect").
- **No office-phone migration.** `organisations.office_phone` already exists from migration 0000 (D4).
- **Route groups.** `/field` and `/field/pickings` sit in `(home)` and `(list)` groups, so another agent's picking answers a real 404. One `field/error.tsx` at the `field/` level covers record, help and detail (D5; fix round 1).
- **Language cookie.** It is renamed `lang` → `udgam_lang`, as TSK-11.7 says. It is not httpOnly, and it is Secure in production. A legacy `lang` cookie is ignored (D7; fix round 1).
- **i18n key sets.** `en` and `kn` match except for the English-only admin prefixes `rail.*` and `phones.*` (TP18). The test asserts that these are the only exceptions (D8).
- **Test names.** DB-backed query tests are `*.int.test.ts` (D9).
- **Fix round 1 additions.**
  - `?state=throw` is a test-only surface, honoured only outside production or with E2E=1.
  - `listPickings` returns the newest 200, with no pagination UI yet.
  - The outbox queue runs under the Web Lock `udgam-outbox` when the browser has one.
  - New copy: `pend.unreadable` (Kannada pending native review) and `certCopy.qrLabel`.

  (TASK-12-impl.md fix round 1, "Candidate EXE entries"; spec and quality r2 PASS.)
- **Follow-up.** Each queued send times out after 120 s (`QUEUE_SEND_TIMEOUT_MS`), and the lock wait is bounded by the caller's signal (P5-followup-impl.md item 14, 856b67f).
- **Left for the owner:** the visibility of `device_not_owned` on a shared phone (quality finding 15).

**TKT-12 (TASK-13)**
- **Schema commit.** The schema has its own commit, ahead of TSK-12.1 (TASK-13-impl.md D1). Migrations are 0017/0018, then 0021 (fix round 1) and 0033 (follow-up).
- **Extra guards.**
  - A run that is superseded, or that belongs to an event an admin decided, is refused.
  - `admin_id` has a real FK to `user`.
  - Extra error codes: `batched` (409), `reason_too_long` and `reason_has_control` (400).

  (D2, D7; spec review: "stricter, not weaker".)
- **Runs are immutable once written (0021).** This supersedes 0008's batched-only run freeze, so one TKT-14 test now expects the refusal. 0021 also:
  - folds the override insert guards into one ordered trigger;
  - allows overrides of Needs Review runs only;
  - freezes a decided event's `final_verdict` to the override.

  (fix round 1 candidates 2–3; quality r2 N4.)
- **No new run after a hard-failed run (0033, CF-06).** This closes the raw two-statement bypass (quality r2 N3; P5-followup-impl.md item 11).
- **No `(review)/layout.tsx`.** Next layouts get no `searchParams`. Each page renders through a shared `ReviewScreen.tsx`. The queue sits in a `(queue)` group, so another org's run is a real 404. The TKT-04 placeholder `/admin` page is deleted, and its Sign out moves to a pill under the queue (D3; spec review accepted).
- **As-of re-run context.** It is built from events anchored before the capture's own seq: photos, kg, chain head, previous capture, agent count and revocation. The plot is the current row, so a later boundary edit is not rolled back. The season kg uses earlier events' current final verdicts, which can only lower the total. The re-run payload adds `rerunOf` (D5; fix round 1 Major 2; quality review nit 7).
- **Reason rules.**
  - Refused:
    - control and format characters (newline allowed);
    - phone numbers in any script's digits, joined across 1–3 separators, in mobile or landline shape;
    - text with fewer than 10 visible characters.
  - Accepted: dates, times and decimals.
  - ZWJ and ZWNJ are allowed only between 2 Kannada characters.
  - Lengths count code points, up to 1000.

  The same rules apply in the app and the DB (D7; fix round 1 Major 1; P5-followup-impl.md item 11).
- **Copy and map.**
  - The English-only words live in `src/lib/review/copy.ts`, with no new `en.ts` keys.
  - The review map's 25 m band is drawn in `ReviewDetail.tsx`, and the shared `PlotSvg` is untouched.
  - The rail gains an `admin-rail` class.

  (D8, D9; fix round 1.)
- **Commit slicing.** The Check-again button landed with TSK-12.6 (D11).

**TKT-16 (TASK-17)**
- **Certificate wording.** It lives in `src/lib/certificate/copy.ts`, not `en.ts`. The certificate is English-only, and its words stay on the HR2 list (TASK-17-impl.md D1; spec finding 4).
- **Test surfaces.** `?__tamper=` and `?state=` are gated on E2E=1, as `/__test__/*` is. There is no `UDGAM_TEST_ROUTES` (D2).
- **No `?__key=test`.** The `other-key` tamper re-signs and must report `unknown-key` against the real published key (EVAL-062) (D3; spec nit 15).
- **EVAL-064 on the page.** Raw 404 bytes are compared on the feed route. On the page, the rendered DOM is compared, and the raw bodies are checked for batch data, because a per-request CSP nonce makes raw identity impossible (D5; spec nit 11).
- **QR PNG.** sharp decodes it instead of pngjs. The QR uses scale 8, error correction M and a 4-module quiet zone (D6).
- **Non-additive `proof.ts` changes (TKT-15's file).**
  - Entries are verified in windows of 32 with `Promise.all`.
  - `zod/mini` replaces `zod`.
  - Progress is reported in feed order, only up to the first failure.

  The outcome and step order are unchanged, and the vectors and harness proof suite are green. Verification fell from about 2.0 s to 0.5 s, and the page chunk from 100 KB to 25 KB gzip. The page preloads the ledger key (D7; spec finding 5; spec r2 nit 3).
- **Perf runner.**
  - It seeds into the target server's `DATA_DIR`, and refuses `--only=s3` (TKT-29).
  - The S4 fixture carries EVAL-058's override.
  - Each run reports `serverMs`, `htmlMs` and `verifyMs`. These are report-only; S4's pass is still < 3 s.

  (D8, D13; fix round 1 spec items.)
- **Telemetry beacon.**
  - The request needs a numeric Content-Length, at most 512 bytes, read within 5 s.
  - Each IP gets 30 per 10 min.
  - One `certificate.viewed` beacon is sent per page view.
  - `proof_failed` has its own bucket at `/api/telemetry?e=proof_failed`.

  Each certificate view writes one rate-limit row (fix round 1 Q1–Q3; P5-followup-impl.md item 18).
- **Page details.**
  - Entry chips follow the visitor's own proof.
  - A key-fetch failure is `unavailable`, never a mismatch.
  - Print QR opens a popup with a `window.print()` fallback.
  - Map labels shrink to fit or are left out.
  - The override reason is wrapped in `<bdi>`.

  (D11, D12; fix round 1.)
- **District outlines.** The Dakshina Kannada outline was pulled back out of Kasaragod, Kerala (quality r2 N1; d0ec2df). EXE28 stands.

**TKT-17 (TASK-18)**
- **ProductionPlace.** It is "District, Karnataka" without the plot ID. TP24 and §12 govern over the TSK-17.1 wording (TASK-18-impl.md D1; spec A1).
- **The 4 ha test.** It uses the area at 2 decimals: `round2(area) ≥ 4.00` exports a Polygon, so a plot shown as "4.00 ha" is never a Point. The schema caps a Point's `Area` at 3.99 (D2; fix round 1 Q2, Q3).
- **Coordinates** are written with exactly 6 decimals on the wire. The serializer writes geometry by hand, with no regex over the JSON (D3; fix round 1 Q4).
- **Concave plots** get a guaranteed interior point: the midpoint of the widest horizontal chord when turf's point is not strictly inside (D4).
- **`quantity_kg_cherry`** is the batch total, repeated on every Feature, per §12 (D5).
- **Files.** The metadata helper is `link-preview.ts`, because of Next's page-export rule, and there is a second e2e spec for no-JS tags. Test files are `*.int.test.ts` (D6, D7; spec A5, A6).
- **Shared changes.**
  - `generateMetadata` and the page share one feed build per request through `cache(resolveFeed)`; this touches TKT-16's render line.
  - Both verify routes share `responses.ts`.

  (D8; fix round 1 Q5; spec A5.)
- **Print sheet.** `print.css` is global, scoped with `:has(#proof-feed)`. ProofPanel gains one additive `data-lit` attribute. `tfoot` and `break-after` rules keep the printed entry table honest (D9; fix round 1 Q6).
- **Ring orientation.** Every exported ring follows RFC 7946: exteriors counter-clockwise, holes clockwise (fix round 1 Q1).

**TKT-22 (TASK-23)**
- **Checksum file.** The sidecar is `foundry_v1.8.3_linux_<arch>.sha256`, not `<tarball>.sha256`, which returns 404 (TASK-23-impl.md D1).
- **solc.** solc 0.8.37 is installed from the sha256-pinned GitHub release into `~/.svm/0.8.37/`, because `binaries.soliditylang.org` is blocked. TKT-24 pins `solc_version` and `offline = true` (D2; spec A-2).
- **Messages.** The second run prints `ok: … already satisfied`, as TC-002 words it (D3).
- **Download failure.** It warns and exits 0, and a checksum mismatch is always fatal. CI sets `CLOUD_SETUP_STRICT=1`, which makes a failed download fatal (D4; P5-followup-impl.md item 7).
- **Sigstore.** The bundle was not verified, because the attestation hosts are blocked. The digests were cross-checked against GitHub's published asset digests (D6).
- **The TSK-22.4 verify step** is `~/.foundry/bin/forge --version`; the block does not touch PATH (spec A-1).
- **arm64.** The arm64 execution check is deferred to TSK-27.1 (TKT-27).

**TKT-24 (TASK-25)**
- **viem 2.56.9** is a new production dependency, pinned exactly. technical-plan §0 gains the row `viem | 2.56.9` (TSK-24.4; TASK-25-impl.md D6; spec nit 7).
- **Callers stay on `hashchain.append`.** Every anchoring pass first backfills a pending `evm_anchors` row for any entry that lacks one, in seq order. Anchoring runs:
  - at boot;
  - then every 5 s, single-flight;
  - before each proof, waiting at most 3 s (`ANCHOR_WAIT_MS`).

  Concurrent callers coalesce into one running pass plus one queued pass (D1; fix round 1 Major 1).
- **The `evm` proof field.**
  - It has a `status` discriminant: `anchored`, `pending` or `failed`.
  - A `failed` seq halts later anchoring until an operator runs `pnpm ledger:evm:resolve`. This records 1 immutable resolution (migrations 0024/0025), and the seq stays `failed` in proofs and audit.
  - `verifyFeed` strips `evm`: the field is not verified.

  (D2; fix round 1 deviation 1; docs/proof-feed.md §13.)
- **Tests and harness.**
  - The `evm` vitest project runs only on request (`pnpm test:evm`). It fails loudly without Foundry and never skips.
  - Under `--ledger=evm`, the harness lets only its own loopback RPC through and counts those calls (`localChainRpcCalls`).

  (D3, D4.)
- **Operator key.**
  - The key is a 0600 file.
  - It is funded from Anvil's unlocked account on local chain 31337 only.
  - It reaches `forge script` through the child environment, never through argv.
  - A `deployment.json` whose registry is not live is refused.

  (D7.)
- **Deployment and audit.**
  - `deployment.json` carries `confirmations`: 1 on 31337, 12 elsewhere. This avoids a new env var.
  - `checkFeedAnchors` gains an additive `failures` field.
  - `ANVIL_RPC_URL` is treated as a secret name.

  (fix round 1 deviations 2–4.)
- **BatchRegistry details.** `nextSeq` starts at 1, `seq` is indexed in `EntryAnchored`, and it reverts on a zero hash or zero operator (D8).
- **CI and tests.**
  - The contracts CI job runs the full `pnpm eval --ledger=evm --milestone=M2`.
  - 2 tests that asserted the old EVAL-103 placeholder note were updated. No case or results file changed.

  (D9, D11.)
- **Follow-up.**
  - The receipt timeout grows with `confirmations`.
  - §13.2's step 0 says the registry comes from an out-of-band announcement.

  (P5-followup-impl.md item 13.)

**TKT-30 (TASK-31)**
- **Schema commit.** The schema has its own commit. Migrations were merged as 0022/0023 (TASK-31-impl.md D1).
- **Phone scoping.** `staged_media` has `device_id`, and the stage route needs `X-Udgam-Device` for a phone that is enrolled to the agent and not revoked. The binding is advisory within one agent's phones. An unexpired staged row keeps its first phone (D2; quality finding 4; P5-followup-impl.md item 12).
- **Interfaces and limits beyond the plan.**
  - `stagePhoto` takes `deviceId` and `mime`.
  - Separate stage slots: 4 per process, 2 per agent.
  - A per-address limit of 180 per 10 min.

  (D4, D5; spec finding 4.)
- **`media_not_staged`.** It replays an accepted payload's verdict before answering 409. A 409 refunds the device and per-address tokens (D6; quality finding 5; P5-followup-impl.md item 12).
- **Sweeps.** Staging is swept on stage calls, after every capture and at boot. The orphan cutoff is `STAGE_TTL_MS` by file mtime (P5-followup-impl.md item 12).
- **Shared files.** `src/app/api/capture/route.ts` and `read-form.ts` were touched outside the owned files; the changes are small and additive (D7; spec finding 3).
- **e2e.** The spec re-sets the emulated GPS fix just before Send (D8).
- **Commit history.** The TSK-30.4 commit's spec fails on its own and is fixed in the TSK-30.5 commit. Interactive rebase is unavailable (D9; spec finding 2).

## EXE38 · The S4 perf server needs a throwaway auth secret — accepted (orchestrator, 2026-10-05; amends the m-001-formal-run runbook, step 4)
**Context.** At runbook step 4 the production perf server refused every request: `BETTER_AUTH_SECRET` is required when NODE_ENV=production, and the runbook's command didn't set one. The run stopped before writing `baseline-perf-v1.json` (perf files can't be rewritten).
**Decision.** The step-4 server gets the same throwaway environment the e2e web server uses: `BETTER_AUTH_SECRET` generated in the shell at start (`openssl rand -hex 32`, never printed, written or committed), `BETTER_AUTH_URL` set to the server's own URL, and `REMOTE_SENSING_PROVIDER=fixture`. The runbook says so. The sandbox refused the inline command substitution, so the formal run put the same command in a scratch launcher script that holds only the generator, never the value.
**Result.** M-001 formal run at gate commit eb321a1, formal commit d7124cb, report commit 24d40a8; the release exited 0.
- S1 97.7 % (42/43), S1-floor 91.7 %;
- S2 0/40;
- S4 10/10 under 3 s (p50 2452 ms, max 2905 ms, 4-vCPU x64, load 0.3–1.4);
- S6-lib 7/7, S7 Yes, S7-release Yes, CF 0.

baseline-v1 is frozen (EV13, EXE34).

## EXE39 · Stage 7 final whole-branch review and fix wave — accepted (orchestrator, 2026-10-05)
**Context.** The completion review (Opus, whole branch at ebb42ce) found:
- **1 major:** an unscoped dynamic path in `deployment.ts` made Turbopack trace the whole project, `data/keys` included, into every server route. With TKT-27's standalone output, the private keys would have been copied into the deploy artifact.
- **2 minors:** an unbounded `/api/enrol` body; three drifting key-file helpers.
- **6 nits.**

**Decision (single fix wave, merged at 6a6051d).**
- Every DATA_DIR and key path is built through `src/lib/config/runtime-path.ts` (`turbopackIgnore`). `next.config.ts` excludes the data, secrets and non-runtime folders from tracing, keeping `evals/fixtures`, which the fixture provider reads at run time.
- `scripts/ci/check-trace.mjs` fails CI, in the existing `bundle-secrets` job, on any traced file under `data/`, `.e2e-data/` or `.secrets/`, on `.env` files, and on any `*.key`, `*.jwk` or `*.pem` outside node_modules. Next's excludes don't reach the instrumentation trace, so the runtime-path rule plus this check is the real guard. **TKT-27 must keep the check.**
- `/api/enrol` answers 411 without a numeric Content-Length and 413 above 4 KiB, and reads through the bounded reader.
- One key-file helper keeps files at 0600 and directories at 0700, and tightens a loose directory.
- The duplicated helpers are merged. `docs/exec/migrations.md` lists the triggers a future `user` rebuild must drop and recreate, and a test fails when that list drifts from the schema.

## EXE40 · Stage 8 design-critique triage — accepted (orchestrator, under the owner's delegation, 2026-10-05)
**Context.** Three design reviewers critiqued the running app against Design.md and the approved mockups (reports in `docs/exec/stage8/`). They raised 61 findings, DES-001–025, DES-100–114 and DES-200–220: 0 P0, 7 P1, 29 P2, 25 P3.
**Decision.** Fix every finding except those parked below, in one fix wave per surface, then re-run the critique. Delegated owner calls:
- **DES-002 (offline navigation):** fixed without a service worker. When the phone is offline, tabs and "Send now" stay in the app, show the saved-on-phone sheet and keep "Nothing is lost". A service worker or full offline shell is out of MVP scope.
- **DES-021 / DES-105 (Sign out):** Help gains a Sign out entry in the field app, and every office rail gains Sign out in its foot. This is a content addition, not a change to the frozen IA.
- **DES-101 (QA-M002-1):** after grading, the buyer sees "Graded · waiting for the FPO to settle" and the grade card.
- **DES-203 (EVAL-087 / TC-071):** the printed certificate gains a print-only QR and URL (the existing `BatchQr`). The case text is unchanged.

**Parked:**
- **DES-005:** no time promise on Needs a check (EXE24, OD-5). The farmer copy names who will look and where the answer will appear.
- **DES-201:** the lone processor hop with no step (EXE32; signed `toOrgType` later).
- **DES-202:** the OG image text is a **Design Freeze item → owner**. The image always reads "Kodagu Arabica, verified at origin", even for other districts or failing batches.
- **DES-204:** organisation IDs, not names, on the certificate (EXE28).
- **DES-218:** the localhost absolute-URL fallback → TKT-28 (QA-P6-8-3).

## EXE41 · Corrections to the EXE40 triage — accepted (orchestrator, 2026-10-05)
- **Wrong ID.** EXE40 parked "DES-218: the localhost absolute-URL fallback". In `docs/exec/stage8/stage8-public.md` that finding is **DES-219**; DES-218 is the static "See all checks" label, which was fixed. DES-219 is the one parked to TKT-28: requiring an https `PUBLIC_BASE_URL` in production would break `next start` on localhost for e2e.
- **New finding, DES-221 (P2, accessibility).** Under a `kn` language cookie, the English-only certificate page renders `<html lang="kn">`, because the root layout sets `lang` from the cookie. Public `/verify` pages must declare `lang="en"`. Fixed in the Stage 8 follow-up and verified in the re-run.
- **Display-only rewording.** The certificate's evidence copy is reworded for display only (DES-208, DES-213). Signed payloads, `evidence.ts` and the eval fixtures are unchanged.

## EXE42 · Stage 8 field and office fix decisions — accepted (orchestrator, under the owner's delegation, 2026-10-05; pending owner review)
**Field app**
- **DES-002 (offline):** offline is detected from `navigator.onLine`, with no service worker (EXE40). A phone that reports online while the network is dead can still land on the browser's offline page when a tap changes page. This is accepted for the MVP.
- **DES-019 (weight):** a weight is "unlikely" when it is more than 2× the farmer's highest recent picking or under half their lowest. The farmer confirms in place ("Yes, send N kg"). A refused key shows the half-kilo rule. With no recent range there is no hint (TC-047 unchanged).
- **DES-021 (Sign out):** signing out leaves the phone's saved pickings and its key on the phone, so photos are never lost (TP28). The sheet says so.
- **DES-001 (Help):** Language, This phone and Sign out move behind a "More" row in Help, so Close always stays in view. This changes Help's contents, not the frozen IA.
- **DES-013 (un-enrolled phone):** a phone with no key goes to set-up, never to "Not accepted".

**Office**
- **DES-101 (graded status):** the buyer's graded status wording is added to Design.md §28.7, marked pending owner review.
- **DES-112 (demo verdicts):** the Demo tools chips use the D5 farmer words ("Not accepted", "Needs a check"), while `data-verdict` keeps the system verdict. The EVAL-074 case and its expected verdicts are unchanged; only the e2e text assertion moved.
- **DES-114 (settle label):** the sticky Settle label shortens to "Settle · ₹X", and the hint names the FPO. This deviates from the mockup's longer label, which wrapped at 375.
- **Not-found pages:** one styled card (`NotFound`) serves the root and every signed-in route group. The public `/verify` 404 is unchanged (TP8). A not-found inside a route keeps that route's title.

## EXE43 · Owner items decided under the owner's delegation — accepted (orchestrator, 2026-10-06)
**Context.** The owner said "take decisions on my behalf" for the items open at the end of Stage 8: DES-202, HR1/HR2/HR6, D9/D10 and EXE24–EXE42, and the Kannada review.
**Decisions.**
- **DES-202 (the OG image, a Design Freeze item; changed at the owner's explicit instruction).** The approved artwork stays exactly as it is: layout, mark, typography and colours. Only its words become true per batch. The image text follows the certificate title, "<District> <crop>, verified at origin", from the same proof-feed view model. It is rendered deterministically from the frozen design, never by a diffusion model (og-image-guidelines). A batch whose district or crop is unknown gets the neutral variant "Coffee, verified at origin". `og:image:alt` matches the words. The 1200×630 size and the < 500 KB budget hold. The pilot spans Kodagu and Chikkamagaluru, so a fixed "Kodagu Arabica" image would make a false public claim.
- **HR1 (evidence-template snapshots), HR2 (known-limitations and pruning/clearing wording) and HR6 (number traceability)** in `docs/exec/m-001-gate.md` are accepted as written, after an independent check that every HR6 number matches its results file.
- **D9/D10 (M-002 design addendum) and EXE24–EXE42** are confirmed as they stand. The Stage 8 critique exercised their screens (T1–T4 faithful to `contract.html`).
- **Not delegable:** the Kannada native review (617 strings marked `REVIEW: native speaker`) needs a native speaker, and stays a pre-pilot human item.

## EXE44 · Owner waiver: go straight from Stage 8 into Stage 9 — accepted (owner, 2026-10-06)
**Decision (owner).** "Once Stage 8 is done, move to Stage 9. Don't wait for my approval." Stage 8 closes on a clean re-run, every DES resolved or parked with a reason. Then HANDOFF.md is rewritten and Stage 9 (`bw-code-review-test-eval`) starts in the same session. The owner's review items stay listed in HANDOFF and are not treated as approved, except where EXE43 decided them.
