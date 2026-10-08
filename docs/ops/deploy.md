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

Every command below runs as root. Start a root shell once with `sudo -i`, as the blocks assume.

## Rules that hold for this deployment

- **One app instance.** Sign-in, capture and enrolment throttles, the capture slot pool and the EVM
  send queue live in one process and its database. Never scale `app`, and never run a second copy
  against the same volume. A restore drill runs its second app on a copy of the data, never on
  `/mnt/udgam-data` itself.
- **The app port is never published (EXE14, SEC-006).** Only Caddy publishes ports. Caddy overwrites
  `X-Forwarded-For` with the address it saw and drops `X-Real-IP`. The app keys its per-IP limits by
  the last `X-Forwarded-For` hop. Never add `trusted_proxies` unless another proxy really sits in
  front of Caddy.
- **The Anvil RPC is never published (SEC-203).** The app reaches it as `http://anvil:8545` on the
  stack's network.
- **Least privilege.** The app and Anvil run read-only, with no Linux capabilities and
  `no-new-privileges`. Their only writable places are the volume and tmpfs.
- **The database and keys live on the volume.** Compose pins `DATABASE_URL`, `LEDGER_KEY_PATH` and
  `EVM_OPERATOR_KEY_PATH` under `/data`, over anything in `app.env`. The backup's snapshot and
  `keys/` archive therefore always see the live files.
- **Migrations run at boot, with the app's own runner (EXE29).** The entrypoint runs `migrate.mjs`, a
  bundle of `src/lib/db/migrate.ts`, before `node server.js`. It never runs `drizzle-kit migrate`.
  Migrations are forward-only: a failed migration stops the container from starting.
- **An invalid configuration stops the container (EXE55).** Before migrating, the entrypoint runs
  `config-check.mjs`. With an invalid `app.env` it prints one line, `config.invalid: <variable
  names>` (never a value), and exits 1. `restart: unless-stopped` then restarts it in a loop: a
  deploy's gate fails at once on `restarting` and rolls back, Caddy answers 502 meanwhile, and the
  uptime probe alerts. Read the line with
  `deploy/compose.sh logs --no-log-prefix app | grep '^config.invalid' | tail -1`. Outside the
  container, a plain `next start` stays up and answers 503 `config:"error"` instead
  (`docs/ops/monitoring.md` §1).
- **The image's operator tools** are bundled `.mjs` files beside `server.js`
  (`deploy/build-tools.mjs`): `migrate.mjs`, `config-check.mjs`, and the accounts CLI
  `accounts-create.mjs` and `accounts-set-password.mjs` (`docs/ops/monitoring.md` §5).
- **Secrets stay in `/etc/udgam/app.env`** (0600 root). The owner types them in on the instance. They
  are never echoed, committed or pasted into a session.
  - Validate the stack with **`deploy/compose.sh config --quiet` only**.
  - **Never drop `--quiet`.** Without it, `config` prints the resolved stack, `app.env`'s secrets
    included.
- **Hard links.** The ledger key and the user keys are created with `link(2)`
  (`src/lib/crypto/key-file.ts`), so that exactly one process creates a key. The data volume must
  support hard links (ext4 does). `bootstrap.sh` checks this on the mount and stops if it fails.
- **Everything pulled is pinned** by digest or hash. See "Bumping a pinned image" below.

## First time on the instance

**Owner preconditions** (technical-plan TKT-27, EXE52):

- the A1 instance and its block volume;
- the domain's A record pointing at the instance;
- VCN ingress on 80 and 443;
- SSH access;
- the OCI bucket, with a dynamic group and policy for instance-principal writes;
- an `age` public key.

```sh
sudo -i
git clone https://github.com/<owner>/udgam.git /opt/udgam    # the crontab expects /opt/udgam
lsblk                                                         # find the block volume, e.g. /dev/oracleoci/oraclevdb
UDGAM_VOLUME_DEVICE=/dev/oracleoci/oraclevdb /opt/udgam/deploy/bootstrap.sh --dry-run
UDGAM_VOLUME_DEVICE=/dev/oracleoci/oraclevdb UDGAM_FORMAT_VOLUME=1 /opt/udgam/deploy/bootstrap.sh   # formats only an empty volume
/opt/udgam/deploy/bootstrap.sh                                # again: must print no "did:" line
# bootstrap.sh refuses any host that is not aarch64 (it formats volumes and rewrites the firewall).
df -h /mnt/udgam-data
editor /etc/udgam/app.env      # fill the values (deploy/app.env.example names them; UDGAM_DOMAIN included)
editor /etc/udgam/backup.env   # AGE_RECIPIENT, OCI_BUCKET (deploy/backup.env.example)
/opt/udgam/deploy/compose.sh config --quiet && echo stack-config-ok     # never without --quiet
/opt/udgam/scripts/deploy.sh                                  # builds natively (arm64) and starts the stack
```

