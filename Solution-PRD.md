# Solution PRD — Udgam

**Stage:** 2 · Solution Design (build-workflow)
**Status:** Draft for user sign-off
**Date:** 2026-09-24
**Inputs:** `Discovery-PRD.md` (approved 2026-09-24), `decisions.md` DISC1–DISC16
**Decisions appended by this stage:** `decisions.md` S1–S9

---

## 1. Chosen approach in one paragraph

One Next.js App Router monolith on a single Oracle Always Free instance serves four surfaces (agent PWA, FPO admin, buyer, public verify page) over one libSQL database. The verification pipeline is a pure TypeScript module: a registry of small independent checks, each returning a score, a hard-fail flag, and a human-readable evidence sentence, composed into a three-state verdict. Verification runs synchronously in the upload request with per-provider timeouts. Every state change is anchored to a hash-chain ledger with signed Merkle checkpoints behind a `Ledger` interface that a Foundry/Anvil EVM adapter implements in Milestone 2. The public certificate page recomputes the proofs in the visitor's browser. An evaluation harness scores the verifier against seeded legitimate and attack submissions with one command.

## 2. Requirements

### 2.1 Functional — Milestone 1 (vertical slice)

| ID | Requirement |
|---|---|
| F1 | FPO admin registers farmers and plots; plot boundary drawn on a satellite basemap or uploaded as GeoJSON/KML; area in hectares computed on save |
| F2 | On plot registration the system runs and caches the deforestation query (tree-cover loss since 2021 within the polygon) and a 12-month NDVI history, and anchors `plot_registered` |
| F3 | Admin generates a 24-hour one-time enrolment code; the agent's browser generates a non-extractable P-256 key, registers the public key, and the system anchors `device_enrolled`; admin can revoke a device |
| F4 | Agent selects an assigned plot, takes 1–3 photos via native camera input, enters cherry kg; the browser reads GPS, hashes the exact photo bytes, builds the payload with the previous event hash, canonicalises (RFC 8785), signs, and uploads photos + payload in one multipart request (≤ 10 MB per photo) |
| F5 | The upload handler verifies the signature at the boundary, runs the check registry (§4), persists a `verification_run`, anchors `harvest_event` and `verification_run` in the same transaction as the row writes, and returns the verdict with evidence lines |
| F6 | Verdicts: `Verified` (score ≥ 80, no hard fail), `Needs Review` (50–79, or any check `unavailable`), `Rejected` (< 50 or any hard fail). Rejections are anchored |
| F7 | Admin review queue lists `Needs Review` runs with evidence; admin can re-run verification (retrying unavailable providers) or override to `Verified`/`Rejected` with a mandatory reason; overrides are signed and anchored; hard-failed rejections cannot be overridden |
| F8 | Admin attaches an organic (NPOP/APEDA) certificate to a plot as an attestation: file hash, issuer, validity; anchored. Never presented as "verified organic" |
| F9 | Admin creates a batch from Verified events of one crop: quantity = Σ cherry kg, integrity score = min(event scores); an event belongs to at most one batch (unique constraint); anchored |
| F10 | Admin records custody transfer of a batch to a buyer organisation; signed and anchored; batch locked after transfer |
| F11 | Buyer dashboard lists batches transferred to them with score, quantity, plots, custody chain |
| F12 | Public `/verify/[batchId]?h=<12-char hash>`: batch summary, custody, plot map with deforestation result, per-event verdict and evidence, attestation status, verification panel that recomputes entry hashes, Merkle paths, and checkpoint signature in the browser; print stylesheet; EUDR GeoJSON download |
| F13 | `pnpm eval` runs the verifier against a seeded dataset with the fixture provider and writes `/evals/results/eval-run-{version}.json` + a Markdown report; asserts S1 and S2 |
| F14 | `/api/health` reports database, ledger checkpoint age, and provider reachability; structured logs with a request id per verification run |
| F15 | Seeded demo data: one FPO, one buyer, ≥ 10 plots in Kodagu/Chikkamagaluru, agents, devices, legitimate events, and the four attack cases ready to submit |

### 2.2 Functional — Milestone 2
| ID | Requirement |
|---|---|
| F16 | EVM `Ledger` adapter: Foundry/Anvil, `BatchRegistry` stores entry hashes; proofs gain tx hash and block number; hash-chain store remains payload system of record |
| F17 | `ContractFarming` + escrow with mock ERC-20 INR: buyer funds at agreement; settlement when delivered kg ≥ agreed, buyer-signed quality grade ≥ agreed, and all included events Verified |
| F18 | Processor custody hop with mass-balance (input kg vs output kg after pulping/drying) flagged when outside a configurable band |

