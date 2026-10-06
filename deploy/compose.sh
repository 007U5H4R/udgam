#!/usr/bin/env bash
# `docker compose` against the production stack (TKT-27), with its non-secret settings filled in:
#
#   deploy/compose.sh ps | logs app | up -d | config --quiet | ...
#
# UDGAM_DOMAIN and LEDGER_ADAPTER are read from /etc/udgam/app.env (UDGAM_ENV_FILE), one line each, quoted
# or not, and nothing else from the file (deploy/lib.sh env_value); they are never printed.
# LEDGER_ADAPTER=evm turns on the `evm` profile (Anvil). Any of UDGAM_DOMAIN, UDGAM_DATA_DIR,
# UDGAM_APP_TAG and COMPOSE_PROFILES already set wins.
#
# A missing or unreadable app.env stops here with the reason (compose needs it: env_file, required).
#
# NEVER run `config` without --quiet: it prints the resolved stack, app.env's secrets included.
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
export UDGAM_ENV_FILE="${UDGAM_ENV_FILE:-/etc/udgam/app.env}"

# Compose needs the file too (env_file, required). Say so plainly, before compose's own error.
if [ ! -e "$UDGAM_ENV_FILE" ]; then
  die "$UDGAM_ENV_FILE not found: create it from deploy/app.env.example (deploy/bootstrap.sh does) and fill it in"
elif [ ! -f "$UDGAM_ENV_FILE" ] || [ ! -r "$UDGAM_ENV_FILE" ]; then
  die "$UDGAM_ENV_FILE is not a readable file: run this as root (sudo -i), and keep it 0600 root"
fi

if [ -z "${UDGAM_DOMAIN:-}" ]; then
  UDGAM_DOMAIN="$(env_value UDGAM_DOMAIN)"
  export UDGAM_DOMAIN
fi
if [ -z "${COMPOSE_PROFILES:-}" ] && [ "$(env_value LEDGER_ADAPTER)" = evm ]; then
  export COMPOSE_PROFILES=evm
fi
exec docker compose -f "$UDGAM_REPO/deploy/docker-compose.yml" "$@"