The first deploy has no previous image and no database, so it takes no pre-deploy snapshot and has
nothing to roll back to.

## Redeploy, rollback

```sh
/opt/udgam/scripts/deploy.sh <branch-or-ref> 2>&1 | tee -a /var/log/udgam-deploy.log   # a branch means origin/<branch>
/opt/udgam/scripts/deploy.sh --rollback                 # swap :current and :previous (again to undo)
/opt/udgam/scripts/deploy.sh --rollback --restore-db    # also restore the last pre-deploy snapshot
```

A deploy runs these steps:

1. It refuses a dirty checkout.
2. It fetches, and checks out the ref detached. A branch name means `origin/<branch>`.
3. It snapshots the database with the running image.
4. It builds `udgam-app:<sha>`.
5. It retags images: the running one becomes `:previous`, the new one `:current`. The snapshot
   becomes the one `--restore-db` uses only at this point.
6. It runs `up -d`. If that fails, the gate fails, and compose's error stays on the terminal.
7. It waits up to 90 s for the app container to run exactly `:current`'s image and report healthy.
   A crash loop fails at once, including an invalid `app.env` (the `config.invalid` line, EXE55).
8. If the gate fails, it puts both tags back as they were, brings the old image up through the same
   gate, and exits 1.

The failed image keeps its `<sha>` tag for inspection. `--rollback` swaps the images only, and the
checkout stays where it is. It refuses when both tags name the same image. `--restore-db` checks
that a pre-deploy snapshot is recorded before anything moves, and it loses every write made since
that deploy. The replaced files are kept in `/mnt/udgam-data/pre-restore-<time>/`.

`--restore-db` runs `restore.sh --undo-if-unhealthy`. From the swap until the older image is healthy on
the snapshot, any failure or signal makes `restore.sh` undo: it stops the app (or kills it if it will
not stop), drops the snapshot's own `-wal`/`-shm`, and puts every live file back. Signals are ignored
while the undo runs, so it always finishes. If the rollback fails, both tags go back to where they
were. What happens next depends on `restore.sh`'s status:

| Status | Meaning | What `deploy.sh` does |
|---|---|---|
| 0 | restored, healthy on the snapshot | the rollback is done |
| 1 | failed; the live files are in place (nothing moved yet, or the undo put them all back) | brings the image that was running up again on the live files, through the gate; exits 1 |
| 3 | some live files could not be put back: the data directory is mixed, the app is stopped | starts nothing; the log names `pre-restore-<time>/`. Move the files back by hand, then `deploy/compose.sh up -d app` |
| 4 | the app could be neither stopped nor killed: it may still run on the snapshot; nothing was moved back | starts nothing; stop the app, move `pre-restore-<time>/`'s files back, then `up -d app` |
| 130, 143, other | interrupted (SIGINT/SIGTERM) or an unexpected failure. After a signal during the swap or the undo, the live files are back and the app is stopped; before the swap, nothing changed | starts nothing; the data state is reported as unknown. Check `restore.sh`'s lines and `/mnt/udgam-data` before `up -d app` |

The snapshot is never served once the rollback has failed, and no write is lost. A restore run by hand
(a recovery, without `--undo-if-unhealthy`) leaves an unhealthy app on the restored files and names
the folder, as before.

During the health gate, Caddy serves the new version as it is. A version that boots but answers 503
is visible to users until the rollback. Measured locally: about 94 s. That is the price of one
in-place instance.

## Backups and restore (TC-088)

The cron job runs nightly at 21:00 UTC (02:30 IST), from `/etc/cron.d/udgam`. It runs these steps:

1. It takes a `VACUUM INTO` snapshot of the database.
2. It streams `tar` of the archive's contents into `age -r <owner key>`. Nothing unencrypted with a
   key is written, and a failed run leaves no partial file.
