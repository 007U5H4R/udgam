# Test Cases — Udgam

**Stage:** 6 · Technical Planning · **Ticket:** TASK-1 · **Status:** approved with the Stage 6 plan (2026-09-29); every case stays `Not run` until Stage 7. **Date:** 2026-09-29

**IDs.** `TC-###` is owned by this file and never renumbered or reused. A web-deliverables contract name, where one applies, follows in brackets, e.g. [TC-UI-RESPONSIVE]. Findings use `DES-`, `CR-`, `QA-`, `SEC-`.

**Tests vs evals.** `TC-` cases check that a unit or flow behaves as specified; `EVAL-` cases (`evals/eval-dataset.json`) measure outcomes against the release gates. Where an EVAL case already specifies a behaviour, the TC links to it and adds only what the EVAL case does not cover (evaluation-plan §3). Cases are prioritised by real risk, not padded.

**Expected values** come from `Solution-PRD.md`, `technical-plan.md` (§4–§8, `cfg-1`) and the dataset. They are asserted as fixed values, never recomputed with the code under test.

**Legend.** Links = Milestone · Ticket · native task · EVAL. Type = unit / integration / e2e / static / ci / contract / manual. Pri = P0–P3. Auto = A (automated) / M (manual, with recorded evidence). Status: Not run → Pass / Fail / Blocked (reason). Finding: the `DES-/CR-/QA-/SEC-` ID if the case fails.

