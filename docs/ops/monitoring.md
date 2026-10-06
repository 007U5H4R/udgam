# Production monitoring, logs and audit

TKT-28 (Campfire TASK-29), with the Stage 10 carry-ins SEC-001, SEC-003, DES-219 and QA-P5-4. This page is for the owner running the Oracle A1 instance. Compose commands run on the instance, in the directory that holds `deploy/docker-compose.yml` (TKT-27), as `docker compose -f deploy/docker-compose.yml …`. The examples below shorten that to two shell functions:

```sh
dc() { docker compose -f deploy/docker-compose.yml "$@"; }
jl() { dc logs --no-log-prefix "$@" | grep '^{'; }   # bare JSON log lines, for jq
```

**Production does not exist yet (EXE52).** Everything on this page is built and tested locally. Each step that needs the real instance, domain or repository settings is marked **BLOCKED (owner precondition)** and is listed again at the end.

## 1. What `/api/health` says

`GET https://<UDGAM_DOMAIN>/api/health` is public, uncached, and never carries a secret or an environment value.

| Field | Values | Effect on the status code |
|---|---|---|
| `config` | `ok`, `error` | `error` → **503**. The environment failed validation (QA-P1-1, QA-P5-4). |
| `db` | `ok`, `error`, `unchecked` | `error` → 503. `unchecked` means the config is invalid, so the database cannot be located. |
| `ledger` | `{ lastSeq, lastCheckpointAgeSec, oldestUnsealedAgeSec, keyPresent, keyMismatch }`; `oldestUnsealedAgeSec` is the age of the oldest entry after the last checkpoint, 0 when all are sealed (EXE55) | `keyPresent:false` or `keyMismatch:true` → 503. |
| `providers` | `gfw` and `sentinelHub`: `ok`, `error`, `fixture`, `unprobed` | none; probed at most every 60 s |
| `disk` | `ok`, `low`, `unknown` | **none** (a degraded component, SEC-003); the uptime probe alerts on anything but `ok` |
| `version`, `commit` | the package version and the build's commit | none |

- **Invalid configuration (QA-P5-4, EXE55).** A missing secret, the fixture provider, or a non-https `PUBLIC_BASE_URL` or `BETTER_AUTH_URL` (DES-219) is caught before anything is served. What happens next depends on how the server runs:
  - **In the production container** (`deploy/docker-compose.yml`), the entrypoint checks the configuration first (`/app/config-check.mjs`), before the migrations. It prints one line naming the variables, never their values, and the container exits 1:
    ```
    config.invalid: BETTER_AUTH_SECRET, PUBLIC_BASE_URL
    ```
    Under `restart: unless-stopped` the container then restarts and fails again. During a deploy, `scripts/deploy.sh`'s gate sees `restarting` at once and rolls back to the previous image. Outside a deploy (an `app.env` edit followed by `up -d`), the app stays down: Caddy answers 502, `deploy/compose.sh ps` shows the app `restarting`, and the uptime probe alerts. To see which variables are wrong, run:
    ```sh
    deploy/compose.sh logs --no-log-prefix app | grep '^config.invalid' | tail -1
    ```
    Fix them in `/etc/udgam/app.env`, then run `deploy/compose.sh up -d app`.
  - **Outside the container** (a plain `next start`, for example the Playwright server or a development checkout), the server logs `config.invalid` once (a JSON line at fatal level, with names and rule codes in `.problem`) and skips the migrations. It stays up, every page answers 500, and `/api/health` answers 503 `{"config":"error","db":"unchecked"}` (EXE54). A crash loop would hide the cause there, because no deploy gate or restart policy watches it. To read the line, run:
    ```sh
    jl app | jq -r 'select(.msg == "config.invalid") | .problem' | tail -1
    ```
    Local evidence from a production build at 43c5c22, with no auth secret, the fixture provider and no https URLs: `/api/health` answers 503 with `{"config":"error","db":"unchecked",…}`, the process stays alive, and the log shows `config.invalid` ×1.
- **Disk (SEC-003).** The check reads free bytes on `DATA_DIR`'s filesystem (`fs.statfs`: available blocks × block size) and compares them with `HEALTH_MIN_FREE_DISK_BYTES`, default 10 GiB. Below that, the check reports `disk:"low"` and logs `health.disk_low {freeBytes, thresholdBytes}`. When the filesystem cannot be read, it reports `disk:"unknown"` and logs `health.disk_unknown`. The public body never shows the numbers.

