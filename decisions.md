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
