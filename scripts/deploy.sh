#!/usr/bin/env bash
# One-command redeploy with a health gate and rollback (TKT-27, TSK-27.7, TC-089). On the instance:
#
#   sudo /opt/udgam/scripts/deploy.sh [<git-ref>]      deploy a ref (default: what is checked out)
#   sudo /opt/udgam/scripts/deploy.sh --rollback [--restore-db]
#
# deploy: refuse a dirty checkout -> git fetch, then check out <ref> detached (a branch name means
# origin/<branch>, the fetched one) -> pre-deploy database snapshot with the running image
# (`pnpm db:backup`) -> build udgam-app:<sha> on this host -> the running image becomes
# udgam-app:previous, the new one udgam-app:current -> `compose up -d` -> wait up to 90 s until the app
# container runs that image and reports healthy (/api/health 200), else roll back to the image that was
# running (and the :previous before it) and exit 1. A failed build changes nothing. The pre-deploy
# snapshot becomes the one --restore-db uses only once the new image is :current.
#
# --rollback: swap :current and :previous (run it again to undo) and restart, through the same gate.
# --restore-db also puts back the last pre-deploy snapshot (deploy/cron/restore.sh --snapshot): every
# write since that deploy is lost, and the replaced files are kept in DATA_DIR/pre-restore-<time>/. Use
# it when the older version cannot run on the newer schema (migrations are forward-only, EXE29).
#
# Every run logs its start, each step and its end with UTC times, and the app's time from `up` to
# healthy (the downtime upper bound). Settings: UDGAM_DATA_DIR, UDGAM_COMPOSE (deploy/lib.sh),
# UDGAM_HEALTH_TIMEOUT (90), UDGAM_DEPLOY_NO_FETCH=1 (skip `git fetch`), UDGAM_BUILD_ARGS (extra
# `docker build` arguments, e.g. a base-image mirror).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/../deploy/lib.sh"
RESTORE="$here/../deploy/cron/restore.sh"

