# The Kodagu demo: seed and automated demo script (TKT-20)

**Demo data only.** Everything here is fictional or generated:

- The farmers' names and identifiers are fictional, and they never leave the `farmers` table (EV16).
- The photos are AI-generated (TP29). Seeded media rows carry `source = 'generated-demo'`.
- The satellite answers come from the fixture provider. Their evidence ends with "(demo data)" (EXE12).

## Commands

| Command | What it does |
|---|---|
| `NODE_ENV=development pnpm seed` | Builds the demo state in `DATA_DIR` (default `./data`). It refuses a database that already holds data: "DATA_DIR is not empty — use --reset". |
| `NODE_ENV=development pnpm seed --reset` | Removes `DATA_DIR/{udgam.db*, media, attestations, staging, demo, seed-keys, seed-credentials.txt}` and builds again. The provenance tables refuse DELETE, so the database file is recreated, never emptied. The ledger key and the admins' signing keys in `DATA_DIR/keys` are kept. |
| `pnpm demo` | Runs the Playwright demo (`playwright.demo.config.ts`) at 375 px and 1280 px. It does a fresh `seed --reset` into `.e2e-data/demo`, then `next build` and `next start` with `DEMO_MODE=1 E2E=1` on port `E2E_PORT` (default 3330). |

`pnpm seed` prints one line: the counts and the path of the credentials file. It never prints a password.

## What the seed builds

It goes through the app's own functions, so every row is anchored exactly as in production:

1. `registerPlot`, and the plot's registration checks.
2. `assignPlot`.
3. `issueCode` and `enrolDevice`.
4. `runCapture` (the capture pipeline and the verifier) on signed payloads with photos.
5. `overrideRun`, `attachAttestation`, `createBatch` and `transferBatch`.

Only the organisations and the accounts are inserted directly, as `scripts/seed-accounts.ts` does.

The demo state:

- **Organisations.** Hosahalli Coffee Growers FPO and Western Ghats Green Coffee (demo buyer).
- **Accounts.** One admin, two field agents and one buyer. Their user IDs are opaque and fixed (EXE13). Each gets a generated password, written to `DATA_DIR/seed-credentials.txt` (mode 0600).
- **Plots.** Twelve, in Kodagu and Chikkamagaluru. P01–P10 and X01 reuse the evaluation fixtures' polygons, so the fixture provider answers them with their profiles: P09's harvest window is cloud-blocked, and X01 lost 25 % of its canopy after 2020. Y01 is a 0.4 ha plot near Kottigehara.
- **Phones.** One per agent, enrolled with an office code. Their keys are in `DATA_DIR/seed-keys/` (mode 0600) and are used only by the seeder.
- **Pickings.** Thirty honest pickings, each with 1–3 photos carrying synthetic EXIF: GPS inside the plot, `DateTimeOriginal` with `OffsetTimeOriginal +05:30`, and `Make: Udgam demo`.
  - They are all Verified except P09's two, which are Needs Review (cloud).
  - Y01's last picking flags the season total at 1.76x the reference bound. The office overrides it to Verified, signed and anchored.
- **Batch.** An organic attestation on P01, and one batch of P01's and P02's pickings, transferred to the buyer.
- **Staged attacks.** Four, in `DATA_DIR/demo/attacks/<id>/` with `manifest.json`. Each holds the exact signed payload, its signature and its photos, signed by agent 2's phone:

  | Attack | Expected verdict | Check that catches it |
  |---|---|---|
  | `gps-spoof` | Needs Review | `geofence`: "… m outside the plot edge" |
  | `replay` | Rejected | `photo_uniqueness`: "… photos seen before" |
  | `yield-inflation` | Rejected | `yield_plausibility`: "… x the reference upper bound" |
  | `plot-laundering` | Rejected | `deforestation_overlap`: "25.0% of plot area lost since 2021" |

## Where the demo may run (EXE12)

- **The demo runs on fixture data.** It runs only under the Playwright demo config, or on a development server.
- **The seed runs only when `NODE_ENV` is explicitly `development` or `test`, or with `E2E=1`** (the Playwright server). Otherwise it refuses before touching `DATA_DIR`. An unset `NODE_ENV` is refused too: an operator shell on a production host usually has none, and `--reset` there would delete the database, the ledger and the media.
- **`/admin/demo`, the page that submits the staged attacks, is test-only.** It answers 404 unless `DEMO_MODE=1`, and it is never on in a production deployment. In production mode, only the Playwright server (`E2E=1`) has it.
- **Never set `E2E` in a deployment.** It also exposes the test-only routes (`/__test__/*`, the certificate tamper mode). A public demo deployment uses live satellite providers and real captures, not this seed.

## Timing notes

- **Seed again shortly before a live demo.** The staged attacks are signed at seed time, with capture times between 1 and 7 hours before it. Submitted more than 24 hours later, they also flag the phone-clock gap (`exif_time_agreement`). The catching checks and verdicts stay the same.
- **Y01's honest pickings fall in the current coffee season** (from 1 October, IST). The yield attack meets their season total. If the season turns between the seed and the demo, run `NODE_ENV=development pnpm seed --reset` again.
- **Early in a season the seed squeezes Y01's run in** (`scripts/seed/timeline.ts`). Usually the run ends 90 minutes before the seed, its pickings 150 minutes apart. Within a few hours of 1 October 00:00 IST it ends a quarter of the season's elapsed time before the seed and starts just after the season start, closer together. In the season's first 10 minutes there is not room for it, and the seed refuses before anything is changed, `--reset` included: run it after 00:10 IST.
