#!/bin/sh
# Udgam container entrypoint (TSK-27.1).
#
# Starting the server (`node server.js`, the image's CMD): check that /data is writable, run the app's
# migration runner (migrate.mjs: `pnpm db:migrate` semantics, src/lib/db/migrate.ts, EXE29; never
# drizzle-kit), then hand PID 1 to the server. A failed migration or an invalid environment exits
# non-zero here, so the container fails its start loudly instead of serving a half-migrated database.
# Any other command (`docker run udgam-app node -e "require('sharp')"`) runs as given, untouched.
set -eu

if [ "$#" -eq 2 ] && [ "$1" = node ] && [ "$2" = server.js ]; then
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
