# Discovery PRD — Udgam

**Stage:** 1 · Product Discovery (build-workflow)
**Status:** Approved by Tushar Pathak, 2026-09-24
**Date:** 2026-09-24
**Author:** Tushar Pathak with Claude (Fable 5.1)
**Product name:** **Udgam** (उद्गम — "origin, source"). Tagline: *Provenance you can verify.* Domain `udgam.in` preferred, `udgamtrace.in` fallback — **availability not yet verified** (registrar check pending).

---

## 1. One-paragraph summary

Udgam is a web platform for Indian farmer producer organisations (FPOs) and agri-exporters that makes the physical origin of a harvest batch **verifiable and tamper-evident before it is written to a ledger**. Its defensible core is not the blockchain but the **trust-at-the-edge verification layer**: geo-fenced, device-signed mobile capture, cross-validated against satellite forest-cover and vegetation signals, scored into an integrity verdict that a buyer, an EU importer, or anyone scanning a QR code can independently re-verify in their own browser. It is being built as a fundable deep-tech MVP for India's RDI Scheme (Digital Economy / Digital Agriculture sunrise sector).

## 2. Problem and why it matters

### 2.1 The problem
EU buyers of coffee, rubber, cocoa and other listed commodities must, under the EU Deforestation Regulation (EUDR), prove that each consignment came from plots that were not deforested after 31 December 2020, with plot-level geolocation in a due-diligence statement. Indian smallholder supply chains cannot produce that proof today: plot boundaries are not digitised, harvest events are recorded on paper or WhatsApp, and nothing links a bag of coffee at the port back to a specific plot in a way a regulator or importer can trust.

### 2.2 Why the obvious fix fails — the oracle problem
Putting records "on a blockchain" does nothing if the record was false when it was written. A ledger guarantees a record has not changed *since* it was written; it says nothing about whether the photo was taken where it claims, whether the GPS was spoofed, whether the plot polygon was drawn over freshly cleared forest, or whether the same photo backs three different batches. **The hard, fundable problem is making off-chain physical reality trustworthy at the point of capture.** That is what Udgam is for. The ledger is plumbing.

### 2.3 Why now
- EUDR application dates (as understood at time of writing, **to be re-verified in Stage 2**): large and medium operators from 30 December 2026, micro and small from 30 June 2027, following the one-year deferral agreed in December 2025.
- India's RDI Scheme funds deep-tech R&D in Digital Agriculture; provenance verification is a natural work package with measurable outcomes.
- Free, production-grade remote-sensing APIs (Global Forest Watch, Copernicus Sentinel Hub) now make satellite cross-validation feasible without a GIS team.

## 3. Target users