## Index
| ID | Title | Links | Type | Pri | Auto |
|---|---|---|---|---|---|
| TC-001 | Health route reports database, ledger and provider status | M-001 · TKT-01 · TASK-2 | integration | P0 | A |
| TC-002 | Cloud setup script is idempotent | M-001 · TKT-01 · TASK-2 | ci | P1 | A |
| TC-003 | CI gates run and a planted secret fails the build | M-001 · TKT-01 · TASK-2 · EVAL-083 | ci | P0 | A |
| TC-004 | Design tokens equal the frozen mockup `:root` | M-001 · TKT-01 · TASK-2 | static | P1 | A |
| TC-005 | `src/lib` imports nothing from Next.js | M-001 · TKT-01 · TASK-2 | static | P1 | A |
| TC-006 | Canonical JSON, hashes and signatures agree in Node and the browser | M-001 · TKT-02 · TASK-3 · EVAL-066 | unit + e2e | P0 | A |
| TC-007 | Signature is checked over the exact canonical bytes | M-001 · TKT-02 · TASK-3 · EVAL-053 | unit | P0 | A |
| TC-008 | Hash-chain append: formula, serialised concurrency, append-only | M-001 · TKT-02 · TASK-3 | integration | P0 | A |
| TC-009 | Scorer: weighted mean, thresholds, hard fail and every cap | M-001 · TKT-02 · TASK-3 | unit | P0 | A |
| TC-010 | Capture transaction is atomic and the anchor FK holds | M-001 · TKT-02 · TASK-3 · EVAL-067 | integration | P0 | A |
| TC-011 | Evidence templates name value and threshold for every check × status | M-001 · TKT-02/07/08/09 | unit | P0 | A |
| TC-012 | A throwing check becomes `unavailable` and the run continues | M-001 · TKT-02 · TASK-3 · EVAL-018 | unit | P0 | A |
| TC-013 | Tracer bullet: a seeded phone signs a picking and sees Verified | M-001 · TKT-02 · TASK-3 · EVAL-001, 002 | e2e | P0 | A |
| TC-014 | Mutation engine applies each op exactly and results are order-independent | M-001 · TKT-03 · TASK-4 | unit | P0 | A |
| TC-015 | Harness never hides a case | M-001 · TKT-03 · TASK-4 · EVAL-092 | unit | P0 | A |
| TC-016 | Results carry provenance; the report re-derives from results alone | M-001 · TKT-03 · TASK-4 · EVAL-091 | integration | P0 | A |
| TC-017 | Dataset schema validation gates CI | M-001 · TKT-03 · TASK-4 | ci | P1 | A |
| TC-018 | Role guards protect pages, Server Actions and route handlers | M-001 · TKT-04 · TASK-5 · EVAL-080 | integration | P0 | A |
| TC-019 | Organisation scoping: cross-org IDs return 404 | M-001 · TKT-04 · TASK-5 · EVAL-080 | integration | P0 | A |
| TC-020 | Sign-in and sign-out; `/verify` stays public | M-001 · TKT-04 · TASK-5 | e2e | P1 | A |
| TC-021 | Enrolment codes: hashed, single-use, 24 h, rate-limited | M-001 · TKT-05 · TASK-6 · EVAL-082 | integration | P0 | A |
| TC-022 | Enrolment creates a non-extractable key and anchors `device_enrolled` | M-001 · TKT-05 · TASK-6 | e2e | P0 | A |
| TC-023 | Unknown or revoked keys are refused at the boundary and anchored | M-001 · TKT-05 · TASK-6 · EVAL-051, 052 | integration | P0 | A |
| TC-024 | A capture for an unassigned plot is refused and anchored | M-001 · TKT-05 · TASK-6 · EVAL-054 | integration | P0 | A |
| TC-025 | First-run language sheet during enrolment | M-001 · TKT-05 · TASK-6 | e2e | P2 | A |
| TC-026 | Plot upload: valid GeoJSON/KML parsed, invalid geometry refused with a reason | M-001 · TKT-06 · TASK-7 | unit | P1 | A |
| TC-027 | Area in hectares matches a geodesic reference | M-001 · TKT-06 · TASK-7 | unit | P1 | A |
| TC-028 | Editing a polygon anchors `plot_edited`, marks checks stale and misses the cache | M-001 · TKT-06/07 · TASK-7/8 · EVAL-044 | integration | P0 | A |
| TC-029 | Plot drawing and editing without dragging (WCAG 2.5.7) | M-001 · TKT-06 · TASK-7 | e2e | P1 | A |
| TC-030 | GFW adapter request and response parsing | M-001 · TKT-07 · TASK-8 | unit | P1 | A |
| TC-031 | Sentinel Hub adapter: NDVI parsing and cloud-blocked windows | M-001 · TKT-07 · TASK-8 · EVAL-015 | unit | P1 | A |
| TC-032 | Provider timeouts, errors and malformed bodies never reject | M-001 · TKT-07 · TASK-8 · EVAL-016, 017 | unit | P0 | A |
| TC-033 | Remote-sensing cache avoids repeat calls | M-001 · TKT-07 · TASK-8 | integration | P1 | A |
| TC-034 | Registration runs forest loss and 12-month NDVI and anchors them | M-001 · TKT-07 · TASK-8 | integration | P0 | A |
| TC-035 | EXIF extraction from real photo fixtures | M-001 · TKT-08 · TASK-9 | unit | P0 | A |
| TC-036 | Location rules at every threshold pair | M-001 · TKT-08 · TASK-9 · EVAL-005, 009, 010, 014, 023, 025, 026, 027 | unit | P0 | A |
| TC-037 | Time and movement rules at every threshold pair | M-001 · TKT-08 · TASK-9 · EVAL-011, 013, 028, 033, 034, 055–057 | unit | P0 | A |
| TC-038 | Yield season window, conversion and thresholds | M-001 · TKT-09 · TASK-10 · EVAL-012, 045–050 | unit | P0 | A |
| TC-039 | Yield reference table is seeded from a cited source | M-001 · TKT-09 · TASK-10 | integration | P1 | A |
| TC-040 | Retrying an identical signed payload is idempotent | M-001 · TKT-09 · TASK-10 · EVAL-068 | integration | P0 | A |
| TC-041 | Chain continuity, including a re-enrolled phone and a stale sequence | M-001 · TKT-09 · TASK-10 · EVAL-021, 035 | unit | P0 | A |
| TC-042 | Photo uniqueness across agents and plots | M-001 · TKT-09 · TASK-10 · EVAL-030–032 | integration | P0 | A |
| TC-043 | Uploaded bytes are the signed bytes | M-001 · TKT-10 · TASK-11 | integration | P0 | A |
| TC-044 | Capture flow at 375 px matches the approved screens [TC-UI-RESPONSIVE] | M-001 · TKT-10 · TASK-11 · EVAL-086 | e2e | P0 | A |
| TC-045 | Checking screen shows the real checks as they finish | M-001 · TKT-10 · TASK-11 | e2e | P1 | A |
| TC-046 | 320 × 568 keeps the primary action visible | M-001 · TKT-10 · TASK-11 | e2e | P1 | A |
| TC-047 | GPS starts with the record flow and a weak fix never blocks capture | M-001 · TKT-10 · TASK-11 | e2e | P1 | A |
| TC-048 | Not accepted verdict follows the D5 template | M-001 · TKT-10 · TASK-11 | e2e | P1 | A |
| TC-049 | The capture app is installable | M-001 · TKT-10 · TASK-11 | e2e | P2 | A |
| TC-050 | A failed send keeps everything and Try again works once | M-001 · TKT-11 · TASK-12 · EVAL-068 | e2e | P0 | A |
| TC-051 | Pickings list and detail in all four states [TC-UI-EMPTY, TC-UI-ERROR] | M-001 · TKT-11 · TASK-12 · EVAL-088 | e2e | P1 | A |
| TC-052 | Language switch and externalised strings | M-001 · TKT-11 · TASK-12 | static + e2e | P1 | A |
| TC-053 | Tab bar navigation and Help content [TC-UI-MOBILE-NAV] | M-001 · TKT-11 · TASK-12 | e2e | P2 | A |
| TC-054 | Review queue and detail show the evidence an admin needs | M-001 · TKT-12 · TASK-13 · EVAL-088 | e2e | P1 | A |
| TC-055 | Override needs a public-safe reason and is signed and anchored | M-001 · TKT-12 · TASK-13 · EVAL-075 | integration + e2e | P0 | A |
| TC-056 | A hard-failed rejection cannot be overridden anywhere | M-001 · TKT-12 · TASK-13 · EVAL-076 | integration | P0 | A |
| TC-057 | Re-run retries only unavailable providers | M-001 · TKT-12 · TASK-13 · EVAL-069 | integration | P1 | A |
| TC-058 | Organic certificate is an anchored attestation and never "verified" | M-001 · TKT-13 · TASK-14 · EVAL-079 | integration + static | P0 | A |
| TC-059 | Batch invariants are enforced by the database | M-001 · TKT-14 · TASK-15 · EVAL-077 | integration | P0 | A |
| TC-060 | Custody transfer is signed, anchored and locks the batch; buyers see only theirs | M-001 · TKT-14 · TASK-15 · EVAL-080 | integration + e2e | P0 | A |
| TC-061 | Merkle roots and proofs for every leaf of trees of 1–300 entries | M-001 · TKT-15 · TASK-16 | unit | P0 | A |
| TC-062 | Checkpoints every 100 entries and on demand, signed and linked | M-001 · TKT-15 · TASK-16 | integration | P0 | A |
| TC-063 | Proof feed: complete closure, forced checkpoint, identical 404s | M-001 · TKT-15 · TASK-16 · EVAL-064, 065 | integration | P0 | A |
| TC-064 | Ledger key: generated once outside the repo, never logged, published | M-001 · TKT-15 · TASK-16 | integration | P0 | A |
| TC-065 | Certificate verifies in the browser and names the failing step on tamper | M-001 · TKT-16 · TASK-17 · EVAL-058–063 | e2e | P0 | A |
| TC-066 | Certificate layout: proof first on phones, no horizontal scroll [TC-UI-RESPONSIVE] | M-001 · TKT-16 · TASK-17 · EVAL-087 | e2e | P1 | A |
| TC-067 | No farmer personal data on public outputs | M-001 · TKT-16/17 · TASK-17/18 · EVAL-084 | integration + e2e | P0 | A |
| TC-068 | Every displayed certificate fact comes from the verified feed | M-001 · TKT-16 · TASK-17 | integration | P1 | A |
| TC-069 | QR code encodes the absolute certificate URL with `h` | M-001 · TKT-16 · TASK-17 | unit | P1 | A |
| TC-070 | EUDR GeoJSON conforms to the TP24 field list | M-001 · TKT-17 · TASK-18 · EVAL-078 | integration | P1 | A |
| TC-071 | Printed certificate is light and legible | M-001 · TKT-17 · TASK-18 · EVAL-087 | e2e | P2 | A |
| TC-072 | Link-preview tags and asset [TC-WEB-OG-METADATA, TC-WEB-OG-ASSET] | M-001 · TKT-17 · TASK-18 · EVAL-090 | integration | P1 | A |
| TC-073 | Clean-room checker is independent and catches every tamper | M-001 · TKT-18 · TASK-19 · EVAL-058–063 | unit + static | P0 | A |
| TC-074 | Upload validation refuses malformed input before verification | M-001 · TKT-19 · TASK-20 · EVAL-081 | integration | P0 | A |
| TC-075 | No secrets in logs or the client bundle; dependency audit gate | M-001 · TKT-19 · TASK-20 · EVAL-083, 085 | ci | P0 | A |
| TC-076 | Security headers and CSP | M-001 · TKT-19 · TASK-20 | integration | P1 | A |
| TC-077 | Seed builds the Kodagu demo state from nothing, repeatably | M-001 · TKT-20 · TASK-21 | integration | P1 | A |
| TC-078 | Automated demo end to end at 375 and 1280 px | M-001 · TKT-20 · TASK-21 · EVAL-073, 074 | e2e | P0 | A |
| TC-079 | M-001 gate run and baseline-v1 freeze | M-001 · TKT-21 · TASK-22 | ci + manual | P0 | A + M |
| TC-080 | No horizontal scroll on any surface [TC-UI-RESPONSIVE] | M-001 · all UI tickets | e2e | P1 | A |
| TC-081 | Accessibility scan of every surface | M-001 · all UI tickets · EVAL-089 | e2e | P1 | A |
| TC-082 | BatchRegistry contract | M-002 · TKT-24 · TASK-25 | contract | P2 | A |
| TC-083 | EVM ledger adapter keeps every M-001 proof guarantee | M-002 · TKT-24 · TASK-25 · EVAL-103, 104 | integration | P2 | A |
| TC-084 | ContractFarming releases only when all three conditions hold | M-002 · TKT-25 · TASK-26 · EVAL-093–099 | contract + integration | P2 | A |
| TC-085 | Agreement and settlement screens | M-002 · TKT-25 · TASK-26 · EVAL-105 | e2e | P2 | A |
| TC-086 | Processor hop with mass-balance band | M-002 · TKT-26 · TASK-27 · EVAL-100–102 | integration + e2e | P2 | A |
| TC-087 | Production stack on Oracle A1: HTTPS, persistence, streaming | M-003 · TKT-27 · TASK-28 | manual | P1 | M |
| TC-088 | Backup and restore drill | M-003 · TKT-27 · TASK-28 | manual | P1 | M |
| TC-089 | One-command redeploy and rollback | M-003 · TKT-27 · TASK-28 | manual | P1 | M |
| TC-090 | Health alert reaches the owner during an outage drill | M-003 · TKT-28 · TASK-29 | manual | P1 | M |
| TC-091 | Link unfurls on production [TC-WEB-OG-UNFURL] | M-003 · TKT-28 · TASK-29 · EVAL-090 | manual | P1 | M |
| TC-092 | Production configuration: secrets only in env, live providers, audit clean | M-003 · TKT-28 · TASK-29 · EVAL-085 | manual + ci | P1 | A + M |
| TC-093 | Photo staging endpoint: validation, ownership, caps and expiry | M-001 · TKT-30 · TASK-31 | integration | P1 | A |
| TC-094 | Capture with staged photos: same verdict, bytes re-hashed, expiry falls back | M-001 · TKT-30 · TASK-31 · EVAL-070 | integration + e2e | P1 | A |