### 2.3 Functional — Milestone 3
| ID | Requirement |
|---|---|
| F19 | Docker Compose on Oracle A1 (ARM): app, Anvil (linux-aarch64), Caddy with Let's Encrypt on the product domain; keep-busy cron; ledger key persisted outside the repo |
| F20 | Demo rehearsal script and evaluation report published in `/evals/reports` |

### 2.4 Non-functional
| ID | Requirement |
|---|---|
| N1 | Capture-to-verdict ≤ 30 s online (S3); each provider call times out at 8 s; cache hit avoids the call |
| N2 | Certificate in-browser verification < 3 s for a batch of up to 50 events (S4) |
| N3 | Runs within 2 OCPU / 12 GB; no service other than app, Anvil, Caddy |
| N4 | Mobile responsiveness on agent and verify surfaces at 375 px and 768 px; no horizontal scroll |
| N5 | All strings externalised (i18n-ready), English only shipped |
| N6 | No secrets in repo; ledger key, provider keys, auth secret via environment/files outside the tree |
| N7 | Every table write that changes provenance state is anchored in the same transaction |

## 3. Architecture

### 3.1 Surfaces and routing
| Surface | Route group | Auth | Notes |
|---|---|---|---|
| Capture | `/(agent)` | agent | mobile-first PWA, installable, camera via `<input type="file" accept="image/*" capture="environment">` |
| Admin | `/(admin)` | admin | Leaflet + react-leaflet + leaflet-draw, Esri World Imagery tiles (MapTiler fallback via one config value) |
| Buyer | `/(buyer)` | buyer | |
| Verify | `/verify/[batchId]` | none | |
| API | `/api/capture` (multipart upload), `/api/verify/[batchId]` (proof feed), `/api/health`, `/.well-known/udgam-ledger-key` | | |

Server Actions for forms; route handlers for binary and public data. Business logic in `src/lib/*` with no Next.js imports.

### 3.2 Modules
| Module | Purpose | Depends on |
|---|---|---|
| `lib/crypto` | RFC 8785 canonical JSON, SHA-256, ECDSA P-256 sign/verify; isomorphic (WebCrypto only) | — |
| `lib/verification` | check registry, scorer, verdict; pure | `crypto`, `remote-sensing` (via context) |
| `lib/remote-sensing` | `RemoteSensingProvider` interface; GFW adapter; Sentinel Hub Statistical API adapter; fixture adapter; cache | `db` |
| `lib/ledger` | `Ledger` interface; hash-chain adapter with Merkle checkpoints; (M2) EVM adapter | `crypto`, `db` |
| `lib/media` | `MediaStore` interface; local-disk adapter; thumbnail generation; EXIF extraction | — |
| `lib/db` | Drizzle schema + queries on libSQL (file) | — |
| `lib/auth` | Better Auth config, role helpers | `db` |
| `lib/eudr` | GeoJSON FeatureCollection export with DDS properties | `db` |

### 3.3 Verification execution model (S2)
Synchronous in the upload request. Order: boundary signature check → cheap local checks → remote-sensing checks (cache first, 8 s timeout each) → scoring → persistence + anchoring in one transaction → response. The pipeline's `verify(submission, context)` signature is the seam for a future async worker (wrap, don't rewrite).

### 3.4 Data model (Milestone 1)
`organisations`(id, type fpo|buyer, name) · `users`(id, org, role agent|admin|buyer, …auth) · `farmers`(id, org, name, identifier) · `plots`(id, farmer, crop, geojson, area_ha, registration_checks json, created_at) · `devices`(id, agent, public_key_jwk, enrolled_at, revoked_at, last_seq) · `enrollment_codes`(code, agent, expires_at, used_at) · `harvest_events`(id, plot, device, seq, client_captured_at, server_received_at, lat, lng, accuracy_m, cherry_kg, prev_event_hash, payload_hash, signature, boundary_status accepted|rejected) · `media`(id, event, path, sha256, exif json, thumb_path) · `verification_runs`(id, event, run_no, verdict, score, checks json, unavailable_providers json, created_at) · `admin_overrides`(id, run, admin, new_verdict, reason, signature) · `attestations`(id, plot, type, file_hash, issuer, valid_from, valid_to) · `batches`(id, org, crop, status, quantity_kg, integrity_score) · `batch_events`(batch, event UNIQUE) · `custody_transfers`(id, batch, from_org, to_org, transferred_at, signature) · `ledger_entries`(seq, prev_hash, kind, payload_hash, payload json, ts, entry_hash) · `ledger_checkpoints`(id, from_seq, to_seq, merkle_root, signature, ts) · `remote_sensing_cache`(plot, provider, kind, month_bucket, response json, fetched_at) · `crop_yield_reference`(crop, variety, min_kg_ha, max_kg_ha, cherry_to_clean_ratio, source).

