# Shared helpers for deploy/cron/backup.sh, deploy/cron/restore.sh and scripts/deploy.sh (TKT-27).
# Sourced, never run. Nothing here prints an environment value or a secret.
#
#   UDGAM_DATA_DIR  the data volume on the host (default /mnt/udgam-data)
#   UDGAM_COMPOSE   the compose command (default deploy/compose.sh; the local test stack sets
#                   "tests/deploy/stack/stack.sh compose")
#   UDGAM_APP_TAG   the image tag the one-off containers use (default current)
# shellcheck shell=bash

UDGAM_REPO="${UDGAM_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DATA="${UDGAM_DATA_DIR:-/mnt/udgam-data}"
APP_UID=10001

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  log "error: $*" >&2
  exit 1
}

# Run the stack's compose command with the given arguments.
compose() {
  local cmd
  read -r -a cmd <<<"${UDGAM_COMPOSE:-$UDGAM_REPO/deploy/compose.sh}"
  "${cmd[@]}" "$@"
}

# The app container's id, or nothing when it does not exist.
app_container() { compose ps -a -q app 2>/dev/null | head -n 1; }

# Wait up to $1 seconds for the app container to report healthy (its /api/health check). Returns 1 on
# timeout, or at once when the container has exited.
wait_healthy() {
  local limit="$1" start id status
  start="$(date +%s)"
  while [ $(($(date +%s) - start)) -lt "$limit" ]; do
    id="$(app_container)"
    if [ -n "$id" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      [ "$status" = healthy ] && return 0
      [ "$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null || true)" = exited ] && return 1
    fi
    sleep 1
  done
  return 1
}

# Snapshot the database (`pnpm db:backup`, deploy/db/backup.mjs) in a one-off container of the image, so
# it works whether or not the app is running. Prints the snapshot's host path.
# $1: a label (nightly, predeploy); $2: the image (default udgam-app:${UDGAM_APP_TAG:-current}).
snapshot_db() {
  local label="$1" image="${2:-udgam-app:${UDGAM_APP_TAG:-current}}" out
  out="$(docker run --rm --network none --user "$APP_UID:$APP_UID" -e DATA_DIR=/data -v "$DATA:/data" \
    --entrypoint node "$image" /app/deploy/db/backup.mjs --label "$label")"
  case "$out" in
    /data/backups/*.db) echo "$DATA/${out#/data/}" ;;
    *) die "snapshot printed an unexpected path" ;;
  esac
}
