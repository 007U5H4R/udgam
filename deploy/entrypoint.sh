#!/bin/sh
# Udgam container entrypoint (TSK-27.1).
#
# Starting the server (`node server.js`, the image's CMD): check the configuration, check that /data is
# writable, run the app's migration runner (migrate.mjs: `pnpm db:migrate` semantics,
# src/lib/db/migrate.ts, EXE29; never drizzle-kit), then hand PID 1 to the server. Any of them failing
# exits non-zero here, so the container fails its start loudly instead of serving a half-migrated
# database or an invalid configuration.
#
# Invalid configuration (EXE55): config-check.mjs prints ONE line, `config.invalid: <variable names>`,
# never a value, and the container exits 1. Under `restart: unless-stopped` it restarts and fails again:
# scripts/deploy.sh's gate fails at once on `restarting` and rolls back, Caddy answers 502, and the
# uptime probe alerts. (A plain `next start` outside the container stays up instead, answering 503
# config:"error" on /api/health: src/lib/config/boot.ts.)
#
# Any other command (`docker run udgam-app node -e "require('sharp')"`) runs as given, untouched.
set -eu

if [ "$#" -eq 2 ] && [ "$1" = node ] && [ "$2" = server.js ]; then
  node /app/config-check.mjs || exit 1
  data="${DATA_DIR:-/data}"
  probe="$data/.udgam-write-probe.$$"
  if ! ( : >"$probe" ) 2>/dev/null; then
    echo "entrypoint: $data is not writable by uid $(id -u); give the volume to 10001:10001 (deploy/bootstrap.sh)" >&2
    exit 1
  fi
  rm -f "$probe"
  echo "entrypoint: migrating" >&2
  node /app/migrate.mjs
fi

exec "$@"