| Persona | Role in Udgam | What they need |
|---|---|---|
| **Field agent** (FPO staff on a phone, often the farmer's neighbour or an extension worker) | Authenticated. Registers harvest events at the plot with GPS + photos on an enrolled device | A capture flow that works in 60 seconds on a mid-range Android phone with patchy network |
| **FPO admin** (desk role at the FPO office) | Authenticated. Registers farmers and plots (draws or uploads boundaries), enrols devices, reviews flagged submissions, aggregates verified events into batches, records custody transfer | A review queue with evidence, not just a red/green light; a way to override with an auditable reason |
| **Buyer / exporter** (compliance or sourcing manager) | Authenticated. Sees batches offered, custody chain, integrity scores; downloads the provenance certificate and EUDR GeoJSON; later, creates and settles contract-farming agreements | A certificate their EU importer will accept and a GeoJSON their due-diligence tool can ingest |
| **Public verifier** (importer, auditor, consumer, regulator) | No login. Scans the QR on a certificate | Proof that recomputes in their own browser, not a PDF that says "verified" |
| **Farmer** | Data entity, not a login in the MVP | Their plot and harvests attributed correctly; roadmap: farmer-facing view in local language |
| **Grant evaluator / investor** (meta-audience) | Watches a 10-minute demo, reads the evaluation scorecard and this PRD | Evidence the verification layer catches fraud, measured, not asserted |

**Primary audience for the next 8–12 weeks: grant evaluators and investors**, with the build shaped so a single design-partner FPO pilot can follow without rework (Q1). No design partner, plot data, or draft application exists yet (Q16).

## 4. Anchor commodity and region

**Coffee, Kodagu / Chikkamagaluru, Karnataka** (Q2). EUDR-in-scope, smallholder-heavy with active FPOs, a real EU export channel, and shade-grown under tree canopy — exactly the case where a naive "tree loss = deforestation" check fails, which makes the verification problem non-trivial and the R&D defensible. Multi-crop support is roadmap.

## 5. Scope

### 5.1 In scope — Milestone 1 · the vertical slice (target: demonstrable at week 3)
The thinnest end-to-end path that proves trust-at-the-edge works:
1. FPO admin registers a farmer and a plot (draw polygon on satellite basemap, or upload GeoJSON/KML) — Q21.
2. Plot is checked at registration against forest-cover loss since 31 Dec 2020 and a 12-month vegetation history confirming cultivation — Q7, Q25, Q35.
3. FPO admin enrols a field agent's phone (one-time code → on-device keypair) — Q23.
4. Field agent logs a harvest event on the phone: GPS, timestamp, 1–3 photos, cherry weight; the capture is hashed and signed on the device — Q5, Q6, Q12, Q24.
5. Verification service scores the submission across named checks and returns **Verified / Needs Review / Rejected** with human-readable evidence; hard-fail checks force Rejected — Q3, Q19, Q20.
6. Every submission and verdict (including rejections and admin overrides) is anchored to a tamper-evident ledger — Q8, Q19.
7. FPO admin aggregates verified events into a batch; batch score = minimum of its events; records custody transfer to a buyer — Q22.
8. Buyer dashboard lists batches with scores and custody chain.
9. Public certificate page with QR: custody chain, plot map, per-event evidence, ledger anchors, **in-browser recomputation of the hash chain**, print-to-PDF, and **EUDR-conformant GeoJSON download** — Q15, Q27.
10. **Evaluation harness**: seeded legitimate + attack dataset, one command, per-scenario detection and false-positive report — Q14, Q26.
11. Organic status handled as a **document-backed attestation** (certificate hashed and anchored), never claimed as remotely verified — Q4.

### 5.2 In scope — Milestone 2 · contract farming on real smart contracts (≈ week 4)
- Local EVM (Foundry/Anvil) adapter behind the same ledger interface; Solidity `BatchRegistry`, `Custody`, `ContractFarming` — Q8.
- Escrow with a mock ERC-20 "INR" token: buyer funds at agreement; settlement releases when delivered quantity ≥ agreed, buyer-signed quality grade ≥ agreed, and every included event is Verified — Q28.
- Processor hop with mass-balance (input kg vs output kg after pulping/drying) — Q22.

### 5.3 In scope — Milestone 3 · public deployment and polish (≈ week 5–6)
- Deployed on Oracle Cloud Always Free (Ampere A1) with HTTPS on the product domain; app + Anvil + libSQL on one instance — Q29 (revised), Q11.
- Demo seeding, evaluation report, pitch-ready walkthrough.

### 5.4 Explicitly out of scope for the MVP
- Native mobile app, hardware-backed attestation, mock-location detection (roadmap; natural RDI work package) — Q5, Q6.
- Offline capture queue (payload is designed so it can be added without a data-model change) — Q12.
- Walk-the-boundary GPS tracing of plots — Q21.
- Remote-sensed verification of organic practice; input/pesticide logs — Q4.
- Real money movement, payment rails, dispute resolution — Q28.
- Auditor/regulator role, farmer login, localisation beyond i18n-ready English strings — Q10, Q13.
- Multi-crop, multi-region, multi-FPO tenancy beyond a simple FPO scoping column.
- Public blockchain, tokens with real value, any mainnet.
- Any claim the platform cannot recompute from evidence.

## 6. Threat model — what the verifier must catch

| # | Scenario | MVP status |
|---|---|---|
| 1 | **GPS spoofing** — photo submitted from outside the registered plot | Must-have |
| 2 | **Replay** — old or previously-submitted photo reused for a new batch | Must-have |
| 3 | **Plot laundering** — polygon overlaps land deforested after 31 Dec 2020 | Must-have |
| 4 | **Yield inflation** — cumulative harvest implausible for plot area and crop | Must-have |
| 5 | **Identity substitution** — capture signed by a device not enrolled to that agent/plot, or a revoked device | Stretch |
| 6 | **Timestamp manipulation** — client clock, server receipt and EXIF disagree | Stretch |

Each scenario becomes a seeded attack case in the evaluation dataset with an expected verdict (Q3, Q26).

## 7. Measurable success criteria (Stage 3 release gates; never weakened to pass)

| # | Criterion | Target |
|---|---|---|
| S1 | Detection rate on the seeded attack set, scenarios 1–4 | ≥ 95 % |
| S2 | False-positive rate on the seeded legitimate set | ≤ 5 % |
| S3 | Capture-to-verdict latency, online, including satellite calls | ≤ 30 s |
| S4 | Certificate page recomputes and confirms the hash chain in the browser | < 3 s |
| S5 | Live end-to-end demo (register plot → capture → verdict → batch → transfer → certificate) with no manual database edits | < 10 min |
| S6 | Every anchored record is independently re-verifiable from the certificate page alone | 100 % |
| S7 | Evaluation harness runs with one command and generates its report from real output | Yes |

### 7.1 The demo script the criteria serve
1. Show a registered plot in Kodagu with its deforestation and cultivation checks (green).
2. Field agent captures a real harvest event on a phone → Verified in under 30 s, with evidence lines.
3. Submit the four attack cases → each Rejected or flagged, with the specific evidence that caught it.
4. Aggregate the verified events into a batch, transfer custody to the buyer.
5. Buyer opens the certificate, scans the QR on a second device; the visitor's browser recomputes the chain and shows it matches the anchored root. Download the EUDR GeoJSON.
6. Show the evaluation scorecard.

## 8. Constraints (given, not chosen)

- **Stack:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Drizzle ORM. SQLite via **libSQL (file-backed)** so a hosted swap costs nothing — Q11.
- **Hosting (user decision, sole option):** **Oracle Cloud Always Free, Ampere A1** — currently 2 OCPU / 12 GB RAM / up to 200 GB block storage, ARM (aarch64). Implications: Foundry must use its Linux aarch64 build; a keep-busy cron is needed to avoid idle reclamation; Indian regions frequently report "out of capacity", so **sign up and provision early** (see Risks).
- **Third-party data, free tiers only:** Global Forest Watch Data API (deforestation), Copernicus Data Space Sentinel Hub Statistical API (NDVI; 10,000 processing units/month), Esri World Imagery via ArcGIS Location Platform free tier with MapTiler free as fallback (basemap) — Q7, Q25, Q34.
- **Machine rule:** everything lives on `/Volumes/E Drive`; no internal-disk caches.
- **Timeline:** no external deadline given. Plan: working public demo **6 weeks from build start**, Milestone 1 demonstrable at week 3 — Q18.
- **Repository:** private GitHub repo, proprietary, all rights reserved for now — Q31.

## 9. Decisions settled in discovery that Stage 2 inherits

These are solution-level decisions the interview settled because the brief pre-specified the architecture. They are recorded in `decisions.md` (`DISC#`) so Stage 2 does not re-litigate them without new evidence. Summary:

| Q | Decision |
|---|---|
| Q5 | Client-side signing: per-device non-extractable ECDSA P-256 key in WebCrypto/IndexedDB; every capture signed over (photo hash + GPS + timestamp + plot id + previous capture hash), forming a per-device hash chain; EXIF extracted for cross-checks |
| Q6 | Browser Geolocation accepted; the verifier's job is to score its trustworthiness (accuracy radius, geo-fence containment, movement plausibility, EXIF vs browser GPS, satellite) |
| Q8 | Ledger behind one interface with two adapters: append-only hash-chain store in SQLite with Merkle checkpoints (Milestone 1 default), Foundry/Anvil EVM with Solidity contracts (Milestone 2) |
| Q19 | 0–100 integrity score from named weighted checks with evidence strings; three-state verdict; hard-fail checks; rejections and signed admin overrides are anchored |
| Q20 | Configurable per-crop yield reference table (Coffee Board of India figures, verified in Stage 6); flag above 1.5× upper bound, hard-fail above 2× |
| Q21 | Plots as GeoJSON polygons; Leaflet + react-leaflet + leaflet-draw; satellite basemap |
| Q22 | Batch = admin-aggregated set of Verified events; batch score = min(event scores); two custody hops in M1 |
| Q23 | Device enrolment via one-time code; device revocation recorded |
| Q24 | Photos only; hash and sign exactly the uploaded bytes; `MediaStore` interface, local disk first. *Downscale clause superseded by S1 (original bytes, ≤ 10 MB) after the hosting change.* |
| Q25 | Hosted query APIs (no raster processing); `RemoteSensingProvider` interface with fixture provider and per-plot cache table |
| Q27 | `/verify/{batchId}` public route; QR encodes URL + short hash; print stylesheet, no PDF library |
| Q28 | Escrow contract with mock ERC-20 INR; buyer-signed quality attestation; disputes roadmap |
| Q30 | Better Auth, self-hosted, Drizzle adapter, email + password, seeded demo accounts, role column |
| Q35 | Satellite cadence: deforestation once per plot (cached until polygon changes); NDVI 12-month history at registration; ±30-day NDVI window per harvest event, cached per plot per month |

## 10. Operating cost model

**Scope (Q32):** run cost only as the headline; build tooling already paid shown separately; labour excluded (belongs in the RDI budget template).
**Assumptions:** ₹100 ≈ €1, ₹85 ≈ $1 (update at budgeting time). Pilot = 1 FPO, 300 farmers, 500 plots, 3,000 captures/season, 3 photos/capture at ~400 KB, 50 batches. Scale-out = 10 FPOs, ~10× pilot. Season = ~4 months of captures.

### 10.1 Monthly run cost (INR)

| Line | Demo (weeks 1–12) | Pilot (1 FPO) | Scale-out (10 FPOs) | Basis |
|---|---|---|---|---|
| Compute: Oracle Cloud Always Free, Ampere A1 (2 OCPU, 12 GB) | ₹0 | ₹0 | ₹0 | Always Free allowance (halved June 2026, still sufficient) |
| Block storage on the instance (photos + libSQL) | ₹0 | ₹0 (~3.6 GB/season) | ₹0 up to 200 GB total (~36 GB/season) | Always Free block-volume allowance |
| Domain `.in` | ~₹75 (₹900/yr) | ~₹75 | ~₹75 | Regular price ₹500–900/yr |
| HTTPS / DNS (Caddy + Let's Encrypt, or Cloudflare DNS) | ₹0 | ₹0 | ₹0 | Free |
| Deforestation data: Global Forest Watch Data API | ₹0 | ₹0 | ₹0 | Free, open; key required |
| Vegetation data: Copernicus Sentinel Hub Statistical API | ₹0 | ₹0 (~7,000 PU/season, ≤ 10,000 PU/month) | **₹0 or paid** (~70,000 PU/season ≈ 12k–18k PU in peak months, may exceed free tier) | Free account 10,000 PU/month |
| Basemap tiles: Esri (ArcGIS Location Platform free tier) / MapTiler free | ₹0 | ₹0 | ₹0 (admin-only drawing stays far below 100k tiles/mo) | Free tiers; MapTiler non-commercial only |
| Auth, email | ₹0 | ₹0 | ₹0 | Self-hosted Better Auth, no email provider in MVP |
| **Total run cost** | **≈ ₹75 / month** | **≈ ₹75 / month** | **≈ ₹75 / month + satellite overage if any** | |
| **Annual** | **≈ ₹900** | **≈ ₹900** | **≈ ₹900 + overage** | |

### 10.2 Already-paid tooling (not incremental)
Claude subscription (build), GitHub free private repo, macOS dev machine.

### 10.3 Contingency lines — activated only if (Q37)

| Trigger | Line | Estimated cost |
|---|---|---|
| Sentinel Hub free tier exceeded in peak harvest months at scale-out | Copernicus paid plan | Price to confirm; budget ~₹2,500/month placeholder |
| Esri free tier unavailable or quota exceeded | MapTiler paid / Esri paid tier | From ~₹2,500/month |
| Photos exceed instance block storage | Oracle Object Storage beyond the 20 GB free allowance | ~₹2/GB/month → ~₹80/month at 40 GB |
| Single-instance database becomes a risk | Managed libSQL (Turso) | Free tier likely sufficient; paid from ~₹2,000/month |
| Oracle reclaims or cannot provision the Always Free instance | **No paid hosting line by user decision.** Mitigations: provision early; keep-busy cron; upgrade the account to Pay-As-You-Go (Always Free resources remain free and idle reclamation is reported not to apply — to confirm) | ₹0 |

### 10.4 Sources
Hetzner-class VPS pricing was gathered for comparison and then excluded by decision. Oracle: [InfoQ, July 2026](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/), [Always Free review 2026](https://space-node.net/blog/oracle-vps-free-tier-review-2026). Copernicus: [CDSE FAQ](https://documentation.dataspace.copernicus.eu/FAQ.html), [PU calculator](https://dataspace.copernicus.eu/cases/sentinel-hub-pu-calculator-demystifying-your-costs). GFW: [Data API listing](https://developer.openepi.io/data-catalog/resource/0809e814-6890-4ce6-a513-174d91ba158e). MapTiler: [pricing](https://www.maptiler.com/cloud/pricing/). Domain: [.in price list](https://www.chennaihost.com/domains-price-list.html).

## 11. Risks and open items

| # | Risk / open item | Mitigation / owner |
|---|---|---|
| R1 | Oracle Always Free capacity in Mumbai/Hyderabad is frequently unavailable; provisioning can take days | Create the account and provision the A1 instance **before Stage 7 starts**; retry script; consider PAYG upgrade (₹0 within limits) — Tushar |
| R2 | Oracle can change Always Free limits without notice (did so June 2026) | Keep the app within 2 OCPU / 12 GB; ledger and DB are files, so migration is a copy |
| R3 | Domain availability unverified | Check `udgam.in` / `udgamtrace.in` at a registrar — Tushar |
| R4 | Free API accounts not yet created (GFW key, Copernicus Data Space, ArcGIS Location Platform) | Create before Stage 7; fixture provider keeps the slice demonstrable if any is delayed — Tushar |
| R5 | EUDR application dates and DDS field list may have shifted | Re-verify from the EU primary source in Stage 2 |
| R6 | Coffee yield reference figures asserted from memory | Verify against Coffee Board of India in Stage 6 before seeding the table |
| R7 | Browser GPS is spoofable by design | This is the product thesis: score it, don't trust it; native attestation is the roadmap work package |
| R8 | Shade-grown coffee confounds tree-cover-loss signals | Use loss-since-2020 *within the polygon* plus NDVI continuity, and report evidence rather than a binary; document as an R&D finding |
| R9 | Foundry on ARM Linux | Foundry publishes linux-aarch64 binaries; validate on the instance early in Milestone 2 |

## 12. Timeline (indicative, no hard external date)

| Week | Milestone |
|---|---|
| 0 | Stages 2–6: Solution PRD, evaluation plan, UI/UX design, breakdown, technical plan; accounts and Oracle instance provisioned |
| 1–3 | Milestone 1 vertical slice + evaluation harness |
| 4 | Milestone 2 contract farming on Anvil, processor hop |
| 5–6 | Milestone 3 public deployment, seeding, scorecard, demo rehearsal |

## 13. Sign-off

- [x] Problem, users, scope, out-of-scope, success criteria approved by Tushar Pathak
- [x] Hosting decision (Oracle Always Free only) confirmed
- [x] Next stage: Stage 2 Solution Design (`bw-solution-design`), model Fable / High
