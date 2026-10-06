#!/usr/bin/env bash
# A local copy of the production stack for the deploy tests (TKT-27). Never used on the instance.
#
#   tests/deploy/stack/stack.sh up [--evm]   build nothing; start deploy/docker-compose.yml with Caddy
#                                            serving `localhost` from its internal CA, wait until healthy
#   tests/deploy/stack/stack.sh down         stop it and remove its volumes and scratch data
#   tests/deploy/stack/stack.sh compose ...  any `docker compose` command against the same stack
#
# Environment (all optional):
#   UDGAM_STACK_DIR        scratch directory for data, env file and Caddy's root cert (default
#                          ${TMPDIR:-/tmp}/udgam-stack)
#   UDGAM_STACK_HTTPS_PORT / UDGAM_STACK_HTTP_PORT   host ports (default 4711 / 4710)
#   UDGAM_STACK_TAG        the udgam-app tag to run (default current)
#   UDGAM_STACK_CADDYFILE  a Caddyfile to mount instead of deploy/Caddyfile (to show a test failing)
#   UDGAM_STACK_APP_ENV    extra NON-SECRET app.env lines, newline-separated (e.g.
#                          LEDGER_CHECKPOINT_INTERVAL_SEC=20 for a quick timer check); they come last, so
#                          they win over the defaults above
#
# The app gets a throwaway environment: placeholder provider credentials (the live provider, so no
# fixture data, as in production) and an auth secret generated here and passed to compose by name only.
# It is never printed or written to disk (EXE38).
set -euo pipefail

root="$(cd "$(dirname "$0")/../../.." && pwd)"
dir="${UDGAM_STACK_DIR:-${TMPDIR:-/tmp}/udgam-stack}"
https_port="${UDGAM_STACK_HTTPS_PORT:-4711}"
http_port="${UDGAM_STACK_HTTP_PORT:-4710}"

export UDGAM_DOMAIN=localhost
export UDGAM_HTTPS_PORT="$https_port"
export UDGAM_HTTP_PORT="$http_port"
export UDGAM_DATA_DIR="$dir/data"
export UDGAM_ENV_FILE="$dir/app.env"
export UDGAM_APP_TAG="${UDGAM_STACK_TAG:-current}"

compose() {
  local files=(-f "$root/deploy/docker-compose.yml" -f "$root/tests/deploy/stack/compose.local.yml")
  if [ -n "${UDGAM_STACK_CADDYFILE:-}" ]; then
    printf 'services:\n  caddy:\n    volumes:\n      - %s:/etc/caddy/Caddyfile:ro\n' "$(realpath "$UDGAM_STACK_CADDYFILE")" >"$dir/caddyfile.override.yml"
    files+=(-f "$dir/caddyfile.override.yml")
  fi
  docker compose -p udgam-local "${files[@]}" "$@"
}

case "${1:-}" in
  up)
    profile=()
    [ "${2:-}" = --evm ] && profile=(--profile evm)
    mkdir -p "$dir/data/anvil"
    chown -R 10001:10001 "$dir/data"
    chmod 0700 "$dir/data"
    cat >"$dir/app.env" <<EOF
BETTER_AUTH_URL=https://localhost:$https_port
PUBLIC_BASE_URL=https://localhost:$https_port
REMOTE_SENSING_PROVIDER=live
GFW_API_KEY=local-placeholder
CDSE_CLIENT_ID=local-placeholder
CDSE_CLIENT_SECRET=local-placeholder
EOF
    if [ -n "${UDGAM_STACK_APP_ENV:-}" ]; then printf '%s\n' "$UDGAM_STACK_APP_ENV" >>"$dir/app.env"; fi
    chmod 0600 "$dir/app.env"
    BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
    export BETTER_AUTH_SECRET
    compose "${profile[@]}" up -d --wait --wait-timeout 180
    for _ in $(seq 1 30); do
      compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$dir/caddy-root.crt" >/dev/null 2>&1 && break
      sleep 1
    done
    echo "stack: https://localhost:$https_port (CA $dir/caddy-root.crt)"
    ;;
  down)
    compose --profile evm down -v --remove-orphans
    rm -rf "$dir"
    ;;
  compose)
    shift
    compose "$@"
    ;;
  *)
    echo "usage: $0 up [--evm] | down | compose <args>" >&2
    exit 2
    ;;
esac
