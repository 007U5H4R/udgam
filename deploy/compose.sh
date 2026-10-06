#!/usr/bin/env bash
# `docker compose` against the production stack (TKT-27), with its non-secret settings filled in:
#
#   deploy/compose.sh ps | logs app | up -d | ...
#
# UDGAM_DOMAIN and LEDGER_ADAPTER are read from /etc/udgam/app.env (UDGAM_ENV_FILE), one line each and
# nothing else from the file; it is never printed. LEDGER_ADAPTER=evm turns on the `evm` profile (Anvil).
# Any of UDGAM_DOMAIN, UDGAM_DATA_DIR, UDGAM_APP_TAG and COMPOSE_PROFILES already set wins.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
export UDGAM_ENV_FILE="${UDGAM_ENV_FILE:-/etc/udgam/app.env}"

value() { sed -n "s/^$1=//p" "$UDGAM_ENV_FILE" 2>/dev/null | tail -n 1; }

if [ -z "${UDGAM_DOMAIN:-}" ]; then
  UDGAM_DOMAIN="$(value UDGAM_DOMAIN)"
  export UDGAM_DOMAIN
fi
if [ -z "${COMPOSE_PROFILES:-}" ] && [ "$(value LEDGER_ADAPTER)" = evm ]; then
  export COMPOSE_PROFILES=evm
fi
exec docker compose -f "$repo/deploy/docker-compose.yml" "$@"
