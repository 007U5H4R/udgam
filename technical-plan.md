# Udgam — Technical Plan (Stage 6)

> **For agentic workers (Stage 7, owner-opened claude.ai/code cloud session, S11):**
> - Execute this plan ticket by ticket, one fresh implementer subagent per task: TDD, then a spec-compliance review and a code-quality review (§21.2).
> - The protocol is embedded in §21.2 because the cloud VM has none of the owner's personal skills. If the `superpowers` plugin is available there, `superpowers:subagent-driven-development` applies on top.
> - Task steps use checkbox (`- [ ]`) syntax. Stop at every phase and milestone gate (§21.2).

**Goal.** Build Milestone 1 of Udgam: a picking captured on a phone is signed on the device, checked against the plot, the photo history and satellite data, given an honest three-state verdict, sealed in a hash-chain ledger under signed Merkle checkpoints, and re-verified by anyone from a QR code in their own browser — measured by `pnpm eval`, not asserted. Then M-002 (EVM ledger adapter, escrow, processor hop) and M-003 (Oracle A1 production).

**Architecture (Solution-PRD §1, S2, S3).**
- **One Next.js App Router monolith** with four surfaces (field capture PWA, FPO admin, buyer, public certificate) over one file-backed libSQL database.
- **Business logic lives in `src/lib/*`** with no Next.js imports. Route handlers and Server Actions are thin adapters.
- **Verification is a pure, async function** `verify(submission, context, opts)` over a registry of twelve checks. It runs synchronously inside the capture request (S2). Remote-sensing calls happen **before** the write transaction opens, so the SQLite write lock is never held across an 8 s provider call (TP12).
- **Every provenance write and its ledger entry share one transaction**, and the database itself refuses a provenance row without its ledger entry (TP14).
- **The certificate page renders only from the proof feed** — the same payloads the visitor's browser hashes — so nothing on it is a server assertion (TP16).

**Tech stack (TP1).** See §0 for pinned versions. Next.js App Router + React + TypeScript (strict) · Tailwind CSS v4 with Design.md §12 tokens as CSS variables · shadcn/ui only for Radix Dialog/Sheet behaviour · Drizzle ORM on `@libsql/client` (file) · Better Auth (email + password) · zod · canonicalize (RFC 8785) + WebCrypto only for crypto · exifr · sharp · @turf/* · Leaflet + react-leaflet + leaflet-draw (admin plot editor only) · qrcode · idb · pino · Vitest · Playwright + @axe-core/playwright · ajv · tsx · pnpm · Node 22 · GitHub Actions · (M-002) Foundry/Anvil + viem · (M-003) Docker Compose + Caddy on Oracle A1.

**Spec.** `Solution-PRD.md` (F1–F20, N1–N7, §3–§9) · `evaluation-plan.md` (S1–S7, CF-01–CF-14, §7.4 evidence contract, GAP-1–GAP-9) · `evals/eval-dataset.json` · `Design.md` (FROZEN; §12 tokens, §13–§18) · `.design/exploration/final/` (**the visual truth**) · `decisions.md` (DISC1–16, S1–S11, EV1–16, D1–8, TP1–TP27).

**Status.** Approved by owner 2026-09-29 (Campfire TASK-1). TP13 (staged photo upload, proposed TKT-30) is still an open owner decision. **Tickets:** `tickets.md` (TKT-01..29 → TASK-2..30, mapping in `tickets.md`). **Tests:** `test-cases.md` (TC-001..092). **Evals:** `evals/` (dataset 0.2.0).

---

## 0. Pinned versions (TP1)
Checked with `npm view` on 2026-09-29 (research notes: Stage 6). TKT-01 pins these exactly in `package.json` (no `^`) and records `pnpm view next version` in the ledger; a newer patch is taken only with a green CI run.
| Package | Version | Package | Version |
|---|---|---|---|
| next | 16.3.6 | react / react-dom | 19.3.0 |
| better-auth | 1.7.6 | drizzle-orm / drizzle-kit | 0.45.3 / 0.31.11 |
| @libsql/client | 0.18.0 | zod | 4.6.5 |
| tailwindcss | 4.3.3 | canonicalize | 5.1.0 |
| exifr | 7.1.3 | sharp | 0.35.5 (linux-arm64 prebuilt via `@img/sharp-linux-arm64`) |
| @turf/turf | 7.4.0 | leaflet / react-leaflet / leaflet-draw | 1.9.4 / 5.0.0 / 1.0.4 |
| qrcode | 1.5.4 | idb | 8.0.3 |
| pino | 10.3.1 | ajv | 8.20.0 |
| vitest | 5.0.2 | @playwright/test / @axe-core/playwright | 1.63.0 / 4.13.0 |
| Node | 22 LTS | Foundry (M-002) | v1.8.3 (publishes `linux_arm64` binaries) |
`leaflet-draw` has been unmaintained since 2022. It stays because TKT-06's acceptance criteria and Solution-PRD §3.1 name it. If it fails with react-leaflet 5, the fallback is `@geoman-io/leaflet-geoman-free` 2.20.2, recorded as an `EXE#` decision. i18n uses no library (TP18), so `next-intl` is not a dependency.

## 1. Global constraints (every task implicitly includes these)
- **Frozen design.** Design.md's freeze block holds: IA, heroes (plot card on Home, proof card first on the certificate), visual direction, one primary pill per screen, one motion moment (the cherry on Verified), native scroll, the three-cherry brand object. Pixel, browser and accessibility fixes need no review; anything else goes back to design review. Tokens are copied **verbatim** from `final/index.html` `:root` into `src/app/tokens.css` (TC-004 asserts equality).
- **Rule of light.** Glow only on: the ground, the primary pill, the cherry. Glass only on: cards, the tab bar, sheets. Gradient text: one word or number per screen.
- **Words.** Farmer-facing verdicts are **Verified · Needs a check · Not accepted** (D5); system states stay `Verified | Needs Review | Rejected`. Never on any surface: "fraud", "fake", "cheat", "verified organic" (TC-057 static guard). Organic is always "Certified by <issuer> — certificate on record" (DISC4).
- **Time.** Store ISO-8601 UTC with milliseconds. Client capture time and server receipt time are separate columns (DISC5). Display in IST (UTC+05:30) with explicit offset arithmetic, never the host zone; tests run under `TZ=UTC` and `TZ=America/Los_Angeles`.
- **Numbers in evidence.** Distances whole metres, speeds whole km/h, loss % to one decimal, yield ×U to two decimals, counts "k of n" (evaluation-plan §7.4; templates in §6.5).
- **Config is data.** Every weight, threshold and verdict rule lives in `src/lib/verification/config.ts` as one object with a version (`cfg-1`) and a SHA-256 of its JCS form, printed in every eval result. Changing it after baseline-v1 needs a TP/EV decision **and** two new attack cases per affected scenario committed first (EV13, CF-13).
- **Secrets (N6, S11).** Read only through `src/lib/config/env.ts`, which is zod-validated and throws if imported where `typeof window !== 'undefined'`. `src/lib` may not import `server-only`, a Next-ecosystem package (§3.3); `src/app` wrappers may. Never `NEXT_PUBLIC_` a secret. Agents never run `env`, `printenv`, or echo a secret. The ledger key, admin signing keys and the database live under `DATA_DIR` (default `./data`, git-ignored), never in the tree.
- **Fixture provider is the default** (`REMOTE_SENSING_PROVIDER=fixture`). Build, tests and `pnpm eval` run with no network and no keys.
- **Test-only surfaces** (`/__test__/*` pages, the certificate tamper route, `E2E_FIXTURE_DELAY_MS`) exist only when `E2E=1` and return 404 in production builds; `/admin/demo` exists only when `DEMO_MODE=1` (TP27).
- **Machine rule.** Nothing is installed or built on the owner's Mac for Stage 7; all installs, builds and tests run in the cloud VM or GitHub Actions (S11). The owner's Mac only runs Campfire syncs.
- **Campfire (`backlog/`) is local-only.** The cloud session never edits `backlog/`; it records status in `docs/exec/ledger.md` (§21.3, TP22).
- **Commits.** One task per commit, imperative subject, ending `(TASK-n)` with the native Campfire ID of the ticket.

## 2. Review focus (implied by the spec, easy to miss; each has a test in its owning task)
1. **Canonical bytes, not re-serialised JSON.** The server verifies the signature over the exact `payload` string the phone signed, and rejects it if `canonicalize(JSON.parse(payload)) !== payload`. Re-serialising first would let two encodings of one payload both verify. *Test:* TC-006, TC-073.
2. **The uploaded bytes are the signed bytes (S1).** Each uploaded file's SHA-256 must equal the `media[i].sha256` in the signed payload, in order; a mismatch is a boundary rejection (anchored). *Test:* TC-043, EVAL-053.
3. **Concurrency on one SQLite file.** Two captures from one phone in flight at once, or a capture racing a checkpoint, must not interleave ledger `seq` values. All writes use `BEGIN IMMEDIATE`; `ledger_entries.seq` is `PRIMARY KEY`. *Test:* TC-007 (parallel appends).
4. **A provider that answers slowly but not never.** An 8 s timeout per call via `AbortSignal.timeout`, and the whole remote phase bounded at 10 s, so the S3 budget holds. *Test:* TC-031.
5. **Admin override reasons are public.** An override is in the batch's provenance closure, so its reason text appears on the public certificate. The reason panel says so, and the server rejects reasons containing a 10-digit phone number pattern. *Test:* TC-055.
6. **Enumeration through the proof feed.** Unknown batch, missing `h` and wrong `h` return the same 404 body and similar timing (constant-time compare). *Test:* TC-063, EVAL-064.
7. **EXIF without a time zone.** Phone EXIF `DateTimeOriginal` has no zone unless `OffsetTimeOriginal` is set; it is read as IST (TP25). *Test:* TC-035.
8. **Camera input quirks.** iOS may hand over HEIC; Android Chrome may strip EXIF GPS. HEIC is accepted by magic bytes and hashed as-is (thumbnail via sharp if supported, else a placeholder); absent EXIF GPS is a flag, never a failure. *Test:* TC-035, TC-073.

---

## 3. Architecture

### 3.1 Capture data flow (the riskiest path)
```
phone (/field/record)                          server (/api/capture, Node runtime)
────────────────────                           ─────────────────────────────────────
GPS watch starts on entering the record flow (TP13)
photos via <input type=file capture=environment>
sha256(original bytes) per photo (S1)
payload {v,plotId,deviceId,seq,prevEventHash,
         capturedAt,gps,cherryKg,media[]}
canonicalize (RFC 8785) → ECDSA P-256 sign
IndexedDB: keep payload+signature+files  ──────▶ 1 parse multipart, size/type/count limits (TKT-19)
multipart POST, read NDJSON stream               2 canonical-form + signature + device state + plot
                                                   assignment → failure = 4xx, anchored rejected event
                                                 3 idempotency: payload_hash seen & accepted → stream
                                                   original verdict, stop (EV15, TP7)
                                                 4 store media (content-addressed), EXIF, thumbnails
                                                 5 build VerifyContext (reads only)
                                                 6 verify(): local checks → remote checks (cache →
                                                   provider, 8 s each, 10 s phase cap); each finished
                                                   check streams {t:"check"} (TP12)
                                                 7 BEGIN IMMEDIATE: harvest_events, media,
                                                   verification_runs + ledger entries → COMMIT (N7)
◀────────────── {t:"verdict", …} after COMMIT     8 stream {t:"verdict"} ; on txn failure {t:"error",
drop IndexedDB copy only on a verdict              retryable:true} and nothing persists (§7 rule 3)
```

### 3.2 Routes
| Path | Group / runtime | Auth | Ticket | Mockup |
|---|---|---|---|---|
| `/` | redirect by role, else `/sign-in` | — | TKT-04 | — |
| `/sign-in` | (public) | none | TKT-04 | composed (TP17) |
| `/enrol` | (agent) | agent | TKT-05 | composed + first-run language sheet |
| `/field` | (agent) | agent | TKT-10 | `index.html#s1` |
| `/field/record` | (agent), client state machine (photos → review → weight → checking → verdict) | agent | TKT-10 | `#s2 #s3 #s3-kg #s4 #s5 #s6` + Not accepted via D5 template |
| `/field/pickings`, `/field/pickings/[eventId]` | (agent) | agent | TKT-11 | `#s8` |
| `/field/help` | (agent) — deep link that opens the Help sheet (`#help-dialog` in the mockup) over Home | agent | TKT-11 | `index.html#help-dialog` |
| `/admin` (review queue), `/admin/review/[runId]` | (admin) | admin | TKT-12 | `admin.html` |
| `/admin/plots`, `/admin/plots/new`, `/admin/plots/[plotId]` | (admin) | admin | TKT-06, TKT-13 | composed (rail from `admin.html`) |
| `/admin/batches`, `/admin/batches/new`, `/admin/batches/[batchId]` | (admin) | admin | TKT-14 | composed |
| `/admin/phones` | (admin) | admin | TKT-05 | composed |
| `/admin/demo` (only when `DEMO_MODE=1`) | (admin) | admin | TKT-20 (TP27) | composed |
| `/buyer`, `/buyer/batches/[batchId]` | (buyer) | buyer | TKT-14 | composed |
| `/verify/[batchId]?h=` | (public) SSR from the feed | none | TKT-16/17 | `verify.html` |
| `POST /api/capture` | route handler, `runtime='nodejs'`, streamed NDJSON | agent session + device signature | TKT-02/19 | — |
| `POST /api/enrol` | route handler | agent session + code | TKT-05 | — |
| `GET /api/verify/[batchId]?h=` | route handler | none | TKT-15 | — |
| `GET /api/verify/[batchId]/geojson?h=` | route handler | none | TKT-17 | — |
| `GET /.well-known/udgam-ledger-key` | route handler | none | TKT-15 | — |
| `GET /api/health` | route handler | none | TKT-01 (+15, 07) | — |
| `GET /api/media/[mediaId]/thumb` | route handler; own-org session (agent: own events; admin: org events) | agent/admin | TKT-10 | — |
| `/api/auth/[...all]` | Better Auth handler | — | TKT-04 | — |
Route groups `(agent)`, `(admin)`, `(buyer)`, `(public)` carry the layouts and the server-side guard (TP-§10); URL prefixes `/field`, `/admin`, `/buyer` keep the paths distinct.

### 3.3 Directory layout and file ownership
```
src/
  app/
    tokens.css, globals.css, layout.tsx, manifest.ts, page.tsx          TKT-01 (tokens), TKT-10 (manifest)
    (public)/sign-in/  (public)/verify/[batchId]/                        TKT-04, TKT-16/17
    (agent)/enrol/ (agent)/field/{page,record,pickings,help}/            TKT-05, TKT-10, TKT-11
    (admin)/admin/{page,review,plots,batches,phones}/                    TKT-12, TKT-06/13, TKT-14, TKT-05
    (buyer)/buyer/                                                       TKT-14
    api/{capture,enrol,verify,health,auth}/  .well-known/udgam-ledger-key/
  components/ui/      ported primitives: GlassCard, Pill, Sheet, TabBar, Rail, VerdictChip, CheckRow,
                      PhotoSlot, Keypad, EvidenceList, PlotSvg, Cherry, Skeleton, StateView     TKT-01 → grown per UI ticket
  client/             browser-only: device-key.ts, gps.ts, sign.ts, capture-store.ts, capture-client.ts  TKT-02, 05, 10, 11
  lib/                NO next/* imports (lint rule)
    config/env.ts                                                        TKT-01
    crypto/{jcs,hash,ecdsa,base64url,index}.ts                           TKT-02
    db/{client,schema}.ts, db/migrations/*.sql, db/queries/*.ts          TKT-01 (client), TKT-02+ (schema per ticket)
    ledger/{types,hashchain,merkle,checkpoint,keys,proof,feed}.ts        TKT-02 (chain), TKT-15 (rest)
    ledger/testing/tamper.ts   tamper-variant generator shared by the harness and the test-only certificate route   TKT-18
    verification/{types,config,registry,score,evidence,verify}.ts, checks/*.ts   TKT-02, 07, 08, 09
    remote-sensing/{types,fixture,gfw,sentinel,cache,index}.ts           TKT-07
    media/{store,exif,thumbs,sniff}.ts                                   TKT-02 (store), TKT-08 (exif), TKT-19 (sniff)
    geo/{geofence,distance,area,parse,svg}.ts                            TKT-02, 06, 08
    capture/{parse,boundary,context,pipeline,persist}.ts                 TKT-02, 05, 09, 19
    auth/{auth,guards}.ts                                                TKT-04
    auth/signing-keys.ts   server-held per-user keys (TP15)                TKT-14 (used by TKT-12, 25)
    enrolment/, plots/, review/, attestations/, batches/, custody/       TKT-05, 06, 12, 13, 14
    eudr/geojson.ts                                                      TKT-17
    i18n/{en,kn,index}.ts  minimal t() + en in TKT-04; kn + LanguageSheet in TKT-05; grown by TKT-10/11
    log.ts                                                               TKT-01
evals/
  eval-dataset.json, eval-dataset.schema.json                            Stage 3 (+ Stage 6 M-002 cases)
  harness/{run,dataset,mutate,fixtures,context,provenance,results,report,release}.ts   TKT-03 (+ TKT-18, 21)
  fixtures/plots/*.geojson, fixtures/remote-sensing/*.json, fixtures/photos/*.jpg      TKT-03, 07, 08
  scorers/{case-assertions,detection-rate,false-positive-rate,critical-conditions,
           proof-verifier,latency,harness-integrity,wilson}.ts          TKT-03, 18, 21
  scorers/independent-verifier/  (standalone; own tsconfig; imports nothing from src/)   TKT-18
  results/ (formal runs, committed)  results/local/ (git-ignored)  reports/
e2e/  Playwright specs, tagged @eval and named with EVAL-/TC- IDs          per UI ticket
tests/ cross-cutting static tests (secret scan, wording guard, no-next-in-lib, tokens)   TKT-01, 13
scripts/ cloud-setup.sh, seed.ts, demo.ts, deploy.sh                     TKT-01, 20, 27
docs/ proof-feed.md, exec/ledger.md, eudr-geojson.md                     TKT-15/18, Stage 7, TKT-17
contracts/ (Foundry project: src/, test/, script/)                       TKT-24..26
deploy/ docker-compose.yml, Caddyfile, Dockerfile, cron/                 TKT-27
```
Two implementers never own the same file in one phase (§20).

---

## 4. Data model (Drizzle on libSQL; `src/lib/db/schema.ts` + SQL migrations)

### 4.1 Tables (Solution-PRD §3.4, with Stage 6 additions marked ★)
| Table | Columns (types abbreviated) | Owner |
|---|---|---|
| `organisations` | id text pk, type `fpo\|buyer\|processor`★(processor used in M-002), name, office_phone★ (Help → call the office) | TKT-02 seed / TKT-04 |
| Better Auth tables `user`, `session`, `account`, `verification` | generated by the Better Auth CLI; `user` gains `role text check(role in ('agent','admin','buyer'))`, `org_id text fk` | TKT-04 |
| `farmers` | id, org_id, name, identifier, **producer_id**★ text unique (random `PR-` + 8 Crockford base32, the only farmer ID ever public, EV16) | TKT-02 seed / TKT-06 |
| `plots` | id, farmer_id, crop `arabica\|robusta`, geojson text, area_ha real, registration_checks json, **registration_stale**★ int 0/1, anchor_seq fk, created_at, updated_at | TKT-02 / TKT-06 |
| `agent_plots`★ | agent_id fk user, plot_id fk, assigned_at, revoked_at null, pk(agent_id, plot_id) (GAP-2, TP5) | TKT-05 |
| `devices` | id (`DV-`+8 base32), agent_id, public_key_jwk text, key_thumbprint text unique, enrolled_at, revoked_at null, last_seq int, last_event_hash text, anchor_seq fk | TKT-02 seed / TKT-05 |
| `enrollment_codes` | code_hash text pk (SHA-256 of the 6-char code), agent_id, created_by, expires_at, used_at null, attempts int | TKT-05 |
| `harvest_events` | id, plot_id, device_id (nullable only when `boundary_status='rejected'`, e.g. an unknown key — `CHECK(device_id IS NOT NULL OR boundary_status='rejected')`), agent_id, seq, client_captured_at, server_received_at, lat, lng, accuracy_m, cherry_kg, prev_event_hash, **payload** text (the exact canonical string), payload_hash text **unique**, signature, boundary_status `accepted\|rejected`, boundary_reason null, **final_verdict**★ (trigger-maintained), anchor_seq fk not null | TKT-02 |
| `media` | id, event_id fk, path, sha256, size, mime, exif json, thumb_path; index on sha256 (not unique: rejected replays still store a row) | TKT-02 |
| `verification_runs` | id, event_id, run_no, verdict, score real, checks json, unavailable_providers json, config_version, config_hash, created_at, anchor_seq fk not null; unique(event_id, run_no) | TKT-02 |
| `admin_overrides` | id, run_id fk unique, admin_id, new_verdict `Verified\|Rejected`, reason (≥ 10 chars, check), signature, key_id, created_at, anchor_seq fk not null | TKT-12 |
| `attestations` | id, plot_id, type `organic`, file_hash, file_path, issuer, valid_from, valid_to, anchor_seq fk not null | TKT-13 |
| `batches` | id (`B-`+8 base32), org_id, crop, status `open\|transferred`, quantity_kg real, integrity_score real (both trigger-maintained), short_hash text (first 12 hex of the `batch_created` entry hash), anchor_seq fk not null | TKT-14 |
| `batch_events` | batch_id fk, event_id fk **unique** | TKT-14 |
| `custody_transfers` | id, batch_id, from_org, to_org, transferred_at, signature, key_id, anchor_seq fk not null | TKT-14 |
| `ledger_entries` | seq int **pk**, prev_hash, kind, payload json text, payload_hash, ts, entry_hash unique | TKT-02 |
| `ledger_checkpoints` | id int pk, from_seq, to_seq, merkle_root, prev_checkpoint_hash, ts, key_id, signature; unique(to_seq) | TKT-15 |
| `remote_sensing_cache` | plot_id, provider, kind `loss\|ndvi_history\|ndvi_window`, month_bucket (`YYYY-MM` or `static`), geometry_hash, response json, fetched_at; pk(plot_id, provider, kind, month_bucket, geometry_hash) | TKT-07 |
| `crop_yield_reference` | crop, variety, min_kg_ha, max_kg_ha (clean coffee), cherry_to_clean_ratio, source text, source_url, version | TKT-09 |
| `rate_limits`★ | key, window_start, count; pk(key, window_start) — used by enrolment and capture (no Redis, N3) | TKT-05 / TKT-19 |
| M-002 ★ | `agreements`, `settlements`, `quality_attestations`, `processing_steps` — schema in the TKT-24..26 plans | TKT-24..26 |

`geometry_hash` = SHA-256 of the canonical polygon, so an edited polygon misses the cache (EVAL-044).

### 4.2 Invariants enforced by the database (S8, N7, TP14)
Written as SQL in a custom Drizzle migration and tested by TC-058 / TC-010 by attempting the violation directly in SQL:
- **Anchor FK.** Every provenance table (`plots`, `devices`, `harvest_events`, `verification_runs`, `admin_overrides`, `attestations`, `batches`, `custody_transfers`) has `anchor_seq INTEGER NOT NULL REFERENCES ledger_entries(seq)` with `PRAGMA foreign_keys=ON` on every connection. A provenance row cannot exist without its ledger entry (CF-08). The reverse direction is guaranteed by the shared transaction (TC-010 kills the transaction between the two writes).
- **Append-only ledger.** `BEFORE UPDATE` and `BEFORE DELETE` triggers on `ledger_entries` and `ledger_checkpoints` → `RAISE(ABORT,'ledger is append-only')`.
- **Final verdict.** `AFTER INSERT` on `verification_runs` and on `admin_overrides` set `harvest_events.final_verdict`. An override insert on a run whose checks contain a hard fail → `RAISE(ABORT)` (CF-06; the app also hides the control).
- **Batch membership.** `BEFORE INSERT` on `batch_events` aborts unless the event's `final_verdict='Verified'`, its plot crop equals the batch crop, and the batch is `open`. `batch_events.event_id UNIQUE` (CF-07).
- **Batch aggregates.** `AFTER INSERT` on `batch_events` recomputes `quantity_kg = Σ cherry_kg` and `integrity_score = MIN(score of the run that set final_verdict)`; the columns are never written by the app.
- **Lock after transfer.** `BEFORE UPDATE` on `batches` and `BEFORE INSERT/DELETE` on `batch_events` abort when `status='transferred'` (except the single `open→transferred` status change made by the custody insert).

### 4.3 Transactions
`db.transaction(fn, 'write')` (libSQL interactive transaction → `BEGIN IMMEDIATE`). Ledger `append(tx, kind, payload)` only accepts a transaction handle, so an anchor can't be written outside one. `busy_timeout = 5000`, WAL mode.

---

## 5. Crypto and the signed payload (S1, S9, DISC5)

### 5.1 Primitives (`src/lib/crypto`, isomorphic, WebCrypto only)
- `jcs(value): string` — RFC 8785 via `canonicalize`; rejects `undefined`, non-finite numbers, and non-plain objects.
- `sha256Hex(bytes | string): Promise<string>` — lowercase hex; strings are UTF-8 encoded.
- `generateDeviceKey(): Promise<CryptoKeyPair>` — `{name:'ECDSA', namedCurve:'P-256'}`, **`extractable:false`** for the private key (browser).
- `sign(privateKey, jcsString): Promise<string>` / `verify(publicJwk, jcsString, sigB64u): Promise<boolean>` — ECDSA with SHA-256; signature in WebCrypto's native IEEE P1363 form (64 bytes r‖s), base64url without padding.
- `jwkThumbprint(publicJwk)` — RFC 7638 SHA-256 thumbprint, base64url (device `key_thumbprint`, ledger `kid`).

### 5.2 Capture payload v1 (the exact object the phone signs)
```ts
type CapturePayloadV1 = {
  v: 1;
  plotId: string;
  deviceId: string;
  seq: number;                 // device's next sequence number, from IndexedDB (server's last_seq + 1 at enrolment)
  prevEventHash: string;       // payload_hash of this device's last accepted event, or 'genesis'
  capturedAt: string;          // ISO UTC from the phone clock at Submit
  gps: { lat: number; lng: number; accuracyM: number };   // lat/lng rounded to 7 dp, accuracy to 1 dp
  cherryKg: number;            // multiple of 0.5, 0.5..500
  media: { sha256: string; size: number; mime: string }[]; // 1..3, in upload order
};
```
- `payload_hash = sha256Hex(jcs(payload))`. The multipart body carries `payload` (that JCS string), `signature`, and `photo0..photo2`.
- The server accepts the payload only if `jcs(JSON.parse(payload)) === payload`, zod-parses it, and verifies the signature over those exact bytes (Review focus 1).

### 5.3 Browser/Node agreement (EVAL-066)
`evals/fixtures/crypto-vectors.json` holds JCS inputs/outputs (key order, Unicode, numbers like `1e21`, `-0`, `0.1`), SHA-256 digests, and signatures made in Node. The same vectors run in Vitest (Node) and in Playwright's Chromium via a tiny test page (`e2e/crypto-vectors.spec.ts`). Both must agree 100 %.

---

## 6. Verification pipeline (`src/lib/verification`)

### 6.1 Contract (Solution-PRD §4.1)
```ts
type CheckStatus = 'ok' | 'flag' | 'fail' | 'unavailable';
type CheckResult = { id: CheckId; status: CheckStatus; score: number; weight: number;
                     hardFail: boolean; evidence: string; provider?: 'gfw' | 'sentinel-hub' };
type Verdict = 'Verified' | 'Needs Review' | 'Rejected';
type VerifyResult = { verdict: Verdict; score: number; checks: CheckResult[];
                      unavailableProviders: string[]; capReasons: string[];
                      config: { version: string; hash: string } };
type Submission = { payload: CapturePayloadV1; payloadHash: string; signature: string;
                    media: { sha256: string; exif: ExifFacts }[]; serverReceivedAt: string };
type VerifyContext = {
  device: { id: string; publicJwk: JsonWebKey; revokedAt: string | null; lastSeq: number; lastEventHash: string | null };
  agentPriorAcceptedEvents: number;               // on any device (TP10)
  previousEvent: { lat: number; lng: number; capturedAt: string } | null;   // this device's last accepted event
  plot: { id: string; crop: 'arabica' | 'robusta'; polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon; areaHa: number };
  seenMediaHashes: Set<string>;                   // subset of this submission's hashes already in `media` for accepted events
  seasonCherryKgBefore: number;                   // TP6
  yieldReference: { maxKgHa: number; cherryToCleanRatio: number; source: string };
  remoteSensing: RemoteSensingProvider;           // cache-wrapped (§7)
};
verify(sub: Submission, ctx: VerifyContext, opts?: { enabled?: CheckId[]; onCheck?: (r: CheckResult) => void }): Promise<VerifyResult>
```
`verify` never throws. Each check runs inside `runCheck()`, which converts a throw into `{status:'unavailable', evidence:'Check could not run: <ErrorClass>'}` (§7 rule 4, EVAL-018). `opts.enabled` is how `--config=ledger-only` disables all but `signature_valid` (baseline-v0).

### 6.2 Config `cfg-1` (TP2 — resolves GAP-5)
```ts
export const CONFIG = {
  version: 'cfg-1',
  statusScore: { ok: 1, flag: 0.5, fail: 0 },            // 'unavailable' is excluded from the mean
  weights: { /* every check */ 1 },                         // equal weights: nothing is tuned to the eval set (EV13)
  verdict: { verifiedMin: 80, reviewMin: 50 },
  caps: { anyFail: true, flagCaps: ['deforestation_overlap', 'yield_plausibility'], anyUnavailable: true }, // S10
  geofence: { maxBufferM: 25 },
  gpsAccuracy: { okBelowM: 30, flagBelowM: 100 },
  exifGps: { maxDistanceM: 50 },
  exifTime: { maxExifClientMin: 10, maxClientServerMin: 1440, failAfterMin: 10080 },   // TP4
  movement: { maxKmh: 120 },
  deforestation: { flagAbovePct: 0, hardFailAtPct: 10, lossFromYear: 2021, canopyDensityPct: 10, gfwDatasetVersion: 'v1.13' }, // S5, TP11
  ndviCultivation: { minClearMonths: 6, canopyMin: 0.5, maxSeasonalSwing: 0.35 },      // TP11
  ndviHarvestWindow: { windowDays: 30, okMin: 0.45, failBelow: 0.30 },                 // TP11
  yield: { flagAboveU: 1.5, hardFailAboveU: 2.0 },
  providers: { timeoutMs: 8000, remotePhaseCapMs: 10000 },
} as const;
export const CONFIG_HASH: string = await sha256Hex(jcs(CONFIG));   // top-level await (ESM); computed once at module load
```
Score = `100 × Σ(weight × statusScore) / Σ weight` over checks with status ≠ `unavailable`, rounded to one decimal. Verdict order: any `hardFail` → **Rejected**; else score < 50 → **Rejected**; else any cap reason → **Needs Review**; else ≥ 80 → **Verified**; else **Needs Review**. `capReasons` names each cap that applied (shown in admin review, EVAL-075).

### 6.3 Check rules (Solution-PRD §4.2 with Stage 6 resolutions)
| Check | ok | flag | fail | hard fail | unavailable |
|---|---|---|---|---|---|
| `signature_valid` | signature verifies with the enrolled, unrevoked device key | — | — | invalid signature, unknown key, revoked device | never (pure) |
| `chain_continuity` (TP10) | `seq = lastSeq+1` and `prevEventHash = lastEventHash`; or genesis with no prior events for the agent | wrong seq/prev hash; or genesis on a new device when the agent has prior accepted events (EVAL-021) | — | — | — |
| `photo_uniqueness` | no hash in `seenMediaHashes` | — | — | any photo seen before ("k of n") | — |
| `geofence` | inside polygon | outside, distance to edge ≤ min(accuracy, 25 m) | outside beyond that buffer | — | — |
| `gps_accuracy` | < 30 m | 30 ≤ a < 100 m | ≥ 100 m | — | — |
| `exif_gps_agreement` | EXIF GPS ≤ 50 m from phone GPS (nearest photo) | EXIF GPS absent on every photo | > 50 m on any photo | — | — |
| `exif_time_agreement` (TP4) | EXIF–client ≤ 10 min **and** client–server ≤ 24 h | EXIF absent; or EXIF–client > 10 min; or client–server > 24 h | either gap > 7 days | — | — |
| `movement_plausibility` | no previous event, or implied speed < 120 km/h | — | ≥ 120 km/h | — | — |
| `deforestation_overlap` | loss = 0 | 0 < loss < 10 % of area | — | loss ≥ 10 % | provider error/timeout with empty cache |
| `ndvi_cultivation` (TP11) | ≥ 6 clear months, min NDVI ≥ 0.50, swing ≤ 0.35 | — | min < 0.50 or swing > 0.35 | — | < 6 clear months, or provider error |
| `ndvi_harvest_window` (TP11) | mean NDVI ±30 d ≥ 0.45 | 0.30–0.45 | < 0.30 | — | no clear observation (cloud) or provider error |
| `yield_plausibility` (TP6) | season ≤ 1.5×U | 1.5×U < s ≤ 2×U | — | > 2×U | no reference row for the crop |
Boundaries follow the dataset's paired cases exactly (evaluation-plan §7.5 last paragraph): `<` vs `≤` above are chosen so EVAL-009/025, 010/027, 014/023, 011/056, 034/033, 013/028, 006/040, 039/038, 012/048 and 047/046 land on their expected sides. TC-036/TC-037/TC-038 assert every pair.

### 6.4 Plot assignment is a boundary rule, not a scored check (TP5 — resolves GAP-2)
A capture for a plot not currently assigned to the device's agent (`agent_plots`, `revoked_at IS NULL`) is refused at the boundary like a bad signature: HTTP 403, reason `plot_not_assigned`, anchored as a rejected `harvest_event` (Solution-PRD §7 rule 2; EVAL-054). The twelve-check registry and `cfg-1` are unchanged. EVAL-054 moves from `pending_decision` to `active` (dataset 0.2.0).

### 6.5 Evidence templates (TP3 — resolves GAP-8)
English templates live in `src/lib/verification/evidence.ts`; every template names the measured value and the threshold (HR1). The farmer-facing copy layer (`i18n`) rewrites them in plain words with the same numbers.
| Check · status | Template |
|---|---|
| signature_valid ok / hard fail | `Signed by enrolled phone {deviceId}` / `Signature does not match phone {deviceId}` · `Phone {deviceId} was revoked on {date}` · `Phone key is not enrolled` |
| chain_continuity ok / flag | `Entry {seq} follows entry {seq-1} from this phone` / `Expected entry {expected} after {prev8}, got entry {seq}` · `First entry from a new phone; this agent has {n} earlier entries on another phone` |
| photo_uniqueness ok / hard fail | `{n} of {n} photos are new` / `{k} of {n} photos seen before` |
| geofence ok / flag / fail | `Inside the plot, {d} m from the edge` / `{d} m outside the plot edge, within the {b} m GPS allowance` / `{d} m outside the plot edge (allowance {b} m)` |
| gps_accuracy | `GPS accuracy {a} m (good under 30 m, limit 100 m)` |
| exif_gps_agreement ok / flag / fail | `Photo location {d} m from phone location (limit 50 m)` / `Photo has no location data` / `Photo location {d} m from phone location (limit 50 m)` |
| exif_time_agreement | `Photo time {Δ} from capture time (limit 10 min); phone clock {Δ} from server (limit 24 h)` · `Photo has no time data` · fail: `… (fail over 7 days)`; Δ as `N min` under 120 min, `N h` under 48 h, else `N days` |
| movement_plausibility ok / fail | `First entry from this phone` · `Implied speed {v} km/h from the previous entry {d} m away {t} min earlier (limit 120 km/h)` |
| deforestation_overlap | `{p}% of plot area lost since 2021 (hard fail at 10.0%)` · unavailable: `Forest-loss data unavailable: {reason}; an admin re-run will retry` |
| ndvi_cultivation | `Canopy all year: monthly NDVI {min}–{max} over {k} clear months (needs ≥ 0.50, swing ≤ 0.35)` / fail with the failing number |
| ndvi_harvest_window | `Living canopy around the picking date: NDVI {x} (needs ≥ 0.45)` · `Satellite view blocked by cloud for ±30 days` |
| yield_plausibility | `Season total {r}x the reference upper bound (flag above 1.50x, hard fail above 2.00x)` |
| any · unavailable (throw) | `Check could not run: {ErrorClass}` |
TC-011 snapshot-tests every row; the case-assertions scorer checks `evidence_substrings` from the dataset.

### 6.6 Yield (TP6 — resolves GAP-3)
- **Season window:** the Indian coffee year, 1 Oct – 30 Sep, bucketed by **server receipt time** in IST (client time is attacker-controlled).
- **Season cumulative:** Σ `cherry_kg` of this plot's events in the window with `boundary_status='accepted'` and `final_verdict ≠ 'Rejected'`, plus this event.
- **Conversion point:** convert once, at comparison: `s = (cumulativeCherryKg × cherry_to_clean_ratio ÷ area_ha) ÷ max_kg_ha`. `max_kg_ha` is the clean-coffee upper bound of the reference row.
- **Reference values:** Coffee Board of India, *Database on Coffee, July 2024*, Tables 1.10–1.11 (clean coffee, kg/ha of bearing area; https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf). `max_kg_ha` = the highest district average in Kodagu/Chikkamagaluru over 2018-19 to 2023-24: **Arabica 783** (Chikkamagaluru 2023-24), **Robusta 1,494** (Kodagu 2023-24). `cherry_to_clean_ratio` = **1/6 ≈ 0.1667** (fresh ripe cherry to clean coffee). The Coffee Board publishes no fresh-cherry figure, only dry-cherry outturn (Arabica 53.5 %, Robusta 52.7 %; Annual Report 2022-23). 6:1 is the conservative end of the 5–6:1 industry range, consistent with a measured 6.2–6.3:1, and is recorded in provenance as **unverified**. The flags therefore fall at about 7,050 kg/ha fresh cherry per season (Arabica) and 13,450 (Robusta); hard fails at about 9,400 and 17,930. **Risk (TP6):** district averages are not true upper bounds, so exceptional honest estates could be flagged, and at 2× rejected. Before a pilot, the design-partner FPO validates these numbers; per-plot yield history is the roadmap replacement. The harness is unaffected because cases are written in multiples of U.
- **Known limitation (GAP-7):** earlier events are not re-scored when a later one crosses a threshold (EV6; EVAL-049 note).

---

## 7. Remote sensing (`src/lib/remote-sensing`, TKT-07)
```ts
interface RemoteSensingProvider {
  name: 'fixture' | 'live';
  forestLoss(plot: PlotGeom): Promise<{ lossHa: number; lossPct: number; yearsFrom: number; dataYear: number }>;
  ndviHistory(plot: PlotGeom, endMonth: string): Promise<{ months: { month: string; mean: number | null; clearFraction: number }[] }>;
  ndviWindow(plot: PlotGeom, centreDate: string, days: number): Promise<{ mean: number | null; clearObservations: number }>;
}
```
- **Fixture adapter (default).** Reads `evals/fixtures/remote-sensing/<plotId>.json` (profiles `perennial_canopy`, `cleared_then_planted`, `annual_crop`, `living_canopy`, `cloud_blocked`, explicit loss %). Fault injection (`timeout`, `http_500`, `malformed`) comes only from the harness through a constructor option — never from env in production.
- **Cache wrapper.** Key (plot, provider, kind, month bucket, geometry hash). Forest loss: `static`. NDVI history: the registration month. Harvest window: the capture month. Hit → no call (N1).
- **Timeouts.** `AbortSignal.timeout(8000)` per call; the remote phase is `Promise.allSettled` with a 10 s cap. Timeout, non-2xx, malformed body → the check is `unavailable` with the provider named in `unavailableProviders` (S6). Never Rejected.
- **Re-run (TKT-12).** Re-runs only the checks whose provider was unavailable; the others are copied from the previous run with their original evidence; the new run is a new `verification_run` (run_no+1), anchored.
- **Live adapters:** 
- **GFW (forest loss).** `POST https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss/v1.13/query/json`, header `x-api-key: $GFW_API_KEY`, body `{ "sql": "SELECT umd_tree_cover_loss__year, SUM(area__ha) AS loss_ha FROM results WHERE umd_tree_cover_loss__year >= 2021 AND umd_tree_cover_density_2000__threshold >= 10 GROUP BY umd_tree_cover_loss__year", "geometry": <plot polygon> }`. The dataset version is pinned (`v1.13`, not `latest`) and recorded in provenance. The canopy threshold is **10 %**, matching the EUDR forest definition (canopy cover > 10 %) rather than GFW's 30 % default (TP11). `lossPct = Σ loss_ha ÷ area_ha × 100`. Data runs through 2025, 30 m resolution, CC BY 4.0 (attribution on the certificate). GFW publishes no numeric rate limits, so calls are cached per geometry and made only at registration or edit. Keys come from the Data API `/auth` flow and last one year; the owner creates the key (M-003 precondition).
- **Copernicus Data Space Sentinel Hub (NDVI).** Token: `POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token` (`grant_type=client_credentials`, `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`), cached until `exp` − 60 s. Statistics: `POST https://sh.dataspace.copernicus.eu/statistics/v1` with `input.bounds.geometry` (EPSG:4326), `input.data=[{type:"sentinel-2-l2a", dataFilter:{mosaickingOrder:"leastCC"}}]`, `aggregation.timeRange`, and `aggregationInterval.of` = `P1M` for the 12-month history or `P10D` over ±30 days for the harvest window, `resx/resy ≈ 0.0001`°, `lastIntervalBehavior: "SHORTEN"`. The evalscript returns `ndvi` (FLOAT32) and a `dataMask` that excludes SCL classes 3, 8, 9, 10 and 11 (cloud shadow, cloud, cirrus, snow); the script is in `src/lib/remote-sensing/ndvi.evalscript.js`. An interval with `noDataCount == sampleCount` (mean `NaN`) counts as not clear. Free tier: 10,000 PU and 10,000 requests per month, 300 per minute. Udgam uses about one request per plot registration and one per plot per capture month, well inside it.

---

## 8. Ledger, checkpoints and the proof feed (`src/lib/ledger`, TKT-02/15/18)

### 8.1 Entries (S7)
`entry_hash = sha256Hex(jcs({ seq, prev_hash, kind, payload_hash, ts }))`, `payload_hash = sha256Hex(jcs(payload))`, genesis `prev_hash = '0'.repeat(64)`. Kinds (M1): `plot_registered, plot_edited, device_enrolled, device_revoked, harvest_event, verification_run, admin_override, attestation, batch_created, custody_transfer` (`plot_edited` added for EVAL-044 — a polygon edit is a new anchored fact rather than a mutation of the old one).
**Ledger payloads are public-safe (EV16, TP16):** they carry IDs, hashes, numbers and `producer_id`, never farmer name, identifier or phone number.

### 8.2 Merkle checkpoints (TP9 — resolves GAP-9)
- Leaves: the `entry_hash` bytes of entries `from_seq..to_seq`, in `seq` order. Hashing follows RFC 6962 §2.1: `leaf = SHA-256(0x00 ‖ entry_hash_bytes)`, `node = SHA-256(0x01 ‖ left ‖ right)`, split at the largest power of two < n (no duplication of odd nodes, so no second-preimage ambiguity).
- Checkpoint every 100 entries (created in the same transaction as the 100th append, via the ledger's `onAppended(tx, seq)` hook that TKT-02 exposes and TKT-15 wires) or on demand. Signed statement: `jcs({ v:1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts })`, ECDSA P-256 with the ledger key, P1363 base64url. `prevCheckpointHash = sha256Hex(statement of the previous checkpoint)`.
- **Ledger key.** Generated at first boot if `LEDGER_KEY_PATH` (default `DATA_DIR/keys/ledger.jwk`) is missing; file mode 0600; never logged; public JWK + `kid` (RFC 7638 thumbprint) served at `/.well-known/udgam-ledger-key` as `{ keys: [jwk] }`. Losing the file means new checkpoints under a new kid; old ones stay verifiable only while the old public key is published — backup is an M-003 deliverable (TKT-27).

### 8.3 Proof feed v1 (`GET /api/verify/[batchId]?h=`; documented in `docs/proof-feed.md`)
```jsonc
{
  "format": "udgam-proof-feed/1",
  "batchId": "B-7K2M9Q4D",
  "shortHash": "3f9a1c0b7e2d",                 // first 12 hex of the batch_created entry_hash
  "ledgerKey": { "kid": "…", "url": "/.well-known/udgam-ledger-key" },
  "checkpoints": [ { "id": 7, "fromSeq": 601, "toSeq": 700, "merkleRoot": "…", "prevCheckpointHash": "…", "ts": "…", "kid": "…", "signature": "…" } ],
  "entries": [ { "seq": 612, "prevHash": "…", "kind": "harvest_event", "payload": { … }, "payloadHash": "…", "ts": "…",
                 "entryHash": "…", "checkpointId": 7, "leafIndex": 11, "path": [ "hex", "hex", … ] } ]
}
```
- **Scope = the batch's provenance closure** (evaluation-plan §4.6): `batch_created`, every `custody_transfer`, and for each event its `harvest_event`, all `verification_run`s and any `admin_override`; per plot `plot_registered`, `plot_edited`, `attestation`; per device `device_enrolled`, `device_revoked`.
- **S7 on-demand checkpoint.** If any closure entry is after the last checkpoint, the feed creates one inside a write transaction before responding (EVAL-065). `checkpointIfNeeded` is idempotent (it creates nothing when every closure entry is already checkpointed), so no separate rate limit is needed.
- **GAP-6 (TP8).** Unknown batch, missing `h`, or `h` ≠ `short_hash` (constant-time compare) → `404 {"error":"not_found"}`, identical for all three. The page does the same.
- **Extensions.** Later milestones add kinds to the closure (M-002: `agreement_created`, `settlement`, `quality_attestation`, `processing_step`) and optional `evm` fields per entry (`txHash`, `blockNumber`, or `pending` while the on-chain anchor lags the DB commit). Each addition updates `docs/proof-feed.md`, the clean-room checker and evaluation-plan §4.6 in the same ticket; the format name stays `udgam-proof-feed/1` because the changes are additive.
- **Verification algorithm** (shared `verifyFeed()` in `lib/ledger/proof.ts`, and independently re-implemented in the clean-room checker): for each entry: recompute `payloadHash`, recompute `entryHash`, recompute the Merkle root from `leafIndex` + `path` and compare with its checkpoint's `merkleRoot`; for each checkpoint: verify the signature with the published key whose `kid` matches; check `shortHash` equals the `batch_created` entry hash prefix. The verifier also checks closure completeness from the payloads themselves (every event listed in `batch_created` has its `harvest_event` and at least one `verification_run`; custody entries chain from the batch), so a dropped entry is caught. Signed payloads (`batch_created`, `custody_transfer`, `admin_override`) embed `kid`, `publicJwk` and `signature` so their signatures are checkable from the feed alone. The result names the first failing step (`payload-hash`, `entry-hash`, `merkle-path`, `checkpoint-signature`, `unknown-key`, `short-hash`, `closure-incomplete`, `payload-signature`) — the page shows it (EVAL-059..063).

### 8.4 The certificate renders from the feed (TP16)
`/verify/[batchId]` server-renders the page by calling the feed builder and deriving **every displayed fact** (quantity, crop, origin plots and polygons, producer IDs, verdicts and evidence, custody chain, attestation line) from the feed's payloads. The feed JSON is embedded in the page (`<script type="application/json" id="proof-feed">`), so the in-browser verifier hashes exactly what is displayed and no second fetch is needed (S4). The client fetches only the ledger key. The page is `noindex, nofollow` (Design.md §25 deferred decision; public per batch, not for search) while OG tags remain for link previews.

---

## 9. Capture client (`src/client`, TKT-02/05/10/11)
- **Device key.** `idb` database `udgam` with stores `keys` (the `CryptoKeyPair`, private key non-extractable, stored as a structured-cloned `CryptoKey`), `device` (deviceId, next seq, last event hash), `outbox` (pending captures: payload string, signature, photo `Blob`s, created_at, attempts).
- **GPS (TP13).** `navigator.geolocation.watchPosition` with `enableHighAccuracy:true` starts when `/field/record` mounts and keeps the best fix; at Submit, use the best fix if < 10 s old, else wait up to 10 s for a fresh one. A weak fix never blocks capture (Design.md §18). The watch stops on leaving the flow.
- **Photos.** `<input type="file" accept="image/*" capture="environment">` per slot; hash the `File`'s bytes with `crypto.subtle.digest` as soon as a photo is accepted (so Submit only signs).
- **Send.** Build → canonicalise → sign → write to `outbox` → `fetch('/api/capture', {method:'POST', body: FormData})` → read the NDJSON stream with `response.body.getReader()`; update the checking screen per `{t:"check"}` — the screen shows the mockup's **six farmer-facing groups** (s4), each ticking when all of its checks have finished (mapping in the TKT-10 plan); on `{t:"verdict"}` delete the outbox record and advance seq/last hash; on network error, non-2xx 5xx, or `{t:"error", retryable:true}` show the s7 sheet. 4xx boundary rejections show the Not-accepted verdict with the reason and delete the outbox copy (retrying cannot help).
- **Retry.** "Try again" re-sends the identical payload + blobs; the server's idempotency (TP7) makes a lost-response retry safe (EVAL-068).
- **Reduced motion.** No cherry rise/bloom; the checking screen shows "See result" instead of auto-advancing (Design.md §15).

## 10. Auth, authorisation and signing keys (TKT-04, TKT-12, TKT-14)
- **Better Auth** email + password with the Drizzle adapter; seeded demo accounts per role; session cookie `httpOnly`, `secure` in production, `sameSite=lax`. `BETTER_AUTH_SECRET` from env.
- **Guards.** `requireSession(role)` in every (agent)/(admin)/(buyer) layout **and** in every Server Action and route handler (layouts alone don't protect actions). Every query takes `orgId` from the session, never from input; a cross-org ID returns 404, not 403 (EVAL-080, CF-10). A lint rule (`tests/guard-coverage.test.ts`) fails if a file under `app/(admin|agent|buyer)` exports a Server Action without calling a guard.
- **Middleware** only redirects unauthenticated navigation; it is never the security boundary.
- **`/api/capture`** accepts the TKT-02 tracer's seeded device without a session; from TKT-04 on it requires an agent session **and** the device signature, and the device must belong to that agent.
- **Processor role (M-002).** Whether processors get a `processor` role or a scoped admin view is decided with the TKT-23 design addendum (next D#); until then the roles are agent, admin, buyer.
- **Admin signing keys (TP15).** Overrides and custody transfers are "signed with the admin's server-bound key" (Solution-PRD §4.4): the server generates a P-256 key per admin on first use at `DATA_DIR/keys/users/<userId>.jwk` (0600), signs `jcs(statement)`, and anchors the statement, signature and `kid`. Honest wording in UI and docs: *signed by the server on behalf of the signed-in admin* — it attests which account decided, not possession of a personal device key.
- **Enrolment codes.** 6 characters from a 31-symbol unambiguous alphabet, stored as SHA-256, 24 h expiry, single use, 5 attempts per code and 10 per IP per hour via `rate_limits` (EVAL-082).

## 11. UI implementation rules
- **Port, don't redraw.** Screens with a mockup are ported from `.design/exploration/final/{index,admin,verify}.html`: markup structure, class roles, token values and copy. Prototype-only scaffolding (storyboard frames, states banner, "Jump to screen" menu, direction parameters) is not ported.
- **Screens without a mockup (TP17)** — sign-in, enrolment, Help, the Not-accepted verdict, plot list/editor, batch builder, phones, buyer list — are composed from the ported components only, in the same layout grammar (rail + list + detail for admin; single column + one pill for field). No new colours, radii, type sizes, motion or iconography. Not accepted uses the D5 verdict template: no cherry rim, `--bad` tokens, no green anywhere, names the reason and what to do. Stage 8 critiques them against Design.md like every other screen.
- **Components** in `src/components/ui/` map 1:1 to Design.md §13: primary pill (60 px, glow) · plot card (`PlotSvg` from GeoJSON, pulse dot) · photo slot tiles + counter · numeric keypad + lit number · check rows + progress bar filled by finished checks · verdict screen · tinted bottom sheet · frosted rows with verdict chip · admin detail pane + reason panel.
- **States.** Every data-backed view implements loading (skeleton, not spinner), empty, error (what happened · what to do · nothing lost) and working (Design.md §18), reachable in dev via `?state=loading|empty|error` for e2e (disabled in production builds).
- **i18n (TP18).** `src/lib/i18n/{en,kn}.ts` typed dictionaries + `t(key, vars)`; language in a cookie; `lang` attribute set on `<html>`. Kannada entries carry `// REVIEW: native speaker` and `kn.ts` has a header listing the pending review. N5: English is the shipped default; Kannada is available behind the switch (TKT-11).
- **Maps (TP19).** Leaflet + leaflet-draw only in the admin plot editor (dynamic import, `ssr:false`), tiles from `MAP_TILE_PROVIDER`: default **Esri World Imagery through the keyed ArcGIS Location Platform basemap service** (`ARCGIS_API_KEY`, free tier 2M tiles/month; attribution "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community" + "Powered by Esri"). The unkeyed legacy `server.arcgisonline.com` URL is not used, because its licence for a public demo is unverified. Fallback: MapTiler Satellite (`MAPTILER_KEY`, free plan, non-commercial, MapTiler logo required). The Home plot card and the certificate draw polygons as inline SVG from GeoJSON (Design.md §25: SVG maps only). e2e stubs tile requests.
- **Motion.** One moment: Verified cherry rises 12 px + rim bloom, 400 ms ease-out; 200 ms fades between screens; pulse ring on the Home dot; all disabled under `prefers-reduced-motion`. Native scroll only (Design.md §15; no scroll library).
- **Fonts.** Figtree 400–800 and Noto Sans Kannada 400/600/700 via `next/font/google` (self-hosted at build, no runtime Google request).
- **Accessibility.** WCAG 2.2 AA; targets ≥ 48 px (primary 60 px); visible focus `--focus`; verdict never by colour alone; live region announces each check and the verdict; polygon editing has point add/remove buttons (WCAG 2.5.7).

## 12. EUDR export and certificate metadata (TKT-17)
- **GeoJSON (TP24):** EUDR GeoJSON File Description v1.5 (European Commission, 5 May 2025), which applies to both the Information System UI and API, plus Reg. (EU) 2023/1115 Art. 2(28):
  - A `FeatureCollection` in WGS84 (EPSG:4326), coordinates **[longitude, latitude]** rounded to **6 decimals**, with consecutive duplicates removed after rounding. One `Feature` per plot in the batch.
  - Geometry: **Polygon for plots of 4 ha or more**, Point (the polygon's point-on-surface) under 4 ha. The regulation allows a point up to and including 4 ha; Solution-PRD's "point for plots < 4 ha" is kept because a polygon is always acceptable, so P10 at exactly 4.0 ha exports a Polygon. Rings are closed with at least 4 positions; no holes (outer ring only); no self-intersection (validated at registration, TC-026).
  - EU properties (case-sensitive): `ProducerName` = the pseudonymous **producer_id** (EV16: no farmer names in public files; an exporter can substitute names in its private DDS), `ProducerCountry: "IN"`, `ProductionPlace` = "<District>, Karnataka" (district only, no village), and `Area` (hectares, JSON number) on Points.
  - Udgam properties (ignored by the EU system, kept for Solution-PRD F12 and buyers): `commodity: "coffee"`, `hs_code: "0901 11"` (green coffee, not roasted or decaffeinated; EUDR Annex I heading 0901), `quantity_kg_cherry` (the batch's fresh-cherry kg, labelled as such because a DDS quantity is net mass of the product placed on the market), `crop`, `batch_id`, `certificate_url`.
  - Size stays far below the 25 MB per-DDS limit. `docs/eudr-geojson.md` documents the fields with their sources, and `docs/eudr-geojson.schema.json` validates them.
  - Context (no scope change): Reg. (EU) 2025/2650 moved application to 30 Dec 2026 (large and medium) and 30 Jun 2027 (micro and small), and added a simplified one-off declaration for micro and small primary operators. The export serves the exporter/importer DDS either way.
- **Metadata.** `generateMetadata` on `/verify/[batchId]`: title "Kodagu Arabica, verified at origin — Udgam" pattern from the feed, description, canonical, OG + Twitter (`summary_large_image`) with `og/verify.png` (copied from `.design/exploration/og/verify.png` to `public/og/verify.png`), absolute URLs from `PUBLIC_BASE_URL` (M-003 sets the HTTPS domain; EVAL-090 unfurl checked in TKT-28).
- **Print.** `@media print` light token set (Design.md §12 print row), controls hidden, warnings ≥ 7.4:1.

## 13. Evaluation architecture (wired here; built in TKT-03/18/21) (TP20)
**Single top-level command:** `pnpm eval` — offline, fixture provider, no secrets; runs the `harness-verifier` and `harness-proof` suites; writes `evals/results/eval-run-{appVersion}-{shortSha}.json` (`-r2`… on repeat; ad-hoc runs to `evals/results/local/`) and `evals/reports/eval-report-{…}.md` generated **from the results file only**; exits non-zero on any failed gate it owns (S1, S2, S6-lib, S7) or any CF.

| Command | Does | Where |
|---|---|---|
| `pnpm eval` | harness suites, gates S1/S2/S6-lib/S7, CFs | local, CI (path-filtered), cloud session |
| `pnpm eval --config=ledger-only` | baseline-v0: only `signature_valid` enabled | TKT-03 once |
| `pnpm eval --provider=live` | P01–P10 live vs recorded fixtures (agreement report, no gate) | needs keys; never CI |
| `pnpm eval:integration` | Vitest `integration` project; tests titled `EVAL-0xx …`; JSON reporter → `evals/results/local/integration.json` | CI |
| `pnpm eval:e2e` | Playwright `@eval` tests (design, certificate, demo) | CI on main, Stage 9 |
| `pnpm eval:perf --target=<url>` | S3 (20 runs, EV9 network profile via CDP) and S4 (10 cold loads, 4× CPU throttle) | M-001 end (S4), M-003 on Oracle |
| `pnpm eval:release` | runs all of the above and merges into one release result + report for `QA-report.md` | Stage 9/10 |

- **Harness pipeline** (`evals/harness/`): load + ajv-validate the dataset → for each active case build `(Submission, VerifyContext)` from its plot fixture, device fixture, base case and mutations (§7.3 ops; unknown op = error) → call the real `verify()` → score with `case-assertions` → aggregate with the scorers → provenance → write results → render report.
- **Independence.** Every case gets a fresh context; device keys are generated per run; results must not depend on order (the runner shuffles with a logged seed; TC-014).
- **Cases whose checks don't exist yet** are reported `not_yet_implemented` and count as failed for gates; never dropped (EVAL-092).
- **Provenance** (evaluation-plan §12): app version, commit, branch, dirty flag, environment, dataset version + SHA-256, fixture set hash, `CONFIG` + hash, provider mode, yield-reference version and source, ledger adapter, Node version, OS/arch, harness version, UTC timestamp, duration.
- **Fixtures.** `evals/fixtures/plots/*.geojson` for P01–P10, E01, X01–X07 — deterministic polygons near real Kodagu coordinates generated by `evals/harness/fixtures.ts` from role/area/shape (P04 concave L; P10 exactly 4.0 ha). Where live accounts exist, P01–P10 remote-sensing fixtures are re-recorded from live responses (`pnpm eval --provider=live --record`), committed with their fetch date.
- **Growing the set (before baseline-v1).** EVAL-093–105 are the M-002 cases added in Stage 6. To avoid ID collisions between parallel branches, blocks are reserved: **TKT-07 EVAL-106–109** (scenario 3 to ≥ 10), **TKT-08 EVAL-110–113** (scenario 1 to ≥ 10), **TKT-09 EVAL-114–121** (scenarios 2 and 4 to ≥ 10), **TKT-20 EVAL-122 onward** (legitimate set to ≈ 40 over 10 plots, calibrated by HR3). Unused IDs in a block stay unused; each addition is a dataset minor version and is committed before baseline-v1.
- **Baselines.** `baseline-v0-ledger-only.json` (TKT-03), `baseline-v1.json` + frozen `cfg-1` hash (TKT-21), `baseline-perf-v1.json` (S4 at TKT-21; S3 at TKT-29).
- **CI** (`.github/workflows/ci.yml`): typecheck · lint · test · dataset schema validation · gitleaks · `pnpm audit --prod --audit-level=high` · `pnpm eval` when paths under `src/lib/{verification,crypto,ledger,remote-sensing,media,eudr,capture}`, `src/app/api/capture`, `evals/` change (EV14) · `pnpm eval:e2e` on main. A regression on a critical case or any CF blocks merge.

## 14. Testing strategy
| Layer | Tool | Scope | IDs |
|---|---|---|---|
| Unit | Vitest (`unit` project) | crypto, every check, scorer, evidence templates, Merkle/proofs, geo, EXIF parsing, i18n completeness | TC- |
| Integration | Vitest (`integration` project) with a temp libSQL file per test file | capture route end to end in-process, transactions, triggers, auth guards, enrolment, batches, custody, EUDR export, health | TC- and EVAL- (integration suite) |
| Harness | `pnpm eval` | verifier + proof suites | EVAL- |
| e2e | Playwright (Chromium; phone 375×812, 320×568, tablet 768×1024, desktop 1280/1440) with mocked geolocation, file inputs and tile stubs; axe-core | flows, states, design gates, demo | TC-, EVAL- (e2e) |
| Contracts (M-002) | Foundry `forge test` | BatchRegistry, ContractFarming, MockINR | TC- |
| Perf | `pnpm eval:perf` | S3, S4 | EVAL-070/071 |
| Manual | recorded evidence | S5 rehearsals, real-phone QR, field calibration HR3, sunlight test | EVAL-072, HR1–HR6 |
Baseline gate before any ticket is done: `pnpm typecheck && pnpm lint && pnpm test`, plus the ticket's named TC/EVAL cases.

## 15. Observability and failure modes (F14)
- **Logs.** pino JSON to stdout; `requestId` per request (from `x-request-id` or generated) threaded through capture → verify → persist; one `verification.completed` line per run with event id, verdict, score, unavailable providers, per-check durations and config hash. Redaction list: `authorization`, `cookie`, `signature`, `*.secret`, `*.key`, `password`.
- **Health** `GET /api/health` → `{ db:'ok'|'error', ledger:{ lastSeq, lastCheckpointAgeSec, keyPresent }, providers:{ gfw, sentinelHub: 'ok'|'error'|'fixture' (probed at most every 60 s) }, version, commit }`; 200 when db ok and key present, else 503.
- **Product signals (TP21).** No third-party analytics. `certificate.viewed` and `certificate.proof_failed` (client beacon to `/api/telemetry` with the failing step only, no PII) are structured log events; counts come from logs.
- **Alerting (M-003, TKT-28).** A scheduled GitHub Actions workflow probes `https://<domain>/api/health` every 15 minutes and fails (emailing the owner) on non-200 or a checkpoint older than 24 h while entries exist.

| Failure | Behaviour | Visible as |
|---|---|---|
| Provider timeout/5xx/malformed | check `unavailable`, cap Needs Review, admin re-run | verdict evidence, `unavailableProviders`, health |
| A check throws | `unavailable` with error class | evidence, log `check.threw` |
| Ledger append or row write fails | whole transaction rolls back; agent gets retryable error; payload stays on phone | NDJSON `error`, log `capture.txn_failed` |
| Ledger key missing at runtime | health 503; appends refused | health, log |
| Disk full | writes fail → retryable error | health `db:error`; M-003 disk alert |
| Proof mismatch on a certificate | page names the failing step; beacon logged | log `certificate.proof_failed` |

## 16. Security (Full tier; Stage 10 reviews)
Threats and their owners: forged/tampered captures (signature + canonical-bytes + media-hash checks, TKT-02/19) · replay (photo uniqueness + chain + idempotency, TKT-09) · enrolment brute force (hashed codes, attempts, rate limits, TKT-05) · cross-org access (session-derived org scoping, guards, TKT-04) · upload abuse (size/type/magic/count/rate, TKT-19) · proof forgery (clean-room checker + tamper suite, TKT-18) · enumeration via the feed (TP8) · secrets (gitleaks in CI, server-only env module, redaction, TKT-01/19) · dependency risk (`pnpm audit` gate, TKT-19/28) · public data exposure (public-safe payloads, producer_id, EV16, TKT-16) · XSS (React escaping; override reasons and evidence rendered as text only) · CSRF (Server Actions' origin check + `sameSite=lax`; `/api/capture` requires the session cookie **and** a device signature) · headers (CSP with `default-src 'self'`, tile hosts allow-listed on admin pages only; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: camera=(self), geolocation=(self)`).

## 17. Deployment and environments
| Env | Where | DB / keys | Providers |
|---|---|---|---|
| dev / cloud session | claude.ai/code VM (x86_64) | `./data/` file DB, generated keys | fixture |
| CI | GitHub Actions | temp files | fixture |
| production (M-003) | Oracle A1 (linux-aarch64), Docker Compose: `app` (Node 22 slim, `next start`), `anvil` (M-002), `caddy` (Let's Encrypt, `flush_interval -1` on `/api/capture` so NDJSON streams) | `/data` on block volume; nightly `sqlite3 .backup` + key files to OCI Object Storage (Always Free) | live, keys as env secrets |
**`.env.example`** (names only, TKT-01): `DATABASE_URL`, `DATA_DIR`, `LEDGER_KEY_PATH`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PUBLIC_BASE_URL`, `REMOTE_SENSING_PROVIDER` (=fixture), `GFW_API_KEY`, `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, `MAP_TILE_PROVIDER` (=esri), `ARCGIS_API_KEY`, `MAPTILER_KEY`, `LEDGER_ADAPTER` (=hashchain), `ANVIL_RPC_URL`, `EVM_OPERATOR_KEY_PATH`, `LOG_LEVEL`, `DEMO_MODE` (=0; TP27).
**Migrations** run at boot (`drizzle-kit migrate` in the container entrypoint) — forward-only; a failed migration stops boot (visible in health). **Rollback** = redeploy the previous image tag with the pre-deploy backup; ledger files are append-only so a rollback never rewrites history.

## 18. Performance budgets
- **S3 ≤ 30 s (EV9).** Placeholder budget: GPS 0 s (fix already held, TP13) + hash/sign < 0.5 s + upload 3 × 4 MB at 5 Mbit/s ≈ 19.2 s + verify ≤ 10 s (remote phase cap; typical cache-warm < 1 s) + commit/response < 0.5 s ≈ 30 s worst case. The worst case sits on the gate, so TP13 proposes staged photo upload (upload each photo when "Use this photo" is tapped), which takes upload off the Submit-to-verdict path. It is an owner decision because it adds a ticket; HR3's measured photo size decides urgency.
- **S4 < 3 s (EV10).** Feed embedded in the page (no second round trip), no map tiles, no web fonts blocking (`display:swap`), verification in a microtask loop with WebCrypto; budget: HTML+JS ≤ 150 KB gzip for `/verify`, verification of 50 entries ≤ 300 ms at 4× throttle.
- **Capture page JS** ≤ 200 KB gzip excluding the admin map chunk.

## 19. Risks
| Risk | Mitigation | Owner |
|---|---|---|
| S3 upload budget on field networks | GPS early start (in TKT-10); staged upload proposal (TP13); HR3 calibration | TKT-10, owner |
| Better Auth / Next major-version friction in the cloud VM | versions pinned in §0; TKT-01 proves sign-in in the walking skeleton before feature work | TKT-01/04 |
| libSQL interactive transaction semantics differ from better-sqlite3 | TC-010 proves rollback with a forced failure; triggers tested by direct SQL | TKT-02 |
| NDVI thresholds (TP11) wrong for shade coffee | fixture-driven eval now; live agreement report; thresholds frozen at baseline-v1 and changed only with new cases | TKT-07/21 |
| Kannada strings unreviewed | marked `REVIEW`; owner arranges native review before external demo | owner |
| Dark UI in sunlight | Stage 8 field test; Sunlight token set fallback | Stage 8 |
| Unmocked screens drift from the design | TP17 composition rule + Stage 8 critique | Stage 7/8 |
| Oracle A1 capacity / idle reclamation | provision now (owner); keep-busy cron; PAYG option | owner, TKT-27 |
| Foundry on ARM | TKT-22 spike before M-002 work | TKT-22 |

## 20. Sequencing and parallel streams
M-001 phases (tickets.md build order), with the native IDs and a disjoint file-ownership check:
| Phase | Tickets (native) | Parallel? | Gate after |
|---|---|---|---|
| P1 | TKT-01 (TASK-2) | — | skeleton runs in the cloud VM; CI green |
| P2 | TKT-02 (TASK-3) | — | tracer bullet Verified end to end |
| P3 | TKT-03 (TASK-4) ∥ TKT-04 (TASK-5) | 2 | baseline-v0 committed |
| P4 | TKT-05 (TASK-6), TKT-06 (TASK-7), TKT-08 (TASK-9), TKT-15 (TASK-16) | 3 at once (08 and 15 touch disjoint `lib/`; 05 and 06 share only the admin rail component — 05 owns it) | — |
| P5 | TKT-07 (TASK-8), TKT-09 (TASK-10), TKT-10 (TASK-11), TKT-13 (TASK-14), TKT-14 (TASK-15), TKT-18 (TASK-19), TKT-19 (TASK-20) | 3 at once; TKT-09 and TKT-19 both touch `lib/capture/` → sequential; TKT-07/08/09 each add one-line registrations to `verification/registry.ts` and `evidence.ts` — expect trivial merges, resolve by keeping all lines | per-phase QA |
| P6 | TKT-11 (TASK-12), TKT-12 (TASK-13), TKT-16 (TASK-17) | 3 | — |
| P7 | TKT-17 (TASK-18) | — | — |
| P8 | TKT-20 (TASK-21) | — | demo script green |
| P9 | TKT-21 (TASK-22) | — | **M-001 gate** (owner) |
M-002: TKT-22 (TASK-23, may run any time after TKT-01) → TKT-23 (TASK-24, Stage 4 re-entry, owner) → TKT-24 (TASK-25) → TKT-25 (TASK-26) ∥ TKT-26 (TASK-27). M-003: TKT-27 (TASK-28) → TKT-28 (TASK-29) → TKT-29 (TASK-30), after the Stage 10 gate.


## 21. Stage 7 cloud runbook (S11)

### 21.1 Pre-flight (after Stage 6 sign-off; mostly the owner, about 15 minutes)
**1. Local session, on "approved":** commit the Stage 6 artifacts on `main` (technical-plan.md, test-cases.md, tickets.md mapping, decisions.md TP1–TP25, evals dataset 0.2.0, `backlog/`, HANDOFF.md, and the Stage 7 operating rules added to `CLAUDE.md` from §21.2) and push to `origin` (`007U5H4R/udgam`). Move Campfire TASK-1 to Done.

**2. GitHub access for the cloud:** the Claude GitHub App installed on `007U5H4R/udgam` (or `/web-setup` from the CLI).

**3. claude.ai/code environment "udgam":**
- **Network:** Custom — keep the trusted defaults (npm registry, GitHub) and add `fonts.googleapis.com`, `fonts.gstatic.com` (next/font at build), the Playwright browser hosts `cdn.playwright.dev`, `playwright.azureedge.net`, `playwright.download.prss.microsoft.com`; for live-provider recording only: `data-api.globalforestwatch.org`, `sh.dataspace.copernicus.eu`, `identity.dataspace.copernicus.eu`; for M-002: `foundry.paradigm.xyz`, `github.com` release assets (Foundry binaries).
- **Setup script:** `bash scripts/cloud-setup.sh` once it exists; before TKT-01 lands: `corepack enable >/dev/null 2>&1 || true; if [ -f package.json ]; then pnpm install --frozen-lockfile || pnpm install; pnpm exec playwright install --with-deps chromium || true; fi`.
- **Secrets:** none are needed for M-001 (fixture provider). Add `GFW_API_KEY`, `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` as environment secrets only when recording live fixtures (TKT-07) — never in the repo, never echoed.

**4. Start:** claude.ai/code → repo `007U5H4R/udgam`, branch `main`, environment `udgam` → paste the prompt in §21.4.

### 21.2 Cloud execution protocol (copied into the project `CLAUDE.md` at sign-off)
1. **Read first:** `CLAUDE.md`, `HANDOFF.md`, `technical-plan.md` (§1–§20 and the ticket's §22 plan), `tickets.md`, `test-cases.md`, `evaluation-plan.md`, `evals/eval-dataset.json`, `Design.md` (freeze block, §12–§18) and `.design/exploration/final/*`.
2. **Branch:** `git switch -c build/stage7` from `main`; all work stays there; never push to `main`.
3. **Per task** (§22): one fresh implementer subagent with a small brief (the task text, files, interfaces, the §1 constraints — never the whole history). TDD: failing test → minimal code → green → refactor. Then a spec-compliance review and a code-quality review, each by a fresh reviewer subagent. Fix loop capped at 2 rounds; on a third failure, stop and write a `BLOCKED` ledger row. Commit once per task: `<imperative summary> (TASK-n)`.
4. **Parallelism:** at most 3 implementers at once, each in its own worktree, with disjoint file ownership (§3.3, §20).
5. **Phase gate** after each §20 phase: `pnpm typecheck && pnpm lint && pnpm test`, `pnpm eval` (from P3 on), `pnpm test:e2e` for phases with UI; an independent QA subagent re-checks the phase's acceptance criteria and TC/EVAL cases against the running build; update `docs/exec/ledger.md`; push; post a gate report (TCs and EVALs passed/failed, eval deltas, open issues, screenshots against `final/` for UI). **At the M-001 gate (after TKT-21) stop and wait for the owner's explicit approval** before M-002/M-003.
6. **Never:** print or echo env vars or secrets; edit `backlog/`; change a Design Freeze item (ask instead); weaken a threshold, weight, expected verdict or case class (CF-13); delete or hide an eval case; hand-edit a results file; install anything on the owner's machine.
7. **Decisions and scope:** append decisions to `decisions.md` as `EXE1…`; record scope changes in the ledger with the reason and wait for the owner.

### 21.3 Ledger and sync-back
`docs/exec/ledger.md` — one row per task plus a gate section per phase:
```
| TASK | TSK | status (todo|doing|review|done|blocked) | commit | tests (TC/EVAL ids, result) | evidence (run/screenshot) | notes |
```
At each gate the **local** session: `git fetch origin build/stage7` and reads the ledger → updates Campfire through the CLI (`task edit TASK-n -s "In Progress|In Review|Done"`, `--check-ac` for demonstrated criteria, `--append-notes` with commit SHAs and eval deltas) → updates the Obsidian vault and memory → relays the gate to the owner. Campfire is never edited from the cloud.

### 21.4 Prompt to start the cloud session
```
Read CLAUDE.md, HANDOFF.md, technical-plan.md (§1–§21 and §22 for the current ticket), tickets.md,
test-cases.md, evaluation-plan.md, evals/eval-dataset.json and Design.md (freeze block, §12–§18),
and look at .design/exploration/final/. Stages 1–6 are approved. Execute Stage 7 (skill
bw-execution-orchestration if available) on branch build/stage7 following technical-plan.md §21.2:
M-001 phase P1 first (TKT-01 = TASK-2), then P2 (TKT-02 = TASK-3), and onward per §20; one fresh
implementer subagent per task with TDD and two reviews; ledger in docs/exec/ledger.md. Keep every
DISC#, S#, EV#, D#, TP#, M-, TC-, EVAL- and TASK- id unchanged. Fixture remote-sensing provider only
unless I add keys. Never print secrets or edit backlog/. Stop after each phase with a gate report,
and stop at the M-001 gate for my approval.
```

---

## 22. Per-ticket task plans

Conventions for every task:
- Paths are relative to the repo root. Commit messages read `<imperative summary> (TASK-n)` with the ticket's native Campfire ID.
- "Verify" always means the named command **plus** `pnpm typecheck && pnpm lint` green.
- "Port" means copying markup structure, class roles, token values and copy from the named mockup section (§11); prototype scaffolding is never ported.
- Pinned versions (research 2026-09-29, §0): next 16.3.6 · react 19.3.0 · better-auth 1.7.6 · drizzle-orm 0.45.3 · drizzle-kit 0.31.11 · @libsql/client 0.18.0 · zod 4.6.5 · canonicalize 5.1.0 · exifr 7.1.3 · sharp 0.35.5 · @turf/* 7.4.0 · idb 8.0.3 · ajv 8.20.0 · pino 10.3.1 · vitest 5.0.2 · @playwright/test 1.63.0 · @axe-core/playwright 4.13.0 · tailwindcss 4.3.3 · qrcode 1.5.4. Install with exact versions (`pnpm add -E`).

---

### TKT-01 → TASK-2 · Walking skeleton that builds and runs in the cloud session (sp 3 · P0 · Chore)
**Depends on:** — · **TC:** TC-001, TC-002, TC-003, TC-004, TC-005 · **EVAL:** EVAL-083 (secret scan wired) · **Owns files:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.nvmrc`, `.env.example`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `scripts/cloud-setup.sh`, `src/app/{layout.tsx,page.tsx,tokens.css,globals.css}`, `src/app/api/health/route.ts`, `src/lib/{config/env.ts,db/client.ts,log.ts}`, `tests/{tokens,no-next-in-lib,helpers/db}.ts`, `e2e/{smoke.spec.ts,helpers/stubs.ts}`, `docs/exec/ledger.md`.
**Brief for the implementer:** No product logic. The repo already has `.gitignore`, `CLAUDE.md`, planning Markdown, `.design/`, `evals/` and `backlog/` — the scaffold must not overwrite any of them (scaffold into a temp dir and copy files in). Tokens are copied byte-for-byte from `.design/exploration/final/index.html` `:root`, not retyped. `pnpm eval` must exist but fail loudly until TKT-03.

**TSK-01.1 · Scaffold Next.js without clobbering the repo**
- **Files:** create `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.nvmrc` (`22`), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`; modify nothing that exists.
- [ ] `pnpm dlx create-next-app@16.3.6 /tmp/udgam-scaffold --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack=false --skip-install`, then copy only the files listed above into the repo (`cp -n`); confirm `git status` shows no modified tracked file.
- [ ] Pin exact versions in `package.json` (§0 list; `"packageManager": "pnpm@<corepack default>"`, `"engines": {"node": ">=22"}`), `pnpm install`.
- [ ] Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `test:e2e` (`playwright test`), `verify` (`pnpm typecheck && pnpm lint && pnpm test`), `eval` (`node -e "console.error('pnpm eval: harness not built yet (TKT-03)');process.exit(1)"`), `eval:validate` (stub, same pattern), `db:generate` (`drizzle-kit generate`), `db:migrate` (`tsx src/lib/db/migrate.ts`).
- [ ] `src/app/page.tsx` renders `<main><h1>Udgam</h1></main>`; `tsconfig` has `"strict": true, "noUncheckedIndexedAccess": true`.
- [ ] Verify: `pnpm build` succeeds; `pnpm eval; echo $?` prints the message and `1`.
- [ ] Commit: `Scaffold Next.js 16 app with pnpm, strict TypeScript and Tailwind v4 (TASK-2)`.

**TSK-01.2 · Frozen design tokens and fonts (TC-004)**
- **Files:** create `src/app/tokens.css`, `tests/tokens.test.ts`; modify `src/app/globals.css`, `src/app/layout.tsx`.
- **Produces:** CSS custom properties exactly as `final/index.html` `:root` (`--bg`, `--glow`, `--surface*`, `--hairline`, `--ink*`, `--grad-text`, `--ok*`, `--check*`, `--bad*`, `--cherry`, `--pill-*`, `--focus`, `--r-card`, `--r-row`, `--fs-*`, `--pad`, `--font`); `--banner-h` is prototype-only and is excluded.
- [ ] Write the failing test `tests/tokens.test.ts`:
  ```ts
  const parse = (css: string) => Object.fromEntries([...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].replace(/\s+/g, ' ').trim()]));
  const mock = parse(readFileSync('.design/exploration/final/index.html','utf8').match(/:root\s*{([^}]*)}/)![1]);
  const ours = parse(readFileSync('src/app/tokens.css','utf8'));
  for (const [k, v] of Object.entries(mock)) if (k !== 'banner-h') expect(ours[k], k).toBe(v);
  ```
- [ ] Run `pnpm test tests/tokens.test.ts` → fails (file missing).
- [ ] Copy the `:root` block verbatim into `tokens.css`; import it first in `globals.css`; set `body { background: var(--bg); color: var(--ink); font-family: var(--font); font-size: var(--fs-body); }` and the ground glow on `body::before`. In `layout.tsx` load `Figtree` (400–800) and `Noto_Sans_Kannada` (400, 600, 700) with `next/font/google`, `display: 'swap'`, and put their CSS variables ahead of the `--font` stack.
- [ ] Verify: `pnpm test tests/tokens.test.ts` green; `pnpm build`.
- [ ] Commit: `Add frozen Design.md tokens and self-hosted Figtree and Noto Sans Kannada (TASK-2)`.

**TSK-01.3 · Env module and `.env.example`**
- **Files:** create `src/lib/config/env.ts`, `src/lib/config/env.test.ts`, `.env.example`.
- **Produces:** `export const env: Env` (parsed once, server-only — first line `import 'server-only'` is **not** allowed in `src/lib` (no Next imports), so instead throw if `typeof window !== 'undefined'`); `export function loadEnv(src: Record<string,string|undefined>): Env`.
- [ ] Failing test: `loadEnv({})` returns defaults `DATA_DIR='./data'`, `DATABASE_URL='file:./data/udgam.db'`, `REMOTE_SENSING_PROVIDER='fixture'`, `MAP_TILE_PROVIDER='esri'`, `LEDGER_ADAPTER='hashchain'`, `LOG_LEVEL='info'`, `LEDGER_KEY_PATH='./data/keys/ledger.jwk'`; `loadEnv({REMOTE_SENSING_PROVIDER:'live'})` throws naming `GFW_API_KEY` and `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET`; error messages never include values.
- [ ] Implement with zod 4 (`z.object`, `.default`, `.superRefine` for the live-provider requirement; `BETTER_AUTH_SECRET` required when `NODE_ENV==='production'`).
- [ ] `.env.example`: exactly the §17 names, one per line, `NAME=` with no values except the three non-secret defaults (`REMOTE_SENSING_PROVIDER=fixture`, `MAP_TILE_PROVIDER=esri`, `LEDGER_ADAPTER=hashchain`); a header comment "Never commit real values; secrets go in cloud environment secrets or .env (git-ignored)".
- [ ] Verify: `pnpm test src/lib/config`.
- [ ] Commit: `Add zod-validated env module and .env.example with variable names only (TASK-2)`.

**TSK-01.4 · Database client, logger and health route (TC-001)**
- **Files:** create `src/lib/db/client.ts`, `src/lib/log.ts`, `src/app/api/health/route.ts`, `tests/helpers/db.ts`, `src/app/api/health/route.test.ts` (integration).
- **Produces:**
  ```ts
  // src/lib/db/client.ts
  export function createDb(url: string): { db: LibSQLDatabase<typeof schema>; client: Client };  // sets PRAGMA foreign_keys=ON, journal_mode=WAL, busy_timeout=5000
  export function getDb(): LibSQLDatabase<typeof schema>;  // singleton from env.DATABASE_URL, creates DATA_DIR
  // src/lib/log.ts
  export const log: pino.Logger;  // JSON, redact paths per §15
  export function withRequestId(id?: string): pino.Logger;
  // tests/helpers/db.ts
  export async function tempDb(): Promise<{ db; client; url; cleanup(): Promise<void> }>;  // file in os.tmpdir(), migrations applied
  export function health(deps: { ping(): Promise<void> }): Promise<{ status: 200|503; body: HealthBody }>;  // pure core in src/lib/health.ts
  ```
- [ ] Failing test: `health({ping: ok})` → 200 `{db:'ok', providers:{gfw:'fixture', sentinelHub:'fixture'}, version, commit}`; `health({ping: throws})` → 503 `db:'error'`; `JSON.stringify(body)` contains no env value.
- [ ] Implement `src/lib/health.ts` (pure, takes deps) and the thin route (`export const runtime='nodejs'; export const dynamic='force-dynamic'`), `SELECT 1` ping; `ledger` block is added in TKT-15 (leave a typed optional field).
- [ ] Verify: `pnpm test src/app/api/health src/lib`; `pnpm dev` then `curl -s localhost:3000/api/health` returns `{"db":"ok",…}`.
- [ ] Commit: `Add libSQL client, pino logger and /api/health (TASK-2)`.

**TSK-01.5 · Vitest projects and lint rule for pure lib (TC-005)**
- **Files:** create `vitest.config.ts`, `tests/no-next-in-lib.test.ts`; modify `eslint.config.mjs`.
- [ ] `vitest.config.ts`: `test.projects` = `unit` (`src/**/*.test.ts`, `tests/**/*.test.ts`, excluding `*.int.test.ts`, environment node) and `integration` (`**/*.int.test.ts`, `pool: 'forks'`, `testTimeout: 20000`); rename the health test to `route.int.test.ts`. Add `test:int` script (`vitest run --project integration`).
- [ ] ESLint: `no-restricted-imports` in `src/lib/**` for `next`, `next/*`, `react`, `react-dom`.
- [ ] Failing test `tests/no-next-in-lib.test.ts`: runs ESLint programmatically (`new ESLint().lintText("import 'next/headers'", {filePath: 'src/lib/x.ts'})`) and expects one `no-restricted-imports` message; and `lintFiles(['src/lib'])` returns zero such messages.
- [ ] Verify: `pnpm test` (both projects) green.
- [ ] Commit: `Split Vitest into unit and integration projects and forbid Next imports in src/lib (TASK-2)`.

**TSK-01.6 · Playwright config, tile stub and smoke test**
- **Files:** create `playwright.config.ts`, `e2e/helpers/stubs.ts`, `e2e/smoke.spec.ts`.
- **Produces:** `stubTiles(page)` routes `**/{server.arcgisonline.com,api.maptiler.com,*.arcgis.com}/**` to a 1×1 PNG; `mockGeolocation(context, {lat,lng,accuracy})`.
- [ ] Projects: `phone` (375×812, isMobile, hasTouch), `phone-small` (320×568), `tablet` (768×1024), `desktop` (1440×900); `webServer: { command: 'pnpm build && pnpm start -p 3100', port: 3100, reuseExistingServer: !process.env.CI, env: { DATA_DIR: '.e2e-data', REMOTE_SENSING_PROVIDER: 'fixture' } }`; add `.e2e-data/` to `.gitignore` (append only).
- [ ] `e2e/smoke.spec.ts`: loads `/`, expects the h1, zero console errors, and `document.documentElement.scrollWidth <= innerWidth`.
- [ ] Verify: `pnpm exec playwright install chromium && pnpm test:e2e` green in all projects.
- [ ] Commit: `Add Playwright projects, tile stubs and a smoke test (TASK-2)`.

**TSK-01.7 · Idempotent cloud setup script (TC-002)**
- **Files:** create `scripts/cloud-setup.sh` (executable).
- [ ] `set -euo pipefail`; each step checks before acting and prints `ok: <step> already satisfied` or `did: <step>`: Node ≥ 22 (use existing; else `nvm install 22` if nvm exists; else fail with instructions); `corepack enable` + `corepack prepare pnpm@<pinned> --activate`; `pnpm install --frozen-lockfile`; `pnpm exec playwright install --with-deps chromium` (skip when `~/.cache/ms-playwright/chromium-*` exists); `mkdir -p "${DATA_DIR:-./data}"`; comment `# Foundry: added by TKT-22`. Never reads or prints env secrets.
- [ ] Verify: run it twice locally in the VM; second run prints only `ok:` lines; `git status --porcelain` empty.
- [ ] Commit: `Add idempotent cloud-setup script for claude.ai/code sessions (TASK-2)`.

**TSK-01.8 · CI with secret scan and audit (TC-003, EVAL-083)**
- **Files:** create `.github/workflows/ci.yml`, `.gitleaks.toml`.
- [ ] Jobs on `push` and `pull_request`: `verify` (checkout → pnpm/action-setup → setup-node 22 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test`); `secrets` (`gitleaks/gitleaks-action@v2` over full history, `fetch-depth: 0`, config extends defaults, allowlists `evals/fixtures/crypto-vectors.json` test keys only by path+rule); `audit` (`pnpm audit --prod --audit-level=high`); `dataset` (`pnpm eval:validate` — stub passes `exit 0` with a `::warning::` until TKT-03 replaces it); `setup-idempotent` (runs `scripts/cloud-setup.sh` twice then `git diff --exit-code`, TC-002).
- [ ] Prove the scan fails (TC-003): on branch `ci/secret-canary` commit `canary.txt` containing a string assembled to match gitleaks' `generic-api-key` rule; push; record the failing run URL in the ledger; delete the branch (never merge it).
- [ ] Verify: CI green on `build/stage7`.
- [ ] Commit: `Add CI for typecheck, lint, test, gitleaks, audit and setup idempotency (TASK-2)`.

**TSK-01.9 · Stage 7 ledger**
- **Files:** create `docs/exec/ledger.md` with the §21.3 header and a TASK-2 row (commit SHAs, TC-001..005 results, CI URLs).
- [ ] Commit: `Start the Stage 7 execution ledger (TASK-2)`.

**Done gate:** `pnpm dev` serves `/` + `/api/health` → TC-001, smoke e2e · scripts incl. failing `eval` stub → TSK-01.1 check · tokens + fonts → TC-004 · `cloud-setup.sh` idempotent → TC-002 · `.env.example` names only → TSK-01.3 test + review · CI typecheck/lint/test + secret scanning → TC-003, EVAL-083 · lib purity → TC-005.

---

### TKT-02 → TASK-3 · Tracer bullet: one signed picking becomes a Verified ledger entry (sp 8 · P0 · Feature)
**Depends on:** TKT-01 · **TC:** TC-006, TC-007, TC-008, TC-009, TC-010, TC-011 (registry part), TC-012, TC-013 · **EVAL:** EVAL-001, 002, 018, 022, 030, 053, 066, 067 · **Owns files:** `src/lib/crypto/*`, `src/lib/ledger/{types,hashchain}.ts`, `src/lib/db/schema.ts` (initial slice), `src/lib/db/migrations/*`, `src/lib/verification/*`, `src/lib/verification/checks/{signature-valid,geofence,photo-uniqueness}.ts`, `src/lib/geo/{geofence,distance}.ts`, `src/lib/media/store.ts`, `src/lib/capture/{parse,boundary,context,pipeline,persist}.ts`, `src/app/api/capture/route.ts`, `src/client/{sign,capture-client}.ts`, `src/app/(agent)/field/tracer/page.tsx` (temporary), `scripts/seed-tracer.ts`, `evals/fixtures/crypto-vectors.json`, `e2e/{crypto-vectors.spec.ts,crypto-vectors.html,tracer.spec.ts}`.
**Brief for the implementer:** This is the riskiest slice; keep every shape exactly as §5, §6.1, §8.1 and §3.1 say, because every later ticket builds on them. Verify the signature over the **received canonical string**, never a re-serialisation. `ledger.append` accepts only a transaction handle. Remote-sensing checks do not exist yet — the registry holds only `signature_valid`, `geofence`, `photo_uniqueness`; the scorer must still implement every cap. GAP-5 and GAP-8 are already resolved by TP2 (`cfg-1`) and TP3 (§6.5 templates) — implement them; record no new decision.

**TSK-02.1 · Canonical JSON and hashing**
- **Files:** create `src/lib/crypto/{jcs,hash,base64url,index}.ts`, `src/lib/crypto/jcs.test.ts`, `evals/fixtures/crypto-vectors.json`.
- **Produces:** `jcs(value: unknown): string`; `sha256Hex(input: Uint8Array | string): Promise<string>`; `hexToBytes`, `bytesToHex`, `b64uEncode`, `b64uDecode`.
- [ ] Write the vectors file: RFC 8785 Appendix examples plus `{"b":1,"a":2}`, `{"€":1,"a":2}` (UTF-16 order), numbers `1e21`, `1e-7`, `-0`→`0`, `0.1`, `100`, strings with `\u0000`, `"`, emoji; each with `input`, `canonical`, `sha256`.
- [ ] Failing test: every vector's `jcs(input) === canonical` and `sha256Hex(canonical) === sha256`; `jcs(undefined)`, `jcs({a: NaN})`, `jcs({a: Infinity})`, `jcs(new Date())` throw.
- [ ] Implement `jcs` over `canonicalize` with a pre-walk that rejects `undefined`, non-finite numbers and non-plain objects; `sha256Hex` via `globalThis.crypto.subtle.digest` (UTF-8 for strings).
- [ ] Verify: `pnpm test src/lib/crypto`.
- [ ] Commit: `Add RFC 8785 canonical JSON and SHA-256 helpers with shared vectors (TASK-3)`.

**TSK-02.2 · ECDSA P-256 sign/verify and thumbprints**
- **Files:** create `src/lib/crypto/ecdsa.ts`, `src/lib/crypto/ecdsa.test.ts`; extend `crypto-vectors.json` with a Node-made keypair (public JWK + **test-only** private JWK) and signatures.
- **Produces:** `generateKeyPair(extractable: boolean): Promise<CryptoKeyPair>`; `sign(privateKey: CryptoKey, jcsString: string): Promise<string>` (P1363 r‖s, base64url, no padding); `verify(publicJwk: JsonWebKey, jcsString: string, sigB64u: string): Promise<boolean>` (never throws — malformed input → `false`); `importPublicJwk`, `jwkThumbprint(publicJwk): Promise<string>` (RFC 7638 over `{crv,kty,x,y}`).
- [ ] Failing test: round trip true; flipping one byte of the message or signature → false; a 70-byte DER signature → false (P1363 only); thumbprint of the RFC 7638 §3.1-style vector matches; vector signatures verify.
- [ ] Implement with WebCrypto (`{name:'ECDSA', namedCurve:'P-256'}`, `{name:'ECDSA', hash:'SHA-256'}`).
- [ ] Verify: `pnpm test src/lib/crypto`.
- [ ] Commit: `Add ECDSA P-256 sign/verify in P1363 form and JWK thumbprints (TASK-3)`.

**TSK-02.3 · Browser/Node agreement (TC-006, EVAL-066)**
- **Files:** create `e2e/crypto-vectors.html` (served from `public/__test__/` only when `process.env.E2E === '1'`; route handler guarded), `e2e/crypto-vectors.spec.ts`.
- [ ] Spec: in Chromium, bundle `src/lib/crypto` via a test-only page (`src/app/__test__/crypto/page.tsx`, `notFound()` unless `E2E=1`) that exposes `window.udgamCrypto`; run every vector; sign in the browser and verify the result in Node (and vice versa).
- [ ] Verify: `E2E=1 pnpm test:e2e e2e/crypto-vectors.spec.ts` green; production build returns 404 for `/__test__/crypto`.
- [ ] Commit: `Prove canonical JSON and signatures agree between browser and Node (TASK-3)`.

**TSK-02.4 · Schema slice, anchor FK and append-only triggers**
- **Files:** create `src/lib/db/schema.ts` (tables: `organisations`, `farmers`, `plots`, `devices`, `harvest_events`, `media`, `verification_runs`, `ledger_entries` — columns per §4.1), `drizzle.config.ts`, `src/lib/db/migrate.ts`, `src/lib/db/migrations/0000_*.sql` (generated) and `0001_invariants.sql` (custom), `src/lib/db/invariants.int.test.ts`.
- [ ] `pnpm db:generate`, then `drizzle-kit generate --custom --name invariants` and write: triggers `ledger_no_update` / `ledger_no_delete` (`RAISE(ABORT,'ledger is append-only')`); `runs_set_final_verdict` (`AFTER INSERT ON verification_runs … UPDATE harvest_events SET final_verdict=NEW.verdict WHERE id=NEW.event_id`). Every provenance table has `anchor_seq INTEGER NOT NULL REFERENCES ledger_entries(seq)`.
- [ ] Failing test (TC-008 part, TC-010(b)): raw `UPDATE ledger_entries…` and `DELETE` abort with the message; inserting `harvest_events` with a nonexistent `anchor_seq` fails the FK; inserting a run updates `final_verdict`.
- [ ] `migrate.ts` applies migrations at boot and in `tempDb()`.
- [ ] Verify: `pnpm test:int src/lib/db`.
- [ ] Commit: `Add initial schema with anchor foreign keys and append-only ledger triggers (TASK-3)`.

**TSK-02.5 · Hash-chain ledger append (TC-008)**
- **Files:** create `src/lib/ledger/{types,hashchain}.ts`, `src/lib/ledger/hashchain.int.test.ts`.
- **Produces:**
  ```ts
  type LedgerKind = 'plot_registered'|'plot_edited'|'device_enrolled'|'device_revoked'|'harvest_event'|'verification_run'|'admin_override'|'attestation'|'batch_created'|'custody_transfer';
  type Anchor = { seq: number; entryHash: string; payloadHash: string };
  type Tx = Parameters<Parameters<LibSQLDatabase['transaction']>[0]>[0];
  function append(tx: Tx, kind: LedgerKind, payload: Record<string, unknown>, now?: () => Date): Promise<Anchor>;
  function entryHashOf(e: { seq; prev_hash; kind; payload_hash; ts }): Promise<string>;  // sha256Hex(jcs({seq,prev_hash,kind,payload_hash,ts}))
  function verifyChain(db, fromSeq?: number): Promise<{ ok: true } | { ok: false; seq: number; reason: string }>;
  export const GENESIS_PREV = '0'.repeat(64);
  ```
- [ ] Failing tests: three appends; recompute each `entry_hash` in the test from literal field values (not by calling `entryHashOf`); 20 concurrent `db.transaction(tx => append(tx,…), 'write')` calls → seq 1..20 contiguous, chain verifies; the `append` signature does not accept a `db` (type test with `// @ts-expect-error`).
- [ ] Implement: inside the transaction read `MAX(seq)` and its `entry_hash` (`GENESIS_PREV` when empty), `ts = new Date().toISOString()`, insert; `payload_hash = sha256Hex(jcs(payload))`. Checkpoint hook left as `onAppended?: (seq) => Promise<void>` for TKT-15.
- [ ] Verify: `pnpm test:int src/lib/ledger`.
- [ ] Commit: `Add transaction-only hash-chain ledger append (TASK-3)`.

**TSK-02.6 · Verification types, cfg-1 and scorer (TC-009)**
- **Files:** create `src/lib/verification/{types,config,score}.ts`, `src/lib/verification/score.test.ts`.
- **Produces:** the §6.1 types verbatim; `CONFIG` and `CONFIG_HASH` exactly as §6.2 (`CONFIG_HASH` exported as a `Promise<string>` resolved once, or computed synchronously at build via a top-level await in an ESM module); `score(checks: CheckResult[], config = CONFIG): { verdict; score; capReasons }`.
- [ ] Failing test: every TC-009 expectation (12 ok → 100 Verified; one geofence flag → 95.8 Verified; one fail → 91.7 Needs Review with `capReasons:['anyFail']`; deforestation/yield flag → Needs Review; unavailable excluded + capped; hard fail → Rejected; 79.9/80.0/49.9/50.0 boundaries via weights; `capReasons` order stable).
- [ ] Implement per §6.2 verdict order; score rounded to one decimal *after* comparison inputs are computed from the unrounded mean (test both).
- [ ] Verify: `pnpm test src/lib/verification`.
- [ ] Commit: `Add cfg-1 verdict config and scorer with S10 caps (TASK-3)`.

**TSK-02.7 · Evidence templates (TC-011, registry part)**
- **Files:** create `src/lib/verification/evidence.ts`, `src/lib/verification/evidence.test.ts` (+ `__snapshots__`).
- **Produces:** `evidence.<checkId>.<status>(facts): string` for every row of §6.5 (all twelve checks — later tickets only call them); formatters `m(d)` whole metres `"182 m"`, `kmh(v)`, `pct(x)` one decimal `"9.5%"`, `xu(r)` two decimals `"2.05x"`, `kOfN(k,n)`, `dur(min)` (`N min` < 120, `N h` < 48 h, else `N days`).
- [ ] Failing test: snapshot every template; explicit asserts for dataset substrings: geofence fail(2400, 25) contains `2400 m`; flag(12, 20) contains `12 m` and `20 m`; fail(30, 8) contains `30 m`,`8 m`; gps_accuracy(150) `150 m`; exif_gps fail(3200) `3200 m`; movement(338) `338 km/h`; deforestation(0) `0.0%`, (25) `25.0%` and `10.0%`; yield(2.5) `2.50x`; photo `1 of 3`; throw(`TypeError`) `TypeError`.
- [ ] Implement.
- [ ] Verify: `pnpm test src/lib/verification/evidence`.
- [ ] Commit: `Add evidence sentence templates for every check and status (TASK-3)`.

**TSK-02.8 · Registry, runCheck and verify() with the first three checks (TC-012)**
- **Files:** create `src/lib/verification/{registry,verify}.ts`, `src/lib/verification/checks/{signature-valid,geofence,photo-uniqueness}.ts`, `src/lib/geo/{geofence,distance}.ts`, tests beside each.
- **Produces:** `type Check = { id: CheckId; kind: 'local'|'remote'; provider?: 'gfw'|'sentinel-hub'; run(sub, ctx, config): Promise<Omit<CheckResult,'weight'|'score'>> }`; `REGISTRY: Check[]` (ordered as §6.3); `verify(sub, ctx, opts)` per §6.1 — local checks concurrently, then remote with `Promise.allSettled` and the 10 s cap; `onCheck` called as each finishes; `runCheck` converts throws to `unavailable` with `Check could not run: <err.constructor.name>`. `geofenceStatus(point, polygon, accuracyM, maxBufferM) → {status, distanceM, bufferM}` using `@turf/boolean-point-in-polygon` and `@turf/point-to-line-distance` (units `'meters'`) over polygon rings.
- [ ] Failing tests: `signature_valid` ok / hard fail on tamper / hard fail on revoked; `geofence` ok inside, flag in buffer, fail beyond (EVAL-022 at 2400 m); `photo_uniqueness` hard fail with `1 of 3` when one hash in `seenMediaHashes`; a check stubbed to throw `TypeError` yields `unavailable` and the others still run, verdict Needs Review (TC-012); `opts.enabled=['signature_valid']` runs one check.
- [ ] Implement; checks not yet built are simply absent from `REGISTRY` (the harness reports their cases `not_yet_implemented`, TKT-03).
- [ ] Verify: `pnpm test src/lib/verification src/lib/geo`.
- [ ] Commit: `Add check registry, verify() and the signature, geofence and photo-uniqueness checks (TASK-3)`.

**TSK-02.9 · Capture parse and boundary (TC-007, EVAL-053)**
- **Files:** create `src/lib/capture/{parse,boundary}.ts`, `src/lib/capture/payload.ts` (zod schema for `CapturePayloadV1`, §5.2), tests.
- **Produces:** `parseCaptureForm(form: FormData): Promise<{ payloadString; signature; files: File[] }>`; `checkBoundary(input, deps) → { ok: true; payload; payloadHash; device } | { ok: false; status: 400|401|403|409; reason: 'non_canonical'|'bad_schema'|'unknown_device'|'device_revoked'|'bad_signature'|'media_hash_mismatch'; signedByKnownDevice: boolean }`.
- [ ] Failing test (TC-007): canonical string accepted; same object with reordered keys → `non_canonical` (checked before signature); `cherryKg` edited after signing → `bad_signature`; file bytes ≠ `media[i].sha256` → `media_hash_mismatch`; zod: `cherryKg` must be a multiple of 0.5 in 0.5..500, 1..3 media, `v===1`.
- [ ] Implement per §5.2 and Review focus 1–2 (unknown device → 401; revoked → 403 — enforcement details finished in TKT-05).
- [ ] Verify: `pnpm test src/lib/capture`.
- [ ] Commit: `Add capture payload schema and boundary checks over canonical bytes (TASK-3)`.

**TSK-02.10 · Media store and context builder**
- **Files:** create `src/lib/media/store.ts`, `src/lib/capture/context.ts`, tests.
- **Produces:** `MediaStore { put(bytes, sha256, mime): Promise<{path}>; remove(path): Promise<void> }` local-disk impl at `DATA_DIR/media/<sha[0:2]>/<sha>.<ext>` (write to temp + rename; idempotent if present); `buildContext(db, {payload, device, plot}) → VerifyContext` (reads only; `seenMediaHashes` = hashes of this submission already in `media` joined to accepted events; `previousEvent`, `agentPriorAcceptedEvents`; yield/remote-sensing fields stubbed with the fixture provider and a placeholder reference until TKT-07/09).
- [ ] Failing tests: put/put same hash is idempotent; context for a first-ever event has `previousEvent:null`, `device.lastSeq:0`.
- [ ] Verify: `pnpm test:int src/lib/capture src/lib/media`.
- [ ] Commit: `Add content-addressed media store and verify-context builder (TASK-3)`.

**TSK-02.11 · Pipeline, persist in one transaction, NDJSON route (TC-010, EVAL-067)**
- **Files:** create `src/lib/capture/{pipeline,persist}.ts`, `src/app/api/capture/route.ts`, `src/lib/capture/pipeline.int.test.ts`.
- **Produces:** `runCapture(form, deps, emit: (line: CaptureEvent) => void): Promise<void>` with `CaptureEvent = {t:'check'; id; status} | {t:'verdict'; eventId; verdict; score; checks: {id,status,evidence}[]; idempotent?: boolean} | {t:'rejected'; reason; status} | {t:'error'; retryable: boolean}`; `persistAccepted(tx, …)` writes `harvest_events` (with `payload` string), `media`, `verification_runs` and appends `harvest_event` then `verification_run` ledger entries, setting each row's `anchor_seq`; `persistRejected(tx, …)` writes the rejected event + anchor.
- [ ] Failing test (TC-010a): inject `append` failure on the `verification_run` entry → `{t:'error', retryable:true}`; zero rows in all four tables; the media file written earlier is removed. Happy path: two ledger entries, verdict line last, emitted only after COMMIT.
- [ ] Route: `runtime='nodejs'`, `dynamic='force-dynamic'`, returns `new Response(ReadableStream)` with `Content-Type: application/x-ndjson`, `Cache-Control: no-store`, `X-Accel-Buffering: no`; session check is a TODO guard stub replaced in TKT-04 (`requireSession('agent')`), with a test asserting the stub is present so it can't be forgotten.
- [ ] Verify: `pnpm test:int src/lib/capture`.
- [ ] Commit: `Persist captures and ledger anchors in one transaction and stream NDJSON progress (TASK-3)`.

**TSK-02.12 · Minimal capture page and tracer seed (TC-013)**
- **Files:** create `src/client/{sign,capture-client}.ts`, `src/app/(agent)/field/tracer/page.tsx` (removed by TKT-10), `scripts/seed-tracer.ts`, `e2e/tracer.spec.ts`, `evals/fixtures/photos/p01-exif-ok.jpg` (a small real JPEG with EXIF GPS inside P01 and DateTimeOriginal).
- **Produces:** `buildAndSign({plotId, deviceId, seq, prevEventHash, gps, cherryKg, files}, key) → {payloadString, signature}` (hashes the exact `File` bytes); `sendCapture(form, onEvent)` reading the NDJSON stream line by line.
- [ ] `seed-tracer.ts`: one FPO, one farmer (producer_id), plot P01 (fixture polygon near Madikeri), one device whose **test** key pair is written to `.e2e-data/tracer-key.json` (git-ignored) and whose public JWK is enrolled + anchored; prints nothing secret.
- [ ] Page: file input (capture=environment), kg input, Send; shows the streamed check rows and the verdict + evidence lines (plain markup; the frozen UI arrives in TKT-10).
- [ ] e2e: inject the tracer key into IndexedDB via `page.evaluate` (import JWK), mock geolocation inside P01, attach the fixture JPEG, 42.5 kg, Send → "Verified" and three evidence lines; then query the DB (test helper) for 1 event, 1 media, 1 run, 2 ledger entries (+ seed entries) and `payload` equal to the signed string.
- [ ] Verify: `pnpm test:e2e e2e/tracer.spec.ts` green.
- [ ] Commit: `Wire the tracer bullet: sign on the page, verify, anchor and show the verdict (TASK-3)`.

**Done gate:** `lib/crypto` isomorphic → TC-006, EVAL-066 · hash-chain append fields → TC-008 · check-registry contract, scorer with thresholds and caps → TC-009, TC-011, TC-012 · three checks → TSK-02.8 tests, EVAL-022/030 · `/api/capture` verifies at boundary, one transaction → TC-007, TC-010, EVAL-053/067 · minimal capture page shows verdict + evidence → TC-013, EVAL-001/002 · throwing check → `unavailable` → TC-012, EVAL-018 · GAP-5/GAP-8 implemented as TP2/TP3.

---

### TKT-03 → TASK-4 · Evaluation harness v0 and baseline-v0 (sp 5 · P0 · Feature)
**Depends on:** TKT-02 · **TC:** TC-014, TC-015, TC-016, TC-017 · **EVAL:** EVAL-091, EVAL-092 · **Owns files:** `evals/harness/*`, `evals/scorers/{case-assertions,detection-rate,false-positive-rate,critical-conditions,harness-integrity,wilson}.ts`, `evals/fixtures/plots/*.geojson`, `evals/fixtures/remote-sensing/*.json`, `evals/results/baseline-v0-ledger-only.json`, `evals/reports/`, `.gitignore` (append `evals/results/local/`).
**Brief for the implementer:** The harness calls the **real** `verify()` from `src/lib/verification` — it never re-implements a rule. Every active case appears in the results: missing checks → `not_yet_implemented` (counts as failed), setup errors → `errored`; nothing is dropped (EVAL-092, CF-12). The report is rendered from the results file only. Detection needs attribution (EV4): verdict in `acceptable_verdicts` **and** a `catching_checks` member returned flag/fail. Provider faults come from the case via a fixture-provider constructor option, never env.

**TSK-03.1 · Dataset loader and validation (TC-017)**
- **Files:** create `evals/harness/dataset.ts`, `evals/harness/dataset.test.ts`; modify `package.json` (`eval:validate`: `tsx evals/harness/dataset.ts --validate`); modify `.github/workflows/ci.yml` (dataset job now real).
- **Produces:** `loadDataset(path?): { version; sha256; cases: EvalCase[] }` (ajv 2020 against `eval-dataset.schema.json`; also checks unique IDs and that `base_case` exists).
- [ ] Failing test: committed dataset loads; a temp copy with op `teleport` fails naming `/cases/…/mutations/…/op`; a duplicate `EVAL-001` fails.
- [ ] Verify: `pnpm eval:validate` exits 0; `pnpm test evals/harness`.
- [ ] Commit: `Load and validate the eval dataset against its schema (TASK-4)`.

**TSK-03.2 · Plot and remote-sensing fixtures**
- **Files:** create `evals/harness/fixtures.ts`, `evals/fixtures/plots/{P01..P10,E01,X01..X07}.geojson` (generated, committed), `evals/fixtures/remote-sensing/{…}.json`, `evals/harness/fixtures.test.ts`.
- **Produces:** `generatePlotFixtures()` — deterministic polygons around real Kodagu/Chikkamagaluru anchor points (e.g. near 12.42°N 75.74°E), sized to the dataset `area_ha` (±0.5 %), shapes: convex = rotated rectangle, irregular = seeded 7-gon, `concave_L` = L with the notch inside the bbox (P04); `remoteSensingProfile(plotId)` from the dataset's `remote_sensing` block (loss %, `ndvi_history` profile → 12 monthly means, `ndvi_harvest_window` → mean/clear count; `cloud_blocked` → zero clear observations).
- [ ] Failing test: areas within 0.5 % of `area_ha` (P10 = 4.0 ha); P04 notch centroid is outside the polygon but inside its bbox; regeneration is byte-identical.
- [ ] Verify: `pnpm test evals/harness/fixtures`.
- [ ] Commit: `Generate deterministic Kodagu plot and remote-sensing fixtures from the dataset (TASK-4)`.

**TSK-03.3 · Fixture remote-sensing provider**
- **Files:** create `src/lib/remote-sensing/{types,fixture}.ts` (interface exactly §7), test.
- **Produces:** `new FixtureProvider({ profiles, faults?: { provider: 'gfw'|'sentinel-hub'; mode: 'timeout'|'http_500'|'malformed'; cacheEmpty?: boolean }[] })`; timeout mode returns a never-resolving promise honouring `AbortSignal`.
- [ ] Failing test: P01 → `lossPct 0`; X02 → `10.5`; P09 window → `{mean:null, clearObservations:0}`; fault `http_500` rejects with `ProviderError('gfw', 500)`.
- [ ] Verify: `pnpm test src/lib/remote-sensing`.
- [ ] Commit: `Add the fixture remote-sensing provider with fault injection (TASK-4)`.

**TSK-03.4 · Mutation engine (TC-014)**
- **Files:** create `evals/harness/mutate.ts`, `evals/harness/mutate.test.ts`.
- **Produces:** `buildCase(c: EvalCase, ds, keys) → Promise<{ submission: Submission; context: VerifyContext; providerFaults; throwCheck? }>` starting from the base case (recursively), applying ops in order: `gps_place` (point at `distance_m` from the nearest edge, inside/outside, `outside_notch` in P04's notch), `gps_accuracy`, `exif_gps` (`match`=same point, `offset`=bearing 90° at `distance_m`, `absent`), `exif_time`, `client_clock` (serverReceivedAt − offset), `prev_event` (point `distance_km` away, `minutes_before`), `reuse_media` (copy hashes from the source case; `transform:'re-encode'` → fresh hash; seed `seenMediaHashes`), `chain` (`seq_delta`, `prev_hash` correct/stale/genesis), `season_cumulative` (solve `seasonCherryKgBefore` so the ratio after this event equals `ratio_after_event` in U; placeholder U row `{maxKgHa: 1000, cherryToCleanRatio: 0.2}` flagged `placeholder` in provenance), `photos`, `provider_fault`, `check_throws`, `device` (`revoked`, `unknown` …), `tamper_after_sign`. Payloads are signed with per-run generated keys for devices D-A1…K-X.
- [ ] Failing tests: one per op asserting the exact change (TC-014 examples: 2400 ± 1 m outside; ratio 2.05 ± 0.001); unknown op throws `UnknownMutationOp`; `buildCase` is pure per case (no shared state).
- [ ] Verify: `pnpm test evals/harness/mutate`.
- [ ] Commit: `Add the dataset mutation engine that builds submissions and contexts per case (TASK-4)`.

**TSK-03.5 · Scorers**
- **Files:** create `evals/scorers/{case-assertions,detection-rate,false-positive-rate,critical-conditions,harness-integrity,wilson}.ts` + tests.
- **Produces:** `assertCase(c, result) → { pass; assertions: {name; pass; detail}[]; detected?: boolean }` (verdict ∈ acceptable or == `verdict`; `check_status`; `hardFail` on `hard_fail_checks`; attribution; `evidence_substrings` with lowercase + whitespace-stripped matching); `detectionRate(results) → { pooled; perScenario; wilson95; undetected[] }` (population per evaluation-plan §4.1); `falsePositiveRate(results) → { rate; fps[]; honestReviewLoad }`; `criticalConditions(results) → { fired: {id; caseIds}[] }` (CF-01, 02, 03, 12, 13 at harness level; others map from case `critical_conditions` on failure); `integrity(dataset, results) → { ok; active; passed; failed; errored; skipped }`; `wilson(k, n)` (10/10 → lower 0.722; 40/40 → 0.912; 38/40 → 0.835).
- [ ] Failing tests with hand-built results for each (including an attack Needs Review only because of `unavailable` → **not** detected).
- [ ] Verify: `pnpm test evals/scorers`.
- [ ] Commit: `Add case-assertion, detection, false-positive, critical-condition and integrity scorers (TASK-4)`.

**TSK-03.6 · Runner, provenance, results writer and report (TC-015, TC-016, EVAL-091/092)**
- **Files:** create `evals/harness/{run,provenance,results,report}.ts`, tests; modify `package.json` (`eval`: `tsx evals/harness/run.ts`).
- **Produces:** CLI flags `--config=ledger-only`, `--provider=fixture|live`, `--suite=harness-verifier,harness-proof`, `--seed=<n>`, `--out=local|formal`; `provenance()` with every §13 field (git via `git rev-parse`, dirty via `git status --porcelain`, dataset + fixture hashes, `CONFIG` + `CONFIG_HASH`, yield-reference `placeholder`, `ledger:'hashchain'`, node, `os.platform()/arch()`); `writeResults(obj)` → `evals/results/eval-run-{version}-{shortSha}.json` (formal) or `evals/results/local/…` (default), appending `-r2`, `-r3` instead of overwriting; `renderReport(resultsPath) → markdown` (pure; overall PASS/FAIL, gates table, per-scenario with Wilson, undetected, known limitations, pairs EVAL-019/040 and 005/026 side by side, CFs, config printout, sample-size caveat).
- [ ] Failing tests (TC-015): with a check disabled, affected cases `not_yet_implemented` and counted failed; a case whose `buildCase` throws is `errored`; `active = passed+failed+errored`, `skipped === 0`; exit code 1. (TC-016): report rendered twice byte-identical; numbers in report == results; second formal write gets `-r2`. Shuffled order with two seeds → identical per-case results.
- [ ] `harness-proof` suite is registered but reports its cases `not_yet_implemented` until TKT-15/18.
- [ ] Verify: `pnpm eval` runs offline (`--network none` not needed; assert no `fetch` via a global stub in the runner), prints the summary, exits non-zero (most checks not built yet — expected).
- [ ] Commit: `Add the eval runner with provenance, versioned results and a report derived from results (TASK-4)`.

**TSK-03.7 · baseline-v0 (EV13)**
- **Files:** create `evals/results/baseline-v0-ledger-only.json`, `evals/reports/eval-report-baseline-v0.md`; append `evals/results/local/` to `.gitignore`.
- [ ] Run `pnpm eval --config=ledger-only --out=formal` and copy the produced results to `baseline-v0-ledger-only.json` (the runner supports `--name=baseline-v0-ledger-only` to write it directly — add that flag rather than copying by hand); render its report.
- [ ] Verify: the file's provenance shows `config: ledger-only`, `CONFIG_HASH`, commit; the report re-renders identically.
- [ ] Commit: `Record baseline-v0 (ledger only) from a real harness run (TASK-4)`.

**Done gate:** one command from a clean clone → EVAL-091, TC-016 · per-scenario detection, FP rate, per-case status → TSK-03.5/03.6 tests · `not_yet_implemented` never dropped → TC-015, EVAL-092 · provenance in every result → TC-016 · baseline-v0 committed → TSK-03.7 · schema validation in CI → TC-017.

---

### TKT-04 → TASK-5 · Sign-in with roles and organisation boundaries (sp 3 · P0 · Feature)
**Depends on:** TKT-01 · **TC:** TC-018, TC-019, TC-020 · **EVAL:** EVAL-080 · **Owns files:** `src/lib/auth/{auth,guards,session}.ts`, `src/lib/db/schema.ts` (auth tables + `user.role`, `user.org_id`), `src/app/api/auth/[...all]/route.ts`, `src/app/{page.tsx,(public)/sign-in/page.tsx}`, `src/app/(agent)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(buyer)/layout.tsx`, `src/app/(buyer)/buyer/page.tsx` (placeholder list shell), `src/app/(admin)/admin/page.tsx` (placeholder shell), `src/middleware.ts`, `scripts/seed-accounts.ts`, `tests/guard-coverage.test.ts`, `src/components/ui/{GlassCard,Pill,TextField}.tsx`.
**Brief for the implementer:** The guard is the security boundary, not middleware and not layouts alone (§10). `orgId` always comes from the session. Cross-org access returns 404. Build the sign-in screen only from ported components (TP17) — no new visual ideas. Better Auth tables come from its CLI; don't hand-write them.

**TSK-04.1 · Better Auth with the Drizzle adapter**
- **Files:** create `src/lib/auth/auth.ts`, `src/app/api/auth/[...all]/route.ts`; modify `schema.ts` (+ migration).
- **Produces:** `auth` (betterAuth with `emailAndPassword: { enabled: true, disableSignUp: true }`, `database: drizzleAdapter(db, { provider: 'sqlite' })`, `user.additionalFields: { role: { type: 'string', input: false }, orgId: { type: 'string', input: false } }`, `secret: env.BETTER_AUTH_SECRET ?? dev-only fallback that throws in production`, cookies `httpOnly`, `sameSite: 'lax'`, `secure` in production).
- [ ] `pnpm dlx @better-auth/cli@1.7.6 generate --config src/lib/auth/auth.ts --output src/lib/db/auth-schema.ts`; merge into `schema.ts`; add `CHECK(role IN ('agent','admin','buyer'))` and `org_id REFERENCES organisations(id)` via the custom migration; `pnpm db:generate`.
- [ ] Failing int test: sign in a seeded user via `auth.api.signInEmail` returns a session with `role` and `orgId`; public sign-up endpoint is disabled (4xx).
- [ ] Verify: `pnpm test:int src/lib/auth`.
- [ ] Commit: `Add Better Auth email sign-in with role and organisation on the user (TASK-5)`.

**TSK-04.2 · Guards and session helpers (TC-018)**
- **Files:** create `src/lib/auth/guards.ts`, `src/app/_auth/require.ts` (the Next adapter: reads headers/cookies), tests.
- **Produces:** pure `authorize(session: Session | null, role: Role): { ok: true; userId; orgId; role } | { ok: false; code: 401|403 }`; Next adapter `requireSession(role): Promise<{ userId; orgId; role }>` (pages → `redirect('/sign-in')` on 401, `notFound()` on 403; actions/handlers → throws `AuthError` mapped to 401/403 JSON); `scopedById<T>(rows: T | undefined): T` → `notFound()` when undefined (use with `where(and(eq(t.id, id), eq(t.orgId, orgId)))`).
- [ ] Failing unit test for `authorize` over the 4 × 3 role matrix.
- [ ] Replace the TKT-02 capture route guard stub with `requireSession('agent')`.
- [ ] Verify: `pnpm test src/lib/auth`.
- [ ] Commit: `Add server-side role guards and org-scoped lookups (TASK-5)`.

**TSK-04.3 · Route groups, layouts and redirects**
- **Files:** create `src/app/(agent)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(buyer)/layout.tsx` (each calls `requireSession(role)`), `src/app/(admin)/admin/page.tsx` and `src/app/(buyer)/buyer/page.tsx` (shells with the ported rail / heading), `src/middleware.ts` (redirect unauthenticated navigation to `/sign-in` for `/field|/admin|/buyer`; matcher excludes `/verify`, `/api/verify`, `/.well-known`, `/api/health`, `/api/auth`), `src/app/page.tsx` (redirect by role).
- [ ] Failing int test (TC-018): for roles none/agent/admin/buyer, GET each group's page → only the owner renders; others redirect; `/verify/x`, `/api/health`, `/.well-known/udgam-ledger-key` never redirect.
- [ ] Verify: `pnpm test:int app`.
- [ ] Commit: `Add guarded agent, admin and buyer route groups and role redirects (TASK-5)`.

**TSK-04.4 · Guard-coverage lint test**
- **Files:** create `tests/guard-coverage.test.ts`.
- [ ] Test walks `src/app/(agent|admin|buyer)/**` and `src/app/api/**` (excluding `api/auth`, `api/health`, `api/verify`, `.well-known`) with the TypeScript compiler API: every exported async function in a `'use server'` file and every exported route handler must call `requireSession(` before any `db` access; fails listing offenders. Plant a fixture file under `tests/fixtures/unguarded-action.ts` to prove it fails.
- [ ] Verify: `pnpm test tests/guard-coverage`.
- [ ] Commit: `Fail the build when a Server Action or route handler skips its guard (TASK-5)`.

**TSK-04.5 · Seeded demo accounts and org scoping (TC-019)**
- **Files:** create `scripts/seed-accounts.ts`, `src/lib/auth/org-scope.int.test.ts`.
- [ ] Seed two FPOs (Hosahalli FPO, a second FPO for tests), two buyers, and users `agent@`, `admin@`, `buyer@` per org with passwords from `SEED_PASSWORD` env (default only in dev/test; the value is never printed — print "password from SEED_PASSWORD").
- [ ] Failing int test: FPO-A admin reading FPO-B's plot/device by ID through the query helpers → `notFound`; buyer A listing batches returns only A's (empty now, asserted again in TKT-14).
- [ ] Verify: `pnpm test:int src/lib/auth`.
- [ ] Commit: `Seed demo accounts per role and org and prove cross-org lookups 404 (TASK-5)`.

**TSK-04.6 · Sign-in screen (TC-020, TP17)**
- **Files:** create `src/app/(public)/sign-in/page.tsx`, `src/app/(public)/sign-in/actions.ts`, `src/components/ui/{GlassCard,Pill,TextField}.tsx` (ported from `final/index.html` card/pill/input styles), `e2e/sign-in.spec.ts`.
- [ ] Compose: ground glow, small cherry (`final/cherry.svg` copied to `public/brand/cherry.svg`), one frosted card with email + password fields, one primary pill "Sign in"; error inline under the form: "Email or password is not right." (never which one); strings via `t()` keys (dictionary lands in TKT-10/11 — add `en` keys now in `src/lib/i18n/en.ts` with a minimal `t()`).
- [ ] e2e: each role signs in and lands on `/field`, `/admin`, `/buyer`; wrong password shows the inline error; sign-out clears the session; `/verify/anything` opens signed out (404 page, not sign-in); no horizontal scroll at 320/375/768/1440.
- [ ] Verify: `pnpm test:e2e e2e/sign-in.spec.ts`.
- [ ] Commit: `Add the sign-in screen composed from frozen components (TASK-5)`.

**Done gate:** route groups guarded on the server → TC-018 + guard-coverage test · every query org-scoped → TC-019, EVAL-080 · `/verify/*` public → TC-018, TC-020 · sign-in in the frozen language → TC-020 + Stage 8 critique.

---

### TKT-05 → TASK-6 · Phone enrolment, revocation and plot assignment (sp 5 · P0 · Feature)
**Depends on:** TKT-02, TKT-04 · **TC:** TC-021, TC-022, TC-023, TC-024, TC-025 · **EVAL:** EVAL-051, 052, 054, 082, 021 (context) · **Owns files:** `src/lib/enrolment/*`, `src/lib/rate-limit.ts`, `src/lib/db/schema.ts` (`enrollment_codes`, `agent_plots`, `rate_limits`), `src/app/api/enrol/route.ts`, `src/app/(agent)/enrol/*`, `src/client/device-key.ts`, `src/app/(admin)/admin/phones/*`, `src/components/ui/{Rail,Sheet}.tsx`, `src/lib/capture/boundary.ts` (assignment + device-state rules), `evals/eval-dataset.json` (EVAL-054/068 `status` → `active` is **already done in Stage 6**; do not edit).
**Brief for the implementer:** The private key is created in the browser with `extractable:false` and stored as a `CryptoKey` in IndexedDB — it is never exported, posted or logged. Codes are stored hashed. Plot assignment is a **boundary** rule (TP5), not a thirteenth check: refused captures are still anchored as rejected events. The admin rail component is owned here; TKT-06 imports it.

**TSK-05.1 · Schema and rate limiter**
- **Files:** modify `schema.ts` (+ migration): `enrollment_codes(code_hash pk, agent_id, created_by, expires_at, used_at, attempts)`, `agent_plots(agent_id, plot_id, assigned_at, revoked_at, pk(agent_id, plot_id))`, `rate_limits(key, window_start, count, pk)`; create `src/lib/rate-limit.ts` + int test.
- **Produces:** `hit(tx|db, key: string, limit: number, windowSec: number, now = new Date()): Promise<{ allowed: boolean; remaining: number }>` (upsert-increment inside `BEGIN IMMEDIATE`).
- [ ] Failing int test: 10 hits allowed, 11th refused within the window; new window resets.
- [ ] Verify: `pnpm test:int src/lib/rate-limit`.
- [ ] Commit: `Add enrolment, plot-assignment and rate-limit tables with a SQLite rate limiter (TASK-6)`.

**TSK-05.2 · Enrolment codes (TC-021, EVAL-082)**
- **Files:** create `src/lib/enrolment/codes.ts` + int test.
- **Produces:** `issueCode(db, {agentId, adminId, orgId}) → { code: string; expiresAt }` (6 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, `crypto.getRandomValues`, stored as `sha256Hex(code)`, expiry +24 h); `redeemCode(tx, code, now, ip) → { ok: true; agentId } | { ok: false; reason: 'invalid'|'expired'|'used'|'rate_limited' }` (5 attempts per code hash, 10 per IP per hour via `hit`).
- [ ] Failing int test: DB contains only the hash; used code fails; 24 h + 1 s fails with injected clock; 6th wrong attempt on a code → `rate_limited`; 11th per IP → `rate_limited`; logs (captured pino) contain no code.
- [ ] Verify: `pnpm test:int src/lib/enrolment`.
- [ ] Commit: `Issue hashed single-use 24-hour enrolment codes with attempt and IP limits (TASK-6)`.

**TSK-05.3 · Enrol API and device anchoring (TC-022 server part)**
- **Files:** create `src/lib/enrolment/enrol.ts`, `src/app/api/enrol/route.ts`, int test.
- **Produces:** `enrolDevice(db, { code, publicJwk, ip, sessionAgentId }) → { deviceId; seq: 0; lastEventHash: null }` — in one write transaction: redeem code (must belong to the session's agent), validate the JWK (`kty:'EC', crv:'P-256'`, `x`,`y` present, **no `d`**), thumbprint unique, insert device (`DV-`+8 base32), append `device_enrolled` `{deviceId, agentId, thumbprint}`; `revokeDevice(db, {deviceId, adminOrgId})` sets `revoked_at` and appends `device_revoked` `{deviceId, revokedAt}`.
- [ ] Failing int test: a JWK containing `d` is refused; payload of `device_enrolled` has exactly `{deviceId, agentId, thumbprint}`; revocation anchors; revoking another org's device → 404.
- [ ] Route: `requireSession('agent')`, JSON body, 200 `{deviceId}`.
- [ ] Verify: `pnpm test:int src/lib/enrolment`.
- [ ] Commit: `Enrol and revoke phones with anchored device_enrolled and device_revoked entries (TASK-6)`.

**TSK-05.4 · Device key in IndexedDB**
- **Files:** create `src/client/device-key.ts` (+ `src/client/db.ts` opening the `udgam` idb with stores `keys`, `device`, `outbox`, `prefs`).
- **Produces:** `getOrCreateKeyPair(): Promise<CryptoKeyPair>` (`generateKeyPair(false)`), `saveDevice({deviceId, nextSeq, lastEventHash})`, `getDevice()`, `clearDevice()`; `exportPublicJwk(pair)`.
- [ ] Unit test with `fake-indexeddb` (dev dependency, pinned): stored key object round-trips; `crypto.subtle.exportKey('jwk', privateKey)` rejects.
- [ ] Verify: `pnpm test src/client`.
- [ ] Commit: `Store a non-extractable P-256 device key in IndexedDB (TASK-6)`.

**TSK-05.5 · `/enrol` screen with the first-run language sheet (TC-022, TC-025)**
- **Files:** create `src/app/(agent)/enrol/{page.tsx,EnrolClient.tsx}`, `src/components/ui/Sheet.tsx` (ported tinted bottom sheet), `e2e/enrol.spec.ts`; add `en`/`kn` keys.
- [ ] Flow (composed per TP17): language sheet (ಕನ್ನಡ / English, stored in `prefs` + `lang` cookie; shown only when unset) → "Enter the 6-letter code from the office" (large monospace field, one pill "Set up this phone") → success "This phone is ready" → `/field`. Error copy: invalid/expired/used each say what to do ("Ask the office for a new code").
- [ ] e2e (TC-022): with a code issued by the seed helper, enrol; `page.evaluate` checks the stored key's `extractable === false` and that `exportKey` rejects; the server has the device and a `device_enrolled` entry. (TC-025): sheet shown first time, choice persists after reload, not shown again.
- [ ] Verify: `pnpm test:e2e e2e/enrol.spec.ts`.
- [ ] Commit: `Add the phone enrolment screen with the first-run language sheet (TASK-6)`.

**TSK-05.6 · Boundary: device state and plot assignment (TC-023, TC-024, EVAL-051/052/054)**
- **Files:** modify `src/lib/capture/boundary.ts`, `src/lib/capture/pipeline.ts`; create `src/lib/capture/boundary.int.test.ts` cases.
- [ ] Rules in order after canonical/schema checks: device unknown → 401 `unknown_device` (anchor a rejected event with `device_id` NULL, the claimed ID kept inside the stored `payload`, and the reason — Solution-PRD §7 rule 2; `harvest_events.device_id` is therefore nullable, only for rejected rows, enforced by `CHECK(device_id IS NOT NULL OR boundary_status='rejected')`); revoked → 403 `device_revoked`; signature invalid → 401 `bad_signature`; plot not assigned to the device's agent (`agent_plots` with `revoked_at IS NULL`) → 403 `plot_not_assigned`. Every refusal: `persistRejected` + ledger entry; no verification run; NDJSON `{t:'rejected', reason, status}`.
- [ ] Failing int tests: EVAL-051 (never-enrolled key), EVAL-052 (revoked), EVAL-054 (agent B's device on agent A's plot → message names the plot assignment); after `assignPlot(A→B)`, same capture accepted.
- [ ] Verify: `pnpm test:int src/lib/capture`.
- [ ] Commit: `Refuse unknown, revoked and unassigned-plot captures at the boundary and anchor them (TASK-6)`.

**TSK-05.7 · Admin phones page and plot assignment actions**
- **Files:** create `src/components/ui/Rail.tsx` (ported from `admin.html` rail: Review · Plots · Batches · Phones), `src/app/(admin)/admin/phones/{page.tsx,actions.ts}`, `src/lib/enrolment/assign.ts`, `e2e/phones.spec.ts`.
- **Produces:** `assignPlot(db, {agentId, plotId, orgId})`, `unassignPlot(…)` (sets `revoked_at`; both org-scoped).
- [ ] Page (composed per TP17): list of agents → their phones (enrolled date, last capture, revoked) with "Issue code" (shows the code once, with expiry), "Revoke" (confirm sheet stating it is permanent and recorded), and assigned plots with add/remove; loading/empty/error states.
- [ ] e2e: issue a code (visible once, not retrievable after reload), revoke a phone (entry anchored), assign a plot; no horizontal scroll at 768/1440.
- [ ] Verify: `pnpm test:e2e e2e/phones.spec.ts`; `pnpm test`.
- [ ] Commit: `Add the admin Phones page for codes, revocation and plot assignment (TASK-6)`.

**Done gate:** codes single-use, 24 h, rate-limited → TC-021, EVAL-082 · enrolment + revocation anchored → TC-022, TC-023 · revoked/unknown hard-fail → TC-023, EVAL-051/052 · `agent_plots` + unassigned = scenario 5 refusal → TC-024, EVAL-054 (TP5) · first-run language sheet → TC-025.


### TKT-06 → TASK-7 · Plot registration on a satellite map (sp 5 · P0 · Feature)
**Depends on:** TKT-04 (TASK-5) · **TC:** TC-026, TC-027, TC-028 (edit path; the cache half is TKT-07), TC-029, TC-080/081 (plots screens) · **EVAL:** EVAL-044 (edit path), EVAL-005, EVAL-026 (geometry fixtures) · **Owns files:** `src/lib/geo/{parse,validate,area}.ts`, `src/lib/plots/*`, `src/app/(admin)/admin/plots/**`, `src/components/admin/PlotEditor*.tsx`, `evals/fixtures/geometry/*`
**Brief for the implementer:** Admins register a farmer and a plot. The polygon comes from drawing on satellite tiles or from a GeoJSON/KML upload. It is normalised to WGS84, validated against the EU Information System rules (closed ring, ≥ 4 positions, no self-intersection, no holes, ≤ 1000 vertices, 6-dp rounding without duplicate vertices), and its area is computed geodesically. Every save is anchored in the same transaction: `plot_registered` on create, `plot_edited` on edit (§8.1). An edit also sets `registration_stale=1`, and TKT-07 clears it. Traps: Leaflet touches `window`, so the editor is `dynamic(() => import(...), { ssr:false })`. leaflet-draw 1.0.4 is unmaintained (last release 2022) but works with Leaflet 1.9.4; keep it behind `PlotEditor` so a swap to leaflet-geoman stays local. Tiles come from `MAP_TILE_PROVIDER`, and the official Esri World Imagery path needs `ARCGIS_API_KEY` (research Q6). Ledger payloads carry `producer_id`, never the farmer's name or identifier (EV16). The agent ↔ plot assignment UI belongs to TKT-05; don't build it here.

**TSK-06.1 · Parse GeoJSON and KML into a normalised polygon**
- **Files:** create `src/lib/geo/parse.ts`, `src/lib/geo/parse.test.ts`, `evals/fixtures/geometry/{valid-polygon.geojson,valid-multipolygon.geojson,one-placemark.kml,open-ring.geojson,bowtie.geojson,projected.geojson,too-many-vertices.geojson,empty.geojson}`
- **Produces:** `parsePlotFile(name: string, text: string): { ok: true; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon } | { ok: false; reason: PlotGeomError }`, where `PlotGeomError = 'empty' | 'not_polygon' | 'open_ring' | 'too_few_positions' | 'self_intersection' | 'has_holes' | 'not_wgs84' | 'too_many_vertices' | 'duplicate_vertices'`
- [ ] Write the failing test. Valid Polygon → ok, with coordinates rounded to 6 dp. MultiPolygon → ok. KML with one placemark → the Polygon. Each invalid fixture → its exact `reason`. A Feature or FeatureCollection with a single polygon is unwrapped.
- [ ] `pnpm vitest run src/lib/geo/parse.test.ts` → fails (module missing).
- [ ] Implement: add `@tmcw/togeojson` and `@xmldom/xmldom` for KML (server-side DOMParser). Accept a FeatureCollection or Feature or Geometry. Reject LineString/Point. Close no rings automatically: an open ring is an error, because the admin must know. Flag holes as `has_holes`, because the EU system ignores inner rings. `not_wgs84` when any |lng| > 180 or |lat| > 90. Count vertices across rings (> 1000 → error). Round to 6 dp, then reject duplicate consecutive vertices.
- [ ] Verify: the test is green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Parse and normalise plot GeoJSON and KML uploads (TASK-7)`

**TSK-06.2 · Validate geometry and compute area**
- **Files:** create `src/lib/geo/validate.ts`, `src/lib/geo/area.ts`, `src/lib/geo/geo.test.ts`
- **Produces:** `validatePolygon(g): PlotGeomError | null` (used by `parsePlotFile` and the editor), `areaHa(g): number` (geodesic, `@turf/area` ÷ 10 000, not rounded), `formatHa(n): string` (2 dp), `geometryHash(g): Promise<string>` = `sha256Hex(jcs(g))` (the cache key in §4.1)
- [ ] Write the failing test. Self-intersection uses `@turf/kinks` (bow-tie → `self_intersection`). Areas of P01 (2.0 ha), P04 (1.2 ha concave L) and P10 (4.0 ha) from the TKT-03 fixtures `evals/fixtures/plots/*.geojson` are within 0.5 % (TC-027). `geometryHash` is stable across key-order changes and changes when one vertex moves by 1e-6.
- [ ] Run → fails.
- [ ] Implement it; `parsePlotFile` now calls `validatePolygon`.
- [ ] Verify: green; typecheck and lint.
- [ ] Commit: `Validate plot geometry and compute geodesic area (TASK-7)`

**TSK-06.3 · Farmer and plot persistence with anchoring**
- **Files:** modify `src/lib/db/schema.ts` (`farmers.producer_id`, `plots.registration_stale`, `plots.updated_at`, `plots.anchor_seq`), add migration `src/lib/db/migrations/00xx_plots.sql`; create `src/lib/plots/{farmers,plots}.ts` and `src/lib/plots/plots.test.ts` (integration, temp libSQL)
- **Produces:** `createFarmer(tx, {orgId, name, identifier}) → {id, producerId}`; `registerPlot(orgId, {farmerId, crop, geometry}) → {plotId, anchorSeq}`; `editPlot(orgId, plotId, geometry) → {anchorSeq}`; `listPlots(orgId)`; `getPlot(orgId, plotId)` (null for another org, TC-019); the hook `onPlotGeometrySaved(plotId, geometry)` (a no-op here, which TKT-07 replaces with the registration checks)
- [ ] Write the failing test:
  - `producer_id` matches `/^PR-[0-9A-HJKMNP-TV-Z]{8}$/`.
  - `registerPlot` writes the plot plus a `plot_registered` ledger entry in one transaction. The payload is `{plotId, producerId, crop, areaHa, geometryHash}`, with no name or identifier.
  - `editPlot` writes a `plot_edited` entry `{plotId, previousGeometryHash, geometryHash, areaHa}`, sets `registration_stale=1`, and never rewrites the old ledger entry.
  - A failure injected into the ledger append leaves no plot row (TC-010 pattern).
  - Another org's plot ID → null.
- [ ] Run → fails.
- [ ] Implement using the ledger `append(tx, kind, payload)` from TKT-02. Add `plot_edited` to the ledger kind union (§8.1). Compute `area_ha` server-side from the geometry; never trust a client value.
- [ ] Verify: green; typecheck and lint.
- [ ] Commit: `Persist farmers and plots with anchored registration and edits (TASK-7)`

**TSK-06.4 · Server Actions for register and edit**
- **Files:** create `src/app/(admin)/admin/plots/actions.ts`, `src/app/(admin)/admin/plots/actions.test.ts`
- **Produces:** `createPlotAction(formData)`, `updatePlotGeometryAction(plotId, geojsonText)`, `uploadPlotFileAction(formData)`. Each returns `{ok:true, plotId} | {ok:false, reason}`.
- [ ] Write the failing test:
  - A non-admin gets 403. `tests/guard-coverage.test.ts` still passes.
  - An upload over 2 MB → `file_too_large`.
  - An invalid geometry returns its reason string.
  - Success returns the plot ID and anchors.
- [ ] Run → fails.
- [ ] Implement: `requireSession('admin')` first; `orgId` from the session; zod input.
- [ ] Verify: green.
- [ ] Commit: `Add guarded plot register, edit and upload actions (TASK-7)`

**TSK-06.5 · Plot list and new-plot screen (composed, TP17)**
- **Files:** create `src/app/(admin)/admin/plots/page.tsx`, `src/app/(admin)/admin/plots/new/page.tsx`, `src/app/(admin)/admin/plots/[plotId]/page.tsx`, `e2e/admin-plots.spec.ts`
- [ ] Write the failing e2e. The list shows each plot's farmer, producer ID, crop, area, registration status (fresh / stale / checks pending) and the four states via `?state=`. New plot: pick or create a farmer and a crop, then draw or upload. After saving, the detail page shows the area in ha and a "Registration checks pending" line (TKT-07 fills it).
- [ ] Run → fails.
- [ ] Implement with the admin rail and components from `admin.html` (rail, glass rows, pills, sheets); no new visual tokens. The detail uses `PlotSvg` for the outline. The map editor comes in the next task.
- [ ] Verify: e2e green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Add admin plot list, new-plot and plot detail screens (TASK-7)`

**TSK-06.6 · Map editor with a non-drag alternative (WCAG 2.5.7)**
- **Files:** create `src/components/admin/PlotEditor.tsx`, `src/components/admin/PlotEditorMap.client.tsx`, `src/lib/geo/tiles.ts`; modify `src/app/(admin)/admin/plots/new/page.tsx` and `[plotId]/page.tsx`; extend `e2e/admin-plots.spec.ts` (TC-029)
- **Produces:** `tileLayerConfig(provider = env.MAP_TILE_PROVIDER): { url, attribution, maxZoom }`. For `esri`: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=` + `ARCGIS_API_KEY`, attribution "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community | Powered by Esri". For `maptiler`: `https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}@2x.jpg?key=` + `MAPTILER_KEY`, attribution "© MapTiler © OpenStreetMap contributors". The key is read server-side and passed as a prop only to the admin editor page; never `NEXT_PUBLIC_`. If the key is missing, the map shows a plain "Satellite tiles unavailable — draw on the outline or upload a file" state and the editor still works.
- [ ] Write the failing e2e, with tile requests routed to a 1×1 PNG stub:
  - Draw a polygon by clicking vertices.
  - Select a vertex from the vertex list and move it with the "Move north/south/east/west 1 m" buttons and the arrow keys.
  - Add a vertex after the selected one with "Add point", remove one with "Remove point".
  - Focus is visible throughout, the live area updates on every change, "Save" calls the action, and the saved area matches.
- [ ] Run → fails.
- [ ] Implement: react-leaflet 5 `MapContainer` + leaflet-draw `L.Draw.Polygon` / `L.EditToolbar.Edit` in the client-only component. Beside the map is an accessible vertex list (`<ol>` of lat/lng rows, each a button) plus the move, add and remove controls, with 48 px targets. Every change runs `validatePolygon` and shows the error inline. Allow the admin-only tile hosts in the CSP (§16; TKT-19 owns the header file, so add the host to its allow-list constant `ADMIN_TILE_HOSTS` in `src/lib/security/csp.ts` if it exists, otherwise export the constant from `tiles.ts` for TKT-19 to import).
- [ ] Verify: e2e green at 1280 and 768 px; TC-080 horizontal-scroll check on `/admin/plots*`; axe clean (TC-081).
- [ ] Commit: `Add plot map editor with keyboard and button vertex editing (TASK-7)`

**Done gate (TKT-06)**
| Acceptance criterion | Evidence |
|---|---|
| Leaflet + leaflet-draw on Esri World Imagery, MapTiler fallback by one config value | TSK-06.6 `tileLayerConfig` unit assertions + e2e with stubbed tiles |
| Drag-point editing plus point add/remove buttons (WCAG 2.5.7) | TC-029 |
| GeoJSON/KML upload | TC-026 |
| Area in hectares on save | TC-027, TSK-06.3 |
| `plot_registered` anchored | TSK-06.3 integration test |
| An edit re-anchors and marks registration checks stale (feeds EVAL-044) | TSK-06.3 + TC-028 (cache half in TKT-07) |
| Geometry fixtures for EVAL-005/026 are valid | TSK-06.2 validates `evals/fixtures/plots/P04.geojson` (concave, notch outside) |

---

### TKT-07 → TASK-8 · Satellite checks with caching and honest failure (sp 8 · P0 · Feature)
**Depends on:** TKT-03 (TASK-4), TKT-06 (TASK-7) · **TC:** TC-030, TC-031, TC-032, TC-033, TC-034, TC-028 (cache half), TC-011 (rows for the three checks), TC-001 (provider probe) · **EVAL:** EVAL-006, 015, 016, 017, 019, 037–043, 044 · **Owns files:** `src/lib/remote-sensing/**`, `src/lib/verification/checks/{deforestation_overlap,ndvi_cultivation,ndvi_harvest_window}.ts`, `src/lib/plots/registration.ts`, `evals/fixtures/remote-sensing/**`; small edits to `src/lib/verification/{registry,evidence}.ts`, `src/lib/capture/context.ts`, `evals/harness/context.ts`, `src/app/api/health/route.ts`
**Brief for the implementer:** A provider failure must never become a rejection (S6, CF-03). Every timeout, non-2xx, malformed body, or window with no clear observation becomes `unavailable` with the provider named. The fixture provider is the default and needs no network. Live adapters are exercised only through recorded responses in tests. Thresholds come from `cfg-1` (§6.2): `deforestation.hardFailAtPct 10`; `ndviCultivation` 6 clear months, min ≥ 0.50, swing ≤ 0.35; `ndviHarvestWindow` ±30 d, ok ≥ 0.45, fail < 0.30. Traps:
- GFW `latest` 307-redirects: follow redirects, but pin the resolved version (`v1.13` at planning time) in the cache row.
- GFW rejects keyless calls with 403.
- The CDSE token is rate-limited: cache it until `exp − 60 s`.
- Statistical API intervals that are fully masked show `noDataCount == sampleCount` with a NaN mean, and they may be absent from `data[]`: handle both.

**TSK-07.1 · Provider interface, fixture adapter and profiles**
- **Files:** create `src/lib/remote-sensing/{types,fixture}.ts`, `src/lib/remote-sensing/fixture.test.ts`, `evals/fixtures/remote-sensing/profiles.ts`
- **Produces:** `RemoteSensingProvider` (§7, exact signatures), `PlotGeom = { id: string; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; areaHa: number; geometryHash: string }`; `ProviderError extends Error { provider: 'gfw' | 'sentinel-hub'; kind: 'timeout' | 'http' | 'malformed' }`; `createFixtureProvider(opts: { profiles: Record<plotId, RsProfile>; faults?: { provider, mode: 'timeout'|'http_500'|'malformed' }[]; delayMs?: Partial<Record<'forestLoss'|'ndviHistory'|'ndviWindow', number>> })`. Profiles are generated from the dataset `fixtures.plots[].remote_sensing`:
  - `perennial_canopy`: 12 monthly means 0.62–0.81, 11 clear.
  - `cleared_then_planted`: dips to 0.21, then regrowth.
  - `annual_crop`: 0.28–0.74.
  - `living_canopy` window: mean 0.71, 4 clear observations.
  - `cloud_blocked`: mean null, 0 clear.
  - `bare`: mean 0.22, 3 clear.
  - `deforestation_loss_pct_inside` → `lossPct` and `lossHa = pct × areaHa / 100`.
- [ ] Write the failing test. For P01, X01, X05, X06 and P09 the fixture returns the numbers above. A `timeout` fault rejects with `ProviderError{kind:'timeout'}` only after the caller's `AbortSignal` fires (never resolves on its own). `http_500` → `kind:'http'`. `malformed` → `kind:'malformed'`. A fault on `gfw` does not affect `sentinel-hub` calls.
- [ ] Run → fails.
- [ ] Implement it. Fault injection exists only through the constructor option; there's no env switch (§7).
- [ ] Verify: green; typecheck and lint.
- [ ] Commit: `Add remote-sensing provider interface and fixture adapter (TASK-8)`

**TSK-07.2 · Cache wrapper and timeouts**
- **Files:** modify `src/lib/db/schema.ts` (`remote_sensing_cache`, §4.1) + migration; create `src/lib/remote-sensing/{cache,index}.ts`, `src/lib/remote-sensing/cache.test.ts` (integration)
- **Produces:** `withCache(provider, db, {now}) → RemoteSensingProvider`; `withTimeouts(provider, {timeoutMs: 8000}) → RemoteSensingProvider` (each call gets `AbortSignal.timeout(timeoutMs)`); `getRemoteSensing(env) → RemoteSensingProvider` (`REMOTE_SENSING_PROVIDER=fixture|live`)
- [ ] Write the failing test (TC-033, TC-032 timing half, with fake timers):
  - Two `ndviWindow` calls for the same plot in the same month → one underlying call.
  - Another month → a second call.
  - An edited geometry (new hash) misses the cache for `forestLoss`.
  - Errors are never cached.
  - A never-answering call rejects with `kind:'timeout'` at 8000 ms.
- [ ] Run → fails.
- [ ] Implement. Cache key = (plot_id, provider, kind, month_bucket, geometry_hash): forest loss uses `static`, NDVI history the registration month `YYYY-MM`, the window the capture month in IST. Store `response` JSON plus `fetched_at`.
- [ ] Verify: green.
- [ ] Commit: `Cache remote-sensing responses per plot, geometry and month with 8 s timeouts (TASK-8)`

**TSK-07.3 · The three satellite checks and the remote phase cap**
- **Files:** create `src/lib/verification/checks/{deforestation_overlap,ndvi_cultivation,ndvi_harvest_window}.ts` + `checks/satellite.test.ts`; modify `src/lib/verification/registry.ts` (register the three, with `provider` set), `src/lib/verification/evidence.ts` (§6.5 rows), `src/lib/verification/verify.ts` (remote phase: `Promise.allSettled` capped at `providers.remotePhaseCapMs` = 10 000; still pending at the cap → `unavailable` "no answer within 10 s")
- **Produces:** check modules following the TKT-02 `Check` contract; `unavailableProviders` filled from checks whose provider failed
- [ ] Write the failing test (TC-032, TC-011 rows, EVAL-level expectations):
  - `lossPct` 0 → ok, "0.0% of plot area lost since 2021 (hard fail at 10.0%)".
  - 3.0 → flag; 9.5 → flag; 10.0 → hard fail; 10.5 → hard fail; 25.0 → hard fail with "25.0%" and "10.0%".
  - History `perennial_canopy` → ok with "monthly NDVI 0.62–0.81 over 11 clear months"; `cleared_then_planted` → fail naming 0.21; `annual_crop` → fail.
  - Fewer than 6 clear months → unavailable.
  - Window 0.71 → ok; 0.40 → flag; 0.22 → fail; `cloud_blocked` → unavailable "Satellite view blocked by cloud for ±30 days".
  - Each fault mode → unavailable with the provider in `unavailableProviders`, and the verdict is Needs Review, never Rejected (EVAL-016/017).
  - With `delayMs` 12 000 on `ndviWindow` the phase ends at 10 s.
- [ ] Run → fails.
- [ ] Implement per §6.3 rows. The forest-loss check reads the plot's cached registration result first (F2), and on a miss calls `forestLoss`.
- [ ] Verify: green; `pnpm eval` shows EVAL-006, 015–017, 019, 037–043 no longer `not_yet_implemented`, and their assertions pass.
- [ ] Commit: `Add forest-loss and NDVI checks with a 10 s remote phase cap (TASK-8)`

**TSK-07.4 · GFW live adapter (recorded-response tested)**
- **Files:** create `src/lib/remote-sensing/gfw.ts`, `src/lib/remote-sensing/gfw.test.ts`, `evals/fixtures/remote-sensing/recorded/gfw-P01.json` (recorded in TSK-07.7; until then a hand-written response in the documented shape, marked `"synthetic": true`)
- **Produces:** `createGfwProvider({ apiKey, baseUrl = 'https://data-api.globalforestwatch.org', datasetVersion = 'latest', origin, fetch = globalThis.fetch })`
- [ ] Write the failing test (TC-030), with an injected `fetch` spy:
  - Request: `POST {baseUrl}/dataset/umd_tree_cover_loss/{version}/query/json`, headers `x-api-key: <key>`, `content-type: application/json`, `origin`.
  - Body `{ sql, geometry }` with exactly:
    ```sql
    SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha FROM results
    WHERE umd_tree_cover_loss__year >= 2021 AND umd_tree_cover_density_2000__threshold >= {TCD}
    GROUP BY umd_tree_cover_loss__year
    ```
  - The recorded response `{data:[{umd_tree_cover_loss__year, area__ha}], status:'success'}` → `lossHa = Σ area__ha`, `lossPct = lossHa / plot.areaHa × 100`, `dataYear = max year seen or the dataset's last year`.
  - 403/429/5xx → `ProviderError{kind:'http'}`. A non-JSON body → `malformed`.
  - The key never appears in any log line (capture pino output).
- [ ] Run → fails.
- [ ] Implement it. `{TCD}` comes from `cfg-1` `deforestation.canopyDensityPct` (see note below). Follow the `latest` redirect and record the resolved version from the final URL in the response metadata.
- [ ] Verify: green.
- [ ] Commit: `Add Global Forest Watch tree-cover-loss adapter (TASK-8)`
- **Note for the parent plan:** `cfg-1` (§6.2) has no tree-cover-density threshold, but the GFW query needs one. The EUDR uses the FAO forest definition (> 10 % canopy); GFW's default is 30 %. Add it as a config value before baseline-v1 (TP decision).

**TSK-07.5 · Sentinel Hub (CDSE) live adapter (recorded-response tested)**
- **Files:** create `src/lib/remote-sensing/sentinel.ts`, `src/lib/remote-sensing/sentinel-evalscript.ts`, `src/lib/remote-sensing/sentinel.test.ts`, `evals/fixtures/remote-sensing/recorded/sentinel-P01-history.json`, `…-P09-window-cloud.json`
- **Produces:** `createSentinelProvider({ clientId, clientSecret, tokenUrl = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', statsUrl = 'https://sh.dataspace.copernicus.eu/statistics/v1', fetch, now })`
- [ ] Write the failing test (TC-031):
  - The token is requested once with `grant_type=client_credentials` and reused until `exp − 60 s`.
  - The statistics request has `input.bounds.geometry` = the plot and `properties.crs` = `http://www.opengis.net/def/crs/EPSG/0/4326`, `data:[{type:'sentinel-2-l2a', dataFilter:{mosaickingOrder:'leastCC'}}]`, `resx/resy 0.0001`, and the evalscript from research Q4: B04, B08, SCL, dataMask; SCL classes 3/8/9/10/11 masked; outputs `ndvi` FLOAT32 + `dataMask`.
  - History uses `aggregationInterval {of:'P1M'}` over 12 months with `lastIntervalBehavior:'SHORTEN'`. The window uses `P10D` over [date − 30 d, date + 30 d].
  - Parsing: `clearFraction = (sampleCount − noDataCount) / sampleCount`. `mean` is null when `noDataCount == sampleCount`, or when the mean is `NaN` or the string "NaN". Missing intervals count as not clear. The window mean is the clear-pixel-weighted mean of clear intervals, and `clearObservations` is the number of intervals with a clear fraction > 0.
  - 401 on the stats call → one token refresh and a retry, then `http`.
- [ ] Run → fails.
- [ ] Implement it.
- [ ] Verify: green.
- [ ] Commit: `Add Copernicus Sentinel Hub NDVI adapter with SCL cloud masking (TASK-8)`

**TSK-07.6 · Registration checks on plot save, and the health probe (F2)**
- **Files:** create `src/lib/plots/registration.ts`, `src/lib/plots/registration.test.ts` (integration); modify `src/lib/plots/plots.ts` (replace the `onPlotGeometrySaved` no-op), `src/app/(admin)/admin/plots/[plotId]/page.tsx` (registration card + "Re-run checks" action), `src/app/api/health/route.ts` (providers: `fixture` in fixture mode; in live mode a cached 60 s probe = a token fetch for CDSE and a `GET /dataset/umd_tree_cover_loss` for GFW)
- **Produces:** `runRegistrationChecks(orgId, plotId) → { forestLoss, ndviHistory, anchorSeq }`, which stores `registration_checks` JSON (loss %, NDVI summary, each check's evidence), clears `registration_stale`, and anchors the results' hash in the same transaction as the update (as a `plot_edited` payload `{plotId, registrationChecksHash}` — the plot's registration is a fact anchored with it)
- [ ] Write the failing test (TC-034, TC-028 cache half, EVAL-044):
  - Saving P01 stores both results and anchors.
  - Editing P01 to the fixture geometry `evals/fixtures/geometry/P01-edited-18pct.geojson` (profile loss 18.0 %) re-queries because the geometry hash changed, the card shows 18.0 %, and the next capture on the plot is Rejected with `deforestation_overlap` `hardFail:true`.
  - A GFW fault at registration saves the plot, marks the check unavailable, and shows the Re-run control.
- [ ] Run → fails.
- [ ] Implement it. Provider calls run outside the write transaction (TP12); only the result write and the anchor are transactional.
- [ ] Verify: green; TC-001 health still passes in fixture mode.
- [ ] Commit: `Run forest-loss and NDVI registration checks when a plot is saved (TASK-8)`

**TSK-07.7 · Live mode for the harness and scenario 3 cases**
- **Files:** modify `evals/harness/run.ts` (flags `--provider=live`, `--record`), `evals/harness/context.ts` (build the provider from `provider_fault` mutations + profiles); modify `evals/eval-dataset.json` (fixtures `X08`–`X10`, cases, `dataset_version` minor bump); create `evals/harness/live-agreement.ts`
- **Produces:**
  - `pnpm eval --provider=live` compares P01–P10 live answers with the fixtures in an agreement table in the report. There's no gate; it needs `GFW_API_KEY`, `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` from env and exits with a clear message if any is missing; never in CI.
  - `--record` writes `evals/fixtures/remote-sensing/recorded/<plot>-<kind>.json` with `fetchedAt` and the provider version.
- **New cases** (reserved block EVAL-106–109; if another branch merged into that block first, renumber to the next free IDs at merge, since IDs are never reused):
  - EVAL-106: X08, loss exactly 10.0 % → Rejected, `deforestation_overlap` hard fail, evidence "10.0%".
  - EVAL-107: X09, 5.5 ha plot with 0.4 % loss → Needs Review via the flag cap, evidence "0.4%".
  - EVAL-108: X10, zero loss, `ndvi_history` = `cleared_then_planted` → `ndvi_cultivation` fail → Needs Review.
  - Fixture plots follow the existing shape. All three are `attack`, scenario 3, gate S1, `depends_on:["EV7"]` where the cap is what catches them.
- [ ] Write the failing test: `evals/harness/live.test.ts` asserts that `--provider=live` without keys exits 2 with a message listing the missing variable names only (not values), and that the dataset still validates (`pnpm eval:validate`).
- [ ] Run → fails.
- [ ] Implement it; add the three cases.
- [ ] Verify: `pnpm eval:validate` green; `pnpm eval` detects EVAL-106–108 and scenario 3 has ≥ 10 active S1 attack cases (EVAL-037–043 + 106–108 = 10).
- [ ] Commit: `Add live-provider agreement mode and three plot-laundering cases (TASK-8)`

**Done gate (TKT-07)**
| Acceptance criterion | Evidence |
|---|---|
| `RemoteSensingProvider` with fixture (default), GFW and Sentinel Hub adapters | TSK-07.1, TC-030, TC-031 |
| Per-plot, per-month cache | TC-033 |
| 8 s timeout per call | TC-032 (fake timers) |
| `deforestation_overlap` any-loss flag / ≥ 10 % hard fail (S5), `ndvi_cultivation`, `ndvi_harvest_window` | TSK-07.3; EVAL-006, 019, 037–043, 106–108 in `pnpm eval` |
| Timeouts, HTTP errors and cloud-blocked windows → `unavailable`, capped at Needs Review (S6) | TC-032; EVAL-015, 016, 017 |
| Registration runs the forest-loss query and the 12-month history (F2) | TC-034; EVAL-044 via TC-028 |

---

### TKT-08 → TASK-9 · Location and time checks (sp 5 · P0 · Feature)
**Depends on:** TKT-02 (TASK-3) · **TC:** TC-035, TC-036, TC-037, TC-011 (rows for these checks) · **EVAL:** EVAL-003, 004, 005, 007, 008, 009, 010, 011, 013, 014, 020, 023–029, 033, 034, 055–057 · **Owns files:** `src/lib/media/exif.ts`, `src/lib/geo/{geofence,distance}.ts`, `src/lib/verification/checks/{geofence,gps_accuracy,exif_gps_agreement,exif_time_agreement,movement_plausibility}.ts`, `evals/fixtures/photos/**`; small edits to `src/lib/verification/{registry,evidence}.ts`, `src/lib/capture/{pipeline,context}.ts`
**Brief for the implementer:** Five checks, and `geofence` is completed here: TKT-02 shipped it as plain point-in-polygon. Every threshold boundary in §6.3 is pinned by a dataset pair, so write the pair tests first (TC-036/037) and let them decide `<` versus `≤`. Traps:
- By default exifr turns `DateTimeOriginal` into a JS `Date` in the *process* time zone. Use `reviveValues:false` and parse the raw `YYYY:MM:DD HH:MM:SS` yourself: apply `OffsetTimeOriginal` if present, else +05:30 (TP25).
- A point in a concave polygon's notch is outside even though it is inside the bounding box. Use `@turf/boolean-point-in-polygon`, never a bbox test.
- Distance to the edge is the distance to the nearest ring segment (`@turf/point-to-line-distance` over `@turf/polygon-to-line`, in metres), not to a vertex.
- Evidence numbers are whole metres, whole km/h and `N min / N h / N days` (§6.5).

**TSK-08.1 · EXIF extraction with the IST default**
- **Files:** create `src/lib/media/exif.ts`, `src/lib/media/exif.test.ts`, `evals/fixtures/photos/{gps-time-offset.jpg,time-no-offset.jpg,no-exif.jpg,sample.heic}` + `evals/fixtures/photos/README.md` (how each was made: generated with `piexifjs` in `evals/fixtures/photos/make.ts`, except the HEIC, a public-domain sample with its source URL)
- **Produces:** `type ExifFacts = { gps: { lat: number; lng: number } | null; takenAt: string | null /* ISO UTC */; hadOffset: boolean; make?: string; model?: string }`; `extractExif(bytes: Uint8Array): Promise<ExifFacts>` (never throws; a failure → all null); `sniffImage(bytes): 'jpeg' | 'heic' | null` (JPEG `FF D8 FF`; HEIC `ftyp` at offset 4 with brand `heic|heix|hevc|mif1`). TKT-19 reuses `sniffImage`.
- [ ] Write the failing test (TC-035):
  - `gps-time-offset.jpg` with `2026:09:20 10:15:00` and `+05:30` → `takenAt 2026-09-20T04:45:00.000Z`, GPS to 6 dp.
  - `time-no-offset.jpg` gives the same instant (IST assumed) and `hadOffset:false`.
  - `no-exif.jpg` → `{gps:null, takenAt:null}`.
  - The HEIC is sniffed `heic`, and its EXIF is parsed if present.
  - Run the suite under `TZ=UTC` and `TZ=America/Los_Angeles` with identical results.
- [ ] Run → fails.
- [ ] Implement with `exifr.parse(bytes, { gps: true, reviveValues: false, pick: [...] })` plus `exifr.gps()`.
- [ ] Verify: `TZ=UTC pnpm vitest run src/lib/media` and `TZ=America/Los_Angeles pnpm vitest run src/lib/media` both green.
- [ ] Commit: `Extract EXIF GPS and capture time with an IST default (TASK-9)`

**TSK-08.2 · Wire EXIF and the previous event into the capture pipeline**
- **Files:** modify `src/lib/capture/pipeline.ts` (after storing media: `extractExif` per photo → `Submission.media[i].exif`; persist `media.exif` JSON), `src/lib/capture/context.ts` (`previousEvent` = this device's last accepted event: lat, lng, capturedAt); extend `src/lib/capture/pipeline.test.ts`
- [ ] Write the failing test:
  - A capture with the `gps-time-offset.jpg` fixture stores the EXIF JSON and passes `ExifFacts` to `verify`.
  - The second capture from the device gets `previousEvent` equal to the first.
  - Boundary-rejected events are never `previousEvent`.
- [ ] Run → fails.
- [ ] Implement it.
- [ ] Verify: green; TC-013 tracer e2e still green.
- [ ] Commit: `Feed EXIF facts and the previous accepted event into verification (TASK-9)`

**TSK-08.3 · Geofence with the buffer rule and GPS accuracy**
- **Files:** create `src/lib/geo/{geofence,distance}.ts`, `src/lib/geo/geofence.test.ts`, `src/lib/verification/checks/gps_accuracy.ts`; modify `src/lib/verification/checks/geofence.ts`, `evidence.ts`, `registry.ts`; create `src/lib/verification/checks/location.test.ts`
- **Produces:** `locate(point, polygon) → { inside: boolean; distanceToEdgeM: number }`; `haversineM(a, b)`
- [ ] Write the failing test (TC-036), using the TKT-03 plot fixtures and the mutation engine's `gps_place` to build points:
  - Geofence:
    - P04 point 15 m inside next to the notch → ok ("Inside the plot, 15 m from the edge").
    - P04 point in the notch 40 m → fail.
    - 12 m outside at accuracy 20 → flag ("12 m outside the plot edge, within the 20 m GPS allowance").
    - 30 m outside at accuracy 8 → fail ("30 m outside the plot edge (allowance 8 m)").
    - 26 m outside at accuracy 60 → fail ("allowance 25 m").
    - 2400 m outside → fail "2400 m".
    - Buffer boundary: distance == buffer → flag; buffer + 1 m → fail.
  - Accuracy: 28 → ok, 29.9 → ok, 30 → flag, 99.9 → flag, 100 → fail, 150 → fail "GPS accuracy 150 m (good under 30 m, limit 100 m)".
- [ ] Run → fails.
- [ ] Implement per §6.3: buffer = `min(accuracyM, cfg.geofence.maxBufferM)`; round distances with `Math.round` only for evidence, compare on raw values.
- [ ] Verify: green.
- [ ] Commit: `Complete geofence with the accuracy buffer and add the GPS accuracy check (TASK-9)`

**TSK-08.4 · EXIF GPS and EXIF time agreement (TP4)**
- **Files:** create `src/lib/verification/checks/{exif_gps_agreement,exif_time_agreement}.ts`, `src/lib/verification/checks/exif.test.ts`; modify `evidence.ts`, `registry.ts`
- [ ] Write the failing test (TC-036 EXIF part, TC-037 time part):
  - EXIF GPS (worst photo decides; photos without GPS are ignored unless all lack it):
    - 10 m → ok; 35 m → ok; 49 m → ok; 50 m → ok; 51 m → fail.
    - 3200 m → fail with "3200 m" (EVAL-023).
    - All absent → flag "Photo has no location data" (EVAL-007).
  - EXIF–client (latest photo time vs `payload.capturedAt`): 2 min → ok; 9 → ok; 10 → ok; 11 → flag; 120 → flag "120 min"; 3 days (4320 min) → flag "3 days"; 7 days (10 080 min) → flag; 10 081 min → fail "(fail over 7 days)"; 45 days → fail.
  - Client–server (`capturedAt` vs `serverReceivedAt`): 0 → ok; 23 h → ok; 24 h → ok; 24 h + 1 min → flag; 3 days → flag (EVAL-055); 9 days → fail (EVAL-057); 10 days → fail (EVAL-035).
  - EXIF time absent → flag "Photo has no time data".
  - The worse of the two gaps decides the status. The sentence reports both gaps.
- [ ] Run → fails.
- [ ] Implement per §6.3 and `cfg-1.exifTime`. Δ formatting: under 120 min → `N min`; under 48 h → `N h`; otherwise `N days`, whole numbers.
- [ ] Verify: green.
- [ ] Commit: `Add EXIF location and time agreement checks (TASK-9)`

**TSK-08.5 · Movement plausibility**
- **Files:** create `src/lib/verification/checks/movement_plausibility.ts`, `src/lib/verification/checks/movement.test.ts`; modify `evidence.ts`, `registry.ts`
- [ ] Write the failing test (TC-037 movement part):
  - No previous event → ok "First entry from this phone".
  - 25 km in 20 min (75 km/h) → ok.
  - 119 km/h → ok.
  - 120 → fail.
  - 150 → fail "150 km/h".
  - 45 km in 8 min → fail "338 km/h".
  - `minutes_before` ≤ 0 (a clock going backwards) → fail with "time did not advance", because an implied infinite speed is not plausible.
  - The sentence includes the distance in whole metres and the minutes.
- [ ] Run → fails.
- [ ] Implement it with `haversineM` and client timestamps, which is what the agent claims. The server-time gap is covered by `exif_time_agreement`.
- [ ] Verify: green; `pnpm eval` shows EVAL-003–005, 007–011, 013, 014, 020, 022–028, 033, 034, 055–057 passing; EVAL-029 is listed under known limitations.
- [ ] Commit: `Add movement plausibility check (TASK-9)`

**TSK-08.6 · Scenario 1 cases to ten**
- **Files:** modify `evals/eval-dataset.json` (minor version bump)
- **New cases** (reserved block EVAL-110–113; renumber to the next free IDs at merge if the block is taken). All are scenario 1 `attack`, gate S1, base EVAL-002, `depends_on:["EV7"]`:
  - EVAL-110: 100 m outside P08 with 30 m accuracy and matching EXIF → geofence fail "100 m", gps_accuracy flag.
  - EVAL-111: inside P01 with EXIF GPS offset 60 m → exif_gps_agreement fail "60 m" (single signal, just over the 50 m limit).
  - EVAL-112: inside P06 with the previous capture 21 km away 10 min earlier → movement_plausibility fail "126 km/h" (single signal, just over 120).
  - EVAL-113: 55 m outside P02 with 5 m accuracy and EXIF GPS absent → geofence fail "55 m", exif flag.
- [ ] Write the failing check: `pnpm eval:validate` passes and a harness unit test asserts scenario 1 has ≥ 10 active S1 cases.
- [ ] Run → fails (7 cases).
- [ ] Add the cases.
- [ ] Verify: `pnpm eval` detects all four, and scenario 1 detection is ≥ 90 %.
- [ ] Commit: `Bring the GPS-spoofing attack set to ten cases (TASK-9)`

**Done gate (TKT-08)**
| Acceptance criterion | Evidence |
|---|---|
| `gps_accuracy`, `exif_gps_agreement`, `exif_time_agreement`, `movement_plausibility` | TSK-08.3–08.5 unit tests; TC-036, TC-037 |
| Geofence buffer min(accuracy, 25 m) with concave-polygon correctness | TC-036; EVAL-005, 009, 025, 026, 027 |
| GAP-1 resolved (absent EXIF time → flag; the 7-day fail applies to both gaps) and recorded | TP4 in decisions.md; TC-037; EVAL-033, 035, 057 |
| Evidence sentences in the §7.4 format | TC-011 rows; `evidence_substrings` for EVAL-009, 020, 022–025, 027, 028 |
| Scenario 1 cases linked in tickets.md pass | `pnpm eval` results file on the ticket's last commit |

---

### TKT-09 → TASK-10 · Yield, chain and replay checks; idempotent retry (sp 5 · P0 · Feature)
**Depends on:** TKT-02 (TASK-3), TKT-05 (TASK-6), TKT-06 (TASK-7) · **TC:** TC-038, TC-039, TC-040, TC-041, TC-042, TC-011 (rows) · **EVAL:** EVAL-012, 031, 032, 035, 036, 045–050, 068 · **Owns files:** `src/lib/yield/**`, `src/lib/verification/checks/{yield_plausibility,chain_continuity}.ts`, `src/lib/capture/idempotency.ts`, `src/lib/db/seed/yield-reference.ts`; edits to `checks/photo_uniqueness.ts` (from TKT-02), `src/lib/capture/{pipeline,context}.ts`, `registry.ts`, `evidence.ts`, `evals/harness/{provenance,report}.ts`
**Brief for the implementer:** Four behaviours. (1) Yield is checked against a **season** total, not one capture. The season is the coffee year, 1 Oct – 30 Sep, bucketed by **server** receipt time in IST. The total converts cherry kg to clean coffee once, at comparison (TP6). (2) Chain continuity flags, never fails (TP10). (3) Photo uniqueness counts only hashes from **accepted** events, across all agents and plots. (4) An identical signed payload is recognised by `payload_hash` **before** verification and returns the original result (TP7, EV15). Otherwise the retry would hard-fail its own photos. Trap: `harvest_events.payload_hash` is `UNIQUE`, so two concurrent identical submissions race: catch the constraint error inside the transaction and return the winner's result. EVAL-036 (a re-encoded photo) is a declared known limitation; don't try to catch it.

**TSK-09.1 · Yield reference table and cited seed**
- **Files:** modify `src/lib/db/schema.ts` (`crop_yield_reference` per §4.1, pk (crop, variety), `version`) + migration; create `src/lib/db/seed/yield-reference.ts`, `src/lib/yield/reference.ts`, `src/lib/yield/reference.test.ts` (integration)
- **Produces:** `getYieldReference(crop) → { maxKgHa, cherryToCleanRatio, source, sourceUrl, version } | null`; `YIELD_REFERENCE_VERSION`
- **Values (TP6 is authoritative; these are the research figures it cites):**
  - `max_kg_ha` (clean coffee) = the highest district average in Coffee Board *Database on Coffee, July 2024*, Tables 1.10–1.11 (2018-19 → 2023-24, Kodagu and Chikkamagaluru): **arabica 783**, **robusta 1494**.
  - `source_url` = `https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf`.
  - `cherry_to_clean_ratio` for **fresh (ripe) cherry → clean** per TP6. The research found no Coffee Board figure for fresh cherry: the industry rule is 5–6 : 1, a peer-reviewed Arabica study measured 0.159–0.162, and the Board's outturn figures (0.535 / 0.527) apply to **dry** cherry. Seed the value TP6 fixes, with its source text in `source`.
- [ ] Write the failing test (TC-039):
  - After `seedYieldReference(db)`, one row per crop with the TP6 values, a non-empty `source` and `source_url`, and `version = YIELD_REFERENCE_VERSION`.
  - Seeding twice is idempotent.
  - `getYieldReference('arabica')` returns the row.
- [ ] Run → fails.
- [ ] Implement it.
- [ ] Verify: green.
- [ ] Commit: `Seed the crop yield reference from cited Coffee Board figures (TASK-10)`

**TSK-09.2 · Season window and cumulative total**
- **Files:** create `src/lib/yield/season.ts`, `src/lib/yield/season.test.ts`; modify `src/lib/capture/context.ts` (`seasonCherryKgBefore`, `yieldReference`) + its test
- **Produces:** `coffeeSeasonOf(serverReceivedAtIso) → { start: string; end: string; label: '2026-27' }` (IST boundaries); `seasonCherryKgBefore(db, plotId, season) → number`
- [ ] Write the failing test (TC-038 window part):
  - `2026-09-30T18:29:59.999Z` (30 Sep 23:59:59.999 IST) → season 2025-26.
  - `2026-09-30T18:30:00.000Z` (1 Oct 00:00 IST) → 2026-27.
  - The cumulative total sums `cherry_kg` of accepted events on the plot in the season with `final_verdict ≠ 'Rejected'`, excluding boundary-rejected events and events on other plots.
  - Identical results under `TZ=UTC` and `TZ=America/Los_Angeles`.
- [ ] Run → fails.
- [ ] Implement it with fixed-offset arithmetic (no host-zone calls).
- [ ] Verify: green under both TZ values.
- [ ] Commit: `Compute the coffee-season cumulative harvest by server time in IST (TASK-10)`

**TSK-09.3 · `yield_plausibility`**
- **Files:** create `src/lib/verification/checks/yield_plausibility.ts`, `src/lib/verification/checks/yield.test.ts`; modify `evidence.ts`, `registry.ts`
- [ ] Write the failing test (TC-038 threshold part):
  - `s = ((seasonCherryKgBefore + cherryKg) × cherryToCleanRatio ÷ areaHa) ÷ maxKgHa`.
  - s = 1.45 → ok; 1.50 → ok; 1.51 → flag; 1.60 → flag; 1.95 → flag; 2.00 → flag; 2.05 → hard fail with "2.05x"; 2.50 → hard fail with "2.50x"; 3.00 → hard fail.
  - Salami: 1.8 before, 2.1 after → hard fail. The check uses the season total, not the capture alone (EVAL-049).
  - No reference row → `unavailable` "No yield reference for <crop>".
  - Evidence: "Season total 2.05x the reference upper bound (flag above 1.50x, hard fail above 2.00x)".
- [ ] Run → fails.
- [ ] Implement per §6.3 and `cfg-1.yield`. Compare on the unrounded ratio; round only for evidence.
- [ ] Verify: green; `pnpm eval` passes EVAL-012, 045–050 (the harness uses its synthetic U, and provenance says "placeholder").
- [ ] Commit: `Add season yield plausibility check (TASK-10)`

**TSK-09.4 · `chain_continuity` (TP10)**
- **Files:** create `src/lib/verification/checks/chain_continuity.ts`, `src/lib/verification/checks/chain.test.ts`; modify `src/lib/capture/context.ts` (`agentPriorAcceptedEvents` counted across all the agent's devices; `device.lastSeq` and `device.lastEventHash` already come from TKT-02/05), `evidence.ts`, `registry.ts`
- [ ] Write the failing test (TC-041):
  - `seq = lastSeq + 1` with the correct prev hash → ok "Entry 14 follows entry 13 from this phone".
  - seq +2 → flag "Expected entry 14 after <prev8>, got entry 15".
  - The right seq with a stale prev hash → flag.
  - seq −2 with a stale hash (EVAL-035) → flag.
  - Genesis on a device with `lastSeq=0` when the agent has 0 prior events → ok.
  - Genesis on a new device when the agent has 23 prior accepted events → flag "First entry from a new phone; this agent has 23 earlier entries on another phone" (EVAL-021).
  - The check never returns `fail`.
- [ ] Run → fails.
- [ ] Implement it. On an accepted capture, the pipeline's persist step updates `devices.last_seq` and `last_event_hash` only when the event's `seq > last_seq`, so a stale replay can't rewind the chain.
- [ ] Verify: green.
- [ ] Commit: `Add per-device chain continuity check with re-enrolment awareness (TASK-10)`

**TSK-09.5 · Photo uniqueness across agents and plots**
- **Files:** modify `src/lib/verification/checks/photo_uniqueness.ts`, `src/lib/capture/context.ts` (`seenMediaHashes` = the submission's hashes present in `media` joined to `harvest_events` with `boundary_status='accepted'`, any plot and any agent); create `src/lib/capture/uniqueness.test.ts` (integration)
- [ ] Write the failing test (TC-042):
  - A hash on agent B's accepted event on plot P03 → hard fail "1 of 3 photos seen before" (EVAL-031/032).
  - All three reused → "3 of 3" (EVAL-030).
  - A hash present only on a boundary-rejected event → ok.
  - A hash on an event whose final verdict is Rejected by a check (still boundary-accepted) → counts as seen, because the photo was used.
- [ ] Run → fails.
- [ ] Implement it.
- [ ] Verify: green; `pnpm eval` passes EVAL-030–032.
- [ ] Commit: `Make photo uniqueness global over accepted captures (TASK-10)`

**TSK-09.6 · Idempotent retry by payload hash (TP7, EV15)**
- **Files:** create `src/lib/capture/idempotency.ts`, `src/lib/capture/idempotency.test.ts` (integration); modify `src/lib/capture/pipeline.ts` (step 3 of §3.1: before media storage and `verify`)
- **Produces:** `findPriorOutcome(db, payloadHash) → { kind: 'accepted'; eventId; verdict; score; checks } | { kind: 'rejected'; eventId; reason } | null`; NDJSON `{t:"verdict", …, idempotent:true}`
- [ ] Write the failing test (TC-040, EVAL-068, CF-14):
  - Submit EVAL-002's payload; submit the identical bytes again. The response carries the same `eventId` and verdict with `idempotent:true`; no new rows in `harvest_events`, `media`, `verification_runs` or `ledger_entries`; the season total counts the kg once.
  - Two identical submissions fired concurrently → exactly one event, both responses equal. The unique-constraint loser re-reads the winner.
  - The same photos with a new `capturedAt` (a different payload hash) → processed normally and hard-fails `photo_uniqueness`.
  - A retry of a boundary-rejected payload → the same rejection, no second anchor.
- [ ] Run → fails.
- [ ] Implement it: the lookup is the first step after the signature check; catch `SQLITE_CONSTRAINT_UNIQUE` on `payload_hash` inside the write transaction → roll back → return `findPriorOutcome`. Log `capture.idempotent_replay` with the request ID and event ID.
- [ ] Verify: green; TC-013 still green.
- [ ] Commit: `Return the original verdict for an identical signed payload (TASK-10)`

**TSK-09.7 · Known-limitation note, provenance and scenario 2 and 4 cases**
- **Files:** modify `evals/harness/provenance.ts` (`yieldReference: { version, source: 'placeholder' | 'Coffee-Board-verified' }`), `evals/harness/report.ts` (a "Known limitations" section listing EVAL-029, EVAL-036 and GAP-7 salami re-scoring, with their verdicts; the wording follows HR2), `evals/eval-dataset.json` (EVAL-054 and EVAL-068 `status` `pending_decision` → `active` if not already done in Stage 6; new cases; minor version bump)
- **New cases:** reserved blocks EVAL-114–117 (scenario 2) and EVAL-118–121 (scenario 4); renumber to the next free IDs at merge if taken. All are `attack` with gate S1.
  - EVAL-114: two of three photos reused from EVAL-004 on another agent's plot → hard fail "2 of 3".
  - EVAL-115: all photos reused from EVAL-001 with a fresh chain position and matching EXIF on the same plot, a day later → hard fail "3 of 3".
  - EVAL-116: an old unsubmitted photo with EXIF 8 days before → `exif_time_agreement` fail (catching check listed).
  - EVAL-117: a stale signed capture replayed out of sequence (seq −1, stale prev hash) with its original photos → `photo_uniqueness` hard fail + chain flag.
  - EVAL-118: season 1.55×U → flag → Needs Review.
  - EVAL-119: 2.01×U → hard fail.
  - EVAL-120: salami from 1.40 to 1.60 → flag.
  - EVAL-121: a robusta plot at 2.20×U → hard fail. This needs a robusta fixture plot; use P08 with `crop: robusta` in a case-level override if the schema allows, else add a fixture `P11` (robusta, 2.0 ha, perennial).
- [ ] Write the failing test: a harness unit test asserts scenarios 2 and 4 each have ≥ 10 active S1 cases and the report contains a "Known limitations" section naming EVAL-029, EVAL-036 and GAP-7.
- [ ] Run → fails.
- [ ] Implement it.
- [ ] Verify: `pnpm eval:validate` and `pnpm eval` green; scenario 2 and scenario 4 detection ≥ 90 %.
- [ ] Commit: `Report known limitations and bring the replay and yield attack sets to ten (TASK-10)`

**Done gate (TKT-09)**
| Acceptance criterion | Evidence |
|---|---|
| `crop_yield_reference` seeded from a verified, cited Coffee Board source | TC-039; TP6 in decisions.md |
| `yield_plausibility` (> 1.5×U flag, > 2×U hard fail), GAP-3 resolved (season window, conversion point) | TC-038; EVAL-012, 045–050, 118–121 |
| `chain_continuity` (flag) | TC-041; EVAL-021, 035 |
| `photo_uniqueness` across agents and plots | TC-042; EVAL-030–032, 114–117 |
| An identical signed payload returns the original verdict without a new event (EV15, GAP-4) | TC-040; EVAL-068 |
| GAP-7 recorded as a declared limitation | TSK-09.7 report section; TP6 / EV6 |

### TKT-10 → TASK-11 · Capture app to the frozen design (sp 8 · P1 · Feature)
**Depends on:** TKT-02, TKT-05, TKT-06 · **TC:** TC-043, TC-044, TC-045, TC-046, TC-047, TC-048, TC-049 (+ TC-080/081 for its routes) · **EVAL:** EVAL-086, EVAL-089 (capture pages), EVAL-070 (instrumented here, measured in TKT-29) · **Owns files:** `src/styles/field.css`, `src/components/ui/{Pill,GlassCard,Cherry,VerdictChip,Sheet,TabBar,PlotSvg,PhotoSlot,Keypad,CheckRow,EvidenceList,VerdictScreen}.tsx`, `src/components/field/*`, `src/lib/geo/svg.ts`, `src/lib/i18n/farmer-evidence.ts`, `src/client/{gps,hash-file,capture-client,capture-store}.ts`, `src/app/(agent)/field/{page.tsx,record/*}`, `src/app/manifest.ts`, `public/icons/*`, `scripts/make-icons.ts`, `src/app/api/media/[mediaId]/thumb/route.ts`, `e2e/capture-*.spec.ts`
**Brief for the implementer:** Port `final/index.html` s1, s2, s3, s3-kg, s4, s5, s6 — markup structure, class names and the `<style>` rules for those classes — into `src/styles/field.css`; do not port the storyboard frames, states banner or "Jump to screen" menu (§11). The checking screen shows the mockup's **six farmer-facing groups** (index.html line 831), each ticking when all its underlying checks have streamed — never twelve raw check IDs. The camera is the native file input only (F4, D6); no gallery option. Hash each photo when "Use this photo" is tapped, so Submit only canonicalises and signs (§9, S3 budget). The Not-accepted screen has no mockup: compose it from `VerdictScreen` with `--bad` tokens and no cherry rim (D5, TP17).

**TSK-10.1 · Farmer copy layer and check groups (pure)**
- **Files:** create `src/lib/i18n/farmer-evidence.ts`, `src/lib/i18n/farmer-evidence.test.ts`, `src/components/field/check-groups.ts`, `src/components/field/check-groups.test.ts`; add keys to `src/lib/i18n/en.ts` and `src/lib/i18n/kn.ts` (`// REVIEW: native speaker`).
- **Produces:** `CHECK_GROUPS: { key: 'seal'|'inside'|'photos'|'forest'|'satellite'|'harvest'; checks: CheckId[] }[]` = seal ← `signature_valid, chain_continuity`; inside ← `geofence, gps_accuracy, exif_gps_agreement, movement_plausibility`; photos ← `photo_uniqueness, exif_time_agreement`; forest ← `deforestation_overlap, ndvi_cultivation`; satellite ← `ndvi_harvest_window`; harvest ← `yield_plausibility`. `groupProgress(done: Map<CheckId, CheckStatus>) → { key; state: 'pending'|'done' }[]`. `farmerLines(result: VerifyResult, lang) → { icon: 'location'|'camera'|'tree'|'cloud'|'trend'|'seal'; text: string }[]` (max 3; Verified → inside/photos/forest positives; Needs Review → the cap reason(s) + "The office will look at this. You don't need to do anything."; Rejected → the hard-fail reason + what to do).
- [ ] Write failing tests: every `CheckId` is in exactly one group; `groupProgress` marks `inside` done only after all four of its checks arrive; for a result with `geofence` fail 30 m, `farmerLines(…,'en')[0].text` contains `30 m`; for `ndvi_harvest_window` unavailable, the text names the cloudy satellite picture and says nothing is needed from the farmer; no line contains "fraud", "fake", "cheat", "Rejected".
- [ ] Run `pnpm vitest run src/lib/i18n/farmer-evidence.test.ts src/components/field/check-groups.test.ts` → fails (modules missing).
- [ ] Implement; numbers are passed through from the check's evidence variables, never recomputed.
- [ ] Verify: the tests + `pnpm typecheck && pnpm lint` green.
- [ ] Commit: `Add farmer verdict copy and six check groups for the capture app (TASK-11)`

**TSK-10.2 · Field stylesheet and primitives**
- **Files:** create `src/styles/field.css` (imported by `src/app/(agent)/layout.tsx`), `src/components/ui/{Pill,GlassCard,Cherry,VerdictChip,Sheet,TabBar}.tsx`; `public/brand/cherry.svg` (copy of `final/cherry.svg`).
- **Produces:** `<Pill variant="primary|ghost|amber" icon>`, `<GlassCard as>`, `<Cherry size tone="green|amber|none" motion="rise|slow|none">`, `<VerdictChip verdict="Verified|Needs Review|Rejected">` (word + mark + colour; farmer words from i18n), `<Sheet open onClose labelledBy tone="default|amber">` (native `<dialog>`), `<TabBar current="home|pickings|help">`.
- [ ] Write failing test `e2e/capture-primitives.spec.ts` against `/field` (signed-in seeded agent): the record pill's computed height is 60 px; the tab bar has three buttons with `aria-current` on Home; `VerdictChip` for each verdict contains its word and an `svg.mk`.
- [ ] Run `pnpm test:e2e e2e/capture-primitives.spec.ts` → fails.
- [ ] Implement: copy the mockup's rules for `.screen, .top, .wordmark, .chip, .glass, .card, .pill, .pill.ghost, .pill.amber, .tabbar, .tab, .rows, .row, .vchip, .mk, .cherry, .lit, .h1, .lede, .sheet, .dlg-panel, .grabber, .textbtn` verbatim, replacing literals with the `tokens.css` variables they came from; `@media (prefers-reduced-motion: reduce)` block from the mockup included; the `@supports not (backdrop-filter…)` fallback to `--surface-solid`.
- [ ] Verify: spec green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Port the field stylesheet and base capture components (TASK-11)`

**TSK-10.3 · Plot outline as SVG**
- **Files:** create `src/lib/geo/svg.ts`, `src/lib/geo/svg.test.ts`, `src/components/ui/PlotSvg.tsx`.
- **Produces:** `projectToBox(geom: Polygon|MultiPolygon, box: {w:number;h:number;pad:number}, point?: {lat;lng}) → { path: string; dot?: {x;y}; inside?: boolean }` (equirectangular with cos(lat) x-scaling; y flipped); `<PlotSvg geojson point? marginM? pulse?>`.
- [ ] Write failing tests: a 100 m square centred in a 200×120 box fills it minus padding with aspect preserved; the P04 L-shape path has 6 vertices; a point in the notch yields `inside:false`; output is deterministic (snapshot).
- [ ] Run `pnpm vitest run src/lib/geo/svg.test.ts` → fails.
- [ ] Implement; `inside` uses `lib/geo/geofence.ts` from TKT-02/08 (no second point-in-polygon). Component renders `.plot-map` markup from the mockup with the pulse ring class (static under reduced motion).
- [ ] Verify: tests green; typecheck, lint.
- [ ] Commit: `Draw plot outlines and the live dot as inline SVG (TASK-11)`

**TSK-10.4 · GPS watch that starts with the flow (TP13)**
- **Files:** create `src/client/gps.ts`, `src/client/gps.test.ts`.
- **Produces:** `startGpsWatch(geo = navigator.geolocation, now = Date.now) → { best(): Fix|null; waitForFresh(maxMs=10000, maxAgeMs=10000): Promise<Fix|null>; onChange(cb): () => void; stop(): void; state(): 'finding'|'ok'|'weak'|'denied' }`, `Fix = { lat; lng; accuracyM; at: number }`. Keeps the most accurate fix of the last 60 s; `weak` when best accuracy ≥ 100 m.
- [ ] Write failing tests with a fake `Geolocation`: `watchPosition` called once with `enableHighAccuracy:true`; two fixes (40 m then 12 m) → `best()` is the 12 m one; a fix older than 10 s makes `waitForFresh` wait for the next; permission error → `state()==='denied'`; `stop()` calls `clearWatch`.
- [ ] Run `pnpm vitest run src/client/gps.test.ts` → fails.
- [ ] Implement.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Start the GPS fix when the record flow opens and keep the best one (TASK-11)`

**TSK-10.5 · Home (s1)**
- **Files:** create `src/app/(agent)/field/page.tsx` (server), `src/components/field/HomeClient.tsx`, `src/lib/db/queries/field-home.ts` (+ `.test.ts`).
- **Produces:** `getFieldHome(agentId, orgId) → { plots: {id; name; areaHa; crop; geojson; lastPickedAt}[]; recent: {eventId; receivedAt; cherryKg; verdict}[] }` (assigned, unrevoked plots only; most recently picked first; last 3 events).
- [ ] Write failing tests: the query returns only `agent_plots` rows with `revoked_at IS NULL` for this agent and org; `e2e/capture-home.spec.ts` at 375×812 with geolocation inside P01 shows "You're inside" + the plot name in `.lit`, the facts line, the record pill, three rows; outside by 120 m shows "You're 120 m from <plot>"; while no fix, "Finding your location…" (Design.md §18).
- [ ] Run the query test and the spec → fail.
- [ ] Implement from `index.html` lines 458–476 (header with wordmark + language chip, greeting with IST date, plot card, record pill, "Your last pickings" rows); "Change plot" link when more than one plot (Design.md §8). Empty state: "No pickings recorded yet" + record action; error state via `error.tsx` with the §18 message; loading via `loading.tsx` skeleton.
- [ ] Verify: both green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Build the capture Home with the plot card and last pickings (TASK-11)`

**TSK-10.6 · Record-flow state machine (pure)**
- **Files:** create `src/components/field/record-flow.ts`, `src/components/field/record-flow.test.ts`.
- **Produces:** `type FlowState = { step: 'photos'|'review'|'weight'|'checking'|'verdict'|'saved'; plotId; photos: { slot: 0|1|2; file?: File; sha256?: string; size?: number; mime?: string }[]; reviewing?: 0|1|2; kg: string; checks: Map<CheckId,CheckStatus>; result?: VerdictView; error?: { kind: 'offline'|'server'|'rejected'; reason?: string } }` and `reduce(state, action)` with actions `take(slot,file)`, `use(sha256,size,mime)`, `retake`, `continue`, `key(k)` (digits, '.', '⌫'; one decimal, only `.5` or `.0`, max 500), `send`, `check(id,status)`, `verdict(v)`, `fail(kind,reason?)`, `back`.
- [ ] Write failing tests: continue from photos with 0 photos sets `needOne`; keys "4","2",".","5" → `"42.5"`; "."+"3" rejected (only .5); "5","0","1" rejected (>500); `send` with kg "" is a no-op; `check` after `verdict` ignored; `back` from weight returns to photos keeping photos.
- [ ] Run `pnpm vitest run src/components/field/record-flow.test.ts` → fails.
- [ ] Implement as a pure reducer (no browser APIs).
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Model the record flow as a pure state machine (TASK-11)`

**TSK-10.7 · Photos (s2) and review (s3)**
- **Files:** create `src/app/(agent)/field/record/page.tsx`, `src/components/field/RecordFlow.tsx`, `src/components/field/PhotosStep.tsx`, `src/components/field/ReviewStep.tsx`, `src/components/ui/PhotoSlot.tsx`, `src/client/hash-file.ts` (+ `.test.ts`).
- **Produces:** `hashFile(file: Blob) → Promise<{ sha256: string; size: number; mime: string }>` (`crypto.subtle.digest` over `await file.arrayBuffer()`; mime sniffed from magic bytes JPEG/HEIC/PNG, falling back to `file.type`).
- [ ] Write failing tests: `hashFile` of `evals/fixtures/photos/exif-gps-offset.jpg` equals the fixture's recorded SHA-256; `e2e/capture-photos.spec.ts`: `setInputFiles` on slot 1 ("The branch") shows s3 "Is the photo clear?" with the Check list; "Use this photo" returns to s2 with counter "1 of 3" and "Continue with 1 photo"; "Take again" reopens the input; the `input` has `accept="image/*"` and `capture="environment"`; the tab bar is not rendered anywhere in `/field/record`.
- [ ] Run both → fail.
- [ ] Implement from `index.html` lines 490–537 (slots labelled The branch · Basket on the scale · The day's pile with their drawings; lede; counter; Open camera pill; Continue ghost pill; "At least 1 photo is needed"). Show the real photo via `URL.createObjectURL` (revoked on unmount). Hash on "Use this photo".
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Add photo slots and the review step with on-accept hashing (TASK-11)`

**TSK-10.8 · Weight (s3-kg) and Submit timing mark**
- **Files:** create `src/components/field/WeightStep.tsx`, `src/components/ui/Keypad.tsx`; extend `src/lib/db/queries/field-home.ts` with `recentKgRange(agentId, plotId) → {min;max}|null` (last 10 accepted events) + test.
- [ ] Write failing tests: `recentKgRange` with kg 38.5, 44, 51 → `{38.5, 51}`; `e2e/capture-weight.spec.ts`: tapping 4, 2, ., 5 shows `42.5` in `output.kg-num.lit` and the pill reads "Send 42.5 kg"; the hint reads "Your last pickings: 38–51 kg"; tapping Send records `performance.getEntriesByName('udgam:t0-submit').length === 1`.
- [ ] Run → fail.
- [ ] Implement from lines 538–552 (eyebrow "Plot · N photos", "How many kilos?", lit number + unit, hint, keypad grid 1–9 . 0 ⌫ with 56 px+ keys, Send pill). Hint shows the farmer's own range only — never the yield threshold (D6). `performance.mark('udgam:t0-submit')` in the Send click handler before any async work.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Add the weight keypad with the farmer's own recent range (TASK-11)`

**TSK-10.9 · Streamed send client and outbox write**
- **Files:** create/extend `src/client/capture-client.ts` (+ `.test.ts`), `src/client/capture-store.ts` (+ `.test.ts`, dev dependency `fake-indexeddb`).
- **Produces:** `sendCapture({ payload: string; signature: string; files: Blob[] }, { onCheck?: (id: CheckId, status: CheckStatus) => void; signal?: AbortSignal }) → Promise<{ kind: 'verdict'; verdict: VerdictView; idempotent: boolean } | { kind: 'rejected'; reason: string } | { kind: 'retryable'; cause: 'offline'|'server' }>`; `putOutbox(item) → id`, `deleteOutbox(id)`, `getOutbox(id)` in DB `udgam`, store `outbox` (§9).
- [ ] Write failing tests with a mocked `fetch` returning a `ReadableStream` that emits NDJSON split mid-line across chunks: `onCheck` fires once per `{t:"check"}` line in order; `{t:"verdict"}` resolves `kind:'verdict'`; a thrown `TypeError` → `retryable/offline`; HTTP 503 or `{t:"error",retryable:true}` → `retryable/server`; HTTP 4xx JSON `{error:"plot_not_assigned"}` → `rejected`; a stream ending without a verdict → `retryable/server`. Outbox: put → get returns the same payload string and blobs; delete removes.
- [ ] Run `pnpm vitest run src/client/capture-client.test.ts src/client/capture-store.test.ts` → fail.
- [ ] Implement: build payload with `src/client/sign.ts` (TKT-02) using the held GPS fix (`waitForFresh` only if `best()` is older than 10 s), `putOutbox` **before** `fetch`, `deleteOutbox` only on `verdict` or `rejected`; advance the device seq/last hash (TKT-02 `device` store) only on an accepted verdict.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Stream capture results and keep the signed payload until a verdict (TASK-11)`

**TSK-10.10 · Checking (s4) with real progress**
- **Files:** create `src/components/field/CheckingStep.tsx`, `src/components/ui/CheckRow.tsx`; test-only delay hook in the fixture provider construction inside `src/lib/capture/context.ts` (reads `E2E_FIXTURE_DELAY_MS` **only when** `process.env.E2E === '1'`; a unit test asserts it is ignored otherwise).
- [ ] Write failing test `e2e/capture-checking.spec.ts` (server started with `E2E=1 E2E_FIXTURE_DELAY_MS=2000`): the four local groups show done before `forest`/`satellite`; `aria-valuenow` of the progress bar increases 0→6 only as groups finish; the `aria-live` region receives one announcement per group and one for the verdict; with `page.emulateMedia({reducedMotion:'reduce'})` the screen stops on "See result" (`#see-result`) instead of auto-advancing, and the cherry has no animation (`getAnimations().length === 0`).
- [ ] Run → fails.
- [ ] Implement from lines 558–575 (slow cherry, "Checking your picking", lede "42.5 kg · Plot 2 · 3 photos", meter "k of 6 checks done", checks list, caption "This usually takes under 30 seconds.", live region, See result). Auto-advance 600 ms after the verdict line when motion is allowed.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Show the six real check groups ticking as the server streams them (TASK-11)`

**TSK-10.11 · Verdict screens (s5, s6, Not accepted) and the verdict timing mark**
- **Files:** create `src/components/ui/VerdictScreen.tsx`, `src/components/ui/EvidenceList.tsx`, `src/components/field/VerdictStep.tsx`.
- [ ] Write failing test `e2e/capture-verdict.spec.ts`: Verified (P01 clean) shows `h1 .lit` "Verified", "Your 42.5 kg from <plot> is recorded.", three evidence lines, one "Done" pill, cherry with class `green`; Needs a check (P09 cloud-blocked fixture) shows the amber cherry, chip, "The office will check this one", the reason and who checks; Not accepted (reused photo from the seed) shows "Not accepted", the reason and what to do, no element whose computed colour equals `--ok` or `--ok-ink`, cherry without rim (`tone="none"`), one pill; `performance.getEntriesByName('udgam:t1-verdict')` exists and `performance.measure('udgam:s3','udgam:t0-submit','udgam:t1-verdict')` is > 0; "Done" returns to `/field` with the new entry first in the rows.
- [ ] Run → fails.
- [ ] Implement from lines 581–621 (s5, s6) and D5 for Not accepted (same template, `--bad` tokens, no green, reason + what to do). The rise/bloom animation (400 ms ease-out, 12 px) only on Verified and only without reduced motion. `performance.mark('udgam:t1-verdict')` in a `requestAnimationFrame` after the verdict heading mounts (EV9 t1 = card visible). Focus moves to the verdict heading (`tabindex=-1`).
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Add the three verdict screens on one template with the S3 timing mark (TASK-11)`

**TSK-10.12 · Installable manifest and icons**
- **Files:** create `src/app/manifest.ts`, `scripts/make-icons.ts` (sharp: `public/brand/cherry.svg` → `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` on `#0A0E0C`), the generated PNGs (committed), `e2e/capture-manifest.spec.ts`.
- [ ] Write failing test: `GET /manifest.webmanifest` has `name:"Udgam"`, `short_name`, `start_url:"/field"`, `display:"standalone"`, `background_color:"#0A0E0C"`, `theme_color:"#0A0E0C"`, the three icons; via CDP `Page.getInstallabilityErrors` on `/field` → empty list.
- [ ] Run → fails.
- [ ] Implement; `pnpm tsx scripts/make-icons.ts` once and commit the output.
- [ ] Verify: green (TC-049).
- [ ] Commit: `Make the capture app installable with cherry icons (TASK-11)`

**TSK-10.13 · Photo thumbnails route (used by Pickings and admin review)**
- **Files:** create `src/app/api/media/[mediaId]/thumb/route.ts`, `src/lib/media/access.ts` (+ `.test.ts`).
- **Produces:** `canReadMedia(session, mediaId) → boolean` — agent: own events only; admin: events of plots in their org; buyer: never.
- [ ] Write failing test: agent A reads own thumb 200 (`image/jpeg`, `Cache-Control: private, max-age=3600`); agent B gets 404; admin of the org 200; admin of another org 404; unauthenticated 401; the original (`/api/media/[id]/thumb` never serves originals).
- [ ] Run → fails.
- [ ] Implement with `requireSession` (TKT-04) and the thumb path from `media.thumb_path` (TKT-02).
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Serve photo thumbnails to the agent and their FPO only (TASK-11)`

**TSK-10.14 · Capture sweep: 320 × 568, responsive, a11y, byte integrity**
- **Files:** create `e2e/capture-sweep.spec.ts`; `tests/integration/capture-bytes.test.ts`.
- [ ] Write failing tests: for each record-flow step at 320×568 the primary pill's `boundingBox()` lies inside the viewport (TC-046); at 320/375/768/1440 `scrollWidth ≤ innerWidth` on `/field` and every step (TC-044, TC-080); axe-core: no serious/critical on `/field` and every step (EVAL-089); integration: swapping one uploaded file for different same-size bytes → 4xx `media_hash_mismatch` with a rejected event anchored; reordered files → mismatch; stored original's SHA-256 equals the payload's (TC-043).
- [ ] Run → the viewport and a11y tests expose any gaps; fix them with the Design.md §16 rules (shrink the decorative cherry, one sentence and photo height under 700 px height; keep the action pinned).
- [ ] Verify: `pnpm test:e2e e2e/capture-*.spec.ts` and `pnpm vitest run tests/integration/capture-bytes.test.ts` green; attach one screenshot per screen at 375 px to the ledger (Stage 8 input).
- [ ] Commit: `Hold the capture flow to 320 px, no horizontal scroll and axe-clean (TASK-11)`

**Done gate (TKT-10):**
| AC | Evidence |
|---|---|
| Matches `final/index.html` s1–s6 | TC-044 (+ screenshots), TSK-10.5/10.7/10.8/10.10/10.11 specs |
| Native camera via file input with capture (F4); original bytes hashed and signed (S1) | TSK-10.7 input attributes; TC-043 |
| Checking screen shows the real checks as they finish (transport: streamed NDJSON, TP12) | TC-045 |
| Tab bar hidden in the record flow | TSK-10.7 spec |
| All strings externalised | TC-052 (static guard, finalised in TKT-11) + dictionary keys added here |
| Installable PWA manifest | TC-049 |
| 320 × 568 keeps the primary action visible | TC-046 |
| EVAL-086, EVAL-089 (capture pages); EVAL-070 instrumented | TSK-10.14; `udgam:t0-submit` / `udgam:t1-verdict` marks for `pnpm eval:perf` |

---

### TKT-11 → TASK-12 · Saved-on-phone retry, pickings, help and language (sp 5 · P1 · Feature)
**Depends on:** TKT-10 · **TC:** TC-050, TC-051, TC-052, TC-053 (+ TC-080/081) · **EVAL:** EVAL-068 (client side), EVAL-088 (capture views) · **Owns files:** `src/client/capture-store.ts` (extends), `src/components/field/{SavedSheet,PendingRow,PickingRow,HelpSheet}.tsx`, `src/app/(agent)/field/pickings/**`, `src/app/(agent)/field/help/page.tsx`, `src/app/(agent)/actions/language.ts`, `src/lib/db/queries/pickings.ts`, `src/lib/db/migrations/*_org_office_phone.sql`, `src/lib/i18n/{en,kn}.ts` (extends), `tests/i18n-*.test.ts`, `e2e/field-*.spec.ts`
**Brief for the implementer:** Nothing the farmer did may be lost: the outbox copy written in TSK-10.9 survives reloads and is only deleted on a verdict or a boundary rejection. "Try again" re-sends the **identical** payload string and blobs — never re-signs — so the server's idempotency (TP7) makes a lost-response retry safe. Help and Language are the mockup's bottom sheets (`#help-dialog`, `#lang-dialog`), opened from the tab bar and the header chip; `/field/help` renders Home with the Help sheet open (deep link for TC-053). Reuse `LanguageSheet` from TKT-05's first-run flow; don't build a second one.

**TSK-11.1 · Outbox: list, attempts, survive reload**
- **Files:** extend `src/client/capture-store.ts` and its test.
- **Produces:** `listOutbox() → OutboxItem[]` (oldest first), `bumpAttempt(id)`, `OutboxItem = { id; payload: string; signature: string; files: Blob[]; plotId; cherryKg; photoCount; createdAt; attempts }`.
- [ ] Write failing tests (`fake-indexeddb`): three puts list in creation order; a new `openDB` connection (simulated reload) still lists them; `bumpAttempt` increments; blobs round-trip byte-identical.
- [ ] Run `pnpm vitest run src/client/capture-store.test.ts` → fails.
- [ ] Implement.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Keep unsent pickings on the phone across reloads (TASK-12)`

**TSK-11.2 · "Couldn't send" sheet (s7) and Try again**
- **Files:** create `src/components/field/SavedSheet.tsx`; wire into `src/components/field/RecordFlow.tsx`.
- [ ] Write failing test `e2e/field-retry.spec.ts`: (a) `page.route('/api/capture', r => r.abort())` → the amber sheet shows heading "No network here" (offline) or "Couldn't send" (server), "Nothing is lost: 3 photos and 42.5 kg are saved on this phone.", an amber "Try again" pill and "Try later"; reload `/field` → a pending row "Saved on this phone" with a Send action; unroute and tap Try again → verdict shown, outbox empty. (b) route that lets the request reach the server but replaces the response with an abort → Try again → the same event ID is shown (`idempotent:true`), and a DB query in the test finds exactly one `harvest_events` row for that payload hash (TC-050, EVAL-068 client).
- [ ] Run → fails.
- [ ] Implement from `index.html` lines 623–634 (under-layer, scrim, sheet panel, grabber, wifi-off icon, copy, `pill amber`, `textbtn`). Heading chosen by `sendCapture` cause (`offline` vs `server`). Try again calls `sendCapture` with the stored item and `bumpAttempt`.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Show the saved-on-phone sheet and retry the identical signed picking (TASK-12)`

**TSK-11.3 · Pending rows on Home and Pickings**
- **Files:** create `src/components/field/PendingRow.tsx`; use in `HomeClient.tsx` and the Pickings list.
- [ ] Write failing test (in `e2e/field-retry.spec.ts`): with one outbox item, Home and Pickings show a `glass row` "Saved on this phone · 42.5 kg" with a "Send now" text button, above sent entries; sending it removes the row.
- [ ] Run → fails.
- [ ] Implement with existing classes only (`glass row`, `textbtn`, amber `vchip check` mark is **not** used — the row is not a verdict) (TP17).
- [ ] Verify: green.
- [ ] Commit: `List unsent pickings with a send action (TASK-12)`

**TSK-11.4 · Pickings list (s8) with four states**
- **Files:** create `src/lib/db/queries/pickings.ts` (+ `.test.ts`), `src/app/(agent)/field/pickings/{page.tsx,loading.tsx,error.tsx}`, `src/components/field/PickingRow.tsx`.
- **Produces:** `listPickings(agentId, orgId) → { month: 'YYYY-MM'; items: { eventId; receivedAt; cherryKg; plotName; verdict: 'Verified'|'Needs Review'|'Rejected'; reason?: FarmerLine; whatToDo?: string }[] }[]` (IST months; includes boundary-rejected events of this agent with their reason).
- [ ] Write failing tests: query returns only this agent's events; groups by IST month (an event at 2026-09-30T19:00Z lands in October); Rejected items carry a reason; `e2e/field-pickings.spec.ts`: working state matches lines 642–659 (heading "Your pickings", month header with count and plot, rows with chips, `r-why` for Needs a check, `details` "What can I do?" for Not accepted); `?state=loading` shows skeleton rows (no spinner); `?state=empty` shows "No pickings recorded yet" + record pill; `?state=error` shows "Couldn't load your entries. Your saved pickings are safe on this phone." + retry (TC-051, EVAL-088).
- [ ] Run → fails.
- [ ] Implement; the `?state=` switch is honoured only when `process.env.NODE_ENV !== 'production'` (§11).
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Build the pickings list with reasons and all four states (TASK-12)`

**TSK-11.5 · Picking detail**
- **Files:** create `src/app/(agent)/field/pickings/[eventId]/page.tsx`, `src/lib/db/queries/picking-detail.ts` (+ `.test.ts`).
- [ ] Write failing tests: another agent's event ID → 404; detail shows photos (thumb route from TSK-10.13), kg, IST date/time, plot, verdict chip and up to three farmer lines, "See all checks" disclosure listing each group's state.
- [ ] Run → fails.
- [ ] Implement with `GlassCard`, `EvidenceList`, `VerdictChip`; Back to Pickings.
- [ ] Verify: green.
- [ ] Commit: `Show a picking's photos, weight and reasons (TASK-12)`

**TSK-11.6 · Help sheet and tab bar navigation**
- **Files:** create `src/components/field/HelpSheet.tsx`, `src/app/(agent)/field/help/page.tsx`; migration `src/lib/db/migrations/00xx_org_office_phone.sql` (`organisations.office_phone TEXT NULL`), seed value in the demo seed hook (TKT-20 fills the real seed).
- [ ] Write failing test `e2e/field-nav.spec.ts`: Home · Pickings · Help reachable by click and by keyboard (Tab + Enter) with `aria-current` on the active tab; the bar sits above `env(safe-area-inset-bottom)`; Help sheet (and `/field/help`) contains: what Verified / Needs a check / Not accepted mean; photo tips; "Call the office" as a `tel:` link from `office_phone` (hidden when null); language; "This phone" (device ID, enrolled date); why gallery photos are not allowed (Design.md §17) (TC-053).
- [ ] Run → fails.
- [ ] Implement from `#help-dialog` (lines 685–692) using `Sheet`; content strings in `en.ts`/`kn.ts`.
- [ ] Verify: green.
- [ ] Commit: `Add the Help sheet and keyboard-usable tab navigation (TASK-12)`

**TSK-11.7 · Language switch ಕನ್ನಡ / English**
- **Files:** create `src/app/(agent)/actions/language.ts` (Server Action `setLanguage(lang: 'en'|'kn')` → cookie `udgam_lang`, 1 year, `sameSite=lax`); header chip wiring in `HomeClient.tsx` and Pickings; `:lang(kn)` rules in `src/styles/field.css` (body line-height ≥ 1.6, labels may wrap to two lines); header comment in `src/lib/i18n/kn.ts` listing that all entries await native review.
- [ ] Write failing test `e2e/field-language.spec.ts`: the chip opens `LanguageSheet`; choosing ಕನ್ನಡ sets `<html lang="kn">`, changes the Home heading and tab labels, persists after reload; Kannada body text computed `line-height / font-size ≥ 1.6`; at 320 px no element with text has `scrollWidth > clientWidth` (no clipping).
- [ ] Run → fails.
- [ ] Implement; `src/app/layout.tsx` reads the cookie for `lang`.
- [ ] Verify: green.
- [ ] Commit: `Switch the capture app between Kannada and English (TASK-12)`

**TSK-11.8 · i18n completeness guard**
- **Files:** create `tests/i18n-keys.test.ts`, `tests/i18n-no-literals.test.ts`.
- [ ] Write the tests: `en` and `kn` have identical key sets (deep); every `kn` value is non-empty; a TypeScript-AST scan of `src/app/(agent)/**/*.tsx`, `src/components/field/**/*.tsx` and `src/components/ui/**/*.tsx` finds no `JsxText` containing a letter (digits, punctuation and whitespace allowed) and no string-literal `aria-label`/`placeholder`/`title` attributes (TC-052).
- [ ] Run → fails on any literal left from earlier tickets; move each into the dictionaries.
- [ ] Verify: `pnpm test` green.
- [ ] Commit: `Guard that every capture string comes from the dictionaries (TASK-12)`

**Done gate (TKT-11):**
| AC | Evidence |
|---|---|
| Failed sends keep payload + photos in IndexedDB with the amber sheet (s7) and a working Try again | TC-050 (both variants), TSK-11.1 tests |
| Pickings tab (s8) with verdict chips and Not-accepted reasons | TC-051 working state, TSK-11.4 |
| Help tab content | TC-053 |
| ಕನ್ನಡ/English switch, Kannada marked for review | TSK-11.7, `kn.ts` header, TC-052 |
| Four screen states on data-backed views | TC-051 (EVAL-088 capture views) |
| EVAL-068 client side | TC-050 (b) |

---

### TKT-12 → TASK-13 · Admin review queue with re-run and signed overrides (sp 5 · P1 · Feature)
**Depends on:** TKT-04, TKT-07, TKT-08, TKT-09 · **TC:** TC-054, TC-055, TC-056, TC-057 (+ TC-080/081) · **EVAL:** EVAL-069, EVAL-075, EVAL-076, EVAL-088 (admin) · **Owns files:** `src/styles/admin.css` (review rules appended), `src/lib/review/{queue,detail,rerun,override}.ts` (+ tests), `src/app/(admin)/admin/(review)/**`, `src/app/(admin)/admin/review/actions.ts`, `src/components/admin/{QueueList,ReviewDetail,DecideForm,ChecksCard}.tsx`, `e2e/admin-review.spec.ts`
**Brief for the implementer:** Port `final/admin.html`: queue (`.q-*`), detail (`.d-*`), checks card, decide form, `locked` and `outcome` blocks, and the four `body[data-state]` views (`loading`, `empty`, `error`, `working`). The admin sees the **system** evidence strings (§6.5), not the farmer copy. Re-run must rebuild the context **as of the original capture** (exclude the event's own photos from `seenMediaHashes` and its own kg from the season cumulative), re-run only the checks that were `unavailable`, copy the rest, and re-score with the same `score()` (§7). Overrides are signed with the server-held admin key from `src/lib/auth/signing-keys.ts` (created in TSK-14.2 — TKT-14 runs in the phase before this one) and anchored; the DB trigger is the last line against overriding a hard fail (§4.2).

**TSK-12.1 · Queue query**
- **Files:** create `src/lib/review/queue.ts`, `src/lib/review/queue.test.ts`.
- **Produces:** `listReviewQueue(orgId) → { waiting: QueueItem[]; final: QueueItem[] }`, `QueueItem = { runId; eventId; plotName; producerId; receivedAt; score; headline: string /* first cap reason in admin words */; icon }`. `waiting` = latest run per event with verdict `Needs Review`, no override, event `final_verdict='Needs Review'`, oldest first. `final` = latest 20 hard-failed `Rejected` runs ("Not accepted by the checks — can't be changed").
- [ ] Write failing tests: org scoping (FPO-B items never appear); an event with run 1 Needs Review and run 2 Verified is not waiting; an overridden run is not waiting; ordering oldest first; a hard-failed run appears in `final` only.
- [ ] Run `pnpm vitest run src/lib/review/queue.test.ts` → fails.
- [ ] Implement with Drizzle + a window on `run_no`.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Query the review queue per organisation, oldest first (TASK-13)`

**TSK-12.2 · Queue UI with four states**
- **Files:** create `src/app/(admin)/admin/(review)/layout.tsx` (rail from TKT-05 + queue column), `page.tsx` (detail placeholder "Pick an item" at ≥ 1100 px; at < 1100 px the list alone), `loading.tsx`, `error.tsx`, `src/components/admin/QueueList.tsx`; append `.main, .queue, .q-*` rules to `src/styles/admin.css`.
- [ ] Write failing test `e2e/admin-review.spec.ts` (queue part): working state lists items with headline, score and time, the "Not accepted by the checks (n)" section with its note; the rail "Review" count equals `waiting.length`; `?state=loading` skeleton rows; `?state=empty` "Nothing to check." block; `?state=error` "Couldn't load the review list." + retry (TC-054 states, EVAL-088 admin).
- [ ] Run → fails.
- [ ] Implement from `admin.html` lines 450–490 and the `[data-show~=…]` state blocks (lines 291–297 rules).
- [ ] Verify: green.
- [ ] Commit: `Build the review queue in the frozen admin design with all four states (TASK-13)`

**TSK-12.3 · Review detail**
- **Files:** create `src/lib/review/detail.ts` (+ test), `src/app/(admin)/admin/(review)/review/[runId]/page.tsx`, `src/components/admin/{ReviewDetail,ChecksCard}.tsx`.
- **Produces:** `getReviewDetail(orgId, runId) → { run; event; plot: {name; geojson; areaHa; crop}; point: {lat;lng;accuracyM}; photos: {mediaId}[]; checks: CheckResult[]; score; capReasons: string[]; unavailableProviders: string[]; locked: null | 'hard_fail' | 'decided'; history: {runNo; verdict; score; at}[] }`.
- [ ] Write failing tests: another org's run → null (page 404); `capReasons` rendered as plain sentences (e.g. `anyUnavailable` → "A satellite check could not run, so a person must look"); `e2e`: detail shows title + chip + meta, the score with the scale key (0–49 / 50–79 / 80+), the "why" line, plot card with the phone dot and the 25 m margin band (`PlotSvg marginM={25}`), photos grid (thumb route), "All 12 checks" with each evidence line; at 768 px the list opens the detail with a Back button; at 1440 px rail + queue + detail side by side.
- [ ] Run → fails.
- [ ] Implement from lines 492–527.
- [ ] Verify: green.
- [ ] Commit: `Show every check's evidence, the score and cap reason in review detail (TASK-13)`

**TSK-12.4 · Re-run only the unavailable providers**
- **Files:** create `src/lib/review/rerun.ts` (+ `.test.ts`); action `rerunRun(runId)` in `src/app/(admin)/admin/review/actions.ts`; "Check again" button (`#btn-again`) + hint in `ReviewDetail.tsx`.
- **Produces:** `rerunUnavailable(db, { orgId; runId; provider: RemoteSensingProvider }) → { runId; runNo; verdict; score }`.
- [ ] Write failing tests (TC-057, EVAL-069): for a run with only `ndvi_harvest_window` unavailable, spies show only `ndviWindow` called; the other 11 results are byte-identical copies; the new run has `run_no = 2`, is anchored as `verification_run`, and `final_verdict` becomes Verified when the provider now answers; run 1 remains; a run with no unavailable checks → 409 `nothing_to_rerun`; the rebuilt context excludes the event's own media from `seenMediaHashes` and its own kg from the season cumulative (so `photo_uniqueness` and `yield_plausibility` can't flip if they had thrown).
- [ ] Run → fails.
- [ ] Implement: `buildContextAsOf(event)` in `src/lib/capture/context.ts` (extend TKT-02's builder with an `asOfEventId` option); `verify(sub, ctx, { enabled: unavailableIds })`; merge; `score()`; transaction: `ledger.append('verification_run', …)` then insert. The button is disabled with the hint "All checks ran — nothing to retry" when `unavailableProviders` is empty.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Re-run only the checks whose provider was unavailable (TASK-13)`

**TSK-12.5 · Override service**
- **Files:** create `src/lib/review/override.ts` (+ `.test.ts`); action `overrideRun` in `actions.ts`.
- **Produces:** `overrideRun(db, { orgId; adminId; runId; newVerdict: 'Verified'|'Rejected'; reason }) → { overrideId; anchorSeq }`; errors `reason_too_short`, `reason_has_phone`, `not_reviewable` (409), `hard_fail_final` (409), `already_decided` (409).
- [ ] Write failing tests (TC-055, TC-056, EVAL-075/076): reason trimmed < 10 chars refused; reasons matching `/(\+?91[\s-]?)?[6-9]\d{9}\b/` or any 10 consecutive digits refused; on success an `admin_overrides` row and an `admin_override` ledger entry whose payload is `{ v:1, runId, eventId, newVerdict, reason, adminId, ts, kid, publicJwk, signature }` exist in the same transaction; `verify(publicJwk, jcs(statement), signature)` is true; `final_verdict` updated by the trigger; a hard-failed run → 409 from the service **and** a raw SQL insert into `admin_overrides` for it aborts (trigger from §4.2); a second override on the same run → 409.
- [ ] Run → fails.
- [ ] Implement using `signAsUser(adminId, jcs(statement))` from `src/lib/auth/signing-keys.ts`; map the trigger's `RAISE(ABORT)` to `hard_fail_final`.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Sign and anchor admin overrides, refusing hard-failed runs (TASK-13)`

**TSK-12.6 · Decide form, locked state and outcome**
- **Files:** create `src/components/admin/DecideForm.tsx`; wire `btn-accept` / `btn-reject` in `ReviewDetail.tsx`.
- [ ] Write failing test (`e2e/admin-review.spec.ts`, TC-055/056 UI): "Accept as verified" opens the decide form with its heading, the reason textarea, the live counter "n of at least 10 characters", the note "Your decision is signed with your account and recorded permanently. The reason is shown on the public certificate.", and a submit pill disabled until 10 characters; a reason with a phone number shows an inline error; submitting shows the `outcome` panel and removes the item from the queue; a hard-failed run shows the `locked` line and **no** accept/reject/check-again controls in the DOM.
- [ ] Run → fails.
- [ ] Implement from lines 529–551 (`act-row`, `decide`, `dec-note`, `dec-btns`, `locked`, `outcome`), adding the one public-certificate sentence (Review focus 5). Focus moves to the outcome panel after submit; the page `aria-live` region announces it.
- [ ] Verify: green; axe on `/admin` and a detail page in all four states (TC-081).
- [ ] Commit: `Add the reasoned accept/reject form and the locked state for final rejections (TASK-13)`

**Done gate (TKT-12):**
| AC | Evidence |
|---|---|
| Matches `admin.html` (queue, detail, score with cap reason, all checks with evidence, photos, plot card) | TC-054, TSK-12.2/12.3 specs |
| Re-run retries only the unavailable providers | TC-057, EVAL-069 |
| Override needs a reason ≥ 10 characters, is signed and anchored as `admin_override` | TC-055, EVAL-075 |
| Hard-failed rejections show no override | TC-056, EVAL-076 |
| Loading / empty / error states; 768 px list → detail | TC-054, EVAL-088 (admin) |

---

### TKT-13 → TASK-14 · Organic certificate as an attestation (sp 2 · P2 · Feature)
**Depends on:** TKT-06 · **TC:** TC-058 · **EVAL:** EVAL-079 · **Owns files:** `src/lib/attestations/*`, `src/lib/db/migrations/*_attestations.sql`, `src/components/ui/AttestationLine.tsx`, `src/app/(admin)/admin/plots/[plotId]/attestation/*`, `tests/wording-guard.test.ts`
**Brief for the implementer:** An organic certificate is something an issuer claims; Udgam only proves the file hasn't changed since it was recorded (DISC4). Every surface — plot page, batch detail, certificate (TKT-16 imports `AttestationLine`) — uses exactly "Certified by <issuer> — certificate on record", with validity dates. The ledger payload carries no farmer data (EV16).

**TSK-13.1 · Attestation service and table**
- **Files:** create `src/lib/db/migrations/00xx_attestations.sql` (table per §4.1; `anchor_seq NOT NULL REFERENCES ledger_entries(seq)`), `src/lib/attestations/attach.ts` (+ `.test.ts`); file store `DATA_DIR/attestations/<sha256>.pdf` via `src/lib/media/store.ts`.
- **Produces:** `attachAttestation(db, { orgId; plotId; file: Uint8Array; issuer; validFrom; validTo }) → { id; fileHash; anchorSeq }`; errors `not_pdf`, `too_large` (> 10 MB), `bad_dates`, `issuer_required`.
- [ ] Write failing tests: a PDF (magic `%PDF-`) stores the file, its SHA-256, issuer and dates and anchors `attestation` with payload `{ v:1, plotId, type:'organic', fileHash, issuer, validFrom, validTo }` in one transaction; a PNG renamed `.pdf` → `not_pdf`; `validTo < validFrom` → `bad_dates`; another org's plot → not found.
- [ ] Run `pnpm vitest run src/lib/attestations/attach.test.ts` → fails.
- [ ] Implement.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Record organic certificates as hashed, anchored attestations (TASK-14)`

**TSK-13.2 · Attach form and the attestation line**
- **Files:** create `src/components/ui/AttestationLine.tsx` (+ unit test of its text), `src/app/(admin)/admin/plots/[plotId]/attestation/{actions.ts,AttestationForm.tsx}`; render on the plot page (TKT-06's `/admin/plots/[plotId]`).
- **Produces:** `<AttestationLine issuer validFrom validTo today>` → "Certified by {issuer} — certificate on record · valid {from}–{to}" or "… · expired {to}".
- [ ] Write failing tests: the line text for valid and expired cases; e2e: attaching a PDF on a plot shows the line and a link to download the file (admin only).
- [ ] Run → fails.
- [ ] Implement with existing admin form styles (TP17).
- [ ] Verify: green.
- [ ] Commit: `Show organic status as "Certified by … — certificate on record" (TASK-14)`

**TSK-13.3 · Wording guard**
- **Files:** create `tests/wording-guard.test.ts`.
- [ ] Write the test: case-insensitive search of `src/**` (excluding `*.test.*`) and `src/lib/i18n/*.ts` for `verified organic`, `organic verified`, `organically verified`, `\bfraud`, `\bfake\b`, `\bcheat` → zero hits; plant a temporary string in a scratch copy inside the test to prove it can fail.
- [ ] Run → passes only after any offending copy is fixed.
- [ ] Verify: `pnpm test` green.
- [ ] Commit: `Guard product copy against "verified organic" and accusation words (TASK-14)`

**Done gate (TKT-13):** file hash, issuer, validity stored and anchored → TSK-13.1 / TC-058; wording on every surface → `AttestationLine` + TSK-13.3 / EVAL-079 (certificate side re-checked in TKT-16).

---

### TKT-14 → TASK-15 · Batches, custody transfer and the buyer list (sp 5 · P1 · Feature)
**Depends on:** TKT-02, TKT-04 · **TC:** TC-059, TC-060 (+ TC-080/081) · **EVAL:** EVAL-077, EVAL-080 (buyer boundary) · **Owns files:** `src/lib/db/migrations/*_batch_invariants.sql`, `src/lib/auth/signing-keys.ts` (+ test), `src/lib/batches/*`, `src/lib/custody/*`, `src/app/(admin)/admin/batches/**`, `src/app/(buyer)/buyer/**`, `src/components/admin/{BatchBuilder,TransferForm}.tsx`, `src/components/buyer/*`, `e2e/batches.spec.ts`
**Brief for the implementer:** The database enforces the invariants (S8, TP14); the app checks are courtesy. Batch membership is fixed at creation: the `batch_created` ledger payload lists the member events, and there is no add-later path. Compute quantity and min score in the app, anchor them, insert, then assert the trigger-maintained columns equal the anchored values inside the same transaction (mismatch → throw → rollback). Buyer and admin batch screens have no mockup: compose them from the admin rail/list/detail grammar and field rows (TP17).

**TSK-14.1 · Batch invariant triggers**
- **Files:** create `src/lib/db/migrations/00xx_batch_invariants.sql`, `tests/integration/batch-invariants.test.ts`.
- [ ] Write failing tests in raw SQL (TC-059, EVAL-077): inserting the same `event_id` into two batches fails (UNIQUE); inserting an event whose `final_verdict ≠ 'Verified'` aborts; a robusta event into an arabica batch aborts; after inserts `quantity_kg = Σ cherry_kg` and `integrity_score = MIN(score of the run that set final_verdict)`; with a `custody_transfers` row present, `UPDATE batches SET status='transferred'` succeeds once; afterwards any `UPDATE batches`, `INSERT` or `DELETE` on `batch_events` for it aborts; `status='transferred'` without a custody row aborts.
- [ ] Run `pnpm vitest run tests/integration/batch-invariants.test.ts` → fails.
- [ ] Implement the triggers of §4.2 (batch part): `batch_events_before_insert`, `batch_events_after_insert` (aggregate recompute), `batch_events_before_delete`, `batches_before_update`.
- [ ] Verify: green.
- [ ] Commit: `Enforce batch membership, aggregates and post-transfer lock in SQLite (TASK-15)`

**TSK-14.2 · Server-held user signing keys (TP15)**
- **Files:** create `src/lib/auth/signing-keys.ts`, `src/lib/auth/signing-keys.test.ts`.
- **Produces:** `signAsUser(userId, message: string) → Promise<{ signature: string; kid: string; publicJwk: JsonWebKey }>`; `getUserPublicKey(userId)`. Keys at `DATA_DIR/keys/users/<userId>.jwk`, created with `flag:'wx'`, mode `0o600`, P-256; `kid` = RFC 7638 thumbprint.
- [ ] Write failing tests (temp `DATA_DIR`): first call creates the file with mode 0600; a second call reuses it (same kid); the signature verifies with `lib/crypto` `verify`; two users get different kids; concurrent first calls produce one key (the `wx` loser re-reads); no log line contains `"d":`.
- [ ] Run → fails.
- [ ] Implement.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Add server-held per-user signing keys for admin statements (TASK-15)`

**TSK-14.3 · Create a batch**
- **Files:** create `src/lib/batches/create.ts` (+ test), `src/lib/batches/eligible.ts` (+ test).
- **Produces:** `listEligibleEvents(orgId, crop?) → { eventId; plotName; producerId; crop; cherryKg; score; receivedAt }[]` (final Verified, not in any batch, org's plots); `createBatch(db, { orgId; adminId; crop; eventIds }) → { batchId; shortHash; anchorSeq; quantityKg; integrityScore }`; errors `mixed_crop`, `not_eligible`, `empty`.
- [ ] Write failing tests: three Verified arabica events → batch with Σ kg and min score; `batch_created` payload `{ v:1, batchId, orgId, crop, events: [{eventId, payloadHash}] (sorted), quantityKg, integrityScore, adminId, ts, kid, publicJwk, signature }`; `short_hash` = first 12 hex of the entry hash; a Needs Review event → `not_eligible` with nothing persisted; mixed crops → `mixed_crop`; another org's event → `not_eligible`.
- [ ] Run → fails.
- [ ] Implement in one `'write'` transaction: select + compute → sign → `ledger.append` → insert `batches` + `batch_events` → re-read aggregates and compare.
- [ ] Verify: green.
- [ ] Commit: `Create batches from Verified events of one crop, anchored with their members (TASK-15)`

**TSK-14.4 · Custody transfer**
- **Files:** create `src/lib/custody/transfer.ts` (+ test).
- **Produces:** `transferBatch(db, { orgId; adminId; batchId; toOrgId }) → { transferId; anchorSeq }`; errors `not_open`, `not_buyer`, `not_found`.
- [ ] Write failing tests (TC-060): transfer to a buyer org inserts `custody_transfers` with a signature verifiable against the admin key, anchors `custody_transfer` `{ v:1, batchId, fromOrg, toOrg, ts, adminId, kid, publicJwk, signature }`, sets status `transferred`; a second transfer → `not_open`; to an FPO org → `not_buyer`; another org's batch → `not_found`.
- [ ] Run → fails.
- [ ] Implement: insert custody (anchored) then the single status update.
- [ ] Verify: green.
- [ ] Commit: `Sign and anchor custody transfers and lock the batch (TASK-15)`

**TSK-14.5 · Admin batch screens**
- **Files:** create `src/app/(admin)/admin/batches/{page.tsx,new/page.tsx,[batchId]/page.tsx,actions.ts,loading.tsx,error.tsx}`, `src/components/admin/{BatchBuilder,TransferForm}.tsx`.
- [ ] Write failing test `e2e/batches.spec.ts` (admin part): list with status, crop, kg, score (four states); builder lists eligible events with checkboxes, selecting an arabica event disables robusta rows, the pill reads "Create batch · 3 pickings · 128.5 kg"; detail shows members, totals, the certificate link (`/verify/<id>?h=<short>`) and a transfer form (buyer select + confirm note "This is signed and recorded permanently"); after transfer the form is replaced by the custody line.
- [ ] Run → fails.
- [ ] Implement with rail, `q-list` rows, `glass card`, `pill`, `decide`-style confirm (TP17).
- [ ] Verify: green; axe clean.
- [ ] Commit: `Add batch builder, batch detail and transfer for FPO admins (TASK-15)`

**TSK-14.6 · Buyer list and detail**
- **Files:** create `src/lib/batches/buyer.ts` (+ test), `src/app/(buyer)/buyer/{page.tsx,loading.tsx,error.tsx,batches/[batchId]/page.tsx}`, `src/components/buyer/{BatchRow,CustodyChain}.tsx`.
- **Produces:** `listBuyerBatches(buyerOrgId)`, `getBuyerBatch(buyerOrgId, batchId)` — only batches whose latest custody `to_org` is the buyer's org.
- [ ] Write failing tests (TC-060, EVAL-080): buyer A lists its batch with score, quantity, plot count (producer IDs, no farmer names) and custody chain; buyer B's list is empty and `getBuyerBatch` → null (page 404); e2e: the certificate link opens the public page; four states.
- [ ] Run → fails.
- [ ] Implement.
- [ ] Verify: green; TC-080 sweep for `/admin/batches*` and `/buyer*`.
- [ ] Commit: `Show buyers only the batches transferred to them (TASK-15)`

**Done gate (TKT-14):** one crop only, Σ kg, min score, event in at most one batch → TC-059 / EVAL-077; custody signed and anchored, locked after transfer → TC-059, TC-060; buyer list scoped to their org with certificate links → TC-060 / EVAL-080.

---

### TKT-15 → TASK-16 · Ledger checkpoints and the proof feed (sp 5 · P0 · Feature)
**Depends on:** TKT-02 · **TC:** TC-061, TC-062, TC-063, TC-064, TC-001 (ledger fields) · **EVAL:** EVAL-058–063, EVAL-065 (EVAL-064 server side) · **Owns files:** `src/lib/ledger/{merkle,checkpoint,keys,proof,closure,feed,health}.ts` (+ tests), `src/lib/ledger/hashchain.ts` (checkpoint hook only), `src/lib/db/migrations/*_ledger_checkpoints.sql`, `src/app/api/verify/[batchId]/route.ts`, `src/app/.well-known/udgam-ledger-key/route.ts`, `src/app/api/health/route.ts` (ledger fields), `docs/proof-feed.md`, `docs/proof-feed.vectors.json`, `scripts/proof-vectors.ts`, `evals/harness/{proof-suite,tamper}.ts`
**Brief for the implementer:** `proof.ts` and `merkle.ts` are isomorphic (WebCrypto + `lib/crypto` only) because the certificate page runs them (TKT-16); `keys.ts`, `checkpoint.ts`, `closure.ts`, `feed.ts` are server-only. Merkle hashing is RFC 6962 §2.1 exactly (0x00 leaf / 0x01 node prefixes, split at the largest power of two < n); inclusion verification follows RFC 9162 §2.1.3.2. `docs/proof-feed.md` must let someone who has never seen this repo write a verifier (TKT-18 does exactly that) — every byte-level rule belongs in it. The feed and the page share one `resolveFeed(batchId, h)` so the three not-found cases are identical everywhere (TP8).

**TSK-15.1 · Merkle tree (RFC 6962)**
- **Files:** create `src/lib/ledger/merkle.ts`, `src/lib/ledger/merkle.test.ts`.
- **Produces:** `merkleRoot(leaves: Uint8Array[]) → Promise<Uint8Array>`; `auditPath(leaves, index) → Promise<Uint8Array[]>`; `rootFromPath(leaf: Uint8Array, index: number, size: number, path: Uint8Array[]) → Promise<Uint8Array>` (RFC 9162 §2.1.3.2 algorithm).
- [ ] Write failing tests (TC-061): for n = 1..300 and every index, `rootFromPath(leaf, i, n, auditPath(leaves, i))` equals `merkleRoot(leaves)`; 5 fixed vectors (n = 1, 2, 3, 7, 8 with leaves `sha256("leaf-i")`) equal roots computed by a 20-line reference written inline in the test straight from RFC 6962's recursive definition; flipping one bit in any path element, or passing `index ± 1`, gives a different root; empty tree root = SHA-256 of the empty string.
- [ ] Run `pnpm vitest run src/lib/ledger/merkle.test.ts` → fails.
- [ ] Implement iteratively (no recursion depth issues), WebCrypto SHA-256 only.
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Add RFC 6962 Merkle roots and inclusion proofs (TASK-16)`

**TSK-15.2 · Ledger key and the well-known route**
- **Files:** create `src/lib/ledger/keys.ts` (+ `.test.ts`), `src/app/.well-known/udgam-ledger-key/route.ts` (+ integration test).
- **Produces:** `loadLedgerKey(path = env.LEDGER_KEY_PATH) → Promise<{ kid; publicJwk; sign(message: string): Promise<string> }>` (generates on first call if missing: P-256, `writeFile(…, { mode: 0o600, flag: 'wx' })`, parent dir `0o700`); `publishedKeys() → { keys: (JsonWebKey & { kid; use:'sig'; alg:'ES256' })[] }`.
- [ ] Write failing tests (TC-064): no file → created with mode 0600 (`statSync().mode & 0o777`); second load → same kid; `git check-ignore data/keys/ledger.jwk` exits 0; a pino logger capture during load contains no `"d":`; `GET /.well-known/udgam-ledger-key` → 200 `application/json`, one key, no `d` member, `Cache-Control: public, max-age=300`.
- [ ] Run → fails.
- [ ] Implement.
- [ ] Verify: green.
- [ ] Commit: `Generate the ledger key at first boot and publish its public half (TASK-16)`

**TSK-15.3 · Checkpoints: every 100 entries and on demand**
- **Files:** create `src/lib/db/migrations/00xx_ledger_checkpoints.sql` (table per §4.1 + append-only triggers), `src/lib/ledger/checkpoint.ts` (+ `.test.ts`); modify `src/lib/ledger/hashchain.ts` `append()` to call `maybeCheckpoint(tx, seq)`.
- **Produces:** `checkpointStatement(cp) → string` (= `jcs({ v:1, id, fromSeq, toSeq, merkleRoot, prevCheckpointHash, ts })`); `createCheckpoint(tx, toSeq) → Checkpoint`; `checkpointIfNeeded(tx) → Checkpoint | null` (only when entries exist after the last checkpoint); `maybeCheckpoint(tx, seq)` creates one when `seq % 100 === 0`.
- [ ] Write failing tests (TC-062): 250 appends → checkpoints [1–100] and [101–200] created inside the appending transactions; `checkpointIfNeeded` → [201–250]; calling it again → null (no new entries); each signature verifies over `checkpointStatement` with the published JWK; `prevCheckpointHash` of #2 = `sha256Hex(statement #1)`, of #1 = 64 zeros; `UPDATE ledger_checkpoints` aborts; a failure inside `createCheckpoint` rolls back the 100th append too.
- [ ] Run → fails.
- [ ] Implement; leaves are `hexToBytes(entry_hash)` of the range in `seq` order.
- [ ] Verify: green; TC-008 still green.
- [ ] Commit: `Seal the ledger under signed Merkle checkpoints every 100 entries (TASK-16)`

**TSK-15.4 · Proofs and feed verification (isomorphic)**
- **Files:** create `src/lib/ledger/proof.ts`, `src/lib/ledger/proof.test.ts`.
- **Produces:** `getProof(db, seq) → Promise<Proof>` (server, re-exported from `feed.ts` to keep `proof.ts` isomorphic); `verifyProof(proof, keys) → Promise<VerifyOutcome>`; `verifyFeed(feed: ProofFeedV1, keys: PublishedKey[]) → Promise<{ ok: true; entries: number; checkpoints: {id; kid}[] } | { ok: false; step: 'format'|'payload-hash'|'entry-hash'|'merkle-path'|'checkpoint-signature'|'unknown-key'|'short-hash'|'closure-incomplete'; seq?: number; checkpointId?: number }>`. Checks, in order: format/version; per checkpoint: known `kid` then signature; per entry: `payloadHash`, `entryHash`, `leafIndex === seq − fromSeq`, root from path equals its checkpoint's `merkleRoot`; `shortHash` = prefix of the `batch_created` entry hash; closure completeness: every event listed in the `batch_created` payload has its `harvest_event` and at least one `verification_run` entry in the feed.
- [ ] Write failing tests with a feed built in-test from a small ledger: intact → ok with the entry count; each tamper → the named step (cherryKg changed → `payload-hash`; entry `ts` changed with `payloadHash` recomputed → `entry-hash`; one path element changed → `merkle-path`; signature byte flipped → `checkpoint-signature`; checkpoint re-signed with another key whose kid isn't published → `unknown-key`; two adjacent entries' positions swapped → `merkle-path`; an entry dropped → `closure-incomplete`; `shortHash` altered → `short-hash`).
- [ ] Run → fails.
- [ ] Implement with `lib/crypto` + `merkle.ts` only (no `node:` imports; a lint rule/test asserts it).
- [ ] Verify: green; typecheck, lint.
- [ ] Commit: `Verify proof feeds step by step, naming the first failing check (TASK-16)`

**TSK-15.5 · Provenance closure**
- **Files:** create `src/lib/ledger/closure.ts` (+ `.test.ts`).
- **Produces:** `closureSeqs(db, batchId) → Promise<number[]>` per evaluation-plan §4.6: `batch_created`; every `custody_transfer`; per member event its `harvest_event`, all `verification_run`s, any `admin_override`; per plot `plot_registered`, `plot_edited` and `attestation` entries (found by `kind` + `json_extract(payload,'$.plotId')`); per device `device_enrolled` and `device_revoked` (by `$.deviceId`). Sorted, unique.
- [ ] Write failing test (TC-063 closure part): on a seeded batch (2 plots, one edited, one attestation, 3 events on 2 devices, one revoked later, one override, one transfer), the result equals a list the test assembles independently from the table `anchor_seq` columns plus the two JSON-matched kinds; entries of other batches and rejected captures are absent.
- [ ] Run → fails.
- [ ] Implement.
- [ ] Verify: green.
- [ ] Commit: `Compute a batch's provenance closure from the ledger (TASK-16)`

**TSK-15.6 · Feed builder and the public route**
- **Files:** create `src/lib/ledger/feed.ts` (+ `.test.ts`), `src/app/api/verify/[batchId]/route.ts` (+ `tests/integration/proof-feed-route.test.ts`).
- **Produces:** `buildFeed(db, batchId) → Promise<ProofFeedV1>` (runs `checkpointIfNeeded` in a write transaction when any closure seq is after the last checkpoint — S7, EVAL-065); `resolveFeed(db, batchId, h: string | null) → Promise<ProofFeedV1 | null>` (null for unknown batch, missing `h`, or `h` ≠ `short_hash` via `timingSafeEqual` on equal-length buffers, comparing against a fixed dummy when lengths differ).
- [ ] Write failing tests (TC-063, EVAL-064 server side, EVAL-065): the route returns 200 `application/json` with `format:"udgam-proof-feed/1"` for the right `h`; after a new custody transfer, the next request creates a checkpoint and every entry's `checkpointId` is set; unknown batch, no `h`, wrong `h` → 404 with byte-identical bodies `{"error":"not_found"}` and identical headers; `Cache-Control: no-store`; `verifyFeed` of the response with `publishedKeys()` → ok.
- [ ] Run → fails.
- [ ] Implement per §8.3 (field names exactly as documented).
- [ ] Verify: green.
- [ ] Commit: `Serve the batch proof feed with on-demand checkpoints and uniform not-found (TASK-16)`

**TSK-15.7 · The proof-feed specification and vectors (GAP-9)**
- **Files:** create `docs/proof-feed.md`, `scripts/proof-vectors.ts`, `docs/proof-feed.vectors.json` (generated, committed), `tests/proof-feed-doc.test.ts`.
- [ ] Write the failing test: `docs/proof-feed.vectors.json` exists; its intact feed verifies with `verifyFeed` and each listed tamper fails at the documented step; every field name in the doc's JSON example appears in `ProofFeedV1`'s zod schema and vice versa.
- [ ] Run → fails.
- [ ] Write the document, self-contained: purpose and trust anchor (same-server key; not protection against a server replacing both key and records); how to fetch the feed and key; the JSON schema with every field; RFC 8785 canonicalisation (with the number and string rules that matter); hex/base64url encodings; `payloadHash`, `entryHash` formulas with the exact object keys; Merkle leaf/node construction (RFC 6962 §2.1) and the inclusion algorithm (RFC 9162 §2.1.3.2) in pseudo-code; `leafIndex = seq − fromSeq`; the checkpoint statement object and ECDSA P-256/SHA-256 over its UTF-8 bytes, signature in IEEE P1363 r‖s base64url; the key JSON format and kid (RFC 7638); `shortHash`; closure-completeness rule; the ordered list of verification steps and their names; the vectors file and how to use it. Generate vectors with `pnpm tsx scripts/proof-vectors.ts`.
- [ ] Verify: test green; a reviewer subagent given only the doc and vectors confirms it is sufficient (record in the ledger).
- [ ] Commit: `Document proof feed v1 with test vectors for independent verifiers (TASK-16)`

**TSK-15.8 · Harness proof suite and health ledger fields**
- **Files:** create `evals/harness/tamper.ts`, `evals/harness/proof-suite.ts` (registered as suite `harness-proof` in `evals/harness/run.ts`); modify `src/app/api/health/route.ts` using a new `src/lib/ledger/health.ts` (+ test).
- **Produces:** `runProofSuite(opts) → CaseResult[]` for EVAL-058–063 and EVAL-066 (lib verifier now; TKT-18 adds the clean-room verifier as a second column); `ledgerHealth(db) → { lastSeq; lastCheckpointAgeSec: number|null; keyPresent }`.
- [ ] Write failing tests: `pnpm eval` reports EVAL-058 passed with coverage 100 % of closure entries for a seeded 50-event batch (5 plots, one override, one attestation, one transfer); EVAL-059–063 each pass (tamper rejected with the expected step; EVAL-063 runs both `drop_entry` and `swap_adjacent`); the checker column for TKT-18 reports `not_yet_implemented` (never dropped); `/api/health` includes `ledger.lastSeq`, `ledger.lastCheckpointAgeSec`, `ledger.keyPresent` and returns 503 when the key file is missing (TC-001 ledger part).
- [ ] Run → fails.
- [ ] Implement; the batch is built through the real services in a temp libSQL file, not by writing rows directly.
- [ ] Verify: `pnpm eval` shows the proof suite; `pnpm test` green.
- [ ] Commit: `Run the proof and tamper suite in pnpm eval and report ledger health (TASK-16)`

**Done gate (TKT-15):**
| AC | Evidence |
|---|---|
| Checkpoint every 100 entries or on demand | TC-062 |
| Server ledger key generated at first boot outside the repo; public key at `/.well-known/udgam-ledger-key` | TC-064 |
| `getProof` / isomorphic `verifyProof` | TSK-15.4 tests; TC-061 |
| `/api/verify/[batchId]` forces a checkpoint when the batch has newer entries (S7) | TC-063, EVAL-065 |
| Feed format documented (feeds GAP-9) | TSK-15.7 (`docs/proof-feed.md` + vectors) |
| EVAL-058–063 (lib side) | TSK-15.8 in `pnpm eval` |

### TKT-16 → TASK-17 · Public certificate with in-browser proof (sp 8 · P1 · Feature)
**Depends on:** TKT-14 (TASK-15), TKT-15 (TASK-16); uses TKT-18's tamper generator for the test mode · **TC:** TC-065, TC-066, TC-067 (page + feed part), TC-068, TC-069, TC-080/081 (certificate routes) · **EVAL:** EVAL-064, 071, 084, 087, 088, 089 · **Owns files:** `src/lib/certificate/*`, `src/app/(public)/verify/[batchId]/*` (except the metadata block, which TKT-17 extends), `src/app/api/telemetry/route.ts`, `src/components/ui/{ProofPanel,Timeline,OriginTable,EntryList}.tsx`, `evals/perf/*`, `evals/scorers/latency.ts`, `e2e/certificate*.spec.ts`
**Brief for the implementer:** The page is a pure function of the proof feed (§8.3–§8.4, TP16). Never query the DB for anything that is displayed. Port `.design/exploration/final/verify.html`: `body[data-state=loading|verified|mismatch]` drives the CSS, and in `mismatch` no `--ok`/`.lit` green may render anywhere. Proof panel first on phones, map and journey two-column from 1000 px (Design.md §16). The embedded feed JSON must be escaped (`<` → `<`) so it cannot break out of the `<script>`. The test-only tamper mode must be impossible in a production build.

**TSK-16.1 · Certificate view model (pure)**
- **Files:** create `src/lib/certificate/view-model.ts`, `src/lib/certificate/view-model.test.ts`, `evals/fixtures/feeds/batch-3-events.json` (generated once by `src/lib/certificate/__fixtures__/make-feed.ts`, which builds a temp ledger through the real `lib/ledger` + batch functions and writes the feed; commit both).
- **Produces:** `buildCertificateView(feed: ProofFeedV1): CertificateView` with `{ headline:{quantityKg, crop, farmCount, district}, plots:[{producerId, plotId, polygon, areaHa, forestLoss:{pct, evidence}}], journey:[{kind, org, at}], origin:[{producerId, plotId, areaHa, kg}], entries:[{eventId, date, kg, verdict, evidence:string[], override?:{verdict, reason}}], organic:{issuer, validTo}|null, entryCount, shortHash }`.
- [ ] Write the failing test: for the fixture feed, headline quantity equals Σ `cherryKg` in the `harvest_event` payloads; crop comes from `batch_created`; plots come from the latest `plot_registered`/`plot_edited` payload per plot; the verdict per entry is the override's if one exists, else the last run's; the organic line appears only when an `attestation` payload exists; `buildCertificateView` has no import from `lib/db` (assert via a module-graph check with `import.meta.glob`-free static read of the file's imports).
- [ ] Run `pnpm vitest run src/lib/certificate/view-model.test.ts` → fails (module missing).
- [ ] Implement it as a pure reducer over `feed.entries` in `seq` order. Unknown kinds are ignored with a counted warning field, not thrown.
- [ ] Verify: the test is green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Derive the certificate view model purely from the proof feed (TASK-17)`

**TSK-16.2 · Page loader, 404 parity and the embedded feed**
- **Files:** create `src/app/(public)/verify/[batchId]/page.tsx`, `src/app/(public)/verify/[batchId]/not-found.tsx`, `src/lib/certificate/embed.ts`, `src/lib/certificate/embed.test.ts`, `e2e/certificate-notfound.spec.ts`.
- **Produces:** `serializeFeedForEmbed(feed): string` (JSON with `<`, `>`, `&`, U+2028/2029 escaped).
- [ ] Write the failing tests: `serializeFeedForEmbed` output parses back to a deep-equal object, and it contains no `</script`. In e2e (`@eval EVAL-064`), `/verify/B-UNKNOWN0?h=000000000000`, `/verify/<real>` without `h`, and `/verify/<real>?h=<wrong>` return 404 with byte-identical bodies (compare `response.text()`), and the page shows the plain "batch not found" message.
- [ ] Run → fails.
- [ ] Implement it: `page.tsx` (Server Component, `dynamic='force-dynamic'`) calls TKT-15's `getProofFeed(db, batchId, h)`, and `null` → `notFound()`. It renders `<script type="application/json" id="proof-feed">{serializeFeedForEmbed(feed)}</script>` and passes `buildCertificateView(feed)` to the sections. Set `export const metadata`-level `robots: { index:false, follow:false }` in `generateMetadata` (TKT-17 adds OG to the same function).
- [ ] Verify: unit + `pnpm test:e2e e2e/certificate-notfound.spec.ts` green.
- [ ] Commit: `Serve the certificate from the proof feed with identical 404s (TASK-17)`

**TSK-16.3 · In-browser proof panel**
- **Files:** create `src/components/ui/ProofPanel.tsx` (`'use client'`), `src/components/ui/ProofPanel.test.tsx` (Vitest + jsdom with WebCrypto from `node:crypto`), `src/app/api/telemetry/route.ts`, `src/app/api/telemetry/route.test.ts`.
- **Produces:** `<ProofPanel entryCount kid />`. It reads `#proof-feed`, fetches `/.well-known/udgam-ledger-key`, calls `verifyFeed(feed, keys, { onProgress(done,total) })` from `src/lib/ledger/proof.ts`, and sets `document.body.dataset.state` plus `performance.mark('proof-final')`.
- [ ] Write the failing test: with the fixture feed and its key, the panel ends in `verified` with the copy "Verified on this device just now" and "{n} records checked, all match the sealed ledger." plus "checkpoint {id} signed by key {kid8}". With a feed whose one payload field is changed, it ends in `mismatch` naming step `payload-hash` and the record's seq, and `body.dataset.state === 'mismatch'`. The progress line reads "Checking {k} of {n} records…". A live region (`role=status`) receives each state. The telemetry route accepts only `{event:'certificate.proof_failed'|'certificate.viewed', step?, batchId}` (400 otherwise) and logs it without IP or UA.
- [ ] Run → fails.
- [ ] Implement it. If `verifyFeed` lacks `onProgress`, add the optional callback in `src/lib/ledger/proof.ts` without changing its return type (coordinate: TKT-15 owns the file; this is an additive change). "Check again" (`#check-again`) re-runs verification. On mismatch, send `navigator.sendBeacon('/api/telemetry', …)` with the step only.
- [ ] Verify: tests green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Verify the certificate proof in the visitor's browser (TASK-17)`

**TSK-16.4 · Hero, origin map, journey and origin table (port)**
- **Files:** modify `src/app/(public)/verify/[batchId]/page.tsx`; create `src/app/(public)/verify/[batchId]/certificate.module.css`, `src/components/ui/Timeline.tsx`, `src/components/ui/OriginTable.tsx`; reuse `PlotSvg` / `src/lib/geo/svg.ts` for a multi-plot SVG map (no tiles, Design.md §25).
- [ ] Write the failing e2e `e2e/certificate.spec.ts` (`@eval EVAL-087`): at 375 px the `.proof` card's top is above `#origin-map`'s top; at 1000 px the map and journey sit side by side (their bounding boxes overlap vertically); the h1 reads "{kg} kg of {Crop} cherry from {n} farms in {district}".
- [ ] Run → fails.
- [ ] Port the markup, class roles and tokens from `verify.html` (h1, `#origin-map`, `#tl-h` timeline, `#origin-h` table). Drop the prototype scaffolding (`#states-dialog`, `#params-dialog`). The map draws each plot's polygon with its deforestation result line.
- [ ] Verify: the e2e is green at the phone-375 and desktop-1440 projects; `pnpm lint`.
- [ ] Commit: `Port the certificate hero, origin map and journey (TASK-17)`

**TSK-16.5 · Entries, organic line, downloads and honest limits (port)**
- **Files:** modify `page.tsx` and `certificate.module.css`; create `src/components/ui/EntryList.tsx`.
- [ ] Extend `e2e/certificate.spec.ts`: each entry shows date, kg, verdict word + mark (never colour alone) and up to three evidence lines, with "See all checks" expanding the rest; an override shows its reason as text. The organic line reads exactly "Certified by {issuer} — certificate on record" (validity shown) and is absent without an attestation. `#dl-block` has the GeoJSON link (`/api/verify/{id}/geojson?h=`, target implemented in TKT-17) and a Print button. The `#limits` section lists the trust-anchor statement (evaluation-plan §4.6), the GPS-inside-plot and re-encoded-photo limitations (EVAL-029/036), the salami limitation (GAP-7) and the pruning/clearing pair. Wording is from `src/lib/i18n/en.ts` keys pending HR2 approval.
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Port certificate entries, organic attestation, downloads and limits (TASK-17)`

**TSK-16.6 · Four states and the dev state switch**
- **Files:** modify `page.tsx`, `ProofPanel.tsx`; create `e2e/certificate-states.spec.ts`.
- [ ] Write the failing e2e (`@eval EVAL-088`): `?state=loading` shows the real step line with the bar, `?state=mismatch` shows the red proof card and no green, the not-found state comes from TSK-16.2, and working = verified. `?state=` is ignored when `NODE_ENV==='production'` (assert through an integration test of the state resolver `resolveDevState(searchParams, env)`).
- [ ] Run → fails; implement `src/lib/certificate/dev-state.ts`; verify green.
- [ ] Commit: `Add certificate loading, mismatch and not-found states (TASK-17)`

**TSK-16.7 · QR code for a batch**
- **Files:** create `src/lib/certificate/qr.ts`, `src/lib/certificate/qr.test.ts`, `src/components/ui/BatchQr.tsx`; modify `src/app/(admin)/admin/batches/[batchId]/page.tsx` and `src/app/(buyer)/buyer/batches/[batchId]/page.tsx` (add the QR card only). Dev deps: `jsqr`, `pngjs`.
- **Produces:** `certificateUrl(batchId: string, shortHash: string, base = env.PUBLIC_BASE_URL): string`; `qrSvg(url): Promise<string>`; `qrPng(url): Promise<Buffer>`.
- [ ] Write the failing test (TC-069): decoding `qrPng(certificateUrl('B-7K2M9Q4D','3f9a1c0b7e2d'))` with jsqr yields `https://udgam.test/verify/B-7K2M9Q4D?h=3f9a1c0b7e2d` (with `PUBLIC_BASE_URL=https://udgam.test`); for a seeded batch the short hash equals the first 12 hex of its `batch_created` entry hash.
- [ ] Run → fails; implement with `qrcode` (error correction M, quiet zone 4); render the SVG inline on both batch pages with a "Print QR" action.
- [ ] Verify: tests green; admin and buyer batch pages still pass TC-080 at 375/768.
- [ ] Commit: `Generate the certificate QR code for each batch (TASK-17)`

**TSK-16.8 · Test-only tamper mode (never in production)**
- **Files:** modify `page.tsx`; create `src/lib/certificate/test-mode.ts`, `src/lib/certificate/test-mode.test.ts`, `e2e/certificate-tamper.spec.ts`.
- **Produces:** `tamperFromSearchParams(sp, env): TamperVariant | null`, which returns non-null only when `env.NODE_ENV !== 'production' && env.UDGAM_TEST_ROUTES === '1'`.
- [ ] Write the failing unit test: production → always `null`, even with `__tamper=payload-field`; test env with the flag → the variant. Write the failing e2e (`@eval EVAL-058..063`, TC-065): for each variant in `TAMPER_VARIANTS` from `src/lib/ledger/testing/tamper.ts` (TKT-18), load `/verify/{id}?h=…&__tamper={v}`. The panel reaches `mismatch` naming the expected step (`payload-hash`, `merkle-path`, `checkpoint-signature`, `unknown-key`, `merkle-path` for dropped/reordered). A computed-style scan finds no element whose colour or background resolves to `--ok` (#7FE3A6/#9CF0BF). The intact load reaches `verified`.
- [ ] Run → fails; implement by applying `applyTamper(feed, keys, v)` before embedding; for `other-key`, serve the substituted key through the page's key-fetch URL override `?__key=test`, which is also gated.
- [ ] Verify: unit + e2e green; `pnpm build` output greps no `UDGAM_TEST_ROUTES` code path reachable (the unit test is the gate).
- [ ] Commit: `Add gated tamper mode to exercise certificate failure states (TASK-17)`

**TSK-16.9 · No personal data on the page or the feed (page part of TC-067)**
- **Files:** create `e2e/certificate-privacy.spec.ts`.
- [ ] Write the test (`@eval EVAL-084`): seed farmers with sentinel values (name `Zzsentinel Farmer`, identifier `ID-SENTINEL-9999`, phone `9999988888`), build and transfer a batch, then fetch the page HTML and `/api/verify/{id}?h=` and assert none of the three sentinels appear, while `PR-` producer IDs do.
- [ ] Run → green, or fix the payload builder that leaks (the fix belongs in the owning `lib/*` payload function, with a unit test there).
- [ ] Commit: `Prove the certificate and proof feed carry no farmer personal data (TASK-17)`

**TSK-16.10 · S4 performance runner (EVAL-071)**
- **Files:** create `evals/perf/s4-certificate.ts`, `evals/perf/fixtures.ts` (builds a 50-event transferred batch in a temp `DATA_DIR` through lib functions), `evals/perf/network.ts` (EV9 profile: 10 Mbit/s down, 5 Mbit/s up, 80 ms RTT via CDP `Network.emulateNetworkConditions`), `evals/scorers/latency.ts`, `evals/scorers/latency.test.ts`; add script `"eval:perf": "tsx evals/perf/run.ts"` with `evals/perf/run.ts` dispatching `--only=s4|s3`, `--target=<url>`, `--runs=<n>`.
- **Produces:** `summarizeLatency(samplesMs: number[], thresholdMs: number): {p50, p95, max, pass}` (pass iff max < threshold for S4).
- [ ] Write the failing scorer test: `[100,200,300]` with 3000 → `{p50:200, p95:290, max:300, pass:true}` (linear interpolation, documented); any 3000 → `pass:false`.
- [ ] Implement the runner: each of 10 runs uses a fresh browser context (cold cache) at 375×812 with `Emulation.setCPUThrottlingRate {rate:4}` and the EV9 network. Measure `performance.getEntriesByName('proof-final')[0].startTime` (navigation start = 0). Record per-run `{ms, finalState}`; a run not ending `verified` counts as a failure. Write `evals/results/local/perf-s4-<sha>.json` with provenance (§13).
- [ ] Verify: `pnpm build && pnpm start &` then `pnpm eval:perf --target=http://localhost:3000 --only=s4 --runs=3` completes and writes the file (the formal 10-run measurement is TKT-21).
- [ ] Commit: `Add the S4 certificate latency runner and latency scorer (TASK-17)`

**TSK-16.11 · Responsive and accessibility gates for the certificate**
- **Files:** extend `e2e/certificate.spec.ts`.
- [ ] Add (`@eval EVAL-087, EVAL-089`): `scrollWidth ≤ innerWidth` at 320/375/768/1440; axe-core has no serious or critical violations in loading, verified, mismatch and not-found; tab order is proof panel → map → entries → downloads.
- [ ] Verify: `pnpm test:e2e e2e/certificate*.spec.ts` green on all projects.
- [ ] Commit: `Gate the certificate on responsive and accessibility checks (TASK-17)`

**Done gate (TKT-16):**
| AC | Evidence |
|---|---|
| Matches `verify.html` (proof first on phones, map, journey, origin table, entries, organic line, honest limits) | TSK-16.4/16.5 e2e, TC-066, screenshots vs `final/verify.html` in the ledger |
| Proof recomputed in the browser with loading and mismatch states | TC-065 (TSK-16.3, 16.6, 16.8), EVAL-058..063 page side, EVAL-088 |
| Wrong or missing `h` stops the feed serving data (GAP-6) | TSK-16.2 e2e, TC-063 (TKT-15), EVAL-064 |
| Pseudonymous producer IDs only (EV16) | TC-067 page/feed part (TSK-16.9), EVAL-084 |
| QR generation for a batch | TC-069 (TSK-16.7) |
| S4 instrumented | TSK-16.10 runner; formal EVAL-071 in TKT-21 |
| Design gates | TC-080, TC-081, EVAL-087, EVAL-089 |

---

### TKT-17 → TASK-18 · EUDR map file, printable certificate, link-preview metadata (sp 3 · P1 · Feature)
**Depends on:** TKT-16 (TASK-17) · **TC:** TC-070, TC-071, TC-072, TC-067 (GeoJSON part) · **EVAL:** EVAL-078, 087 (print), 090 (tags; unfurl in TKT-28) · **Owns files:** `src/lib/eudr/*`, `src/app/api/verify/[batchId]/geojson/route.ts`, `docs/eudr-geojson.md`, `docs/eudr-geojson.schema.json`, `src/app/(public)/verify/[batchId]/print.css`, the `generateMetadata` block in `page.tsx`, `public/og/verify.png`
**Brief for the implementer:** The EU Information System GeoJSON format is the external contract (TP24, technical-plan §12; EU "GeoJson File Description" v1.5 of 5 May 2025). It is a WGS84 FeatureCollection with `[longitude, latitude]` order, at least 6 decimal digits, closed rings, no holes and no self-intersection. Its Feature `properties` names are case-sensitive: `ProducerName`, `ProducerCountry`, `ProductionPlace`, and `Area` (hectares, a JSON number, Points only). Other properties are ignored by the EU system. The exact property set and the DDS side-data are whatever TP24 records: implement TP24 verbatim, and never put a farmer's name in `ProducerName` (EV16 → the pseudonymous `producer_id`). Build from the feed's payloads, like the page (TP16).

**TSK-17.1 · GeoJSON builder**
- **Files:** create `src/lib/eudr/geojson.ts`, `src/lib/eudr/geojson.test.ts`, `docs/eudr-geojson.schema.json`.
- **Produces:** `buildEudrGeoJson(feed: ProofFeedV1): GeoJSON.FeatureCollection` (one Feature per plot in the batch).
- [ ] Write the failing test against the fixture feed plus P01 (2.0 ha), P10 (4.0 ha) and P03 (5.5 ha) fixture polygons. Assert: a `FeatureCollection`; P01 → `Point` at `turf.pointOnFeature` (inside the polygon even for concave P04) with `Area: 2.0` as a number; P10 and P03 → `Polygon` (TP24 threshold: Point only below 4 ha; the legal rule is polygon for > 4 ha, so ≥ 4 ha → Polygon is compliant); every coordinate is rounded to exactly 6 dp; no two consecutive vertices are equal after rounding; rings are closed; no inner rings; property keys ⊆ the TP24 list with exact casing; `ProducerCountry === 'IN'`; `ProducerName` matches `^PR-`; the output validates against `docs/eudr-geojson.schema.json` (ajv).
- [ ] Run → fails.
- [ ] Implement it (TP24 field mapping; `ProductionPlace` = plot ID + district from the plot payload). DDS reference data (HS code, description, quantity basis) goes where TP24 puts it — not as extra Feature properties unless TP24 says so.
- [ ] Verify: the test is green; `pnpm typecheck && pnpm lint`.
- [ ] Commit: `Build the EUDR geolocation GeoJSON from the proof feed (TASK-18)`

**TSK-17.2 · Download route**
- **Files:** create `src/app/api/verify/[batchId]/geojson/route.ts`, `src/app/api/verify/[batchId]/geojson/route.test.ts`.
- [ ] Write the failing integration test (TC-070, `EVAL-078`): a valid `h` returns 200, `Content-Type: application/geo+json`, `Content-Disposition: attachment; filename="udgam-{batchId}-eudr.geojson"`, and a body equal to `buildEudrGeoJson(feed)`. Unknown batch, missing `h` and wrong `h` → the same 404 body as the feed (TP8). With the TSK-16.9 sentinel seed, the body contains no sentinel (TC-067 GeoJSON part, `EVAL-084`). Body size < 25 MB for a 50-plot batch (EU per-DDS limit).
- [ ] Run → fails; implement it by reusing `getProofFeed`; verify green.
- [ ] Commit: `Serve the EUDR GeoJSON download behind the certificate hash (TASK-18)`

**TSK-17.3 · Format document**
- **Files:** create `docs/eudr-geojson.md`.
- [ ] Write the property mapping table (TP24), the Point/Polygon rule with its legal basis, the precision rule, the rejected geometries (holes, crossings, figure-eight, LineString), the 25 MB limit and what Udgam does about each, the DDS reference data and quantity basis (TP24), and the sources (EU GeoJSON File Description v1.5, Reg. 2023/1115 Art. 2(28) and Annex II, Reg. 2025/2650 dates).
- [ ] Verify: the doc's property table equals the keys the builder emits (a test in `geojson.test.ts` parses the Markdown table).
- [ ] Commit: `Document the EUDR GeoJSON export format (TASK-18)`

**TSK-17.4 · Print stylesheet**
- **Files:** create `src/app/(public)/verify/[batchId]/print.css` (imported by the page); create `e2e/certificate-print.spec.ts`.
- [ ] Write the failing e2e (TC-071, `@eval EVAL-087`): with `page.emulateMedia({media:'print'})`, the computed `body` background is white and body text is `rgb(17,17,17)`. Warning text colours (`--check` print `#7a4b00`, `--bad` print `#9b2217`) have contrast ≥ 7.4:1 on white (computed in the test with WCAG relative luminance). `#check-again`, the Print button and `#dl-block` controls have `display:none`. No element has `backdrop-filter` or a non-`none` box-shadow glow.
- [ ] Run → fails; implement with Design.md §12 print tokens (`@media print { :root { … } }`); verify green.
- [ ] Commit: `Add the light print stylesheet for certificates (TASK-18)`

**TSK-17.5 · Link-preview metadata**
- **Files:** modify the `generateMetadata` in `src/app/(public)/verify/[batchId]/page.tsx`; copy `.design/exploration/og/verify.png` → `public/og/verify.png`; create `src/app/(public)/verify/[batchId]/metadata.test.ts`.
- [ ] Write the failing integration test (TC-072, `EVAL-090`): server HTML for a valid batch has `og:title`, `og:description`, and `og:image` = `${PUBLIC_BASE_URL}/og/verify.png` (absolute https in production config) with width 1200 and height 630, plus `og:url`, `twitter:card=summary_large_image`, `twitter:image`, `robots=noindex, nofollow`, and a canonical URL. `sharp('public/og/verify.png').metadata()` → 1200×630 PNG. An unknown batch → generic title and noindex, with no batch data in the tags.
- [ ] Run → fails; implement it with `metadataBase: new URL(env.PUBLIC_BASE_URL)` and a title from the view model ("{District} {Crop}, verified at origin — Udgam"; Design.md §25).
- [ ] Verify: green; `pnpm build` succeeds.
- [ ] Commit: `Add Open Graph and Twitter metadata to certificates (TASK-18)`

**Done gate (TKT-17):**
| AC | Evidence |
|---|---|
| GeoJSON FeatureCollection, field list verified against the EU primary source | TC-070 (TSK-17.1/17.2), `docs/eudr-geojson.md` sources, EVAL-078 |
| Point below 4 ha, Polygon otherwise | TSK-17.1 test (P01/P10/P03) |
| Light print stylesheet, warnings ≥ 7.4:1 | TC-071, EVAL-087 print |
| Server-rendered OG + Twitter tags with `og/verify.png` | TC-072, EVAL-090 (tags); unfurl → TC-091 in TKT-28 |
| No personal data in the export | TC-067 GeoJSON part |

---

### TKT-18 → TASK-19 · Clean-room proof checker and the harness proof suite (sp 3 · P0 · Task)
**Depends on:** TKT-15 (TASK-16; `docs/proof-feed.md` is TKT-15's deliverable) · **TC:** TC-073 · **EVAL:** EVAL-058, 059, 060, 061, 062, 063 (checker side), 066 (Node side) · **Owns files:** `evals/scorers/independent-verifier/**`, `tests/independent-verifier-isolation.test.ts`, `src/lib/ledger/testing/tamper.ts` (+ test), `evals/harness/suites/proof.ts`, `evals/harness/proof-fixture.ts`, `evals/scorers/proof-verifier.ts`
**Brief for the implementer (TSK-18.1–18.4):** The checker proves S6 independently (EV11). **The implementer subagent for TSK-18.1–18.4 receives ONLY `docs/proof-feed.md`, the data file `evals/fixtures/crypto-vectors.json`, and the task text below. No `src/` file, no technical-plan excerpt, no other context.** If the document is insufficient to write the checker, that is a GAP-9 defect in `docs/proof-feed.md`. Report it as `BLOCKED` with the missing fact, and have the TKT-15 owner fix the document (never the checker peeking at `src/`). Node standard library only (`node:crypto` `webcrypto`, `node:fs`), with no npm packages at all.

**TSK-18.1 · Package skeleton and isolation test**
- **Files:** create `evals/scorers/independent-verifier/tsconfig.json` (no `paths`, `types:["node"]`, `rootDir` = this folder), `evals/scorers/independent-verifier/README.md` (states the clean-room rule), `tests/independent-verifier-isolation.test.ts`; add an ESLint override that forbids any non-relative, non-`node:` import in that folder.
- [ ] Write the failing test: it walks every `.ts` file under `evals/scorers/independent-verifier/`, extracts every `import`/`require`/dynamic `import()` specifier, and asserts each is relative (resolving inside the folder) or starts with `node:`. It also plants a temporary file importing `../../../src/lib/crypto` and asserts that the check fails, then removes it.
- [ ] Run → fails (folder empty → the planted-import assertion has nothing to scan).
- [ ] Create `src/index.ts` exporting nothing yet; make the test pass.
- [ ] Verify: `pnpm vitest run tests/independent-verifier-isolation.test.ts` green; `pnpm lint`.
- [ ] Commit: `Scaffold the clean-room proof checker with an isolation guard (TASK-19)`

**TSK-18.2 · Own RFC 8785 canonicalisation and SHA-256**
- **Files:** create `evals/scorers/independent-verifier/src/jcs.ts`, `src/hash.ts`, `jcs.test.ts`.
- [ ] Write the failing test: every JCS vector in `evals/fixtures/crypto-vectors.json` round-trips to the expected string (UTF-16 code-unit key ordering, ES number serialisation, `-0` → `0`, minimal string escaping); SHA-256 hex digests match.
- [ ] Run → fails; implement from RFC 8785 (hand-written serializer; no library); verify green.
- [ ] Commit: `Implement canonical JSON and hashing in the clean-room checker (TASK-19)`

**TSK-18.3 · Own Merkle path and checkpoint signature verification**
- **Files:** create `src/merkle.ts`, `src/signature.ts`, `merkle.test.ts`.
- [ ] Write the failing test: RFC 6962 leaf/node prefixes as `docs/proof-feed.md` specifies; for a tree of 7 leaves built inside the test, every leaf's path from `leafIndex` recomputes the root; a flipped sibling fails; the checkpoint statement signature from the vectors file verifies with the P-256 JWK via `webcrypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, …)` over P1363 bytes decoded from base64url.
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Verify Merkle paths and checkpoint signatures in the clean-room checker (TASK-19)`

**TSK-18.4 · Feed verification and CLI**
- **Files:** create `src/verify.ts`, `cli.ts`, `verify.test.ts`.
- **Produces:** `checkFeed(feed: unknown, keys: {keys: JsonWebKey[]}): Promise<{ok:boolean; verified:number; total:number; failure?:{step:string; seq?:number}}>`; CLI `tsx evals/scorers/independent-verifier/cli.ts <feed.json> <keys.json>` prints that JSON and exits 0/1.
- [ ] Write the failing test with a feed built by hand in the test from the document's rules. Intact → `ok:true, verified===total`. A changed payload → `payload-hash`. A changed entry field → `entry-hash`. A changed sibling → `merkle-path`. A changed signature → `checkpoint-signature`. A kid not in keys → `unknown-key`. A wrong `shortHash` → `short-hash`. Step names are exactly the document's.
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Add the clean-room feed checker and CLI (TASK-19)`

**TSK-18.5 · Tamper variant generator (harness side, normal context)**
- **Files:** create `src/lib/ledger/testing/tamper.ts`, `src/lib/ledger/testing/tamper.test.ts`; add a lint rule forbidding imports of `src/lib/ledger/testing/**` from `src/app/**` except `src/lib/certificate/test-mode.ts`.
- **Produces:** `TAMPER_VARIANTS = ['payload-field','merkle-sibling','checkpoint-signature','other-key','dropped-entry','reordered-entries','wrong-short-hash'] as const`; `applyTamper(feed, keys, variant): {feed, keys, expectedStep}`.
- [ ] Write the failing test: each variant changes exactly one thing relative to the input (a deep diff shows one path, or for `other-key` the substituted key plus re-signed checkpoints), and `expectedStep` is the step the document names (dropped and reordered entries → `merkle-path`).
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Generate one-change tamper variants of a proof feed (TASK-19)`

**TSK-18.6 · Harness proof suite (EVAL-058–063, 066) and proof-verifier scorer**
- **Files:** create `evals/harness/proof-fixture.ts` (a temp ledger plus a 50-event transferred batch through real lib functions, including one override, one attestation, a revoked device and entries after the last checkpoint), `evals/harness/suites/proof.ts`, `evals/scorers/proof-verifier.ts`, `evals/scorers/proof-verifier.test.ts`; register the suite in `evals/harness/run.ts` (TKT-03 file; additive).
- [ ] Write the failing scorer test: given per-verifier results for the intact feed and 7 variants, output `{coverage:{lib:1, cleanRoom:1}, tamperRejected:{lib:1, cleanRoom:1}, perVariant:[{variant, lib:{rejected, step}, cleanRoom:{rejected, step}, stepMatches}]}`; any variant accepted by either verifier → CF-04 fired.
- [ ] Implement the suite. Map cases: EVAL-058 intact (both verifiers, coverage = verified ÷ closure entries = 100 %); EVAL-059 `payload-field`; EVAL-060 `merkle-sibling`; EVAL-061 `checkpoint-signature`; EVAL-062 `other-key`; EVAL-063 `dropped-entry` + `reordered-entries`; EVAL-066 the Node half of the crypto vectors (lib and clean-room agree with the vectors; the browser half is TC-006 e2e). Invoke the clean-room checker as a child process (`tsx cli.ts`) so no module state is shared.
- [ ] Verify: `pnpm eval` shows S6-lib = 100 % coverage and 100 % tamper rejection by both verifiers; the case statuses for EVAL-058..063 and 066 are `passed`.
- [ ] Commit: `Run the S6 proof and tamper suite with both verifiers (TASK-19)`

**Done gate (TKT-18):**
| AC | Evidence |
|---|---|
| `docs/proof-feed.md` specification exists and suffices (GAP-9) | TSK-18.1–18.4 written from it alone (the implementer brief is recorded in the ledger); a BLOCKED row if not |
| Checker uses only platform WebCrypto and shares no code with the app | TC-073 static part (TSK-18.1) |
| Passes the intact batch and fails every tamper case | TC-073, EVAL-058..063 via TSK-18.6, CF-04 not fired |

---

### TKT-19 → TASK-20 · Capture-boundary hardening and dependency hygiene (sp 3 · P1 · Chore)
**Depends on:** TKT-02 (TASK-3). Sequential with TKT-09 on `src/lib/capture/*` (§20) · **TC:** TC-074, TC-075, TC-076 · **EVAL:** EVAL-081, 083, 085 · **Owns files:** `src/lib/media/sniff.ts`, `src/lib/capture/{limits,rate-limit}.ts`, edits to `src/lib/capture/{parse,boundary}.ts`, `src/middleware.ts` (CSP nonce), `next.config.ts` `headers()`, `scripts/ci/check-bundle-secrets.sh`, `.env.ci.example`, CI jobs
**Brief for the implementer:** Reject before `verify()` runs, and cheapest check first: Content-Length → count → sizes → magic bytes → schema → canonical form → signature. Once a payload's signature is valid, every later refusal is anchored as a rejected `harvest_event` (Solution-PRD §7 rule 2). An unsigned or unparseable request is only logged. Camera captures are JPEG or HEIC/HEIF; nothing else is accepted. The CSP must not break Next's inline bootstrap: use a per-request nonce set in middleware (Next App Router reads it from the request CSP header). The embedded `application/json` feed needs no nonce.

**TSK-19.1 · Magic-byte sniffing**
- **Files:** create `src/lib/media/sniff.ts`, `src/lib/media/sniff.test.ts`.
- **Produces:** `sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/heic' | null`.
- [ ] Write the failing test: `FF D8 FF` → jpeg; ISO-BMFF `ftyp` brand `heic|heix|heif|mif1|msf1` at offset 4 → heic; PNG, WebP, GIF, PDF, a text file, empty and 3-byte inputs → `null`; the fixture photos from `evals/fixtures/photos/` sniff as expected.
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Identify capture photos by magic bytes (TASK-20)`

**TSK-19.2 · Request limits and schema at the boundary**
- **Files:** create `src/lib/capture/limits.ts` (`MAX_PHOTO_BYTES = 10 * 1024 * 1024`, `MAX_PHOTOS = 3`, `MAX_BODY_BYTES = 3 * MAX_PHOTO_BYTES + 256 * 1024`); modify `src/lib/capture/parse.ts`; create `src/lib/capture/parse.limits.test.ts`.
- [ ] Write the failing integration tests (TC-074, `EVAL-081`) against the route handler, with `verify` spied. A missing Content-Length → 411. Content-Length > `MAX_BODY_BYTES` → 413 before the body is read. A photo of 10 MB + 1 byte → 413. 0 or 4 photos → 400. Unknown form fields → 400. A text file labelled `image/jpeg` → 415. A payload failing the zod schema → 400 naming the field. `verify` is never called in any case.
- [ ] Run → fails; implement the ordered checks in `parse.ts`; verify green.
- [ ] Commit: `Refuse oversized, miscounted or mistyped captures before verification (TASK-20)`

**TSK-19.3 · Rate limiting**
- **Files:** create `src/lib/capture/rate-limit.ts`, `src/lib/capture/rate-limit.test.ts` (uses the `rate_limits` table from TKT-05).
- **Produces:** `consume(db, key: string, limit: number, windowSec: number, now: Date): Promise<{ok:boolean; retryAfterSec:number}>`.
- [ ] Write the failing test: 30 captures per device per 10 min, the 31st → `ok:false` with `retryAfterSec > 0`; 60 per IP per 10 min; the window rolls over; route → 429 with `Retry-After`.
- [ ] Run → fails; implement it (keyed on the claimed deviceId before signature verification, and on the IP); verify green.
- [ ] Commit: `Rate-limit capture uploads per phone and per address (TASK-20)`

**TSK-19.4 · Anchor signed refusals**
- **Files:** modify `src/lib/capture/boundary.ts`; create `src/lib/capture/boundary.anchor.test.ts`.
- [ ] Write the failing test: a validly signed payload whose photo fails sniffing, or whose photo hash mismatches, produces a `harvest_events` row with `boundary_status='rejected'` and `boundary_reason` in `{'media_type','media_hash_mismatch','media_too_large'}` plus a ledger entry, in one transaction. An unsigned or garbled request produces no row and no ledger entry, only a `capture.refused` log line with the reason. Retrying the same signed payload returns the same rejection without a second anchor (TP7).
- [ ] Run → fails; implement; verify green.
- [ ] Commit: `Anchor refused captures that carry a valid signature (TASK-20)`

**TSK-19.5 · Security headers and CSP**
- **Files:** create `src/middleware.ts` (nonce + CSP; it keeps the unauthenticated-redirect logic from TKT-04 if present), modify `next.config.ts` (`headers()`), create `src/app/headers.test.ts` and `e2e/csp.spec.ts`.
- [ ] Write the failing tests (TC-076): every HTML response has `Content-Security-Policy` with `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Only `/admin/plots*` adds the tile hosts from `MAP_TILE_PROVIDER` to `img-src`. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`. The e2e visits `/field`, `/admin`, `/admin/plots/new`, `/verify/{id}?h=` and records zero CSP violations (console + `securitypolicyviolation` listener).
- [ ] Run → fails; implement; verify green (and `pnpm build`).
- [ ] Commit: `Send a nonce-based CSP and security headers (TASK-20)`

**TSK-19.6 · Log redaction**
- **Files:** modify `src/lib/log.ts` if the redact list is incomplete; create `src/lib/log.test.ts`.
- [ ] Write the failing test: logging `{authorization:'Bearer x', cookie:'a=b', signature:'sig', password:'p', gfw:{key:'k'}, env:{BETTER_AUTH_SECRET:'s'}}` into a captured stream yields `[Redacted]` for each. A full in-process capture request (integration) emits logs that contain neither the request's signature value nor any value from the test env's secret variables.
- [ ] Run → fails or passes; complete the redact paths (§15) until green.
- [ ] Commit: `Redact credentials and signatures from structured logs (TASK-20)`

**TSK-19.7 · Bundle secret grep and dependency audit in CI**
- **Files:** create `scripts/ci/check-bundle-secrets.sh`, `.env.ci.example` (fake, clearly marked values for every secret name in `.env.example`); modify `.github/workflows/ci.yml` (jobs `bundle-secrets` and `audit`).
- [ ] Write the check: build with the fake env, then `grep -rF` each fake secret value across `.next/static` and `.next/server/app/**/*.html`; any hit → exit 1 naming the variable (never printing the value). Prove it can fail: temporarily reference one secret in a client component on a throwaway branch, watch CI fail, and revert.
- [ ] Add `pnpm audit --prod --audit-level=high` as a required job (TC-075, `EVAL-085`).
- [ ] Verify: both jobs green on the branch; the failing proof run's URL goes in the ledger.
- [ ] Commit: `Fail CI on secrets in the client bundle or high-severity dependencies (TASK-20)`

**Done gate (TKT-19):**
| AC | Evidence |
|---|---|
| 10 MB cap, content-type + magic bytes, count ≤ 3, schema, rate limit | TC-074 (TSK-19.1–19.3), EVAL-081 |
| Signed rejections anchored (Solution-PRD §7 rule 2) | TSK-19.4 test |
| `pnpm audit` gate in CI | TC-075 (TSK-19.7), EVAL-085 |
| No secrets in logs or client bundle | TC-075 (TSK-19.6, 19.7), EVAL-083 |
| Headers/CSP (technical-plan §16) | TC-076 (TSK-19.5) |

---

### TKT-20 → TASK-21 · Kodagu demo data and the automated demo script (sp 5 · P0 · Task)
**Depends on:** TKT-07, 10, 11, 12, 14, 16 (TASK-8, 11, 12, 13, 15, 17) · **TC:** TC-077, TC-078 · **EVAL:** EVAL-073, 074 (+ legitimate-set growth toward S2) · **Owns files:** `scripts/seed.ts`, `scripts/seed/*`, `e2e/demo*.spec.ts`, `playwright.demo.config.ts`, the demo attack page (see TSK-20.3), dataset additions
**Brief for the implementer:** The seed goes through the app's own `lib/*` functions (registration, enrolment, the capture pipeline, batches, custody), never raw SQL, so every row is anchored exactly as in production. Farmer names and identifiers are fictional and never public (EV16). Seeded demo passwords are generated into `DATA_DIR/seed-credentials.txt` (0600, git-ignored) and never printed to chat or logs. Seeded historical captures are signed by server-generated demo device keys kept in `DATA_DIR/seed-keys/` (used only by the seeder; the live demo phone enrols normally through the browser).

**TSK-20.1 · Seed data definition**
- **Files:** create `scripts/seed/data.ts`, `scripts/seed/data.test.ts`.
- **Produces:** `SEED` = `{ fpo:{name:'Hosahalli Coffee Growers FPO'}, buyer:{name:'Western Ghats Green Coffee (demo buyer)'}, users:[1 admin, 2 agents, 1 buyer], plots:[12 × {id, farmer, crop, district, centre:[lng,lat], areaHa, shape, profile}], history:[…], attacks:[4] }`.
- [ ] Write the failing test: ≥ 10 plots. Every centre lies inside a Kodagu or Chikkamagaluru bounding box (Kodagu ≈ lat 11.9–12.8, lng 75.4–76.2; Chikkamagaluru ≈ lat 12.9–13.6, lng 75.3–76.1), e.g. around Madikeri 12.42/75.74, Somwarpet 12.60/75.85, Virajpet 12.20/75.80, Suntikoppa 12.46/75.83, Chikkamagaluru 13.32/75.77, Mudigere 13.13/75.64. Areas span 0.4–5.5 ha, including one concave plot and one ≥ 4 ha plot. Arabica and robusta both present. One plot uses the adversarial `X01` profile (25 % loss) for the laundering attack. No farmer name appears in any field that feeds a ledger payload (`producerId` only).
- [ ] Run → fails; implement it (polygons from `evals/harness/fixtures.ts`'s generator for reproducibility); verify green.
- [ ] Commit: `Define the Hosahalli FPO demo data set (TASK-21)`

**TSK-20.2 · Seed runner**
- **Files:** create `scripts/seed.ts`, `scripts/seed/run.ts`, `scripts/seed/run.test.ts`; add `"seed": "tsx scripts/seed.ts"`.
- [ ] Write the failing integration test (TC-077) on a temp `DATA_DIR`. `runSeed()` creates the orgs, users, 12 plots (registration checks via the fixture provider), agent–plot assignments, enrolled devices, and ~30 legitimate captures through `runCapture()`, all Verified except the cloud-blocked plot's (Needs Review). It also creates one batch transferred to the buyer, so the buyer list and a certificate exist before the demo. Every provenance table's rows have a valid `anchor_seq`. Afterwards the full ledger chain and all checkpoints verify (`verifyLedger()`). A second `runSeed()` on the same `DATA_DIR` throws "not empty — use --reset"; `--reset` wipes `DATA_DIR/{udgam.db,media,seed-*}` and rebuilds with the same counts.
- [ ] Run → fails; implement it; verify green; `pnpm seed` from a clean clone prints only counts plus the credentials-file path.
- [ ] Commit: `Seed the Kodagu demo through the app's own functions (TASK-21)`

**TSK-20.3 · Staged attacks and the in-app way to submit them**
- **Files:** create `scripts/seed/attacks.ts` (writes `DATA_DIR/demo/attacks/{gps-spoof,replay,plot-laundering,yield-inflation}/{payload.json,signature.txt,photo*.jpg}` + `manifest.json`), `src/app/(admin)/admin/demo/page.tsx` + `actions.ts` (enabled only when `DEMO_MODE=1`; 404 otherwise), `src/app/(admin)/admin/demo/demo.test.ts`.
- [ ] Write the failing tests. With `DEMO_MODE` unset, `/admin/demo` → 404 and the action refuses. With it set, an admin sees four cards (composed per TP17, one pill each), and "Submit" posts the staged signed payload and photos through the same `/api/capture` handler (a server-side `fetch` to itself with the demo device's session), returning the verdict. Expected verdicts: gps-spoof → Needs Review with `geofence` fail; replay → Rejected with `photo_uniqueness` hard fail; plot-laundering → Rejected with `deforestation_overlap` hard fail (X01, 25.0 %); yield-inflation → Rejected with `yield_plausibility` hard fail. The attack payloads are signed at seed time by a seeded demo device assigned to the plots.
- [ ] Run → fails; implement it; verify green.
- [ ] Commit: `Stage the four demo attacks with an in-app submit page (TASK-21)`

**TSK-20.4 · Grow the legitimate set toward ≈ 40 (S2 realism)**
- **Files:** modify `evals/eval-dataset.json` (append legitimate cases from the next free EVAL ID, minor version bump), `docs/exec/hr3-field-calibration.md` (owner's HR3 measurements; if absent, write a `BLOCKED: HR3 pending` ledger row, use the evaluation-plan placeholders, and mark the added cases `"notes": "jitter from placeholder, recalibrate after HR3"`).
- [ ] Add cases so the legitimate class reaches ≈ 40 across P01–P10, with GPS accuracy, EXIF presence, EXIF time offset and file-size jitter drawn from HR3. Never change existing cases (CF-13).
- [ ] Verify: `pnpm eval:validate` green; `pnpm eval` S2 ≤ 5 %. Any new false positive is investigated and reported as a `QA-` row, never fixed by editing the case.
- [ ] Commit: `Extend the legitimate evaluation set to about 40 calibrated cases (TASK-21)`

**TSK-20.5 · Automated demo script (EVAL-073)**
- **Files:** create `e2e/demo.spec.ts`, `playwright.demo.config.ts` (projects `phone-375` 375×812 and `desktop-1280`; `webServer: pnpm seed --reset && pnpm build && DEMO_MODE=1 pnpm start`); add `"demo": "playwright test -c playwright.demo.config.ts"`.
- [ ] Write the test (`@eval EVAL-073`, TC-078) with two browser contexts: an admin on desktop and an agent phone (mocked geolocation inside the new plot, fixture photos with matching EXIF). Steps, each a `test.step` with its timestamp: admin registers a plot by upload → admin assigns it and issues an enrolment code → the phone enrols → the phone captures and sees Verified → admin builds a batch from Verified pickings → admin transfers it to the buyer → the buyer opens the certificate from the batch QR URL → the proof panel reaches `verified` → the GeoJSON downloads. No DB access outside the app. Total wall time < 10 min at both widths. Step timings are written to `evals/results/local/demo-run-<sha>.json`.
- [ ] Run → fails until the flow works; fix only through the owning tickets' code (log the needed fixes as ledger rows).
- [ ] Verify: `pnpm demo` green on both projects.
- [ ] Commit: `Automate the grant demo end to end at phone and desktop widths (TASK-21)`

**TSK-20.6 · The four attacks show their evidence (EVAL-074)**
- **Files:** create `e2e/demo-attacks.spec.ts`.
- [ ] Write the test (`@eval EVAL-074`): submit each staged attack from `/admin/demo`. Then assert that the review detail (Needs Review) or the event detail (Rejected) shows the catching check's evidence containing, respectively, "m outside the plot edge", "photos seen before", "% of plot area lost since 2021" with "25.0%", and "x the reference upper bound". The verdict words are the system states on admin surfaces.
- [ ] Verify: green in `pnpm demo`.
- [ ] Commit: `Assert each demo attack shows the evidence that caught it (TASK-21)`

**Done gate (TKT-20):**
| AC | Evidence |
|---|---|
| Seed: 1 FPO, 1 buyer, ≥ 10 Kodagu plots, agents, devices, legitimate history, four attacks ready | TC-077 (TSK-20.1–20.3) |
| Playwright demo (register → capture → verdict → batch → transfer → certificate verified) at 375 and 1280 | TC-078, EVAL-073 (TSK-20.5) |
| The four attacks show the evidence that caught them | EVAL-074 (TSK-20.6) |
| Legitimate set ≈ 40 before baseline-v1 | TSK-20.4, `pnpm eval` S2 |

---

### TKT-21 → TASK-22 · M-001 evaluation run, baseline-v1 and gate review (sp 3 · P0 · Task)
**Depends on:** TKT-18, TKT-20 and every M-001 ticket (TASK-2..21) · **TC:** TC-079 · **EVAL:** every M1 case; gates S1, S2, S4, S6, S7; CF-01..CF-14 · **Owns files:** `evals/results/{eval-run-v1*,baseline-v1,baseline-perf-v1}.json`, `evals/reports/eval-report-v1*.md`, `tests/config-freeze.test.ts`, `docs/exec/m-001-gate.md`, the `--baseline` flag in `evals/harness/run.ts`
**Brief for the implementer:** This ticket measures. It never tunes. Thresholds, weights, verdict rules, case classes and expected verdicts are frozen. A failure becomes a Bug row, not a config change (EV13, CF-13). Every number in the report must come from a results file produced in this run (CF-12). Run on a clean tree at the gate commit.

**TSK-21.1 · Pre-gate readiness check**
- **Files:** create `evals/harness/readiness.ts`, `evals/harness/readiness.test.ts`; add `"eval:ready": "tsx evals/harness/readiness.ts"`.
- [ ] Write the failing test for `checkReadiness(dataset, registry)`: it fails unless all twelve checks are registered, scenarios 1–4 each have ≥ 10 active attack cases, the legitimate class has ≥ 35 active cases, no active case is `not_yet_implemented`, and `docs/exec/hr3-field-calibration.md` exists (else a warning line that the report must print).
- [ ] Run → fails; implement it; run `pnpm eval:ready` on the branch. If not ready, write BLOCKED ledger rows naming the gaps and stop.
- [ ] Commit: `Check M-001 evaluation readiness before the gate run (TASK-22)`

**TSK-21.2 · Baseline freeze guard**
- **Files:** modify `evals/harness/run.ts` (add `--baseline=v1`, which writes the formal run and a copy at `evals/results/baseline-v1.json` and refuses to overwrite an existing baseline); create `tests/config-freeze.test.ts`.
- [ ] Write the failing test: when `evals/results/baseline-v1.json` exists, `CONFIG_HASH` must equal its `provenance.config.hash`, unless `evals/config-changes.md` lists the new hash with a TP/EV decision ID and ≥ 2 new attack-case IDs per affected scenario that already exist in the dataset (EV13).
- [ ] Run → passes vacuously (no baseline yet); assert it fails with a planted fake baseline carrying a different hash; implement; verify.
- [ ] Commit: `Guard the frozen verification config after baseline-v1 (TASK-22)`

**TSK-21.3 · Formal harness run and baseline-v1**
- [ ] On the clean gate commit: `pnpm install --frozen-lockfile && pnpm eval --baseline=v1`. It writes `evals/results/eval-run-{appVersion}-{sha}.json`, `evals/results/baseline-v1.json` and `evals/reports/eval-report-{…}.md`. Check S1 pooled ≥ 95 % and each scenario ≥ 90 %, S2 ≤ 5 %, S6-lib 100 % coverage and tamper rejection by both verifiers, S7 (totals reconcile, `skipped = 0`), and no CF.
- [ ] Verify: `tsx evals/harness/report.ts evals/results/baseline-v1.json` regenerates a byte-identical report (TC-016).
- [ ] Commit: `Record the M-001 formal evaluation run and freeze baseline-v1 (TASK-22)`

**TSK-21.4 · Integration and e2e EVAL suites into the release result**
- [ ] Run `pnpm eval:release --milestone=M1`, which executes `pnpm eval:integration` and `pnpm eval:e2e` and merges them with the harness results into `evals/results/eval-run-v1-release-{sha}.json` and `evals/reports/eval-report-v1.md`. Every M1 EVAL case in the dataset appears with a status (the reconciliation is checked by the harness-integrity scorer); manual/perf M3 cases are listed as `deferred to M-003` with the ticket.
- [ ] Commit: `Record the M-001 release evaluation across all suites (TASK-22)`

**TSK-21.5 · S4 formal measurement → baseline-perf-v1**
- [ ] `pnpm build && pnpm start` in the VM (production build, seeded 50-event batch from `evals/perf/fixtures.ts`), then `pnpm eval:perf --target=http://localhost:3000 --only=s4 --runs=10`. Each of the 10 cold loads must be < 3 s and end `verified` (EVAL-071). Write `evals/results/baseline-perf-v1.json` with the S4 section only (S3 is added in TKT-29 on Oracle), including provenance and hardware (the VM's CPU and arch; the report notes that it is not the Oracle A1).
- [ ] Commit: `Record the S4 certificate latency baseline (TASK-22)`

**TSK-21.6 · Failures, owner reviews and the gate report**
- [ ] For each failed gate, CF or failed case, add a ledger row `BUG · <case/TC> · <observed> · <suspected owner ticket>` for the local session to create as a Campfire bug (`type bug`, P0/P1, linked to the case). Do not change thresholds or cases.
- [ ] Prepare the owner items in `docs/exec/m-001-gate.md`: HR2 (the known-limitations and pruning/clearing-pair wording, as printed in the report, for approval), HR6 (every number in the scorecard traced to its results file and line), HR1 (the evidence-template snapshots from TC-011 for the rubric), and the list of `REVIEW: native speaker` Kannada keys.
- [ ] Write the gate report: gate table (value, threshold, pass), eval deltas vs baseline-v0, TCs passed and failed, screenshots vs `final/`, and open issues. Push. **Stop for the owner's M-001 approval.**
- [ ] Commit: `Report the M-001 gate for owner review (TASK-22)`

**Done gate (TKT-21):**
| AC | Evidence |
|---|---|
| `eval-run-v1.json` + `eval-report-v1.md` from real output | TSK-21.3/21.4, TC-079, TC-016 |
| S1 (≥ 95 % pooled, ≥ 90 % per scenario), S2, S4, S6, S7 met | the gate table in `docs/exec/m-001-gate.md`, each value from a results file |
| CF-01..CF-14 clear | critical-conditions scorer output |
| baseline-v1 frozen (EV13) | `baseline-v1.json` + TSK-21.2 guard |
| Failures open Bug tickets; thresholds never lowered | TSK-21.6 ledger rows → Campfire bugs (local sync) |


### TKT-22 → TASK-23 · Spike: Foundry and Anvil in the cloud VM and on ARM (sp 2 · P2 · Spike)
**Depends on:** TKT-01 (TASK-2) · **TC:** — · **EVAL:** — (feeds EVAL-093–104) · **Owns files:** `docs/spikes/foundry.md`, `scripts/cloud-setup.sh` (Foundry block only)
**Brief for the implementer:** answer one question in writing: does Foundry install and does Anvil run (a) in the claude.ai/code VM (x86_64) and (b) on linux/arm64? Research (Stage 6) found release **v1.8.3** (2026-09-15) ships `foundry_v1.8.3_linux_amd64.tar.gz` and `foundry_v1.8.3_linux_arm64.tar.gz` (asset named `arm64`, not `aarch64`), each with a sha256 and a sigstore attestation. Confirm this, don't assume it. All code is throwaway except the setup-script block.

**TSK-22.1 · Install pinned Foundry in the VM**
- **Files:** none committed (scratch under `/tmp/foundry-spike`)
- [ ] Download `foundry_v1.8.3_linux_amd64.tar.gz` and its `.sha256` from the GitHub release. Check the digest with `sha256sum -c`, then extract to `~/.foundry/bin`.
- [ ] Verify: `forge --version`, `anvil --version` and `cast --version` all print 1.8.3. Record the exact output.

**TSK-22.2 · Anvil smoke test in the VM**
- [ ] Run `anvil --port 8545 --silent &`, then `cast block-number --rpc-url http://127.0.0.1:8545` (expect `0`) and `cast send` a value transfer between two default dev accounts. Kill anvil.
- [ ] `forge init --no-git /tmp/foundry-spike/c && cd $_ && forge test` passes. This also shows whether `forge-std` fetches through the network allow-list. If it doesn't, record the host that needs adding.

**TSK-22.3 · linux/arm64 check**
- [ ] If the VM has `docker buildx` + QEMU, run the arm64 tarball's `anvil --version` inside `--platform linux/arm64 debian:bookworm-slim`. Otherwise record the arm64 asset name + sha256 from the release and mark the on-hardware check **deferred to TKT-27 (TSK-27.1)**. Don't mark it passed.
- [ ] Record whether an official multi-arch container image exists. If that can't be confirmed, TKT-27 builds its own anvil image from the tarball.

**TSK-22.4 · Write the answer; extend setup only if it worked**
- **Files:** create `docs/spikes/foundry.md`; modify `scripts/cloud-setup.sh`
- [ ] `foundry.md` covers: versions, exact install commands, digests, network hosts needed, the x86 result, the arm64 result (or "deferred") and blockers. It ends with a GO / NO-GO for M-002.
- [ ] On GO, add an idempotent block to `cloud-setup.sh`: skip if `forge --version` already reports 1.8.3; otherwise download, verify the sha256 and extract. Run it twice. The second run prints "foundry 1.8.3 already installed" (keeps TC-002 green).
- [ ] Verify: `bash scripts/cloud-setup.sh && bash scripts/cloud-setup.sh && forge --version`.
- [ ] Commit: `Record Foundry spike result and add pinned Foundry to cloud setup (TASK-23)`

**Done gate:** `docs/spikes/foundry.md` answers both environments (or marks arm64 deferred with the reason). TC-002 still passes. A NO-GO stops M-002 and opens a decision for the owner.

---

### TKT-23 → TASK-24 · Design addendum for contract-farming and processor screens (sp 3 · P2 · Docs)
**Depends on:** — (runs as a short **Stage 4 re-entry**, skill `bw-ui-ux-design`; owner gate) · **TC:** — · **EVAL:** EVAL-105 (made concrete here) · **Owns files:** `Design.md` (new §28 only), `.design/exploration/final/contract.html`, `decisions.md` (one D# entry)
**Brief for the implementer:** M-002 screens are not in the frozen design (Design.md scope-change rule). Add them in the frozen visual language without touching any frozen M-001 item. No product code. The ticket is done only when the owner approves.

**TSK-23.1 · Screen inventory from F17/F18**
- **Files:** `Design.md` §28 (draft)
- [ ] List every screen and state. Buyer: agreement list, new agreement (crop, agreed kg, minimum grade, amount in mock INR, deadline), fund, give a quality grade for a delivered batch. Admin (FPO): agreement detail with a settlement panel showing the three conditions, each as value vs threshold. Processor: record a processing step (process, input kg, output kg) and hand on. Certificate: the extra journey step. Also the processor role's entry point: a new `/processor` surface or a scoped admin view. Recommend one and record it for D9.
- [ ] Grade scale: recommend a numeric 0–100 grade that the app maps from labels. The contract stores a `uint8`.

**TSK-23.2 · Mockups in the frozen language**
- **Files:** create `.design/exploration/final/contract.html`, reusing `final/admin.html` `:root` tokens and components verbatim
- [ ] All four states per data view; 375/768/1440; no new colours, radii, type sizes or motion (TP17). Settlement "released" uses `--ok`. "Not released" uses `--check` and names the failing condition(s). Never use accusation words.
- [ ] Verify: open at the three widths. No horizontal scroll; axe is clean on the static page.

**TSK-23.3 · Addendum text + EVAL-105 detail**
- [ ] Design.md §28: IA additions, components used, states table, copy. State that the certificate journey step reuses the existing journey component (content change, not a freeze change).
- [ ] Tighten EVAL-105's `expected.behavior` with the concrete screen list. This is a dataset patch version (wording only).

**TSK-23.4 · Owner approval**
- [ ] Present the mockup to the owner. On approval, append `D9 · M-002 screens addendum — accepted` to `decisions.md` (context / decision / rejected).
- [ ] Commit: `Add approved M-002 design addendum for agreements, settlement and processing (TASK-24)`

**Done gate:** D9 is recorded as accepted. The mockup covers every screen from TSK-23.1 in four states. Until D9 exists, TKT-25/26 UI tasks (TSK-25.8, TSK-26.5) are blocked.

---

### TKT-24 → TASK-25 · EVM ledger adapter and BatchRegistry contract (sp 5 · P2 · Feature)
**Depends on:** TKT-15 (TASK-16), TKT-22 (TASK-23, GO) · **TC:** TC-082, TC-083 · **EVAL:** EVAL-103, EVAL-104 (+ re-run of EVAL-058–063) · **Owns files:** `contracts/**`, `src/lib/ledger/evm/**`, `src/lib/db/migrations/*_evm_anchors.sql`, `docs/proof-feed.md` (EVM section), `.github/workflows/contracts.yml`
**Brief for the implementer:** the same `Ledger` interface (§8.1) also writes each entry hash to `BatchRegistry` on Anvil. The hash-chain store stays the payload system of record. On-chain anchoring happens **after** the DB commit, in strict seq order. The DB transaction can't include a chain transaction, so an anchor can be briefly pending. Proofs say so honestly. Anvil is a local dev chain, not a public blockchain (mainnet is out of scope, Solution-PRD §10).

**TSK-24.1 · Foundry project scaffold**
- **Files:** create `contracts/foundry.toml` (solc pinned, `optimizer=true`), `contracts/remappings.txt`, `contracts/lib/forge-std` (via `forge install foundry-rs/forge-std --no-git`, pinned tag), `contracts/.gitignore` (`out/`, `cache/`, `broadcast/`)
- [ ] Verify: `cd contracts && forge build` succeeds.
- [ ] Commit: `Scaffold Foundry project for M-002 contracts (TASK-25)`

**TSK-24.2 · BatchRegistry, test first (TC-082)**
- **Files:** create `contracts/test/BatchRegistry.t.sol`, `contracts/src/BatchRegistry.sol`
- **Produces:** `constructor(address operator)`; `append(uint64 seq, bytes32 entryHash)` (operator only; requires `seq == nextSeq`; emits `EntryAnchored(seq, entryHash)`); `entryHash(uint64) view`; `nextSeq() view`. There is no update path, so there is no overwrite.
- [ ] Write failing tests: non-operator reverts; an out-of-order seq reverts; re-appending an existing seq reverts; read-back equals written; the event is emitted.
- [ ] Implement it minimally. Verify: `forge test --match-contract BatchRegistry -vv` green.
- [ ] Commit: `Add BatchRegistry contract with strict in-order append (TASK-25)`

**TSK-24.3 · Deploy script and operator key**
- **Files:** create `contracts/script/Deploy.s.sol`, `scripts/evm-deploy.ts`; modify `package.json` (`contracts:build`, `contracts:test`, `contracts:deploy`), `src/lib/config/env.ts` (`LEDGER_ADAPTER`, `ANVIL_RPC_URL`, `EVM_OPERATOR_KEY_PATH`)
- **Produces:** `DATA_DIR/evm/deployment.json` `{chainId, registry, operator, deployedAtBlock}` (git-ignored). The operator key is generated at `EVM_OPERATOR_KEY_PATH` (default `DATA_DIR/keys/evm-operator.key`, 0600) and funded from Anvil's dev account on local Anvil only. Anvil's public default keys are never used as the operator outside tests.
- [ ] Verify: with anvil running, `pnpm contracts:deploy` writes the file; running it again with an existing deployment is a no-op.
- [ ] Commit: `Add Anvil deployment script with a generated operator key (TASK-25)`

**TSK-24.4 · ABI and viem client**
- **Files:** create `src/lib/ledger/evm/abi/BatchRegistry.json` (from `forge inspect BatchRegistry abi`, committed), `src/lib/ledger/evm/client.ts`
- **Produces:** `createRegistryClient({rpcUrl, deployment, operatorKey})` → `{ append(seq, entryHash), entryHash(seq), nextSeq() }` over viem `createWalletClient`/`createPublicClient`. The viem version is pinned in `package.json` and recorded in §0.
- [ ] Integration test (`vitest --project evm`, global setup starts anvil on a random port and deploys): append then read back. If `anvil` isn't on PATH the project **fails** with a message. It never skips silently.
- [ ] Commit: `Add viem client for BatchRegistry (TASK-25)`

**TSK-24.5 · `evm_anchors` table**
- **Files:** `src/lib/db/schema.ts`, `src/lib/db/migrations/*_evm_anchors.sql`
- **Produces:** `evm_anchors(seq INTEGER PRIMARY KEY REFERENCES ledger_entries(seq), status TEXT CHECK(status IN ('pending','anchored','failed')), chain_id, contract, tx_hash, block_number, attempts, last_error, updated_at)`; append-only-ish trigger: `tx_hash` is immutable once set.
- [ ] Test: inserting for a missing seq fails (FK); updating a set `tx_hash` aborts.
- [ ] Commit: `Add evm_anchors table for on-chain anchoring state (TASK-25)`

**TSK-24.6 · EVM adapter implementing `Ledger`**
- **Files:** create `src/lib/ledger/evm/adapter.ts`, `src/lib/ledger/evm/adapter.test.ts`; modify `src/lib/ledger/index.ts` (select the adapter by `LEDGER_ADAPTER`)
- **Produces:** `append(tx, kind, payload)` delegates to the hash-chain adapter and inserts `evm_anchors(status='pending')` in the same DB transaction. `anchorPending()` runs after commit: it sends pending rows in ascending seq, marks them `anchored` with `tx_hash`/`block_number`, and stops at the first failure (order preserved). It runs on startup and before any proof is built. `getProof` adds `evm: {chainId, contract, txHash, blockNumber}` when anchored, or `evm: {status:'pending'}`.
- [ ] Failing tests first: 5 appends → 5 on-chain hashes equal `entry_hash`; kill anvil mid-run → rows stay `pending`, restart → they anchor in order; the hash-chain adapter's existing tests pass unchanged with `LEDGER_ADAPTER=hashchain`.
- [ ] Commit: `Add EVM ledger adapter that anchors entry hashes after commit (TASK-25)`

**TSK-24.7 · Proof feed EVM extension**
- **Files:** `src/lib/ledger/feed.ts`, `docs/proof-feed.md` (new "EVM extension" section), `evals/scorers/independent-verifier/*` (only an ignore-unknown-optional-field test)
- [ ] Per entry, the feed adds an optional `evm` object. The format string stays `udgam-proof-feed/1`, because the extension is additive and optional. The doc explains how a third party checks `entryHash(seq)` on the registry given RPC access. It also states that the demo Anvil RPC is not public, so browser-side on-chain checking is out of scope.
- [ ] Test: the clean-room checker still verifies a feed that carries `evm` fields (TC-073 unchanged).
- [ ] Commit: `Document and serve the optional EVM proof fields (TASK-25)`

**TSK-24.8 · EVAL-103 and EVAL-104 runners**
- **Files:** `evals/harness/run.ts` (`--ledger=evm` flag: start anvil, deploy, build the proof suite on the EVM adapter), create `scripts/ledger-audit.ts` + `package.json` `ledger:audit`
- [ ] EVAL-103: `pnpm eval --ledger=evm` runs EVAL-058–063 on the EVM adapter and asserts every in-scope entry has `evm.txHash`/`blockNumber` matching the chain.
- [ ] EVAL-104: `ledger:audit` compares every `ledger_entries.entry_hash` with `registry.entryHash(seq)` and exits non-zero naming mismatched seqs. The integration test temporarily drops the append-only trigger in a **test DB only**, alters a payload/entry hash, and expects a mismatch report.
- [ ] Verify: `pnpm eval --ledger=evm` exits 0 and the results provenance shows `ledger adapter: evm`.
- [ ] Commit: `Run the proof suite on the EVM adapter and add ledger audit (TASK-25)`

**TSK-24.9 · CI for contracts and EVM**
- **Files:** create `.github/workflows/contracts.yml` (`foundry-rs/foundry-toolchain` pinned to v1.8.3; `forge test`; `pnpm vitest --project evm`; `pnpm eval --ledger=evm`), path-filtered on `contracts/**`, `src/lib/ledger/**`
- [ ] Verify: the workflow is green on the branch.
- [ ] Commit: `Add CI job for Foundry tests and EVM proof suite (TASK-25)`

**Done gate:** AC "adapter switchable by config" → TSK-24.6; "hash-chain store remains payload system of record" → TSK-24.6; "Foundry tests" → TC-082; "M-001 proof and tamper cases pass against the EVM adapter" → TC-083, EVAL-103; tamper-after-anchor detection → EVAL-104. `LEDGER_ADAPTER=hashchain` M-001 regression (`pnpm eval`, `pnpm test`) is still green.

---

### TKT-25 → TASK-26 · Contract-farming escrow with automatic settlement (sp 8 · P2 · Feature)
**Depends on:** TKT-14 (TASK-15), TKT-23 (TASK-24, D9 approved), TKT-24 (TASK-25) · **TC:** TC-084, TC-085 · **EVAL:** EVAL-093–099, EVAL-105 · **Owns files:** `contracts/src/{MockINR,ContractFarming}.sol`, `contracts/test/{MockINR,ContractFarming}.t.sol`, `src/lib/agreements/**`, `src/lib/db/migrations/*_agreements.sql`, `src/app/(buyer)/buyer/agreements/**`, `src/app/(admin)/admin/agreements/**`
**Brief for the implementer:** a buyer funds an agreement in mock INR. Payment releases to the FPO only when delivered kg ≥ agreed kg, the buyer's signed grade ≥ the minimum, and every included picking is Verified. The contract enforces the arithmetic and the signatures. Two things are trusted, stated plainly in docs and UI: **delivered kg and "all Verified" come from the server operator's attestation** (the operator is the only settle caller), and the **buyer's grade is signed by a server-held key for the buyer org** (TP15 pattern: it proves which account decided, not a personal device key).

**TSK-25.1 · MockINR, test first**
- **Files:** `contracts/test/MockINR.t.sol`, `contracts/src/MockINR.sol` (ERC-20, 2 decimals = paise, `mint` operator-only, forge-std/OpenZeppelin pinned via `forge install --no-git`)
- [ ] Tests: only the operator mints; transfer/approve behave like ERC-20; `decimals() == 2`. Verify `forge test --match-contract MockINR`.
- [ ] Commit: `Add mock INR ERC-20 token for escrow tests (TASK-26)`

**TSK-25.2 · ContractFarming state and funding, test first**
- **Files:** `contracts/test/ContractFarming.t.sol`, `contracts/src/ContractFarming.sol`
- **Produces:** `createAgreement(bytes32 id, address buyer, address buyerAttestor, address fpoPayee, uint256 agreedGrams, uint8 minGrade, uint256 amount, uint64 deadline)` (operator); `fund(bytes32 id)` (buyer, `transferFrom` of `amount`); states `Created → Funded → Settled | Refunded`; `refund(bytes32 id)` after `deadline` by the buyer if not settled. Refund is the minimum escape so escrow can't lock forever.
- [ ] Tests: double fund reverts; fund by a non-buyer reverts; refund before the deadline reverts; refund after returns exactly `amount`.
- [ ] Commit: `Add ContractFarming agreements with funding and deadline refund (TASK-26)`

**TSK-25.3 · Settlement conditions, all 8 combinations (TC-084; EVAL-093–099)**
- **Files:** same two
- **Produces:** `settle(bytes32 id, bytes32 batchIdHash, uint256 deliveredGrams, bool allVerified, uint8 grade, bytes gradeSig)` operator-only. It verifies `gradeSig` as EIP-712 `QualityGrade(bytes32 agreementId, bytes32 batchIdHash, uint8 grade)` recovered to `buyerAttestor`. If `deliveredGrams ≥ agreedGrams && grade ≥ minGrade && allVerified`, it transfers `amount` to `fpoPayee`, sets `Settled` and emits `Settled`. Otherwise it emits `SettlementRejected(id, reasonsBitmask)` and stays `Funded` (a later delivery may settle). Any call on a non-Funded agreement reverts.
- [ ] Failing tests: a table-driven test over the 8 (qty, grade, verified) combinations, where only all-true transfers (EVAL-093; 094/095/096 are single-false rows); a second settle after success reverts and the balance moves once (EVAL-097); a non-operator caller reverts (EVAL-098); a signature by the wrong key or over a different grade → revert `BadGradeSignature` (EVAL-099); settle on `Created` (unfunded) reverts; token balances reconcile after every test.
- [ ] Verify: `forge test --match-contract ContractFarming -vv`.
- [ ] Commit: `Enforce three-condition settlement with EIP-712 grade attestation (TASK-26)`

**TSK-25.4 · Schema and ledger kinds**
- **Files:** `src/lib/db/schema.ts`, `src/lib/db/migrations/*_agreements.sql`, `src/lib/ledger/types.ts`
- **Produces:** `agreements(id, chain_id_hex, buyer_org, fpo_org, crop, agreed_kg, min_grade, amount_paise, deadline, status created|funded|settled|refunded, anchor_seq fk)`, `quality_attestations(id, agreement_id, batch_id, grade, signer_org, eip712_sig, anchor_seq fk)`, `settlements(id, agreement_id, batch_id, delivered_kg, all_verified, grade, outcome released|not_released, reasons json, tx_hash, block_number, anchor_seq fk)`. New anchor kinds: `agreement_created, agreement_funded, quality_attestation, settlement`. Anchor FK triggers follow §4.2.
- [ ] Test: each insert without an anchor fails; the ledger kind list and the closure builder include the new kinds (a batch's certificate shows its settlement).
- [ ] Commit: `Add agreement, attestation and settlement tables with anchors (TASK-26)`

**TSK-25.5 · Buyer-org EVM attestor keys**
- **Files:** `src/lib/agreements/attestor-keys.ts`
- **Produces:** a secp256k1 key per buyer org at `DATA_DIR/keys/evm/<orgId>.key` (0600, generated on first use, never logged); `signGrade(orgId, {agreementId, batchIdHash, grade})` → EIP-712 signature via viem `signTypedData`.
- [ ] Test: the signature recovers to the org's address; the key file mode is 0600; logs don't contain the key (redaction test).
- [ ] Commit: `Add server-held attestor keys for buyer quality grades (TASK-26)`

**TSK-25.6 · Settlement service (the oracle)**
- **Files:** `src/lib/agreements/settle.ts`, `src/lib/agreements/settle.test.ts`
- **Produces:** `settleBatch(agreementId, batchId)`: reads the batch's quantity and every event's `final_verdict` from the DB, builds `allVerified`, fetches the latest signed grade, calls `settle` through viem, and records `settlements` + anchors in one DB transaction after the receipt. `reasons` names each failed condition with value vs threshold, e.g. `Delivered 598.5 kg of 600.0 kg agreed`.
- [ ] Integration tests (`--project evm`) for EVAL-093–099 end to end through the service. Each dataset case's runner lives in `evals/harness/m2/settlement.ts` and is titled with its EVAL ID.
- [ ] Commit: `Add settlement service that attests delivery and verification on chain (TASK-26)`

**TSK-25.7 · Server Actions**
- **Files:** `src/lib/agreements/actions.ts` (called from route groups), guards per §10
- **Produces:** buyer: create + fund agreement, submit a grade; admin (FPO): settle. Org-scoped; cross-org → 404 (TC-019 pattern).
- [ ] Tests: role/org guard matrix added to `tests/guard-coverage.test.ts`.
- [ ] Commit: `Add guarded agreement and settlement actions (TASK-26)`

**TSK-25.8 · Agreement and settlement screens (blocked until D9)**
- **Files:** `src/app/(buyer)/buyer/agreements/{page,new/page,[id]/page}.tsx`, `src/app/(admin)/admin/agreements/[id]/page.tsx`
- [ ] Port from the approved `final/contract.html`, with four states, i18n keys, and the settlement panel listing each condition with value and threshold.
- [ ] e2e `e2e/m2-agreements.spec.ts` tagged `@eval EVAL-105`: 375/768/1440 no horizontal scroll, axe clean, all states (TC-085).
- [ ] Commit: `Build agreement and settlement screens from the M-002 addendum (TASK-26)`

**Done gate:** "`ContractFarming` + mock ERC-20 INR with Foundry tests for every condition combination" → TC-084 (TSK-25.3); "buyer quality attestation signed" → TSK-25.5 + EVAL-099; "agreement and settlement screens per TKT-23" → TC-085, EVAL-105; "no release on any failed condition" → EVAL-094–096. EVAL-093–099 pass under `pnpm eval:integration`. M-001 regression green.

---

### TKT-26 → TASK-27 · Processor hop with a mass-balance check (sp 5 · P2 · Feature)
**Depends on:** TKT-14 (TASK-15), TKT-23 (TASK-24, D9), TKT-24 (TASK-25) · **TC:** TC-086 · **EVAL:** EVAL-100, 101, 102 · **Owns files:** `src/lib/processing/**`, `src/lib/db/migrations/*_processing.sql`, the processor surface chosen in D9
**Brief for the implementer:** a transferred batch can go FPO → processor → buyer. The processor records one step (pulping, drying or hulling) with input and output kg. An output/input ratio outside the configured band for that process is **flagged** with an evidence sentence. Nothing is rejected. The step is signed (TP15 pattern) and anchored, and the certificate journey shows it.

**TSK-26.1 · Mass-balance config `mb-1` with sources**
- **Files:** create `src/lib/processing/config.ts`
- **Produces:** `{version:'mb-1', bands:{ hulling_parchment:{arabica:[..],robusta:[..]}, hulling_dry_cherry:{…}, pulping:{…}, drying:{…} }, source:{…}}` plus a JCS hash (printed in eval provenance). Seed values with sources: Coffee Board Annual Report 2022-23 (CCRI) outturns (clean as a share of dry parchment 80 % Arabica / 85 % Robusta; of dry cherry 53.5 % / 52.7 %) with a ±5-point band. Stage 6 found no Coffee Board figure for pulping/drying (fresh cherry → parchment/dry cherry), so those bands are marked `source:'placeholder — owner to confirm'`. The UI evidence says "placeholder band" until confirmed.
- [ ] Unit test: the config hash is stable, and every band has `min < max` and a `source`.
- [ ] Commit: `Add versioned mass-balance bands with cited outturn figures (TASK-27)`

**TSK-26.2 · Mass-balance rule + evidence, test first (EVAL-100–102)**
- **Files:** `src/lib/processing/mass-balance.ts`, `.test.ts`
- **Produces:** `checkMassBalance({process, crop, inputKg, outputKg}) → {status:'ok'|'flag', ratio, band, evidence}`. Evidence reads `Output {out} kg is {r}% of input {in} kg (expected {min}–{max}% for {process})`, with r to one decimal.
- [ ] Tests: inside the band → ok (EVAL-100); below → flag (EVAL-101); output > input → flag with "gain" wording (EVAL-102); band edges inclusive.
- [ ] Commit: `Add mass-balance rule with value-and-band evidence (TASK-27)`

**TSK-26.3 · Schema, role and anchors**
- **Files:** `src/lib/db/schema.ts`, `src/lib/db/migrations/*_processing.sql`, `src/lib/ledger/types.ts`
- **Produces:** `processing_steps(id, batch_id, processor_org, process, input_kg, output_kg, ratio, band_min, band_max, status, evidence, config_version, signature, key_id, anchor_seq fk)`, new kind `processing_step`. If D9 chose a `processor` role, the `user.role` CHECK is extended to include it. Custody FPO → processor and processor → buyer reuse `custody_transfers` (the §4.2 lock blocks batch edits, not later custody rows). A processing step is allowed only while the processor org is the current holder (trigger).
- [ ] Tests: a step by a non-holder aborts; a missing anchor aborts; the closure builder includes `processing_step` entries. Update `docs/proof-feed.md` and evaluation-plan §4.6's closure list (artifact-sync chain).
- [ ] Commit: `Add signed, anchored processing steps held by the processor (TASK-27)`

**TSK-26.4 · Processing action**
- **Files:** `src/lib/processing/actions.ts`
- [ ] Guarded, org-scoped action: record the step → run `checkMassBalance` → sign → anchor, all in one transaction. The integration test runs the EVAL-100–102 flows through the action (`evals/harness/m2/mass-balance.ts`, titled with EVAL IDs).
- [ ] Commit: `Add guarded processing-step action with mass-balance flagging (TASK-27)`

**TSK-26.5 · Processor screen and certificate step (blocked until D9)**
- **Files:** processor route per D9; `src/app/(public)/verify/[batchId]/journey.tsx` (add a `processing_step` item renderer only)
- [ ] Port from `final/contract.html`. The certificate journey shows "Hulled at <processor> · 600.0 kg in, 480.0 kg out (80.0%)" with the flag state in `--check` when flagged. The certificate derives it from the feed only (TP16).
- [ ] e2e `e2e/m2-processing.spec.ts`: record a step, see the flag, the certificate shows the step and still verifies (TC-086; the TC-065 intact path is still green).
- [ ] Commit: `Show the processor step on the certificate and add its screen (TASK-27)`

**Done gate:** "processor custody transfer signed and anchored" → TSK-26.3/26.4; "configurable mass-balance band per process" → TSK-26.1; "outside-band flagged with an evidence sentence" → EVAL-101/102; "certificate journey shows the extra step" → TC-086. M-001 regression green.

---

### TKT-27 → TASK-28 · Oracle Cloud Always Free deployment (sp 5 · P1 · Chore)
**Depends on:** TKT-21 (TASK-22; M-001 gate) and the Stage 10 QA gate. **Owner preconditions:** an Oracle Cloud account with an **A1 Flex instance (2 OCPU / 12 GB, Ubuntu 24.04 aarch64)** already provisioned, plus a block volume; the domain registered (`udgamtrace.in` or `udgam.co.in`) with an A record to the instance's public IP; VCN security list ingress 80/443; SSH access for the session operator; an OCI Object Storage bucket + dynamic group/policy for instance-principal writes; an `age` public key from the owner for backup encryption. · **TC:** TC-087, TC-088, TC-089 · **EVAL:** — (enables EVAL-070, 072, 085, 090) · **Owns files:** `deploy/**`, `scripts/deploy.sh`, `next.config.ts` (`output:'standalone'` only)
**Brief for the implementer:** app + Caddy (+ Anvil under a Compose profile once M-002 ships) on the owner's A1 instance, HTTPS on the domain, data and keys on the block volume, encrypted off-instance backups, and a one-command redeploy with rollback. Images are built **on the instance** (native arm64, no QEMU). This ticket runs against real infrastructure, so every step records evidence in `docs/exec/ledger.md`.

**TSK-27.1 · App image (linux/arm64)**
- **Files:** create `deploy/Dockerfile`, `deploy/entrypoint.sh`, `.dockerignore`; modify `next.config.ts` (`output:'standalone'`)
- **Produces:** multi-stage `node:22-bookworm-slim`: deps (`pnpm install --frozen-lockfile`) → build → runtime (standalone output, non-root `udgam` user, `/data` volume). Stage 6 research confirmed that `sharp@0.35.5` ships `@img/sharp-linux-arm64`. The entrypoint runs `drizzle-kit migrate` (the forward-only migrations fail boot loudly), then `node server.js`.
- [ ] Verify on the instance: `docker build -f deploy/Dockerfile -t udgam-app:$(git rev-parse --short HEAD) .` succeeds; `docker run --rm udgam-app:<sha> node -e "require('sharp')"` exits 0; `uname -m` inside prints `aarch64`. Also run the deferred TKT-22 arm64 anvil check here if it was deferred.
- [ ] Commit: `Add arm64 production image with migrations at boot (TASK-28)`

**TSK-27.2 · Compose stack**
- **Files:** create `deploy/docker-compose.yml`, `deploy/anvil.Dockerfile` (from the verified `foundry_v1.8.3_linux_arm64.tar.gz`, sha256-checked)
- **Produces:** services `app` (`env_file: /etc/udgam/app.env`, volume `/mnt/udgam-data:/data`, healthcheck on `/api/health`, logging `json-file` max-size 10m × 14 files), `caddy` (`caddy:2`, ports 80/443, volumes for `caddy_data`/`caddy_config`), `anvil` under `profiles:[evm]` with state persisted to `/data/anvil` (`--state`). `restart: unless-stopped` on all.
- [ ] Verify: `docker compose -f deploy/docker-compose.yml config` is valid; `up -d`; `docker compose ps` all healthy.
- [ ] Commit: `Add Compose stack for app, Caddy and optional Anvil (TASK-28)`

**TSK-27.3 · Caddy with HTTPS and streaming**
- **Files:** create `deploy/Caddyfile`
- **Produces:** `{$UDGAM_DOMAIN} { encode zstd gzip; reverse_proxy app:3000 { flush_interval -1 } }`. A separate `handle /api/capture*` block has no `encode`, so NDJSON isn't buffered. Also HSTS, and `request_body { max_size 32MB }` on `/api/capture` (3 × 10 MB photos + payload), `1MB` elsewhere.
- [ ] Verify: `curl -I https://<domain>` shows a Let's Encrypt cert; a real capture shows progressive check rows (TC-087 streaming part).
- [ ] Commit: `Configure Caddy for HTTPS and unbuffered capture streaming (TASK-28)`

**TSK-27.4 · Instance bootstrap**
- **Files:** create `deploy/bootstrap.sh` (idempotent)
- **Produces:** installs Docker Engine + compose plugin; mounts the block volume at `/mnt/udgam-data` via `/etc/fstab` (UUID, `nofail`); opens 80/443 in the **host** firewall (Oracle Ubuntu images ship iptables rules that block them even when the VCN security list allows them) and persists the rules; creates `/etc/udgam/app.env` (0600 root) from a template listing names only; installs the OCI CLI for instance-principal uploads.
- [ ] Verify: run twice; the second run changes nothing; `df -h /mnt/udgam-data` shows the volume.
- [ ] Commit: `Add idempotent Oracle A1 bootstrap script (TASK-28)`

**TSK-27.5 · Encrypted off-instance backup + restore drill (TC-088)**
- **Files:** create `deploy/cron/backup.sh`, `deploy/cron/restore.sh`, `deploy/cron/crontab`; `package.json` `db:backup` (libSQL `VACUUM INTO '/data/backups/udgam-<ts>.db'`, a consistent snapshot of the file DB)
- **Produces:** nightly 02:30 IST: snapshot → `tar` with `/data/keys` → `age -r <owner key>` → `oci os object put --auth instance_principal` to the bucket; 14-day local and remote retention. The ledger key only leaves the instance encrypted.
- [ ] Drill: restore the latest backup onto a fresh volume/container, then open an existing certificate. It verifies in the browser with the same kid. Record the timings (TC-088).
- [ ] Commit: `Add encrypted nightly backups and a tested restore path (TASK-28)`

**TSK-27.6 · Idle-reclamation guard (owner choice recorded)**
- **Files:** create `deploy/cron/keep-busy.sh`, `docs/ops/oracle-idle.md`
- [ ] Document it honestly. Oracle may reclaim Always Free compute that is idle over a 7-day window: roughly CPU p95 < 20 %, network < 20 %, and for A1 memory < 20 %. The implementer re-reads the current Oracle Always Free page at implementation time and quotes it. A keep-busy job must push real utilisation over that line, which wastes CPU. Upgrading the account to Pay-As-You-Go keeps Always Free resources free and removes idle reclamation. Recommend PAYG; implement keep-busy as a low-priority (`nice 19`), capped job only if the owner declines PAYG, and record the choice as an EXE decision.
- [ ] Commit: `Document Oracle idle reclamation and add optional keep-busy job (TASK-28)`

**TSK-27.7 · One-command redeploy and rollback (TC-089)**
- **Files:** create `scripts/deploy.sh`
- **Produces:** `deploy.sh [<git-ref>]`: `git fetch && git checkout <ref>` → `pnpm db:backup` (pre-deploy snapshot) → build `udgam-app:<sha>` → retag the previous image as `udgam-app:previous` → `docker compose up -d` → wait ≤ 90 s for `/api/health` 200, else auto-rollback. `deploy.sh --rollback` reverts to `:previous`, and with `--restore-db` also restores the pre-deploy snapshot. Every run logs start/end times.
- [ ] Verify: deploy HEAD, deploy HEAD~1, then `--rollback`. Health is 200 after each; downtime is recorded (TC-089).
- [ ] Commit: `Add one-command deploy with health-gated rollback (TASK-28)`

**Done gate:** "Docker Compose for linux-aarch64" → TSK-27.1/27.2; "Caddy + Let's Encrypt" → TSK-27.3, TC-087; "ledger key and database on persistent block storage with an off-instance backup" → TSK-27.5, TC-088, and restart persistence in TC-087; "keep-busy cron against idle reclamation" → TSK-27.6 (or PAYG, recorded); "one-command redeploy" → TC-089.

---

### TKT-28 → TASK-29 · Production configuration and monitoring (sp 3 · P1 · Task)
**Depends on:** TKT-27 (TASK-28). **Owner preconditions:** GFW API key, Copernicus Data Space OAuth client (id/secret), map tile key if TP19 needs one, and GitHub notification emails enabled for failed workflow runs. · **TC:** TC-090, TC-091, TC-092 · **EVAL:** EVAL-085, EVAL-090 · **Owns files:** `.github/workflows/uptime.yml`, `deploy/app.env.example`, `docs/ops/monitoring.md`
**Brief for the implementer:** real providers, absolute-URL link previews, and a failure the owner hears about at 3 AM. Secrets go only into `/etc/udgam/app.env` on the instance, typed by the owner. They are never echoed, committed or pasted into the session.

**TSK-28.1 · Production environment**
- **Files:** create `deploy/app.env.example` (names only; mirrors `.env.example` plus `UDGAM_DOMAIN`)
- [ ] The owner fills `/etc/udgam/app.env`: `PUBLIC_BASE_URL=https://<domain>`, `BETTER_AUTH_URL=https://<domain>`, `REMOTE_SENSING_PROVIDER=live`, provider keys, and `BETTER_AUTH_SECRET` (generated with `openssl rand -base64 32` on the instance). Then `docker compose up -d`.
- [ ] Verify: `/api/health` → providers `gfw:"ok"`, `sentinelHub:"ok"`; `docker inspect` of the image (not the container) shows no secret values; `grep -r` of the repo for each key prefix finds nothing (TC-092).
- [ ] Commit: `Add production env template with names only (TASK-29)`

**TSK-28.2 · Link previews on the domain (EVAL-090)**
- [ ] Run the TC-072 assertions against production: `PLAYWRIGHT_BASE_URL=https://<domain> pnpm test:e2e --grep "TC-072"`. `og:image` is absolute on the domain and returns 200 `image/png` at 1200 × 630.
- [ ] Manual TC-091: LinkedIn Post Inspector and opengraph.xyz for one production certificate URL. Screenshots go to `docs/exec/evidence/og/`, referenced from the ledger (and later `QA-report.md`).

**TSK-28.3 · Uptime probe with alerting (TC-090)**
- **Files:** create `.github/workflows/uptime.yml`
- **Produces:** `schedule: cron '*/15 * * * *'` + `workflow_dispatch`. `curl --fail --max-time 20 https://<domain>/api/health`, and `jq` fails the job if `ledger.lastCheckpointAgeSec > 86400` while `ledger.lastSeq > 0`. A failed run emails the owner through GitHub's workflow-failure notifications. The domain comes from a repository **variable** (not a secret).
- [ ] Drill: `docker compose stop app` → the next run fails → the owner confirms the email within 30 minutes → start → the next run is green (TC-090). Record the times.
- [ ] Commit: `Add scheduled production health probe that alerts on failure (TASK-29)`

**TSK-28.4 · Logs retained and dependency audit**
- **Files:** create `docs/ops/monitoring.md`
- [ ] Document log retention (json-file 10 MB × 14 per service; `docker compose logs --since` recipes; the structured event names from §15). Run `pnpm audit --prod --audit-level=high` on the deployed commit's lockfile and attach the output (EVAL-085, TC-092).
- [ ] Commit: `Document production monitoring, logs and audit evidence (TASK-29)`

**Done gate:** "provider keys as environment secrets" → TC-092; "OG and canonical URLs absolute HTTPS on the domain" → EVAL-090, TC-091; "`/api/health` monitored with an alert to the owner" → TC-090; "structured logs retained" → TSK-28.4; "dependency audit clean in production" → EVAL-085.

---

### TKT-29 → TASK-30 · Production rehearsals and published evaluation report (sp 3 · P1 · Task)
**Depends on:** TKT-28 (TASK-29). **Owner preconditions:** HR3 field calibration done (real photo sizes and network profile replace the EV9 placeholders); the demo phone available for 5 manual S3 runs and the rehearsals; a second device to scan the QR. · **TC:** — · **EVAL:** EVAL-070, EVAL-072 (+ EVAL-073/074 green on production) · **Owns files:** `evals/harness/perf-s3.ts`, `evals/results/*perf*`, `evals/reports/*`, `docs/exec/evidence/rehearsals/**`
**Brief for the implementer:** show the product works where evaluators will see it. The numbers come only from harness output (CF-12). Production is the demo environment: each rehearsal starts from `pnpm seed --reset` **after** a backup, and that is stated in the report.

**TSK-29.1 · S3 perf mode (EVAL-070, automated part)**
- **Files:** create `evals/harness/perf-s3.ts` (extends the TKT-21 perf runner behind `pnpm eval:perf --suite=s3`)
- **Produces:** 20 Playwright runs against `--target`. Chromium CDP network emulation uses the HR3 profile (EV9 placeholder 10/5 Mbit/s, 80 ms RTT until calibrated). Three photos at the HR3 size, geolocation mocked inside a seeded plot. At least 5 runs use a cold harvest-window cache (the runner picks plots/months with no cache row). t0 = the Submit tap, t1 = the verdict card visible. The per-run phase split is GPS / hash+sign / upload / verify / response. A weak-network profile (1.5 Mbit/s up, 300 ms) is reported without a gate.
- [ ] Unit test for the scorer's max/p50/p95 and the pass rule (every run ≤ 30 s). Then run `pnpm eval:perf --target=https://<domain> --suite=s3` → `evals/results/baseline-perf-v1-s3-<sha>.json`.
- [ ] Commit: `Add S3 capture-to-verdict perf runner and record the production baseline (TASK-30)`

**TSK-29.2 · S3 manual runs on the demo phone (EVAL-070, manual part)**
- [ ] Five screen-recorded captures on the demo phone over a real network, timed Submit → verdict from the recording. Log each with the network and photo sizes in `docs/exec/evidence/rehearsals/s3-manual.md`. Every run must be ≤ 30 s. A miss is a gate failure: open a Bug ticket, and never relax the threshold.

**TSK-29.3 · Three consecutive production rehearsals (EVAL-072)**
- [ ] For each run: backup → `pnpm seed --reset` → ledger verification output saved → the Discovery-PRD §7.1 script on production (register plot → capture on the phone → verdict → the four attacks → batch → transfer → certificate scanned on a second device → GeoJSON → scorecard) with the screen recorded and step timestamps logged → ledger verification output saved again. Gate: three **consecutive** runs, each < 10 min, with no manual DB edit, no shell step during the run and no retried step. A failed run resets the count.
- [ ] Also run `pnpm demo` against production (EVAL-073/074 green).
- [ ] Evidence in `docs/exec/evidence/rehearsals/run-{1,2,3}.md` (recording links, timestamps, seed log, before/after verification).

**TSK-29.4 · Published evaluation report**
- [ ] `pnpm eval:release --target=https://<domain>` on the deployed commit → `evals/results/eval-run-<ver>-<sha>-release.json` + `evals/reports/eval-report-<ver>-<sha>.md`, generated from the results file only. It includes S1/S2/S6/S7 (harness), S3/S4 (perf), S5 (evidence links) and the known limitations (EV6).
- [ ] The owner signs HR6 (every number traces to a committed results file).
- [ ] Commit: `Publish the production evaluation report and rehearsal evidence (TASK-30)`

**Done gate:** "three consecutive production demo runs under 10 minutes" → EVAL-072; "capture-to-verdict ≤ 30 s on the reference condition" → EVAL-070 (20 automated + 5 manual, all ≤ 30 s); "evaluation report published in `/evals/reports`" → TSK-29.4.

---

## 23. Self-review (spec coverage, checked 2026-09-29)
- **Tickets:** all 29 (TKT-01..29 → TASK-2..30) have a §22 plan with atomic tasks (198 in total), exact paths, a verification gate per task and a Done gate mapping every acceptance criterion to TC/EVAL evidence.
- **Tests:** every TC-001..092 in `test-cases.md` is referenced by at least one task; no task references an undefined TC.
- **Evals:** every EVAL-001..105 in `evals/eval-dataset.json` (0.2.0) is referenced by at least one task. Pre-baseline growth blocks are reserved (§13).
- **Spec gaps:** GAP-1 → TP4 · GAP-2 → TP5 · GAP-3 → TP6 · GAP-4 → TP7 · GAP-5 → TP2 · GAP-6 → TP8 · GAP-7 → declared limitation (TP6, EV6) · GAP-8 → TP3 · GAP-9 → TP9 + `docs/proof-feed.md` (TKT-15) + clean-room checker (TKT-18).
- **Design.md deferred items:** noindex (TP16) · analytics tool (TP21: none; structured log events) · non-native scroll: none (§15 native) · no §26 Spatial 3D and no §27 Product Experience sections, so no 3D or analytics-SDK plan applies.
- **Web deliverables:** responsive (TC-044, 066, 080), screen states (TC-051, 054, 066), link preview (TC-072, 091), mobile nav (TC-053).
- **Consistency fixes folded in from the per-ticket planners:**
  - nullable `device_id` for unknown-key rejections;
  - no `server-only` import in `src/lib`;
  - async `CONFIG_HASH`;
  - the checkpoint `onAppended` hook;
  - GFW canopy threshold in `cfg-1`;
  - EVAL ID blocks;
  - `signing-keys.ts` ownership moved to TKT-14 and the i18n bootstrap to TKT-04;
  - Help as a sheet;
  - the thumbnail route;
  - feed closure-completeness and payload-signature steps;
  - `office_phone`;
  - six check groups on the checking screen;
  - the `E2E` flag name;
  - `/admin/demo` (TP27);
  - EIP-712 for M-002 on-chain signatures (TP26).
- **Open for the owner:** TP13 (TKT-30 staged photo upload), HR3 calibration, yield reference validation (TP6), mass-balance bands (TKT-26), the processor role (TKT-23, next D#).