3. It runs `oci os object put --auth instance_principal`.
4. It applies retention.

What the archive holds:

- **always:** the snapshot, `keys/`, `attestations/` (the organic certificates the database points
  at) and `evm/` (the contract deployment record);
- **with `LEDGER_ADAPTER=evm`:** also `anvil/` (the chain state);
- **with `BACKUP_MEDIA=1`:** also `media/`.

Retention follows `RETENTION_DAYS` (a whole number of at least 1; default 14), locally and in the
bucket:

- Only the script's own names (`<prefix>udgam-<UTC stamp>-<label>.tar.gz.age`) are ever deleted.
- It always keeps the newest 3 of each kind, today's backup, and the snapshot `deploy.sh` recorded.
- A failed upload, listing or delete fails the run.

The ledger key leaves the instance only inside the encrypted archive.

**Media is not archived by default** (`BACKUP_MEDIA=0`). Every certificate and proof feed verifies
without the photos, but the photos are evidence. Set `BACKUP_MEDIA=1` to include `media/`, and watch
the bucket's 20 GB Always Free limit (owner decision).

```sh
/opt/udgam/deploy/cron/backup.sh                     # by hand; logs to stdout
tail -n 20 /var/log/udgam-backup.log
```

**A restore in place**, for a real recovery. It stops the app, swaps the files, restarts the app and
checks it is healthy. Bring the owner's age identity for the restore, then delete it.

```sh
/opt/udgam/deploy/cron/restore.sh --archive oci:backups/udgam-<time>-nightly.tar.gz.age --identity /root/age.key
shred -u /root/age.key
```

A restore stages everything on the volume first. The swap is a short run of renames. If the swap
fails or is interrupted, every previous file goes back, the app restarts, and the script says so.

## Client-address caveat (Docker's userland proxy)

Caddy sees the real client address only when Docker forwards the published port with iptables DNAT.
That is the default for IPv4. If clients reach the instance over IPv6 while the Docker network is
IPv4-only, `docker-proxy` relays them, and Caddy sees the bridge gateway for every one of them. Every
client would then share one per-IP bucket. After go-live, check that Caddy's access log and the
throttle keys show real client addresses. Keep the instance IPv4-only unless that is solved
(`network_mode: host` for Caddy, or an IPv6-enabled Docker network).

## Request-body caps (SEC-005)

`request_body` caps how many bytes reach the app. The read fails with 413 at the first byte past the
cap. It is not an early refusal on `Content-Length`: a handler that answers before reading (a 401,
for example) never reads the body at all.

| Path | Cap | Why |
|---|---|---|
| `/api/capture*` | 32 MB | 3 × 10 MiB photos + the payload (30.25 MiB) |
| `/admin/plots/<id>/attestation` | 11 MiB | the 10 MiB organic certificate + its envelope |
| `/admin*` | 3 MiB | the 2 MiB plot Server Actions, under Next's 3 MiB Server Action cap (EXE50) |
| everything else | 1 MB | |

## Bumping a pinned image

Everything the instance pulls is pinned by digest (`tests/deploy/pins.static.test.ts` enforces it):

- `node:22-bookworm-slim` (`deploy/Dockerfile`);
- `debian:bookworm-slim` (`deploy/anvil.Dockerfile`);
- `caddy:2.11` (`deploy/docker-compose.yml`);
- the `docker/dockerfile:1` frontend (both Dockerfiles);
- the OCI CLI and its dependencies, by hash (`deploy/oci-cli-requirements.txt`).

A bump is a deliberate commit, never a rebuild that happens to pull something new:

1. Read the new multi-arch **index** digest (it covers both amd64 and arm64):
   `docker buildx imagetools inspect node:22-bookworm-slim | sed -n 's/^Digest: *//p'`.
   If Docker Hub answers 429, read the same tag through `mirror.gcr.io/library/<image>:<tag>`: it
   serves Docker Hub's manifests, so the digest is the same. On 2026-10-06, node and the dockerfile
   frontend matched between the two. The debian and caddy digests were read through the mirror while
   Hub was rate-limited, and the caddy one also matched the image ID of a `caddy:2` pulled from Hub.
