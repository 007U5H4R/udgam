#!/usr/bin/env bash
# One-command redeploy with a health gate and rollback (TKT-27, TSK-27.7, TC-089). On the instance:
#
#   sudo /opt/udgam/scripts/deploy.sh [<git-ref>]      deploy a ref (default: what is checked out)
#   sudo /opt/udgam/scripts/deploy.sh --rollback [--restore-db]
#
# deploy: git fetch + checkout <ref> (detached; refused on a dirty checkout) -> pre-deploy database
# snapshot with the running image (`pnpm db:backup`) -> build udgam-app:<sha> on this host -> the running
# image becomes udgam-app:previous, the new one udgam-app:current -> `compose up -d` -> wait up to 90 s for
# the app to report healthy (/api/health 200), else roll back to :previous automatically and exit 1.
# A failed build changes nothing: the running app keeps serving.
#
# --rollback: swap :current and :previous (run it again to undo) and restart. --restore-db also puts back
# the last pre-deploy snapshot (deploy/cron/restore.sh --snapshot): every write since that deploy is
# lost, and the replaced files are kept in DATA_DIR/pre-restore-<time>/. Use it when the older version
# cannot run on the newer schema (migrations are forward-only, EXE29).
#
# Every run logs its start, each step and its end with UTC times, and the app's time from `up` to
# healthy (the downtime upper bound). Settings: UDGAM_DATA_DIR, UDGAM_COMPOSE (deploy/lib.sh),
# UDGAM_HEALTH_TIMEOUT (90), UDGAM_DEPLOY_NO_FETCH=1 (skip `git fetch`), UDGAM_BUILD_ARGS (extra
# `docker build` arguments, e.g. a base-image mirror).
set -euo pipefail
# shellcheck source=deploy/lib.sh
. "$(cd "$(dirname "$0")/.." && pwd)/deploy/lib.sh"

# Everything runs inside main(): bash has read the whole function before `git checkout` can rewrite
# this file on disk.
main() {
  local timeout="${UDGAM_HEALTH_TIMEOUT:-90}" t0
  t0="$(date +%s)"
  cd "$UDGAM_REPO"

  local lockdir=/run/lock
  [ -d "$lockdir" ] || lockdir="${TMPDIR:-/tmp}"
  exec 9>"$lockdir/udgam-deploy.lock"
  flock -n 9 || die "another deploy is running"

  if [ "${1:-}" = --rollback ]; then
    rollback "$timeout" "${2:-}"
  else
    deploy "$timeout" "${1:-}"
  fi
  log "deploy.sh: end (${SECONDS}s in all; started $(date -u -d "@$t0" +%H:%M:%SZ))"
}

image_id() { docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true; }

# Bring the stack up on udgam-app:current and wait for health. Prints the seconds from `up` to healthy.
up_and_wait() {
  local timeout="$1" t
  t="$(date +%s)"
  compose up -d >/dev/null 2>&1
  if wait_healthy "$timeout"; then
    echo "$(($(date +%s) - t))"
    return 0
  fi
  return 1
}

deploy() {
  local timeout="$1" ref="$2" sha new old snap secs
  log "deploy.sh: start (deploy ${ref:-the checked-out commit})"

  if [ -n "$ref" ]; then
    [ -z "$(git status --porcelain --untracked-files=no)" ] || die "the checkout has local changes; commit or discard them first"
    [ "${UDGAM_DEPLOY_NO_FETCH:-0}" = 1 ] || git fetch --quiet --tags origin
    git -c advice.detachedHead=false checkout --quiet --detach "$ref"
  fi
  sha="$(git rev-parse --short HEAD)"
  log "deploy.sh: commit $sha"

  old="$(image_id udgam-app:current)"
  if [ -n "$old" ] && [ -f "$DATA/udgam.db" ]; then
    snap="$(snapshot_db predeploy udgam-app:current)"
    echo "$snap" >"$DATA/backups/last-predeploy"
    log "deploy.sh: pre-deploy snapshot $(basename "$snap")"
  else
    log "deploy.sh: no running image or database yet; no pre-deploy snapshot"
  fi

  local build_args=()
  # shellcheck disable=SC2206 # deliberate word splitting of the operator's extra arguments
  [ -n "${UDGAM_BUILD_ARGS:-}" ] && build_args=($UDGAM_BUILD_ARGS)
  local tb
  tb="$(date +%s)"
  docker build --quiet -f deploy/Dockerfile -t "udgam-app:$sha" --build-arg "UDGAM_COMMIT=$sha" "${build_args[@]}" . >/dev/null ||
    die "build failed; nothing changed, the running app keeps serving"
  log "deploy.sh: built udgam-app:$sha in $(($(date +%s) - tb))s"

  new="$(image_id "udgam-app:$sha")"
  if [ -n "$old" ] && [ "$old" != "$new" ]; then
    docker tag udgam-app:current udgam-app:previous
  fi
  docker tag "udgam-app:$sha" udgam-app:current

  if secs="$(up_and_wait "$timeout")"; then
    log "deploy.sh: udgam-app:$sha healthy ${secs}s after up"
    return 0
  fi

  log "deploy.sh: udgam-app:$sha not healthy within ${timeout}s; rolling back"
  if [ -z "$old" ] || [ "$old" = "$new" ]; then
    die "no previous image to roll back to; the app is down (docker compose logs app)"
  fi
  docker tag udgam-app:previous udgam-app:current
  if secs="$(up_and_wait "$timeout")"; then
    log "deploy.sh: rolled back to the previous image, healthy ${secs}s after up; udgam-app:$sha is kept for inspection"
  else
    log "deploy.sh: the previous image is not healthy either: try --rollback --restore-db"
  fi
  log "deploy.sh: end (failed; ${SECONDS}s in all)"
  exit 1
}

rollback() {
  local timeout="$1" restore="$2" secs
  log "deploy.sh: start (rollback${restore:+ $restore})"
  [ -z "$restore" ] || [ "$restore" = --restore-db ] || die "unknown option $restore"
  [ -n "$(image_id udgam-app:previous)" ] || die "no udgam-app:previous image to roll back to"
  docker tag udgam-app:current udgam-app:rollback-swap
  docker tag udgam-app:previous udgam-app:current
  docker tag udgam-app:rollback-swap udgam-app:previous
  docker rmi udgam-app:rollback-swap >/dev/null
  log "deploy.sh: udgam-app:current is now the previous image"

  if [ -n "$restore" ]; then
    local snap
    snap="$(cat "$DATA/backups/last-predeploy" 2>/dev/null || true)"
    [ -f "$snap" ] || die "no pre-deploy snapshot recorded in $DATA/backups/last-predeploy"
    log "deploy.sh: restoring $(basename "$snap"); writes since that deploy are lost"
    "$UDGAM_REPO/deploy/cron/restore.sh" --snapshot "$snap" --data-dir "$DATA"
    log "deploy.sh: rolled back with the pre-deploy database"
    return 0
  fi
  if secs="$(up_and_wait "$timeout")"; then
    log "deploy.sh: rolled back, healthy ${secs}s after up"
  else
    die "the rolled-back image is not healthy within ${timeout}s (try --rollback --restore-db)"
  fi
}

main "$@"