Timestamps ISO-8601 UTC. Client capture time and server receipt time are always stored separately (DISC5/Q12).

## 4. Verification pipeline

### 4.1 Contract
`verify(submission, context) → { verdict, score, checks: CheckResult[], unavailableProviders: string[], config }`.
`CheckResult = { id, status: ok|flag|fail|unavailable, score: 0..1, weight, hardFail: boolean, evidence: string }`.
Context is assembled by the caller: plot (+ polygon, registration checks), device, agent's previous event, season cumulative kg for the plot, crop reference, remote-sensing provider, config.

### 4.2 Registry (Milestone 1)
| Check | Threat | Rule | Failure mode |
|---|---|---|---|
| `signature_valid` | 5 | ECDSA verify over canonical payload with device key; device not revoked | hard fail |
| `chain_continuity` | 2, 5 | prev hash = device's last accepted hash, seq = last + 1 | flag |
| `photo_uniqueness` | 2 | each media sha256 unseen globally | hard fail |
| `geofence` | 1 | point inside polygon with buffer = min(accuracy, 25 m) | outside: fail; in buffer: flag |
| `gps_accuracy` | 1 | < 30 m ok; < 100 m flag; else fail | |
| `exif_gps_agreement` | 1 | EXIF GPS within 50 m of browser GPS; absent → flag | |
| `exif_time_agreement` | 6 | EXIF time within 10 min of client time; client within 24 h of server → else flag; > 7 days fail | |
| `movement_plausibility` | 1 | implied speed from previous event < 120 km/h | fail |
| `deforestation_overlap` | 3 | GFW loss ≥ 2021 within polygon: any → flag; ≥ 10 % of area → hard fail | thresholds configurable |
| `ndvi_cultivation` | 3 | 12-month NDVI history consistent with perennial canopy | fail |
| `ndvi_harvest_window` | 1, 3 | ±30-day NDVI consistent with living canopy; cloud-blocked → unavailable | |
| `yield_plausibility` | 4 | season cumulative kg/ha vs reference: > 1.5× upper → flag; > 2× → hard fail | |

### 4.3 Scoring and verdict
score = 100 × weighted mean over checks with status ≠ unavailable. Any hardFail → `Rejected`. Else ≥ 80 `Verified`, 50–79 `Needs Review`, < 50 `Rejected`. Any unavailable → cap at `Needs Review`. Weights/thresholds in one config object, printed in every eval report. A check that throws reports `unavailable` with the error class in evidence.

### 4.4 Overrides
`Needs Review` → `Verified`/`Rejected` with reason; signed with the admin's server-bound key; anchored as `admin_override` referencing the run. Hard-failed `Rejected` is final.

## 5. Ledger and certificate

### 5.1 Interface
`append(kind, payload) → Anchor{ id, seq, entryHash }` · `getProof(anchorId) → Proof{ entry, siblings[], checkpoint }` · `verifyProof(proof) → boolean` (isomorphic, shared with the browser).
Kinds (M1): `plot_registered, device_enrolled, device_revoked, harvest_event, verification_run, admin_override, attestation, batch_created, custody_transfer`.

### 5.2 Hash-chain adapter
entry_hash = SHA-256(canonical{seq, prev_hash, kind, payload_hash, ts}). Checkpoint every 100 entries or on demand: Merkle root over entries since last checkpoint, signed with the server ledger key (generated at first boot, stored outside the repo; public key at `/.well-known/udgam-ledger-key`). The verify page triggers a checkpoint if the batch has entries after the last one (S7).

### 5.3 EVM adapter (M2)
Same interface; `append` also writes entry_hash to `BatchRegistry` on Anvil; proof gains txHash/blockNumber. Payloads stay off-chain.