2. Check that the digest lists `linux/arm64/v8`.
3. Replace the digest (and, for Caddy, the minor in the tag), read the image's release notes, then
   rebuild and run the local stack and the deploy tests.
4. OCI CLI: regenerate with
   `uv pip compile --python-version 3.12 --python-platform aarch64-unknown-linux-gnu --generate-hashes`
   from `oci-cli==<version>`. Check that the x86_64 platform gives the same file.

## Verification record

### Done locally (x86_64 cloud VM, Docker 29, Caddy 2.11.7, 2026-10-06)

- **The image builds.** `check-trace` passes on 92 traces. `check-standalone` passes: 65.2 MB with the bundled tools, no
  whole-project trace (QA-M002-3).
- **The image runs.** `require('sharp')` loads, the user is uid 10001, and the code is read-only.
  Migrations run and `/api/health` returns 200 within about 2 s.
- **The stack comes up.** `docker compose config` is valid, and `compose ps` shows app, Caddy and
  Anvil healthy with the pinned images and least privilege. Only Caddy publishes ports.
- **The forged-header test.** It fails against a pass-through proxy and against the app reached
  directly. It passes behind this Caddyfile. Caddy 2.11's default (no `header_up`) also passes: it
  already ignores an untrusted client's `X-Forwarded-For`. The explicit lines pin that behaviour, and
  `tests/deploy/caddy.static.test.ts` checks every route through `caddy adapt`.
- **The body caps hold** at their exact byte limits. Capture rows stream through Caddy every 500 ms
  with no encoding.
- **The bootstrap is idempotent** in a privileged `ubuntu:24.04` container with a loop-device volume.
  `systemctl` is a no-op there.
