# Deploying Udgam on the Oracle A1 instance (TKT-27)

This runbook covers the production stack: one app container, Caddy, and Anvil under the `evm` profile.
Everything runs on the owner's Oracle A1 instance (Ubuntu 24.04 aarch64). For configuration and
monitoring, see `docs/ops/monitoring.md` (TKT-28). For idle reclamation, see `docs/ops/oracle-idle.md`.

| Piece | File |
|---|---|
| App image (multi-stage, non-root uid 10001, migrations at boot) | `deploy/Dockerfile`, `deploy/entrypoint.sh` |
| Stack | `deploy/docker-compose.yml` (run it through `deploy/compose.sh`) |
| HTTPS, client address, body caps, streaming | `deploy/Caddyfile` |
| Instance preparation | `deploy/bootstrap.sh` |
| Backups | `deploy/cron/backup.sh`, `deploy/cron/restore.sh`, `deploy/cron/crontab` |
| Redeploy and rollback | `scripts/deploy.sh` |

## Rules that hold for this deployment

- **One app instance.** Sign-in, capture and enrolment throttles, the capture slot pool and the EVM
  send queue live in one process and its database. Never scale `app`, and never run a second copy
  against the same volume.
- **The app port is never published (EXE14, SEC-006).** Only Caddy publishes ports. Caddy overwrites
  `X-Forwarded-For` with the address it saw and drops `X-Real-IP`. The app keys its per-IP limits by
  the last `X-Forwarded-For` hop. Never add `trusted_proxies` unless another proxy really sits in
  front of Caddy.
- **The Anvil RPC is never published (SEC-203).** The app reaches it as `http://anvil:8545` on the
  stack's network.
- **Migrations run at boot, with the app's own runner (EXE29).** The entrypoint runs `migrate.mjs`, a
  bundle of `src/lib/db/migrate.ts`, before `node server.js`. It never runs `drizzle-kit migrate`.
  Migrations are forward-only: a failed migration stops the container from starting.
- **Secrets stay in `/etc/udgam/app.env`** (0600 root). The owner types them in on the instance. They
  are never echoed, committed or pasted into a session.
- **Hard links.** The ledger key and the user keys are created with `link(2)`
  (`src/lib/crypto/key-file.ts`), so that exactly one process creates a key. The data volume must
  support hard links (ext4 does). `bootstrap.sh` checks this on the mount and stops if it fails.

## First time on the instance

**Owner preconditions** (technical-plan TKT-27, EXE52):

- the A1 instance and its block volume;
- the domain's A record pointing at the instance;
- VCN ingress on 80 and 443;
- SSH access;
- the OCI bucket, with a dynamic group and policy for instance-principal writes;
- an `age` public key.

```sh
sudo git clone https://github.com/<owner>/udgam.git /opt/udgam    # the crontab expects /opt/udgam
lsblk                                                               # find the block volume, e.g. /dev/oracleoci/oraclevdb
sudo UDGAM_VOLUME_DEVICE=/dev/oracleoci/oraclevdb /opt/udgam/deploy/bootstrap.sh --dry-run
sudo UDGAM_VOLUME_DEVICE=/dev/oracleoci/oraclevdb UDGAM_FORMAT_VOLUME=1 /opt/udgam/deploy/bootstrap.sh   # formats only an empty volume
sudo /opt/udgam/deploy/bootstrap.sh                                 # again: must print no "did:" line
df -h /mnt/udgam-data
sudoedit /etc/udgam/app.env      # fill the values (deploy/app.env.example names them; UDGAM_DOMAIN included)
sudoedit /etc/udgam/backup.env   # AGE_RECIPIENT, OCI_BUCKET (deploy/backup.env.example)
sudo /opt/udgam/scripts/deploy.sh                                   # builds natively (arm64) and starts the stack
```

The first deploy has no previous image and no database, so it takes no pre-deploy snapshot and has
nothing to roll back to.

## Redeploy, rollback

```sh
sudo /opt/udgam/scripts/deploy.sh <git-ref> 2>&1 | sudo tee -a /var/log/udgam-deploy.log
sudo /opt/udgam/scripts/deploy.sh --rollback                 # swap :current and :previous (again to undo)
sudo /opt/udgam/scripts/deploy.sh --rollback --restore-db    # also restore the last pre-deploy snapshot
```

A deploy runs these steps:

1. It checks out the ref (detached; refused on a dirty checkout).
2. It snapshots the database with the running image.
3. It builds `udgam-app:<sha>`.
4. It retags images: the running one becomes `:previous`, the new one `:current`.
5. It runs `up -d` and waits up to 90 s for `/api/health` to return 200.
6. If health fails, it rolls back to `:previous` by itself and exits 1.

The failed image keeps its `<sha>` tag for inspection. `--rollback` swaps images only, and the
checkout stays where it is. `--restore-db` loses every write made since that deploy. The replaced
files are kept in `/mnt/udgam-data/pre-restore-<time>/`.

During the 90 s health gate, Caddy serves the new version as it is. A version that boots but answers
503 is visible to users until the rollback. Measured locally: about 94 s. That is the price of one
in-place instance.

## Backups and restore (TC-088)

The cron job runs nightly at 21:00 UTC (02:30 IST), from `/etc/cron.d/udgam`:

