# Shared helpers for deploy/cron/backup.sh, deploy/cron/restore.sh, deploy/compose.sh and
# scripts/deploy.sh (TKT-27). Sourced, never run. Nothing here prints an environment value or a secret.
#
#   UDGAM_DATA_DIR  the data volume on the host (default /mnt/udgam-data)
#   UDGAM_ENV_FILE  the app's environment file (default /etc/udgam/app.env); only single named lines
#                   are ever read from it (env_value)
#   UDGAM_COMPOSE   the compose command (default deploy/compose.sh; the local test stack sets
#                   "tests/deploy/stack/stack.sh compose")
#   UDGAM_APP_TAG   the image tag the one-off containers use (default current)
# shellcheck shell=bash

# A failure inside $(...) fails the command that uses it, as everywhere else under `set -e`.
shopt -s inherit_errexit

UDGAM_REPO="${UDGAM_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DATA="${UDGAM_DATA_DIR:-/mnt/udgam-data}"
APP_UID=10001
# Where the app's database lives inside its container. deploy/docker-compose.yml pins DATABASE_URL to it
# (an app.env value cannot move it), so the one-off snapshot container reads the same file.
APP_DATABASE_URL=file:/data/udgam.db

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() {
  log "error: $*" >&2
  exit 1
}

# Refuse to run without root, which owning files as uid 10001 needs. UDGAM_TEST_NONROOT=1 lets the
# script tests run unprivileged (ownership changes are then skipped, own()), and only together with the
# test sandbox's marker UDGAM_TEST_SANDBOX=1 (tests/deploy/helpers/script-sandbox.ts): one stray
# variable in an operator's shell never turns the root check off.
require_root() {
  [ "$(id -u)" = 0 ] && return 0
  [ "${UDGAM_TEST_NONROOT:-0}" = 1 ] && [ "${UDGAM_TEST_SANDBOX:-0}" = 1 ] && return 0
  die "run as root (sudo)"
}
own() { if [ "$(id -u)" = 0 ]; then chown "$@"; fi; }

# The value of NAME in the app's env file: the last `NAME=` line, one pair of surrounding quotes removed.
# Reads that one line only; never prints the file.
env_value() {
  sed -n "s/^$1=//p" "${UDGAM_ENV_FILE:-/etc/udgam/app.env}" 2>/dev/null | tail -n 1 |
    sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# Run the stack's compose command with the given arguments.
compose() {
  local cmd
  read -r -a cmd <<<"${UDGAM_COMPOSE:-$UDGAM_REPO/deploy/compose.sh}"
  "${cmd[@]}" "$@"
}

# The app container's id, or nothing when it does not exist.
app_container() { compose ps -a -q app 2>/dev/null | head -n 1; }

image_id() { docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true; }

# Wait up to $1 seconds for the app container to run udgam-app:current's image AND report healthy (its
# /api/health check). Fails at once when the container has exited, died or is restarting (a crash loop),
# and at the timeout when it still runs another image (compose did not recreate it) or is not healthy.
wait_healthy() {
  local limit="$1" start want id state img status health
  want="$(image_id udgam-app:current)"
  [ -n "$want" ] || return 1
  start="$(date +%s)"
  while [ $(($(date +%s) - start)) -lt "$limit" ]; do
    id="$(app_container)"
    if [ -n "$id" ]; then
      state="$(docker inspect --format '{{.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
      read -r img status health <<<"$state"
      case "$status" in
        exited | dead | restarting) return 1 ;;
      esac
      [ "$img" = "$want" ] && [ "$status" = running ] && [ "$health" = healthy ] && return 0
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
  out="$(docker run --rm --network none --user "$APP_UID:$APP_UID" -e DATA_DIR=/data -e "DATABASE_URL=$APP_DATABASE_URL" \
    -v "$DATA:/data" --entrypoint node "$image" /app/deploy/db/backup.mjs --label "$label")" || return 1
  case "$out" in
    /data/backups/*.db) echo "$DATA/${out#/data/}" ;;
    *)
      log "error: snapshot printed an unexpected path" >&2
      return 1
      ;;
  esac
}

# The UTC timestamp in a backup file or object name (udgam-20261006T121821Z-nightly...), or nothing.
name_stamp() { sed -n 's/^\(.*\/\)\{0,1\}udgam-\([0-9]\{8\}T[0-9]\{6\}Z\)-.*/\2/p' <<<"$1"; }

# Print which of the names on stdin (one per line) retention removes: those whose name timestamp is older
# than $1 days, except the newest $2 (by timestamp) and any name listed in the remaining arguments.
# A name without a timestamp is never removed.
prunable() {
  local days="$1" keep="$2" cutoff name stamp
  shift 2
  cutoff="$(date -u -d "-$days days" +%Y%m%dT%H%M%SZ)"
  local -a dated=()
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    stamp="$(name_stamp "$name")"
    [ -n "$stamp" ] && dated+=("$stamp $name")
  done
  [ "${#dated[@]}" -gt 0 ] || return 0
  printf '%s\n' "${dated[@]}" | sort -r | tail -n +"$((keep + 1))" | while read -r stamp name; do
    [[ "$stamp" < "$cutoff" ]] || continue
    local p skip=0
    for p in "$@"; do [ "$name" = "$p" ] && skip=1; done
    [ "$skip" = 1 ] || echo "$name"
  done
}