- **The backup and restore drill passes.** A certificate's proof feed verifies 18/18 after the restore,
  with the same kid, byte for byte. Re-run at the M-003 gate on the integration image (QA-M003-001: the
  drill had kept http:// URLs, which DES-219 now refuses): `tests/deploy/drill/restore-drill.sh <dir>`
  needs `udgam-app:current` tagged (backup.sh snapshots with it); `UDGAM_DRILL_IMAGE` overrides the
  image the drill serves.
- **The deploy cycle works.** It was run as: deploy HEAD, deploy a broken build (auto-rollback),
  deploy HEAD~1, `--rollback`, then `--rollback --restore-db`.
- **Script tests.** The failure paths of `backup.sh`, `restore.sh`, `deploy.sh` and `compose.sh` run
  against stub `docker`, `oci`, `age` and compose (`tests/deploy/*.script.test.ts`).

### BLOCKED (owner precondition)

Run these on the instance once it exists, and record the results in `docs/exec/ledger.md`. All of
them run as root (`sudo -i`), from `/opt/udgam`.

**Image and stack (TSK-27.1, 27.2).**

```sh
cd /opt/udgam
sha=$(git rev-parse --short HEAD)
docker build -f deploy/Dockerfile -t udgam-app:$sha --build-arg UDGAM_COMMIT=$sha .   # native arm64
docker run --rm udgam-app:$sha node -e "require('sharp')"; echo $?                       # 0
docker run --rm --entrypoint uname udgam-app:$sha -m                                     # aarch64
docker build -f deploy/anvil.Dockerfile -t udgam-anvil:1.8.3 deploy && docker run --rm udgam-anvil:1.8.3 --version   # deferred TKT-22 arm64 check
deploy/compose.sh ps                                                                     # all healthy
```

**TC-087: HTTPS, a Let's Encrypt certificate, HSTS.**

```sh
curl -sI https://<domain> | grep -i strict-transport
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null | openssl x509 -noout -issuer -dates
# issuer must name Let's Encrypt (e.g. "O = Let's Encrypt, CN = R11" or "E6"), not Caddy's local CA
```

Then make a real capture from the phone and check that the check rows arrive one by one. Run
`deploy/compose.sh restart`, and check that the data is still there.

**The forged-header test against production (EXE14).** It costs real limits. It sends 31 failed
sign-ins and 31 beacons from one address, so that address hits the sign-in per-IP limit and can't
sign in for up to 15 minutes; its beacons are refused for up to 10 minutes. **Prefer the EXE33
staging deployment** (the same image, its own data). If you must run it against production:

- run it from a machine whose address doesn't need to sign in for the next 15 minutes;
- never run it from the office's network.

Neither node nor pnpm is on the instance (bootstrap doesn't install them). Run it in a throwaway
node container from any machine with Docker:

```sh
docker run --rm -v /opt/udgam:/src:ro node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 \
  sh -c 'cp -r /src /w && cd /w && corepack enable && pnpm install --frozen-lockfile >/dev/null &&
         UDGAM_STACK_URL=https://<staging-or-prod-domain> pnpm vitest run tests/deploy/forged-header.stack.test.ts'
```

This form has no Docker access, so it skips the database check ("no throttle row is keyed by a forged
address"). On the instance itself, that check is:

```sh
docker exec -w /app udgam-app-1 node -e "const{createClient}=require('@libsql/client');const d=createClient({url:'file:/data/udgam.db'});d.execute(\"SELECT count(*) n FROM rate_limits WHERE key LIKE '%198.51.100.%' OR key LIKE '%203.0.113.%'\").then(r=>{console.log(r.rows[0].n);d.close()})"   # must print 0
```

**TC-088: a fresh-volume restore drill.** Never restore in place as a drill. The drill restores the
latest bucket archive into a new directory on the volume. It then serves it from a second app
container with no network at all, verifies a certificate, and cleans up.

```sh
ts=$(date -u +%Y%m%dT%H%M%SZ); drill=/mnt/udgam-data/drill-$ts
obj=$(oci os object list --auth instance_principal --bucket-name <bucket> --prefix backups/ --all \
      --query "data[].name | sort(@) | [-1]" --raw-output)                                   # the newest archive
time deploy/cron/restore.sh --archive "oci:$obj" --identity /root/age.key --data-dir "$drill" --offline
shred -u /root/age.key
docker run -d --name udgam-drill --network none --read-only --tmpfs /tmp --tmpfs /app/.next/cache:uid=10001,gid=10001 \
  --cap-drop ALL --security-opt no-new-privileges:true --env-file /etc/udgam/app.env \
  -e DATA_DIR=/data -e DATABASE_URL=file:/data/udgam.db -e LEDGER_KEY_PATH=/data/keys/ledger.jwk \
  -e LEDGER_ADAPTER=hashchain -v "$drill:/data" udgam-app:current
# --network none and no -p: never published, and it can never reach production's Anvil or the
# providers. Its provider status reads "error", which doesn't affect /api/health's 200.
# Wait at most 3 minutes for healthy. If it never gets there, STOP: the last log lines say why. Record
# the failure, then clean up with the last line of this block (docker rm -f …; rm -rf …).
timeout 180 sh -c 'until [ "$(docker inspect -f "{{.State.Health.Status}}" udgam-drill)" = healthy ]; do sleep 2; done' ||
  { echo "drill app not healthy within 180 s: STOP HERE"; docker logs --tail 50 udgam-drill; }
docker exec udgam-drill node -e "fetch('http://127.0.0.1:3000/api/verify/<batchId>?h=<shortHash>').then(r=>r.text()).then(t=>require('fs').writeFileSync('/tmp/feed.json',t))"
docker exec udgam-drill node -e "fetch('http://127.0.0.1:3000/.well-known/udgam-ledger-key').then(r=>r.text()).then(t=>require('fs').writeFileSync('/tmp/keys.json',t))"
# Copy both out BEFORE removing the container: its /tmp is a tmpfs and goes with it.
docker cp udgam-drill:/tmp/feed.json "/root/drill-$ts-feed.json"
docker cp udgam-drill:/tmp/keys.json "/root/drill-$ts-keys.json"
grep -o '"kid":"[^"]*"' "/root/drill-$ts-keys.json"     # same kid as https://<domain>/.well-known/udgam-ledger-key
# Verify that feed with the clean-room checker (evals/scorers/independent-verifier/cli.ts <feed.json>
# <keys.json>) in a node container, or open the production certificate in a browser and compare its kid.
docker rm -f udgam-drill && rm -rf "$drill"                                              # clean up
```

Record the restore time, the time to healthy, and the kid comparison.

**TC-089: redeploy and rollback.** Run deploy HEAD, deploy HEAD~1, then `--rollback`. Health must be
200 after each. Record the downtime.

**Oracle idle.** The owner chooses PAYG or keep-busy (`docs/ops/oracle-idle.md`). Record it as an EXE
decision.