# Everything runs inside main(): bash has read the whole function before `git checkout` can rewrite
# this file on disk.
main() {
  local timeout="${UDGAM_HEALTH_TIMEOUT:-90}" t0
  t0="$(date +%s)"
  require_root
  cd "$UDGAM_REPO"

  local lockdir="${UDGAM_LOCK_DIR:-/run/lock}"
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

# Bring the stack up on udgam-app:current and pass the gate (lib.sh wait_healthy). Sets UP_SECS. A
# failing `compose up` fails here, its own message left on stderr.
UP_SECS=0
up_and_wait() {
  local timeout="$1" t
  t="$(date +%s)"
  if ! compose up -d >/dev/null; then
    log "deploy.sh: compose up failed" >&2
    return 1
  fi
  wait_healthy "$timeout" || return 1
  UP_SECS=$(($(date +%s) - t))
}

deploy() {
  local timeout="$1" ref="$2" sha new old old_prev snap="" target
  log "deploy.sh: start (deploy ${ref:-the checked-out commit})"

  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "the checkout has local changes; commit or discard them first"
  if [ -n "$ref" ]; then
    [ "${UDGAM_DEPLOY_NO_FETCH:-0}" = 1 ] || git fetch --quiet --tags origin
    target="$ref"
    if git rev-parse --verify --quiet "refs/remotes/origin/$ref^{commit}" >/dev/null; then
      target="origin/$ref" # a branch name: the fetched branch, never a stale local one
    fi
    git -c advice.detachedHead=false checkout --quiet --detach "$target"
  fi
  sha="$(git rev-parse --short HEAD)"
  log "deploy.sh: commit $sha"

  old="$(image_id udgam-app:current)"
  old_prev="$(image_id udgam-app:previous)"
  if [ -n "$old" ] && [ -f "$DATA/udgam.db" ]; then
    snap="$(snapshot_db predeploy udgam-app:current)" || die "the pre-deploy snapshot failed; nothing changed"
    log "deploy.sh: pre-deploy snapshot $(basename "$snap")"
  else
    log "deploy.sh: no running image or database yet; no pre-deploy snapshot"
  fi

  local build_args=() tb
  # shellcheck disable=SC2206 # deliberate word splitting of the operator's extra arguments
  [ -n "${UDGAM_BUILD_ARGS:-}" ] && build_args=($UDGAM_BUILD_ARGS)
  tb="$(date +%s)"
  docker build --quiet -f deploy/Dockerfile -t "udgam-app:$sha" --build-arg "UDGAM_COMMIT=$sha" "${build_args[@]}" . >/dev/null ||
    die "build failed; nothing changed, the running app keeps serving"
  log "deploy.sh: built udgam-app:$sha in $(($(date +%s) - tb))s"

  new="$(image_id "udgam-app:$sha")"
  if [ -n "$old" ] && [ "$old" != "$new" ]; then
    docker tag "$old" udgam-app:previous || die "could not tag the running image as :previous; nothing changed"
  fi
  if ! docker tag "$new" udgam-app:current; then
    restore_tags "$old" "$old_prev"
    die "could not tag udgam-app:$sha as :current; nothing changed"
  fi
  # Only now is this deploy's snapshot the one to go back to (Q4).
  if [ -n "$snap" ]; then
    printf '%s\n' "$snap" >"$DATA/backups/last-predeploy.tmp"
    mv "$DATA/backups/last-predeploy.tmp" "$DATA/backups/last-predeploy"
  fi

  if up_and_wait "$timeout"; then
    log "deploy.sh: udgam-app:$sha healthy ${UP_SECS}s after up"
    return 0
  fi

  log "deploy.sh: udgam-app:$sha not healthy within ${timeout}s; rolling back"
  if [ -z "$old" ] || [ "$old" = "$new" ]; then
    die "no previous image to roll back to; the app is down (deploy/compose.sh logs app)"
  fi
  restore_tags "$old" "$old_prev"
  if up_and_wait "$timeout"; then
    log "deploy.sh: rolled back to the previous image, healthy ${UP_SECS}s after up; udgam-app:$sha is kept for inspection"
  else
    log "deploy.sh: the previous image is not healthy either: try --rollback --restore-db" >&2
  fi
  log "deploy.sh: end (failed; ${SECONDS}s in all)"
  exit 1
}

# Put :current back on $1 and :previous back on $2 (or remove :previous when there was none), so an
# automatic rollback leaves the tags as they were before the deploy (Q5).
restore_tags() {
  local cur="$1" prev="$2"
  [ -n "$cur" ] && docker tag "$cur" udgam-app:current
  if [ -n "$prev" ]; then
    docker tag "$prev" udgam-app:previous
  else
    docker rmi udgam-app:previous >/dev/null 2>&1 || true
  fi
}

rollback() {
  local timeout="$1" restore="$2" cur prev snap=""
  log "deploy.sh: start (rollback${restore:+ $restore})"
  [ -z "$restore" ] || [ "$restore" = --restore-db ] || die "unknown option $restore"
  cur="$(image_id udgam-app:current)"
  prev="$(image_id udgam-app:previous)"
  [ -n "$prev" ] || die "no udgam-app:previous image to roll back to"
  [ "$cur" != "$prev" ] || die "udgam-app:current and udgam-app:previous are the same image; nothing to roll back to"
  if [ -n "$restore" ]; then
    # Checked before any tag moves (Q6).
    snap="$(cat "$DATA/backups/last-predeploy" 2>/dev/null || true)"
    [ -f "$snap" ] || die "no pre-deploy snapshot recorded in $DATA/backups/last-predeploy"
  fi

  docker tag "$prev" udgam-app:current
  docker tag "$cur" udgam-app:previous
  log "deploy.sh: udgam-app:current is now the previous image"

  if [ -n "$restore" ]; then
    log "deploy.sh: restoring $(basename "$snap"); writes since that deploy are lost"
    "$RESTORE" --snapshot "$snap" --data-dir "$DATA"
    log "deploy.sh: rolled back with the pre-deploy database"
    return 0
  fi
  up_and_wait "$timeout" || die "the rolled-back image is not healthy within ${timeout}s (try --rollback --restore-db)"
  log "deploy.sh: rolled back, healthy ${UP_SECS}s after up"
}

main "$@"
exit $?