### 5.4 Certificate `/verify/[batchId]?h=`
QR encodes the URL with the batch's ledger entry hash truncated to 12 chars; mismatch fails on load. Sections: batch + current custody → plot map with deforestation result → per-event verdict + evidence → attestation status → verification panel ("Verified in your browser against checkpoint N signed by key X", or the exact failing step) → print stylesheet → EUDR GeoJSON download (FeatureCollection; properties: commodity, HS code, quantity_kg, country, producer_id; polygon, or point for plots < 4 ha).

## 6. Capture and enrolment flows
- **Enrolment:** admin code (24 h) → agent enters code → WebCrypto P-256 non-extractable key in IndexedDB → public key posted → bound + anchored. Missing key → re-enrol; old device revoked by admin.
- **Capture:** choose plot → 1–3 photos → cherry kg → submit. GPS high-accuracy up to 10 s. Hash exact bytes, build payload {plotId, deviceId, seq, prevEventHash, capturedAt, gps{lat,lng,accuracy}, cherryKg, media[{sha256, size}]}, canonicalise, sign, multipart upload. Spinner lists checks as they complete; verdict card shows evidence lines. Network failure keeps the signed payload + photos in IndexedDB for manual retry (seed of the offline queue, not the queue).

## 7. Error handling rules
1. Provider timeout/error → `unavailable` → cap `Needs Review` → admin re-run. Never `Rejected`.
2. Signature failure / unknown or revoked device / tampered payload → HTTP 4xx with logged reason; still anchored as a rejected `harvest_event`.
3. Ledger append and row writes share one transaction; on failure nothing persists and the agent gets a retryable error.
4. Each check wraps its own body; a throwing check cannot fail the run.
5. Structured logs with request id; `/api/health` for DB, checkpoint age, provider reachability.

## 8. Evaluation harness (shape; Stage 3 owns case design)
`pnpm eval` → dataset from fixtures (≈ 40 legitimate events over 10 plots with realistic GPS/EXIF jitter; ≥ 10 attack cases per scenario 1–4 by mutating legitimate events; scenarios 5–6 if built) → `verify` with fixture provider → `/evals/results/eval-run-{version}.json` + `/evals/reports/eval-report-{version}.md` with per-scenario detection rate, false-positive rate, config, provenance (git commit, dataset version). Asserts S1 ≥ 95 %, S2 ≤ 5 %.

## 9. Testing strategy
- **Vitest unit:** crypto (canonical JSON round-trip browser↔Node, sign/verify), every check, scorer, hash-chain ledger + proof verification.
- **Vitest integration** (temporary libSQL file): upload handler, batch creation, custody transfer, GeoJSON export, health route.
- **Playwright e2e:** the demo script (§7.1 of Discovery PRD) at 375 px and 1280 px with mocked geolocation and file inputs.
- **Foundry tests** (M2): contracts.
- Baseline gate before "done": typecheck + lint + all of the above green.

## 10. Explicitly out of scope (unchanged from Discovery PRD §5.4)
Native app / hardware attestation, offline queue, walk-the-boundary tracing, remote-sensed organic, real money, disputes, auditor role, farmer login, localisation beyond i18n-ready strings, multi-crop, multi-tenant beyond the org column, mainnet.

## 11. Success criteria
S1–S7 as defined in `Discovery-PRD.md` §7; they become Stage 3 release gates and are never weakened to pass.

## 12. Risks specific to this design
| Risk | Mitigation |
|---|---|
| Sentinel-2 cloud cover in monsoon months blanks `ndvi_harvest_window` | status `unavailable` caps at Needs Review, not Rejected; admin re-run; report cloud stats in eval |
| Shade-tree pruning shows as GFW loss on coffee estates | any-loss is a flag not a fail; 10 % hard-fail threshold configurable; documented as an R&D finding |
| Mobile browsers strip EXIF GPS | absent EXIF GPS is a flag; browser GPS + geofence + satellite still score |
| IndexedDB cleared → key lost | re-enrolment flow; old device revoked; chain_continuity flags, not fails |
| Single ledger key on one instance | key backed up off-instance by operator; public key published; rotation is a roadmap item |
| ARM binaries (Foundry, sharp for thumbnails) | validate on the instance in week 1 of M2 / M3 |

## 13. Sign-off
- [ ] Approach, requirements, architecture, pipeline, ledger, flows, error handling, testing approved by Tushar Pathak
- [ ] Next: Stage 3 Evaluation Design (`bw-evaluation-design`), Fable / High