Not given a TC because an EVAL case already specifies them completely: S3 latency (EVAL-070), S4 latency (EVAL-071), S5 rehearsals (EVAL-072), the verifier attack and legitimate sets (harness). TKT-22 (spike) and TKT-23 (design addendum, approved as a D# decision) have no TC. TKT-29's evidence is EVAL-070/072.

---

## M-001 · Trust at the edge, end to end

### TC-001 · Health route reports database, ledger and provider status
- **Links:** M-001 · TKT-01 · TASK-2 (extended by TKT-07, TKT-15) · F14
- **Type/Pri/Auto:** integration · P0 · A
- **Objective:** a failure is visible at 3 AM without reading logs.
- **Preconditions:** temp libSQL file; fixture provider.
- **Steps:** GET `/api/health`; close the DB handle and GET again; (after TKT-15) remove the ledger key file and GET again.
- **Expected:** 200 `{db:"ok", ledger:{lastSeq, lastCheckpointAgeSec, keyPresent:true}, providers:{gfw:"fixture", sentinelHub:"fixture"}, version, commit}`; DB closed → 503 `db:"error"`; key missing → 503 `keyPresent:false`. No secret values in the body.
- **Status:** Not run · **Finding:** —

### TC-002 · Cloud setup script is idempotent
- **Links:** M-001 · TKT-01 · TASK-2 · S11
- **Type/Pri/Auto:** ci · P1 · A
- **Objective:** a fresh cloud session can prepare itself, and re-running is harmless.
- **Steps:** in a CI job on `ubuntu-latest`, run `bash scripts/cloud-setup.sh` twice, then `pnpm typecheck && pnpm test`.
- **Expected:** both runs exit 0; the second reports each step as already satisfied; tests pass; `git status --porcelain` is empty.
- **Status:** Not run · **Finding:** —

### TC-003 · CI gates run and a planted secret fails the build
- **Links:** M-001 · TKT-01 · TASK-2 · EVAL-083 · CF-09
- **Type/Pri/Auto:** ci · P0 · A
- **Objective:** the secret scan can actually fail.
- **Steps:** on a throwaway branch, commit a file with a fake key built to match a gitleaks rule; push; observe CI; delete the branch.
- **Expected:** the gitleaks job fails naming the file; typecheck, lint and test jobs run on every push. The CI run URL is recorded in the ledger.
- **Status:** Not run · **Finding:** —

### TC-004 · Design tokens equal the frozen mockup `:root`
- **Links:** M-001 · TKT-01 · TASK-2 · Design.md §12
- **Type/Pri/Auto:** static · P1 · A
- **Steps:** a Vitest test parses the `:root` custom properties from `.design/exploration/final/index.html` and from `src/app/tokens.css`.
- **Expected:** every mockup token exists in `tokens.css` with an identical value (whitespace-normalised); Figtree and Noto Sans Kannada are the configured families.
- **Status:** Not run · **Finding:** —

### TC-005 · `src/lib` imports nothing from Next.js
- **Links:** M-001 · TKT-01 · TASK-2 · S3
- **Type/Pri/Auto:** static · P1 · A
- **Expected:** an ESLint `no-restricted-imports` rule for `next`, `next/*` and `react` in `src/lib/**` passes; a planted import fails it.
- **Status:** Not run · **Finding:** —

### TC-006 · Canonical JSON, hashes and signatures agree in Node and the browser
- **Links:** M-001 · TKT-02 · TASK-3 · EVAL-066 · S9
- **Type/Pri/Auto:** unit + e2e · P0 · A
- **Data:** `evals/fixtures/crypto-vectors.json`: RFC 8785 examples (non-ASCII key ordering, `1e21`, `1e-7`, `-0`, `0.1`, escaped control characters, emoji), SHA-256 digests, a Node-made P-256 key pair and signatures.
- **Steps:** run the vectors in Vitest; load `e2e/crypto-vectors.html` in Chromium and run the same assertions via `page.evaluate`.
- **Expected:** 100 % agreement in both environments; browser-made signatures verify in Node and vice versa; `jcs` throws on `undefined`, `NaN` and `Infinity`.
- **Status:** Not run · **Finding:** —

### TC-007 · Signature is checked over the exact canonical bytes
- **Links:** M-001 · TKT-02 · TASK-3 · EVAL-053 · technical-plan Review focus 1
- **Type/Pri/Auto:** unit · P0 · A
- **Steps:** sign a payload; submit (a) the canonical string, (b) the same object re-serialised with different key order or whitespace, (c) the canonical string with `cherryKg` changed after signing.
- **Expected:** (a) accepted; (b) refused as `non_canonical` before signature verification; (c) `signature_valid` hard-fails.
- **Status:** Not run · **Finding:** —

### TC-008 · Hash-chain append: formula, serialised concurrency, append-only
- **Links:** M-001 · TKT-02 · TASK-3 · S7
- **Type/Pri/Auto:** integration · P0 · A
- **Steps:** append 3 entries and recompute `entry_hash` by hand from the spec formula; fire 20 appends concurrently; attempt `UPDATE` and `DELETE` on `ledger_entries` in raw SQL.
- **Expected:** hashes equal the independently computed values; the concurrent appends produce seq 1..23 with no gaps or duplicates and a valid prev-hash chain; UPDATE and DELETE abort with "ledger is append-only".
- **Status:** Not run · **Finding:** —

### TC-009 · Scorer: weighted mean, thresholds, hard fail and every cap
- **Links:** M-001 · TKT-02 · TASK-3 · S4, S10, TP2
- **Type/Pri/Auto:** unit · P0 · A
- **Data:** hand-built `CheckResult[]` lists.
- **Expected:** 12 ok → 100, Verified; one geofence `flag` → 95.8, Verified; one `fail` anywhere → 91.7 but Needs Review (cap `anyFail`); a `flag` on `deforestation_overlap` or `yield_plausibility` → Needs Review; any `unavailable` → Needs Review and excluded from the mean; any hard fail → Rejected even at 91.7; 79.9 → Needs Review, 80.0 → Verified, 49.9 → Rejected, 50.0 → Needs Review; `capReasons` lists each cap; `config.hash` equals `CONFIG_HASH`.
- **Status:** Not run · **Finding:** —

### TC-010 · Capture transaction is atomic and the anchor FK holds
- **Links:** M-001 · TKT-02 · TASK-3 · EVAL-067 · CF-08 · N7
- **Type/Pri/Auto:** integration · P0 · A
- **Steps:** (a) inject a failure into `ledger.append` for the `verification_run` entry during a capture; (b) in raw SQL, insert a `harvest_events` row whose `anchor_seq` does not exist.
- **Expected:** (a) a retryable error; no `harvest_events`, `media`, `verification_runs` or `ledger_entries` rows persisted; media files written by that request removed; (b) the insert fails on the foreign key.
- **Status:** Not run · **Finding:** —

### TC-011 · Evidence templates name value and threshold for every check × status
- **Links:** M-001 · TKT-02 (registry), TKT-07, TKT-08, TKT-09 · TASK-3/8/9/10 · GAP-8, TP3, HR1
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** each row of technical-plan §6.5 renders a sentence matching its snapshot, with the measured value in the evaluation-plan §7.4 unit format and, where one applies, the threshold; the dataset's `evidence_substrings` for EVAL-006, 009, 018, 019, 020, 022–025, 027, 028, 032, 037–040 and 045 all appear in the corresponding outputs. The owner scores rubric HR1 from these snapshots at Stage 9.
- **Status:** Not run · **Finding:** —

### TC-012 · A throwing check becomes `unavailable` and the run continues
- **Links:** M-001 · TKT-02 · TASK-3 · EVAL-018 · CF-03
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** a check that throws `TypeError` yields `{status:'unavailable', evidence:'Check could not run: TypeError'}`; the other checks complete; the verdict is Needs Review, never Rejected; `verify()` resolves.
- **Status:** Not run · **Finding:** —

### TC-013 · Tracer bullet: a seeded phone signs a picking and sees Verified
- **Links:** M-001 · TKT-02 · TASK-3 · EVAL-001, 002
- **Type/Pri/Auto:** e2e · P0 · A
- **Preconditions:** seeded device key (test-only injection into IndexedDB), seeded plot P01, geolocation mocked inside P01, a fixture JPEG with matching EXIF.
- **Steps:** open the minimal capture page; attach the photo; enter 42.5 kg; submit.
- **Expected:** the page shows Verified with evidence lines; one `harvest_events`, one `media` and one `verification_runs` row and two ledger entries exist; the stored payload equals the signed string.
- **Status:** Not run · **Finding:** —

### TC-014 · Mutation engine applies each op exactly and results are order-independent
- **Links:** M-001 · TKT-03 · TASK-4 · EV8
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** one test per op in evaluation-plan §7.3 asserts the precise change to `(Submission, VerifyContext)` — e.g. `gps_place outside_edge 2400` puts the point 2400 ± 1 m from the nearest edge, outside; `season_cumulative 2.05` yields a ratio of 2.05 ± 0.001; an unknown op throws; two runs with different shuffle seeds give identical per-case results.
- **Status:** Not run · **Finding:** —

### TC-015 · Harness never hides a case
- **Links:** M-001 · TKT-03 · TASK-4 · EVAL-092 · CF-12
- **Type/Pri/Auto:** unit · P0 · A
- **Steps:** run the harness with one check disabled and one case whose setup throws.
- **Expected:** cases needing the disabled check are `not_yet_implemented` and count as failed for gates; the throwing case is `errored`; `active = passed + failed + errored`, `skipped = 0`; exit code non-zero.
- **Status:** Not run · **Finding:** —

### TC-016 · Results carry provenance; the report re-derives from results alone
- **Links:** M-001 · TKT-03 · TASK-4 · EVAL-091 · S7
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** the results file has every evaluation-plan §12 provenance field; running `evals/harness/report.ts <results.json>` twice gives byte-identical Markdown whose numbers equal the results file's; a second run on the same commit writes `-r2` instead of overwriting.
- **Status:** Not run · **Finding:** —

### TC-017 · Dataset schema validation gates CI
- **Links:** M-001 · TKT-03 · TASK-4 · EV14
- **Type/Pri/Auto:** ci · P1 · A
- **Expected:** `pnpm eval:validate` passes on the committed dataset; a copy with an unknown mutation op or a duplicate ID fails naming the offending path.
- **Status:** Not run · **Finding:** —

### TC-018 · Role guards protect pages, Server Actions and route handlers
- **Links:** M-001 · TKT-04 · TASK-5 · EVAL-080 · CF-10
- **Type/Pri/Auto:** integration · P0 · A
- **Steps:** for each role (none, agent, admin, buyer), call every page under `/field`, `/admin`, `/buyer`, every exported Server Action and every non-public route handler.
- **Expected:** only the owning role succeeds; others get a redirect (pages) or 401/403 (actions, handlers); `/verify/*`, `/api/verify/*`, `/.well-known/*` and `/api/health` stay public; `tests/guard-coverage.test.ts` finds no unguarded action.
- **Status:** Not run · **Finding:** —

### TC-019 · Organisation scoping: cross-org IDs return 404
- **Links:** M-001 · TKT-04 · TASK-5 (applied by every later data ticket) · EVAL-080
- **Type/Pri/Auto:** integration · P0 · A
- **Data:** two FPOs and two buyers seeded.
- **Expected:** an FPO-A admin requesting FPO-B's plot, run, batch or device by ID gets 404; buyer A cannot list or open buyer B's batches; no response body leaks the other org's data.
- **Status:** Not run · **Finding:** —

### TC-020 · Sign-in and sign-out; `/verify` stays public
- **Links:** M-001 · TKT-04 · TASK-5
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** each seeded role signs in and lands on its home (`/field`, `/admin`, `/buyer`); a wrong password shows an inline error without saying which field was wrong; sign-out clears the session; a certificate URL opens without signing in. The sign-in screen uses the frozen visual language (TP17).
- **Status:** Not run · **Finding:** —

### TC-021 · Enrolment codes: hashed, single-use, 24 h, rate-limited
- **Links:** M-001 · TKT-05 · TASK-6 · EVAL-082 · CF-05
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** the DB stores only the code's hash; a used code fails; a code at 24 h + 1 s fails (clock injected); the 6th wrong attempt on a code and the 11th per IP per hour are refused with 429; each refusal is logged without the code value.
- **Status:** Not run · **Finding:** —

### TC-022 · Enrolment creates a non-extractable key and anchors `device_enrolled`
- **Links:** M-001 · TKT-05 · TASK-6 · F3
- **Type/Pri/Auto:** e2e · P0 · A
- **Expected:** after a valid code, IndexedDB holds a `CryptoKey` with `extractable:false`; `crypto.subtle.exportKey` on it rejects; the server has the public JWK and thumbprint; a `device_enrolled` ledger entry exists whose payload carries only the device ID, the agent's user ID (`agentId`: an opaque random ID, never an email, name or organisation name, EV16) and the key thumbprint (amended by EXE13).
- **Status:** Not run · **Finding:** —

### TC-023 · Unknown or revoked keys are refused at the boundary and anchored
- **Links:** M-001 · TKT-05 · TASK-6 · EVAL-051, 052 · CF-05
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** a capture signed by a never-enrolled key and one from a revoked device each return 4xx with `unknown_device` / `device_revoked`; each creates a `harvest_events` row with `boundary_status='rejected'` and a ledger entry; no verification run is created; the revocation itself is anchored as `device_revoked`.
- **Status:** Not run · **Finding:** —

### TC-024 · A capture for an unassigned plot is refused and anchored
- **Links:** M-001 · TKT-05 · TASK-6 · EVAL-054 · TP5 (GAP-2)
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** agent B's valid device submitting for agent A's plot → 403 `plot_not_assigned`; the rejected event is anchored; the Not-accepted message names the plot assignment; after the admin assigns the plot to B, the same capture shape is accepted.
- **Status:** Not run · **Finding:** —

### TC-025 · First-run language sheet during enrolment
- **Links:** M-001 · TKT-05 · TASK-6
- **Type/Pri/Auto:** e2e · P2 · A
- **Expected:** the sheet offers ಕನ್ನಡ / English before the code screen; the choice sets `lang` and persists across reloads; it is not shown again.
- **Status:** Not run · **Finding:** —

### TC-026 · Plot upload: valid GeoJSON/KML parsed, invalid geometry refused with a reason
- **Links:** M-001 · TKT-06 · TASK-7 · F1
- **Type/Pri/Auto:** unit · P1 · A
- **Data:** valid Polygon, MultiPolygon, KML with one placemark; open ring; self-intersecting bow-tie; projected coordinates (values > 180); > 1000 vertices; empty file.
- **Expected:** valid inputs normalise to a WGS84 Polygon/MultiPolygon with closed rings; each invalid input is refused with a plain reason naming the problem.
- **Status:** Not run · **Finding:** —

### TC-027 · Area in hectares matches a geodesic reference
- **Links:** M-001 · TKT-06 · TASK-7
- **Type/Pri/Auto:** unit · P1 · A
- **Expected:** for the P01 (2.0 ha), P04 (1.2 ha, concave) and P10 (4.0 ha) fixtures, the computed area is within 0.5 % of the stated area; displayed to 2 decimals.
- **Status:** Not run · **Finding:** —

### TC-028 · Editing a polygon anchors `plot_edited`, marks checks stale and misses the cache
- **Links:** M-001 · TKT-06 + TKT-07 · TASK-7/8 · EVAL-044
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** after editing P01 to cover an area with 18.0 % loss: a `plot_edited` entry is anchored; `registration_stale=1` until the re-run completes; the forest-loss query re-runs because the geometry hash changed; the registration check shows the loss; the next capture on the plot is Rejected by `deforestation_overlap` (hard fail).
- **Status:** Not run · **Finding:** —

### TC-029 · Plot drawing and editing without dragging (WCAG 2.5.7)
- **Links:** M-001 · TKT-06 · TASK-7
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** with tiles stubbed, an admin can add a vertex, remove a vertex and move the selected vertex with buttons and arrow keys only; focus is visible; the area updates; saving works.
- **Status:** Not run · **Finding:** —

### TC-030 · GFW adapter request and response parsing
- **Links:** M-001 · TKT-07 · TASK-8 · DISC7
- **Type/Pri/Auto:** unit · P1 · A
- **Expected:** the outgoing request (URL, method, headers except the key value, SQL, geometry) equals the shape in technical-plan §7; a recorded real response parses to `{lossHa, lossPct, yearsFrom:2021, dataYear}`; the API key never appears in logs.
- **Status:** Not run · **Finding:** —

### TC-031 · Sentinel Hub adapter: NDVI parsing and cloud-blocked windows
- **Links:** M-001 · TKT-07 · TASK-8 · EVAL-015
- **Type/Pri/Auto:** unit · P1 · A
- **Expected:** a recorded Statistical API response parses to monthly means with clear fractions; an interval with no valid samples yields `mean:null`; a harvest window with zero clear observations makes `ndvi_harvest_window` `unavailable` with the cloud evidence sentence.
- **Status:** Not run · **Finding:** —

### TC-032 · Provider timeouts, errors and malformed bodies never reject
- **Links:** M-001 · TKT-07 · TASK-8 · EVAL-016, 017 · CF-03 · S6
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** with fake timers, a call that never answers is aborted at 8 s and the remote phase ends by 10 s; timeout, HTTP 500 and malformed JSON each make the check `unavailable`, list the provider in `unavailableProviders`, cap the verdict at Needs Review and never produce Rejected.
- **Status:** Not run · **Finding:** —

### TC-033 · Remote-sensing cache avoids repeat calls
- **Links:** M-001 · TKT-07 · TASK-8 · N1
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** two captures on one plot in the same month make one harvest-window call; forest loss is fetched once per geometry; a different month or an edited polygon misses the cache.
- **Status:** Not run · **Finding:** —

### TC-034 · Registration runs forest loss and 12-month NDVI and anchors them
- **Links:** M-001 · TKT-07 · TASK-8 · F2
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** saving a plot stores `registration_checks` with the loss %, the NDVI history summary and their evidence, and anchors them in a `plot_edited` entry that carries the current geometry (including `polygon`) plus `registrationChecksHash` (amended by EXE18); a provider failure at registration saves the plot with the check marked unavailable and a re-run control.
- **Status:** Not run · **Finding:** —

### TC-035 · EXIF extraction from real photo fixtures
- **Links:** M-001 · TKT-08 · TASK-9 · TP25 · technical-plan Review focus 7, 8
- **Type/Pri/Auto:** unit · P0 · A
- **Data:** `evals/fixtures/photos/`: JPEG with GPS + DateTimeOriginal + OffsetTimeOriginal; JPEG with DateTimeOriginal and no offset; JPEG with no EXIF; HEIC sample.
- **Expected:** GPS in decimal degrees to 6 dp; a time with an offset converts exactly; a time without an offset is read as +05:30; no EXIF yields `{gps:null, takenAt:null}` without throwing; HEIC is recognised by magic bytes.
- **Status:** Not run · **Finding:** —

### TC-036 · Location rules at every threshold pair
- **Links:** M-001 · TKT-08 · TASK-9 · EVAL-005, 009, 010, 014, 023, 025, 026, 027
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** geofence — inside concave P04 → ok, in its notch → fail; 12 m outside with 20 m accuracy → flag ("within the 20 m GPS allowance"); 30 m outside with 8 m accuracy → fail ("allowance 8 m"); 26 m outside with 40 m accuracy → fail ("allowance 25 m"). Accuracy 29.9 → ok, 30 → flag, 99.9 → flag, 100 → fail. EXIF GPS 49 m → ok, 51 m → fail, absent → flag.
- **Status:** Not run · **Finding:** —

### TC-037 · Time and movement rules at every threshold pair
- **Links:** M-001 · TKT-08 · TASK-9 · EVAL-011, 013, 028, 033, 034, 055–057 · TP4 (GAP-1)
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** EXIF–client (worst photo) 9 min → ok, 11 min → flag, 120 min → flag, 23 h → flag, 24 h + 1 min → fail, 3 days → fail, 45 days → fail (amended by EXE10); client–server 23 h → ok, 3 days → flag, 9 days → fail; EXIF absent → flag. Speed 75 km/h → ok, 119 → ok, 120 → fail, 150 → fail; no previous event → ok ("First entry from this phone").
- **Status:** Not run · **Finding:** —

### TC-038 · Yield season window, conversion and thresholds
- **Links:** M-001 · TKT-09 · TASK-10 · EVAL-012, 045–050 · TP6 (GAP-3)
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** ratio 1.45 → ok, 1.50 → ok, 1.51 → flag, 1.95 → flag, 2.00 → flag, 2.05 → hard fail ("2.05x"); an event received at 30 Sep 23:59 IST counts in the old season and one at 1 Oct 00:00 IST in the new; a previously Rejected event's kg is excluded; the conversion multiplies cumulative cherry kg by the reference ratio exactly once.
- **Status:** Not run · **Finding:** —

### TC-039 · Yield reference table is seeded from a cited source
- **Links:** M-001 · TKT-09 · TASK-10 · R6
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** `crop_yield_reference` has one row per crop — Arabica `max_kg_ha` 783, Robusta 1,494, `cherry_to_clean_ratio` 0.1667 — whose `source` and `source_url` cite the Coffee Board *Database on Coffee, July 2024*, Tables 1.10–1.11, plus a `version`; eval provenance prints that version, marks the yields "Coffee Board" and the cherry ratio "industry estimate, unverified" (or "placeholder" when the harness runs on synthetic U).
- **Status:** Not run · **Finding:** —

### TC-040 · Retrying an identical signed payload is idempotent
- **Links:** M-001 · TKT-09 · TASK-10 · EVAL-068 · CF-14 · EV15, TP7
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** submitting the same bytes twice returns the same event ID and verdict with `idempotent:true`; the `harvest_events` count is unchanged; the season cumulative counts the kg once; a new payload reusing the photos (new capturedAt) still hard-fails `photo_uniqueness`; a retry of a boundary-rejected payload returns the same rejection without a second anchor.
- **Status:** Not run · **Finding:** —

### TC-041 · Chain continuity, including a re-enrolled phone and a stale sequence
- **Links:** M-001 · TKT-09 · TASK-10 · EVAL-021, 035 · TP10
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** next seq with the correct prev hash → ok; a seq gap or wrong prev hash → flag; genesis on a first-ever device → ok; genesis on a new device when the agent has 23 earlier accepted events → flag with "23 earlier entries".
- **Status:** Not run · **Finding:** —

### TC-042 · Photo uniqueness across agents and plots
- **Links:** M-001 · TKT-09 · TASK-10 · EVAL-030–032
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** a photo hash already on another agent's accepted event on another plot hard-fails ("1 of 3 photos seen before"); hashes from boundary-rejected events do not count as seen, so an honest retake after a rejection is not punished; an identical-payload retry is handled by TC-040 before this check runs.
- **Status:** Not run · **Finding:** —

### TC-043 · Uploaded bytes are the signed bytes
- **Links:** M-001 · TKT-10 · TASK-11 · S1 · technical-plan Review focus 2
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** swapping one uploaded file for different bytes of the same size → 4xx `media_hash_mismatch` with the rejected event anchored; reordered files → mismatch; the stored file's SHA-256 equals the payload's; original bytes are stored unmodified (thumbnails are separate files).
- **Status:** Not run · **Finding:** —

### TC-044 · Capture flow at 375 px matches the approved screens [TC-UI-RESPONSIVE]
- **Links:** M-001 · TKT-10 · TASK-11 · EVAL-086 · D3–D6
- **Type/Pri/Auto:** e2e · P0 · A
- **Steps:** at 375 × 812 with mocked GPS and file inputs, walk Home → photos → review → weight → checking → Verified, and → Needs a check (fixture cloud-blocked plot).
- **Expected:** each screen has the mockup's heading text, a single primary pill and its component set (s1–s6); no horizontal scroll; the tab bar is hidden inside the record flow; a screenshot per screen is attached to the ledger for Stage 8.
- **Status:** Not run · **Finding:** —

### TC-045 · Checking screen shows the real checks as they finish
- **Links:** M-001 · TKT-10 · TASK-11 · TP12 · Design.md §9, §15
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** with the fixture provider delayed 2 s on NDVI (`E2E_FIXTURE_DELAY_MS`), the mockup's six check groups tick as all of their checks finish, local groups first and the satellite group later, in the order the NDJSON stream reports; the progress bar fills by finished groups only; the live region announces each; with `prefers-reduced-motion` the screen waits on "See result" and the cherry does not move.
- **Status:** Not run · **Finding:** —

### TC-046 · 320 × 568 keeps the primary action visible
- **Links:** M-001 · TKT-10 · TASK-11 · Design.md §16
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** on every record-flow screen at 320 × 568, the primary pill's bounding box lies fully inside the viewport without scrolling.
- **Status:** Not run · **Finding:** —

### TC-047 · GPS starts with the record flow and a weak fix never blocks capture
- **Links:** M-001 · TKT-10 · TASK-11 · TP13 · EV9
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** `watchPosition` is called when `/field/record` mounts (spy); at Submit the held fix is used without a new wait; with a 150 m fix the "Move to open sky" line shows and Send stays enabled; with geolocation denied the two-step how-to-allow message shows.
- **Status:** Not run · **Finding:** —

### TC-048 · Not accepted verdict follows the D5 template
- **Links:** M-001 · TKT-10 · TASK-11 · D5, TP17
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** a hard-failed capture shows "Not accepted", the reason in plain words and what to do; no element uses `--ok` colours; no cherry rim light; one pill; no accusation words (the TC-058 wording guard also covers this screen).
- **Status:** Not run · **Finding:** —

### TC-049 · The capture app is installable
- **Links:** M-001 · TKT-10 · TASK-11
- **Type/Pri/Auto:** e2e · P2 · A
- **Expected:** `/manifest.webmanifest` has name, short_name, `start_url:/field`, `display:standalone`, theme and background colours from the tokens, 192 and 512 px icons; Chromium reports the page installable.
- **Status:** Not run · **Finding:** —

### TC-050 · A failed send keeps everything and Try again works once
- **Links:** M-001 · TKT-11 · TASK-12 · EVAL-068 (client side) · Design.md §18, §20
- **Type/Pri/Auto:** e2e · P0 · A
- **Steps:** (a) route `/api/capture` to abort; (b) let the server commit but drop the response.
- **Expected:** (a) the amber "Couldn't send" sheet (s7) says nothing is lost, with the photo count and kg; the outbox holds payload, signature and blobs; after a reload the item is still there; Try again succeeds and clears it. (b) Try again returns the original verdict and one event exists.
- **Status:** Not run · **Finding:** —

### TC-051 · Pickings list and detail in all four states [TC-UI-EMPTY, TC-UI-ERROR]
- **Links:** M-001 · TKT-11 · TASK-12 · EVAL-088
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** loading shows skeletons; empty shows "No pickings recorded yet" with the record action; error says saved pickings are safe and offers retry; working lists entries by month with verdict chips (word + mark + colour); Not-accepted rows show their reason; detail shows photos, kg, verdict and reasons.
- **Status:** Not run · **Finding:** —

### TC-052 · Language switch and externalised strings
- **Links:** M-001 · TKT-11 · TASK-12 · N5 · TP18
- **Type/Pri/Auto:** static + e2e · P1 · A
- **Expected:** a static test finds no JSX text literals in `src/app/(agent)` and `src/components` outside `t()`; the `en` and `kn` dictionaries have identical key sets; switching to ಕನ್ನಡ changes copy and `<html lang="kn">`, persists, and Kannada body text has line-height ≥ 1.6 with no clipped text at 320 px.
- **Status:** Not run · **Finding:** —

### TC-053 · Tab bar navigation and Help content [TC-UI-MOBILE-NAV]
- **Links:** M-001 · TKT-11 · TASK-12 · D4
- **Type/Pri/Auto:** e2e · P2 · A
- **Expected:** Home · Pickings · Help are each reachable by tap and keyboard with `aria-current` on the current tab; the bar floats above the safe area; Help explains the three verdicts, photo tips, "call the office" (a tel link from org settings), language, this phone, and why gallery photos are not allowed.
- **Status:** Not run · **Finding:** —

### TC-054 · Review queue and detail show the evidence an admin needs
- **Links:** M-001 · TKT-12 · TASK-13 · EVAL-088 · F7
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** the queue lists only this org's Needs Review runs, oldest first, with loading, empty ("Nothing to check") and error states; the detail shows the score, each cap reason, all twelve checks with evidence, the photos and the plot card; at 768 px list → detail with a back button; at ≥ 1100 px rail + queue + detail.
- **Status:** Not run · **Finding:** —

### TC-055 · Override needs a public-safe reason and is signed and anchored
- **Links:** M-001 · TKT-12 · TASK-13 · EVAL-075 · D7 · TP15 · technical-plan Review focus 5
- **Type/Pri/Auto:** integration + e2e · P0 · A
- **Expected:** reasons under 10 characters or containing a 10-digit phone pattern are refused inline; the panel says the decision is signed, recorded permanently and shown on the certificate; on submit an `admin_overrides` row and an `admin_override` ledger entry exist; the signature verifies with the admin's public key; `final_verdict` updates.
- **Status:** Not run · **Finding:** —

### TC-056 · A hard-failed rejection cannot be overridden anywhere
- **Links:** M-001 · TKT-12 · TASK-13 · EVAL-076 · CF-06
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** the detail of a hard-failed Rejected run has no override controls; calling the override action directly returns 409; a raw SQL insert into `admin_overrides` for that run aborts via the trigger.
- **Status:** Not run · **Finding:** —

### TC-057 · Re-run retries only unavailable providers
- **Links:** M-001 · TKT-12 · TASK-13 · EVAL-069 · S6
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** for a run where only `ndvi_harvest_window` was unavailable, re-run calls only the Sentinel Hub adapter (spies); the other checks are copied unchanged; a new run (run_no 2) is anchored; if the provider now answers, the verdict updates and the item leaves the queue.
- **Status:** Not run · **Finding:** —

### TC-058 · Organic certificate is an anchored attestation and never "verified"
- **Links:** M-001 · TKT-13 · TASK-14 · EVAL-079 · CF-11 · DISC4
- **Type/Pri/Auto:** integration + static · P0 · A
- **Expected:** attaching a PDF stores its SHA-256, issuer and validity and anchors `attestation`; the plot, batch and certificate show "Certified by <issuer> — certificate on record" with validity; a static test greps `src/` and the dictionaries for `verified organic`, `organic verified`, `fraud`, `fake` and `cheat` and finds none.
- **Status:** Not run · **Finding:** —

### TC-059 · Batch invariants are enforced by the database
- **Links:** M-001 · TKT-14 · TASK-15 · EVAL-077 · CF-07 · S8
- **Type/Pri/Auto:** integration · P0 · A
- **Expected (each attempted in raw SQL and through the action):** adding an event already in another batch fails (unique); adding a Needs Review event fails; adding a robusta event to an arabica batch fails; `quantity_kg` equals Σ kg and `integrity_score` equals the minimum event score after each insert; after transfer, inserting or deleting batch events and updating the batch fail.
- **Status:** Not run · **Finding:** —

### TC-060 · Custody transfer is signed, anchored and locks the batch; buyers see only theirs
- **Links:** M-001 · TKT-14 · TASK-15 · EVAL-080 · F10, F11
- **Type/Pri/Auto:** integration + e2e · P0 · A
- **Expected:** transfer creates a `custody_transfers` row with a verifiable signature and a `custody_transfer` entry, and sets the batch to `transferred`; buyer A's list shows the batch with score, quantity, plots, custody chain and a certificate link; buyer B sees nothing.
- **Status:** Not run · **Finding:** —

### TC-061 · Merkle roots and proofs for every leaf of trees of 1–300 entries
- **Links:** M-001 · TKT-15 · TASK-16 · TP9
- **Type/Pri/Auto:** unit · P0 · A
- **Expected:** for n = 1..300, every leaf's path recomputes the root; roots match an independent RFC 6962 §2.1 reference on 5 fixed vectors; a path with any sibling changed, or a leaf index off by one, fails.
- **Status:** Not run · **Finding:** —

### TC-062 · Checkpoints every 100 entries and on demand, signed and linked
- **Links:** M-001 · TKT-15 · TASK-16 · S7
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** appending 250 entries creates checkpoints [1–100] and [101–200] automatically; an on-demand checkpoint covers [201–250]; each statement's signature verifies with the published JWK; each `prevCheckpointHash` links to the previous statement.
- **Status:** Not run · **Finding:** —

### TC-063 · Proof feed: complete closure, forced checkpoint, identical 404s
- **Links:** M-001 · TKT-15 · TASK-16 · EVAL-064, 065 · TP8 (GAP-6)
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** the feed for a seeded batch contains exactly the provenance-closure entries (evaluation-plan §4.6), listed independently from the DB by the test; when the batch has entries after the last checkpoint, one is created before the response; unknown batch, missing `h` and wrong `h` return byte-identical 404 bodies.
- **Status:** Not run · **Finding:** —

### TC-064 · Ledger key: generated once outside the repo, never logged, published
- **Links:** M-001 · TKT-15 · TASK-16 · N6
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** first boot with no key creates `DATA_DIR/keys/ledger.jwk` with mode 0600; a second boot reuses it (same kid); `git check-ignore` confirms the path is ignored; captured logs contain no JWK `"d"` member; `/.well-known/udgam-ledger-key` returns the public JWK only.
- **Status:** Not run · **Finding:** —

### TC-065 · Certificate verifies in the browser and names the failing step on tamper
- **Links:** M-001 · TKT-16 · TASK-17 · EVAL-058–063 (page side) · CF-04
- **Type/Pri/Auto:** e2e · P0 · A
- **Expected:** the intact batch reaches "Verified in your browser against checkpoint N signed by key X" with the entry count; for each tamper variant (payload field, Merkle sibling, checkpoint signature, other key, dropped or reordered entry) served through a test-only route, the panel shows the mismatch state naming the failing step, and no `--ok` colour is visible anywhere on the page.
- **Status:** Not run · **Finding:** —

### TC-066 · Certificate layout: proof first on phones, no horizontal scroll [TC-UI-RESPONSIVE]
- **Links:** M-001 · TKT-16 · TASK-17 · EVAL-087 · D3
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** at 375 px the proof card is above the map; at 768 px single column; at ≥ 1000 px map and journey in two columns; no horizontal scroll at 320/375/768/1440; loading shows real steps ("Checking 12 records…").
- **Status:** Not run · **Finding:** —

### TC-067 · No farmer personal data on public outputs
- **Links:** M-001 · TKT-16, TKT-17 · TASK-17/18 · EVAL-084 · EV16
- **Type/Pri/Auto:** integration + e2e · P0 · A
- **Expected:** for a seeded batch, the rendered HTML, the proof feed JSON and the GeoJSON contain none of the seeded farmers' names, `identifier` values or phone numbers (string search over all three); producer IDs appear as `PR-…`.
- **Status:** Not run · **Finding:** —

### TC-068 · Every displayed certificate fact comes from the verified feed
- **Links:** M-001 · TKT-16 · TASK-17 · TP16 · CF-11
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** the certificate view model is one pure function of the feed; mutating a DB column that no ledger payload reflects leaves the page unchanged; the embedded `#proof-feed` JSON equals the `/api/verify` response.
- **Status:** Not run · **Finding:** —

### TC-069 · QR code encodes the absolute certificate URL with `h`
- **Links:** M-001 · TKT-16 · TASK-17 · Solution-PRD §5.4
- **Type/Pri/Auto:** unit · P1 · A
- **Expected:** decoding the generated QR yields `${PUBLIC_BASE_URL}/verify/<batchId>?h=<12 hex>`; the short hash equals the `batch_created` entry hash prefix.
- **Status:** Not run · **Finding:** —

### TC-070 · EUDR GeoJSON conforms to the TP24 field list
- **Links:** M-001 · TKT-17 · TASK-18 · EVAL-078 · F12
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** a FeatureCollection with one feature per plot; properties exactly as TP24; plots under 4 ha as a Point and 4 ha or more as a Polygon (P10 at 4.0 ha → Polygon); WGS84 coordinates at the TP24 precision; validates against `docs/eudr-geojson.schema.json`; no personal data (TC-067).
- **Status:** Not run · **Finding:** —

### TC-071 · Printed certificate is light and legible
- **Links:** M-001 · TKT-17 · TASK-18 · EVAL-087 (print) · D7
- **Type/Pri/Auto:** e2e · P2 · A
- **Expected:** with `page.emulateMedia({media:'print'})`: white background, `#111` text, warning colours ≥ 7.4:1, buttons and downloads hidden, no glow or blur.
- **Status:** Not run · **Finding:** —

### TC-072 · Link-preview tags and asset [TC-WEB-OG-METADATA, TC-WEB-OG-ASSET]
- **Links:** M-001 · TKT-17 · TASK-18 · EVAL-090
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** server HTML of `/verify/<id>?h=` has `og:title`, `og:description`, `og:image` (absolute, from `PUBLIC_BASE_URL`), `og:image:width=1200`, `og:image:height=630`, `og:url` and `twitter:card=summary_large_image`; the image is served as `image/png` at 1200 × 630; `robots` is `noindex, nofollow`.
- **Status:** Not run · **Finding:** —

### TC-073 · Clean-room checker is independent and catches every tamper
- **Links:** M-001 · TKT-18 · TASK-19 · EVAL-058–063 (checker side) · EV11
- **Type/Pri/Auto:** unit + static · P0 · A
- **Expected:** a static test finds no import in `evals/scorers/independent-verifier/**` that resolves into `src/` or to any npm package (Node standard library only); the checker verifies 100 % of intact entries and rejects 100 % of tamper variants, naming the step; the implementer's brief contained only `docs/proof-feed.md`.
- **Status:** Not run · **Finding:** —

### TC-074 · Upload validation refuses malformed input before verification
- **Links:** M-001 · TKT-19 · TASK-20 · EVAL-081
- **Type/Pri/Auto:** integration · P0 · A
- **Expected:** a photo of 10 MB + 1 byte → 413; only JPEG and HEIC/HEIF are accepted, decided by magic bytes, so a text or PNG file sent with a JPEG MIME type → 415; 4 photos → 400; a payload failing the zod schema → 400; the 31st capture per device per 10 minutes → 429; where the request carried a valid signature, the rejection is anchored; `verify()` is never called for any of these.
- **Status:** Not run · **Finding:** —

### TC-075 · No secrets in logs or the client bundle; dependency audit gate
- **Links:** M-001 · TKT-19 · TASK-20 · EVAL-083, 085 · CF-09
- **Type/Pri/Auto:** ci · P0 · A
- **Expected:** a CI step builds with a CI-only fake `.env` and greps `.next/static` for each secret value — no hits; the pino redaction test logs an object with `authorization`, `cookie`, `signature` and `password` and finds them redacted; `pnpm audit --prod --audit-level=high` passes, or fails the build.
- **Status:** Not run · **Finding:** —

### TC-076 · Security headers and CSP
- **Links:** M-001 · TKT-19 · TASK-20 · technical-plan §16
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** responses carry the CSP (`default-src 'self'`; nonce + `'strict-dynamic'` scripts; `object-src 'none'`; tile hosts only on `/admin*` pages (amended by EXE17)), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` limiting camera and geolocation to self; no page violates its CSP during e2e (console check).
- **Status:** Not run · **Finding:** —

### TC-077 · Seed builds the Kodagu demo state from nothing, repeatably
- **Links:** M-001 · TKT-20 · TASK-21 · F15
- **Type/Pri/Auto:** integration · P1 · A
- **Expected:** `pnpm seed` on an empty `DATA_DIR` creates 1 FPO (Hosahalli), 1 buyer, ≥ 10 plots in Kodagu/Chikkamagaluru, agents, enrolled devices, a legitimate history and the four attack cases ready to submit; every provenance row is anchored; on a non-empty DB it refuses unless `--reset`; the ledger verifies end to end after seeding.
- **Status:** Not run · **Finding:** —

### TC-078 · Automated demo end to end at 375 and 1280 px
- **Links:** M-001 · TKT-20 · TASK-21 · EVAL-073, 074 · S5
- **Type/Pri/Auto:** e2e · P0 · A
- **Expected:** `pnpm demo` (Playwright) runs register plot → capture → verdict → the four attacks (each showing the evidence that caught it) → batch → transfer → certificate verified, with no DB access outside the app, at both widths, in under 10 minutes; step timestamps are written to the run log.
- **Status:** Not run · **Finding:** —

### TC-079 · M-001 gate run and baseline-v1 freeze
- **Links:** M-001 · TKT-21 · TASK-22 · EV13 · S1, S2, S4, S6, S7
- **Type/Pri/Auto:** ci + manual · P0 · A + M
- **Expected:** `evals/results/eval-run-v1*.json` and `evals/reports/eval-report-v1*.md` are generated from real runs on the gate commit; S1 ≥ 95 % pooled and ≥ 90 % per scenario, S2 ≤ 5 %, S4 < 3 s over 10 cold loads, S6 100 % by both verifiers, S7 yes; no CF fired; `baseline-v1.json` records the `cfg-1` hash; the owner signs HR6.
- **Status:** Not run · **Finding:** —

### TC-080 · No horizontal scroll on any surface [TC-UI-RESPONSIVE]
- **Links:** M-001 · every UI ticket (TKT-04, 05, 06, 10–14, 16, 17) · N4
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** for every route in technical-plan §3.2, signed in as its role, `document.documentElement.scrollWidth ≤ innerWidth` at 320, 375, 768 and 1440 px; text readable without zoom; navigation usable.
- **Status:** Not run · **Finding:** —

### TC-081 · Accessibility scan of every surface
- **Links:** M-001 · every UI ticket · EVAL-089 · Design.md §17
- **Type/Pri/Auto:** e2e · P1 · A
- **Expected:** axe-core reports no serious or critical violations on every route in all four states; keyboard tab order equals visual order on the capture flow, review detail and certificate; the focus ring is visible.
- **Status:** Not run · **Finding:** —

### TC-093 · Photo staging endpoint: validation, ownership, caps and expiry
- **Links:** M-001 · TKT-30 · TASK-31 · TP28
- **Type/Pri/Auto:** integration · P1 · A
- **Objective:** staging must not become a way round the capture boundary or a free file store.
- **Steps:** as agent A, POST a JPEG to `/api/capture/stage`; POST a text file with a JPEG MIME type; POST 10 MB + 1 byte; POST a 13th photo while 12 are staged; POST without a session; advance the clock 1 h + 1 s and run the sweep.
- **Expected:** the JPEG returns 201 `{sha256, expiresAt}` and the stored bytes hash to that value; the text file → 415 and the oversize file → 413 (the TKT-19 limits); the 13th → 429; no session → 401; after expiry the file and its `staged_media` row are gone; a staged hash is never in `seenMediaHashes`; nothing is anchored by staging.
- **Status:** Not run · **Finding:** —

### TC-094 · Capture with staged photos: same verdict, bytes re-hashed, expiry falls back
- **Links:** M-001 · TKT-30 · TASK-31 · EVAL-070 · S1
- **Type/Pri/Auto:** integration + e2e · P1 · A
- **Steps:** (a) stage 3 photos, then submit a capture listing them as staged with no file parts; (b) the same, but tamper with one staged file on disk before Submit; (c) agent B submits a payload referencing agent A's staged hash; (d) at 375 px with the EV9 network profile (5 Mbit/s up, 80 ms), accept three 4 MB photos, wait until staging finishes, tap Submit; (e) let the staged files expire before Submit.
- **Expected:** (a) the verdict and stored media equal those of a normal multipart capture of the same bytes; (b) → 4xx `media_hash_mismatch`, anchored as a rejected event; (c) → 409 `media_not_staged`; (d) the request after Submit carries no photo bytes, and the EVAL-070 timing split shows upload time outside t0→t1; (e) the client gets 409, resends the bytes once, and the verdict arrives with nothing lost.
- **Status:** Not run · **Finding:** —

## M-002 · Contract farming on real smart contracts

### TC-082 · BatchRegistry contract
- **Links:** M-002 · TKT-24 · TASK-25 · F16
- **Type/Pri/Auto:** contract · P2 · A
- **Expected:** `forge test`: only the operator can append; each append stores the entry hash at its seq and emits an event; an existing seq cannot be overwritten; reads return what was written.
- **Status:** Not run · **Finding:** —

### TC-083 · EVM ledger adapter keeps every M-001 proof guarantee
- **Links:** M-002 · TKT-24 · TASK-25 · EVAL-103, 104, and a re-run of EVAL-058–063
- **Type/Pri/Auto:** integration · P2 · A
- **Expected:** with `LEDGER_ADAPTER=evm` against Anvil, every append also writes the entry hash on chain; proofs gain `txHash` and `blockNumber` that match the chain; `pnpm eval --ledger=evm` passes the proof and tamper suites; a hash-chain row altered after anchoring is detected by comparing with the on-chain hash.
- **Status:** Not run · **Finding:** —

### TC-084 · ContractFarming releases only when all three conditions hold
- **Links:** M-002 · TKT-25 · TASK-26 · EVAL-093–099 · F17, DISC9
- **Type/Pri/Auto:** contract + integration · P2 · A
- **Expected:** `forge test` covers all 8 combinations of (quantity met, grade met, all Verified) and only all-true releases the escrow to the FPO; a second settlement reverts; an unauthorised caller reverts; a quality attestation with a bad signature is refused; an unfunded agreement cannot settle; mock-INR balances reconcile after every test.
- **Status:** Not run · **Finding:** —

### TC-085 · Agreement and settlement screens
- **Links:** M-002 · TKT-25 · TASK-26 · EVAL-105 · TKT-23 addendum
- **Type/Pri/Auto:** e2e · P2 · A
- **Expected:** the screens match the approved addendum mockups; four states; no horizontal scroll at 375/768/1440; axe clean; settlement shows each condition with its value and threshold.
- **Status:** Not run · **Finding:** —

### TC-086 · Processor hop with mass-balance band
- **Links:** M-002 · TKT-26 · TASK-27 · EVAL-100–102 · F18
- **Type/Pri/Auto:** integration + e2e · P2 · A
- **Expected:** a processor custody step records input and output kg and is signed and anchored; output inside the configured band → ok; below or above → flagged with an evidence sentence stating the ratio and the band; the certificate journey shows the extra step.
- **Status:** Not run · **Finding:** —

## M-003 · Public deployment and demo

### TC-087 · Production stack on Oracle A1: HTTPS, persistence, streaming
- **Links:** M-003 · TKT-27 · TASK-28 · F19
- **Type/Pri/Auto:** manual · P1 · M
- **Expected:** `https://<domain>` serves a valid Let's Encrypt certificate; `docker compose ps` shows app and caddy (and anvil once M-002 ships) healthy on linux/arm64; after `docker compose restart`, data and the ledger key persist (same kid, same last seq); a capture's checking screen updates progressively through Caddy (NDJSON not buffered).
- **Status:** Not run · **Finding:** —

### TC-088 · Backup and restore drill
- **Links:** M-003 · TKT-27 · TASK-28
- **Type/Pri/Auto:** manual · P1 · M
- **Expected:** the latest nightly DB snapshot and key files restore onto a fresh volume; the restored app serves an existing certificate that verifies in the browser; the drill is timed and recorded.
- **Status:** Not run · **Finding:** —

### TC-089 · One-command redeploy and rollback
- **Links:** M-003 · TKT-27 · TASK-28
- **Type/Pri/Auto:** manual · P1 · M
- **Expected:** `scripts/deploy.sh` deploys a new commit after a pre-deploy backup; `scripts/deploy.sh --rollback` restores the previous image; health returns 200 after each; downtime recorded.
- **Status:** Not run · **Finding:** —

### TC-090 · Health alert reaches the owner during an outage drill
- **Links:** M-003 · TKT-28 · TASK-29 · F14
- **Type/Pri/Auto:** manual · P1 · M
- **Expected:** stopping the app container makes the scheduled health workflow fail and the owner is notified within 30 minutes; restarting clears it.
- **Status:** Not run · **Finding:** —

### TC-091 · Link unfurls on production [TC-WEB-OG-UNFURL]
- **Links:** M-003 · TKT-28 · TASK-29 · EVAL-090
- **Type/Pri/Auto:** manual · P1 · M
- **Expected:** a production certificate URL shows the approved 1200 × 630 image, title and description in LinkedIn Post Inspector and opengraph.xyz; screenshots recorded in `QA-report.md`.
- **Status:** Not run · **Finding:** —

### TC-092 · Production configuration: secrets only in env, live providers, audit clean
- **Links:** M-003 · TKT-28 · TASK-29 · EVAL-085
- **Type/Pri/Auto:** manual + ci · P1 · A + M
- **Expected:** provider keys and the auth secret exist only as environment secrets on the instance (not in the image, repo or logs); `/api/health` shows live providers `ok`; `pnpm audit --prod` on the deployed lockfile reports no high or critical issues.
- **Status:** Not run · **Finding:** —