## 2. Uptime probe and alerting (TSK-28.3, TC-090)

`.github/workflows/uptime.yml` runs every 15 minutes, and on demand from the Actions tab. It fails, and GitHub emails the owner, in any of these cases:

- the request fails or answers non-2xx after two retries (the app is down, a 503, a TLS or DNS error);
- `db` or `config` is not `ok`;
- `disk` is not `ok`;
- the oldest unsealed ledger entry is over 24 h old (`ledger.oldestUnsealedAgeSec > 86400`): entries are not being sealed (EXE55). A body without that field fails too, closed.

Checkpoints are made on demand (a certificate's proof feed), every 100th entry, and by a background timer that seals any unsealed entries every `LEDGER_CHECKPOINT_INTERVAL_SEC` (default 3600 s; real deployments only, EXE54). It logs `ledger.checkpoint_timer_started {intervalSec}` once at boot, and `ledger.checkpoint_sealed` for each seal; a boot without the first line means the timer is not running. While that works, `oldestUnsealedAgeSec` stays under about one interval. On a quiet day with everything sealed it is 0, however old the last checkpoint is, so quiet days never alert (EXE55). `lastCheckpointAgeSec` and `lastSeq` stay in the body for information only.

A provider outage (`gfw`/`sentinelHub` not `ok`) adds a warning to the run, but it is not an alert. It is external, captures still verify with the provider marked unavailable, and nothing can be done about it at 3 AM.

The workflow checks nothing out, uses no actions, and has `permissions: {}`. The domain reaches the script only through `env`.

**Setup (BLOCKED, owner precondition):**
1. Set the repository **variable** (not a secret) `UDGAM_DOMAIN` to the bare host name, for example `udgam.example.org`. The path is Settings → Secrets and variables → Actions → Variables. While it is empty, every run ends green with the notice "Uptime probe skipped", so nothing emails every 15 minutes.
2. GitHub runs scheduled workflows **from the default branch only**. The probe starts once this file is on `main`, which needs the owner's explicit merge instruction (EXE52).
3. Turn on email for failed workflow runs: Settings (personal) → Notifications → Actions → "Notify me … only failed workflows". GitHub sends a scheduled run's failure to the user who last changed the workflow's `cron`. That user must be the owner, or the owner must edit the schedule once.
4. Run it once by hand: Actions → Uptime → Run workflow. The run should end green, with a `Healthy: {…}` line.
5. Know the limits. GitHub may start a scheduled run several minutes late at busy times. In a public repository it turns schedules off after 60 days without repository activity, and re-enabling is one click on the workflow page.
6. **Deleting or emptying `UDGAM_DOMAIN` silently stops monitoring:** every run then ends green with the "skipped" notice, and no email is sent. Once a week, open Actions → Uptime and check that the latest runs show a `Healthy: {…}` line, not the skip notice, and that runs are still being scheduled.

**The alert drill (TC-090, BLOCKED until production exists).** Record each time in the ledger, and the drill passes only if the email arrives within 30 minutes of the stop.

| Step | Command or action | Record |
|---|---|---|
| 1 | Note the time; `dc stop app` | t_stop |
| 2 | Wait for the next scheduled run (≤ 15 min), or Run workflow | run URL, t_fail |
| 3 | The owner confirms the failure email | t_email (≤ t_stop + 30 min) |
| 4 | `dc start app`; wait for `dc ps` to show `healthy` | t_start |
| 5 | The next run is green | run URL, t_green |

Optional disk-alert drill: on the instance, set `HEALTH_MIN_FREE_DISK_BYTES` to a value above the volume's free space in `/etc/udgam/app.env`. Run `dc up -d app`, then Run workflow. The run fails with "disk is low". Then restore the value.

## 3. Logs

All services log JSON lines (pino) to stdout. Docker keeps them with the `json-file` driver, at most `10m` × `14` files per service (≈ 140 MB each; set in `deploy/docker-compose.yml`, TKT-27). Check a container's setting with:

```sh
docker inspect --format '{{json .HostConfig.LogConfig}}' $(dc ps -q app)
```

**Retention caveat.** Docker deletes a container's log files when it **removes** the container, and a redeploy (`up -d` with a new image) recreates `app`. Keep a copy before each deploy. For example, `scripts/deploy.sh` (TKT-27) could run:

```sh
dc logs --no-color --timestamps app > /mnt/udgam-data/logs/app-$(date -u +%Y%m%dT%H%M%SZ).log
```

Logs carry no secrets or signatures. `src/lib/log.ts` redacts the secret variable names, `authorization`, `cookie`, `signature`, `password`, `*.secret` and `*.key`. Error lines carry the error class and driver code, never the message (CR-007).

**Recipes** (`jq` on the host):

```sh
dc logs --since 1h app                                             # the last hour, as Compose shows it
dc logs --since 2026-10-06T00:00:00 --until 2026-10-06T06:00:00 app
dc logs --no-log-prefix -f app | grep --line-buffered '^{' | jq -c 'select(.level >= 40)'   # follow warnings and errors (40 warn, 50 error, 60 fatal)
jl --since 24h app | jq -r .msg | sort | uniq -c | sort -rn        # events by count
jl --since 24h app | jq -c 'select(.msg == "capture.refused") | {time, reason, status, anchored}'
jl --since 24h app | jq -c 'select(.msg == "capture.budget_exhausted")'
jl --since 24h app | jq -c 'select(.requestId == "<id>")'          # one capture, end to end
jl --since 7d app | jq -c 'select(.msg == "certificate.telemetry") | {time, event, batchId, step}'
dc logs --since 24h caddy                                          # the proxy's access and TLS log
```

`jl` drops the few non-JSON lines Next prints at start-up. `time` is epoch milliseconds.

**Event names** (the `msg` field). These are the ones worth an alert or a look. Their source is the `log.*(…, '<event>')` calls under `src/`.

| Area | Events |
|---|---|
| Boot and config | `config.invalid` (in the container: the entrypoint's plain `config.invalid: <names>` line, EXE55; elsewhere: fatal, QA-P5-4), `db.migrated`, `db.pragma_failed`, `auth.dev_secret` (never in production) |
| Health | `health.config_invalid`, `health.db_ping_failed`, `health.ledger_failed`, `health.ledger_key_missing`, `health.disk_low`, `health.disk_unknown`, `ledger.key_mismatch`, `ledger.key_unavailable` |
| Ledger | `ledger.checkpoint_timer_started` (once at boot, EXE54), `ledger.checkpoint_sealed`, `ledger.checkpoint_timer_failed` |
| Verification | `verification.completed` (technical-plan §15) is **not emitted** yet: there is no per-run log line with verdict, score and check durations. Read verdicts from the database or the admin queue. The gap is recorded in the ledger. |
| Capture | `capture.refused` (`reason`, `status`, `anchored`), `capture.budget_exhausted` (SEC-003), `capture.busy`, `capture.failed`, `capture.route_failed`, `capture.idempotent_replay`, `capture.idempotent_race`, `capture.refund_failed`, `capture.media_cleanup_failed`, `capture.staged_cleanup_failed`, `capture.emit_failed` |
| Staging | `stage.stored`, `stage.refused`, `stage.route_failed`, `stage.integrity_failed`, `stage.sweep_failed`, `stage.swept_at_boot` |
| Sign-in and phones | `auth.sign_in_refused`, `auth.sign_in_throttled`, `auth.sign_in_refund_failed`, `enrol.code_redeemed`, `enrol.code_refused`, `enrol.device_enrolled`, `enrol.device_revoked` |
| Review and records | `review.override_recorded`, `review.queue_load_failed`, `review.detail_load_failed`, `attestation.file_missing`, `attestation.file_hash_mismatch` |
| Remote sensing | `remote_sensing.http_error`, `remote_sensing.request_failed`, `remote_sensing.redirect_refused`, `remote_sensing.cache_unreadable`, `remote_sensing.cache_write_failed` |
| Public surface | `certificate.telemetry` (`event`: `certificate.viewed` / `certificate.proof_failed` with `step`, TP21), `proof_feed.failed`, `eudr_geojson.failed` |
| Media | `media.thumb_failed`, `media.thumb_placeholder`, `media.thumb_cache_write_failed` |

Key files log `<prefix>_generated`, `<prefix>_mode_tightened` and `<prefix>_dir_mode_tightened`, where the prefix is `ledger.key`, `auth.signing_key` or `evm.operator_key`. A `ledger.key_generated` line on a server that already had data means the key was lost. `/api/health` then shows `keyMismatch:true`; restore the key from the backup (TSK-27.5).

## 4. Storage budget (SEC-003)

Each agent may store at most `CAPTURE_DAILY_MAX_CAPTURES` accepted captures and `CAPTURE_DAILY_MAX_BYTES` of their photo bytes per India calendar day (00:00–24:00 IST). Both are counted from the stored `harvest_events` and `media` rows. Only accepted captures store photos, whatever their verdict.

| Variable | Default | Why |
|---|---|---|
| `CAPTURE_DAILY_MAX_CAPTURES` | 100 | The pilot plan is ~3,000 captures a season for the whole FPO (~25 a day). An honest agent stays far below this. |
| `CAPTURE_DAILY_MAX_BYTES` | 1,258,291,200 (100 × 3 × 4 MiB = 1.2 GiB) | EV9's placeholder photo size is 3 × 4 MB per capture. Real photos (~400 KB each in the cost model) put ~1.2 MB on disk per capture. |
| `HEALTH_MIN_FREE_DISK_BYTES` | 10,737,418,240 (10 GiB) | Over a day of every pilot agent at the full budget, so there is time to react. |

- Without the budget, one enrolled phone could store about 130 GB a day (30 captures × 30 MB every 10 minutes). With it, a stolen phone can store at most 1.2 GiB a day, plus at most two in-flight captures (2 × 30 MB), because the check runs before the body is read.
- **Over budget**, the route answers `429 {t:"rejected", reason:"rate_limited"}` with `Retry-After` set to the seconds until the next India midnight. It answers before reading the body and before taking a slot, and logs `capture.budget_exhausted {budget, captures, bytes, maxCaptures, maxBytes}`. The phone treats it as "try again later": the picking stays in its outbox, and the phone retries at most once a minute. No new refusal code or user-facing string was needed.
- **To raise a cap**, set the variable in `/etc/udgam/app.env`, run `dc up -d app`, and record why in the ledger. Once HR3 measures real photo sizes, re-size the byte cap from those (TKT-29).

## 5. Accounts (SEC-001)

The demo seed gives every account one shared password, so it refuses production. `scripts/seed-accounts.ts` and `pnpm seed` run only with `NODE_ENV=development` or `test`, or `E2E=1` (EXE35). Production accounts are created one at a time, with the accounts CLI.

The image has no `pnpm`, `tsx` or `scripts/`. `deploy/build-tools.mjs` bundles `pnpm accounts:create` and `pnpm accounts:set-password` into `/app/accounts-create.mjs` and `/app/accounts-set-password.mjs`, which run with plain `node` in the running app container. They are the same code, with Better Auth's own hashing bundled in, and run against the same database and environment as the app. `--help` prints the usage. Run them as root on the instance:

```sh
sudo -i
cd /opt/udgam
# Your own password, piped (works everywhere; the read-only container needs no file for it).
# `read -rs` before each command: type the password, nothing echoes or reaches the shell history.
# Every account needs its own password (password_in_use).
read -rs PW
printf %s "$PW" | deploy/compose.sh exec -T app node /app/accounts-create.mjs \
  --name "Asha K." --email asha@fpo.example --role admin --new-org "Hosahalli FPO" --password-stdin
# More accounts in that organisation (its ORG- id is in the first command's JSON line):
read -rs PW
printf %s "$PW" | deploy/compose.sh exec -T app node /app/accounts-create.mjs \
  --name "Ravi" --email ravi@fpo.example --role agent --org ORG-XXXXXXXX --password-stdin
# A new password (ends the account's sessions and clears its sign-in throttle):
read -rs PW
printf %s "$PW" | deploy/compose.sh exec -T app node /app/accounts-set-password.mjs --email ravi@fpo.example --password-stdin
unset PW
```

To have a password generated instead:

```sh
# Interactive (no -T: a TTY on stdin and stdout): the password is shown once on the terminal.
deploy/compose.sh exec app node /app/accounts-create.mjs --name "Ravi" --email ravi@fpo.example --role agent --org ORG-XXXXXXXX
# Not interactive: into the container's /run/udgam tmpfs (memory only, mode 0700, owned by the app user).
deploy/compose.sh exec -T app node /app/accounts-set-password.mjs --email ravi@fpo.example --out /run/udgam
deploy/compose.sh exec -T app cat /run/udgam/udgam-password-<random>.txt    # the path is in the JSON line
deploy/compose.sh exec -T app rm /run/udgam/udgam-password-<random>.txt
```

- The container's root filesystem is read-only and has no capabilities, so `--out` has exactly two places to write: `/run/udgam`, a tmpfs that `deploy/docker-compose.yml` mounts for this, and `/tmp`. Use `/run/udgam`. `/data` is refused, because it is backed up and readable by the app. The tmpfs is emptied whenever the container restarts.
- The password is never an argument. Any `--password…` option, or a `-p…`/`-P…` option, is refused, while a value such as `--name -Priya` is accepted. It never appears in a log or in the JSON summary line.
- `--password-stdin` reads the first line and is refused on a terminal, because the password would echo. Without it and without a terminal, the command refuses to run unless `--out` is given. The password file is named `udgam-password-<random>.txt` (never the email), mode 0600, and only its path is printed. If the run is interrupted (Ctrl-C, SIGTERM) or the account write fails, the file is removed. Once the account is written, it is kept.
- No two accounts may share a password (`password_in_use`). Roles fit their organisation: agent and admin belong to an FPO, buyer to a buyer, processor to a processor. Field agents then enrol their phone as usual, with an admin-issued code (TKT-05).
- The commands need a valid configuration, like the app: they read the container's environment.
- Outside the image (a development checkout), `pnpm accounts:create` and `pnpm accounts:set-password` take the same options.

## 6. Dependency audit (EVAL-085, TC-092)

```sh
pnpm audit --prod --audit-level=high
```

CI's `audit` job runs the same command on every push. Current output (2026-10-06, commit 623c11b, lockfile sha256 `b051556585e5ccda…`): exit 0, with one moderate advisory and nothing high or critical:

```
1 vulnerabilities found
Severity: 1 moderate
```

That advisory is GHSA-67mh-4wv8-2f99 (esbuild ≤ 0.24.2, its dev server), reached only through `better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`. No running server uses it. It was accepted as SEC-204 (EXE49).

**BLOCKED (owner precondition):** run the same command on the **deployed commit's** lockfile and attach the output to the ledger (TC-092).

## 7. Production configuration (TSK-28.1, TC-092)

`deploy/app.env.example` lists every variable by name, with no values. The owner copies it to `/etc/udgam/app.env` (0600 root) on the instance and fills it in there. `BETTER_AUTH_SECRET` comes from `openssl rand -base64 32`, run on the instance. Without any of the following, production does not serve: the app container stops at its entrypoint and restarts in a loop, and its log's `config.invalid: <names>` line names the variables (§1). A deploy with such a configuration rolls back:
- `BETTER_AUTH_SECRET`;
- `REMOTE_SENSING_PROVIDER=live` and its three keys (EXE12);
- absolute `https://` values for `PUBLIC_BASE_URL` and `BETTER_AUTH_URL` (DES-219).

**BLOCKED (owner precondition):** each of these TC-092 checks:
- `/api/health` shows `providers: {gfw:"ok", sentinelHub:"ok"}`;
- `docker image inspect` of the app image (not the container) shows no secret value;
- `git grep` for each key's prefix finds nothing.

## 8. Blocked on production (owner preconditions, EXE52)

| Item | Needs |
|---|---|
| TC-090 alert drill | the instance and domain, `UDGAM_DOMAIN` set, `uptime.yml` on `main`, failure emails on |
| TC-091 link unfurl (TSK-28.2, EVAL-090) | the domain, one production certificate |
| TC-092 live providers, image inspection and the audit of the deployed lockfile | provider keys in `/etc/udgam/app.env`, the deployed image |
| SEC-101 confirmation before the first production anchor | the owner (`docs/proof-feed.md` §9.2a) |
| First production accounts | the instance; `node /app/accounts-create.mjs` in the app container (§5) |