1. It takes a `VACUUM INTO` snapshot.
2. It streams `tar` of the snapshot plus `keys/` into `age -r <owner key>`.
3. It runs `oci os object put --auth instance_principal`.
4. It applies 14-day retention locally and in the bucket.

The ledger key leaves the instance only inside the encrypted archive.

```sh
sudo /opt/udgam/deploy/cron/backup.sh                     # by hand; logs to stdout
tail -n 20 /var/log/udgam-backup.log
# Restore (bring the owner's age identity for the restore, then delete it):
sudo /opt/udgam/deploy/cron/restore.sh --archive oci:backups/udgam-<time>-nightly.tar.gz.age --identity /root/age.key
sudo shred -u /root/age.key
```

**Media is not in the nightly archive by default** (`BACKUP_MEDIA=0`). The plan scoped the backup to
the database and the keys. Every certificate and proof feed still verifies without the photos. The
photos are evidence, though. Set `BACKUP_MEDIA=1` to include `media/`; watch the bucket's 20 GB
Always Free limit (owner decision).

## Client-address caveat (Docker's userland proxy)

Caddy sees the real client address only when Docker forwards the published port with iptables DNAT.
That is the default for IPv4. If clients reach the instance over IPv6 while the Docker network is
IPv4-only, `docker-proxy` relays them, and Caddy sees the bridge gateway for every one of them. Every
client would then share one per-IP bucket. After go-live, check that Caddy's access log and the
throttle keys show real client addresses. Keep the instance IPv4-only unless that is solved
(`network_mode: host` for Caddy, or an IPv6-enabled Docker network).

## Request-body caps (SEC-005)

Caddy fails a request with 413 as soon as the app reads past the cap. A handler that refuses earlier
(for example, a 401 before reading) never reads the body at all.

| Path | Cap | Why |
|---|---|---|
| `/api/capture*` | 32 MB | 3 × 10 MiB photos + the payload (30.25 MiB) |
| `/admin/plots/<id>/attestation` | 11 MiB | the 10 MiB organic certificate + its envelope |
| `/admin*` | 3 MiB | the 2 MiB plot Server Actions, under Next's 3 MiB Server Action cap (EXE50) |
| everything else | 1 MB | |

## Verification record

### Done locally (x86_64 cloud VM, Docker 29, Caddy 2.11.7, 2026-10-06)

- **The image builds.** `check-trace` passes on 92 traces. `check-standalone` passes: 60.7 MB, no
  whole-project trace (QA-M002-3).
- **The image runs.** `require('sharp')` loads, the user is uid 10001, and the code is read-only.
  Migrations run and `/api/health` returns 200 within about 2 s.
- **The stack comes up.** `docker compose config` is valid, and `compose ps` shows app, Caddy and
  Anvil healthy. Only Caddy publishes ports.
- **The forged-header test.** It fails against a pass-through proxy and against the app reached
  directly. It passes behind this Caddyfile. Caddy 2.11's default (no `header_up`) also passes: it
  already ignores an untrusted client's `X-Forwarded-For`. The explicit lines pin that behaviour.
- **The body caps hold** at their exact byte limits. Capture rows stream through Caddy every 500 ms
  with no encoding.
- **The bootstrap is idempotent** in a privileged `ubuntu:24.04` container with a loop-device volume.
  `systemctl` is a no-op there.
- **The backup and restore drill passes.** A certificate's proof feed verifies 18/18 after the restore,
  with the same kid, byte for byte.
- **The deploy cycle works.** It was run as: deploy HEAD, deploy a broken build (auto-rollback),
  deploy HEAD~1, `--rollback`, then `--rollback --restore-db`.

### BLOCKED (owner precondition)

Run these on the instance once it exists, and record the results in `docs/exec/ledger.md`.

```sh
cd /opt/udgam
docker build -f deploy/Dockerfile -t udgam-app:$(git rev-parse --short HEAD) .              # native arm64
docker run --rm udgam-app:$(git rev-parse --short HEAD) node -e "require('sharp')"; echo $?  # 0
docker run --rm --entrypoint uname udgam-app:$(git rev-parse --short HEAD) -m                # aarch64
docker build -f deploy/anvil.Dockerfile -t udgam-anvil:1.8.3 deploy && docker run --rm udgam-anvil:1.8.3 --version   # deferred TKT-22 arm64 check
deploy/compose.sh ps                                       # all healthy
curl -sI https://<domain> | grep -i strict-transport       # Let's Encrypt certificate + HSTS (TC-087)
UDGAM_STACK_URL=https://<domain> UDGAM_STACK_APP_CONTAINER=udgam-app-1 pnpm vitest run tests/deploy/forged-header.stack.test.ts   # needs node and the repo's dev dependencies on a machine with docker access to the instance; or run it from the instance after `pnpm install`
```

The rest of the on-instance checks:

- **TC-087.** A real capture from the phone shows progressive check rows. A `docker compose restart`
  keeps the data.
- **TC-088.** Restore the latest bucket archive onto a fresh volume or container. An existing
  certificate verifies in a browser with the same kid. Record the timings.
- **TC-089.** Run deploy HEAD, deploy HEAD~1, then `--rollback`. Health is 200 after each. Record the
  downtime.
- **Oracle idle.** The owner chooses PAYG or keep-busy (`docs/ops/oracle-idle.md`). Record it as an
  EXE decision.
