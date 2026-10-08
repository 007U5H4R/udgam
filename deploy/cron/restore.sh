#!/usr/bin/env bash
# Restore the database (and keys) from a backup (TKT-27, TSK-27.5, TC-088).
#
#   restore.sh --archive <file.tar.gz.age | oci:<object-name>> --identity <age-identity-file> [options]
#       an encrypted nightly archive (deploy/cron/backup.sh): the database snapshot, keys/,
#       attestations/, evm/, and anvil/ and media/ when they were archived. `oci:` fetches the object.
#   restore.sh --snapshot <file.db> [options]
#       a local plain snapshot (`pnpm db:backup`, e.g. scripts/deploy.sh's pre-deploy one): the database
#       only; everything else on the volume is kept.
#
# Options:
#   --data-dir <dir>        restore into this directory (default UDGAM_DATA_DIR, /mnt/udgam-data); a
#                           missing one is created 0700
#   --offline               do not stop or start the app (a fresh directory for a drill, or the app
#                           already down). A drill is ALWAYS --offline into a fresh directory.
#   --health-timeout <s>    how long the restarted app has to report healthy (default 90)
#   --undo-if-unhealthy     online only: from the swap until the app is healthy on the restored files, any
#                           failure or signal undoes: stop (or kill) the app, put the previous files back
#                           (the restored database's own -wal/-shm are dropped), then start it again and
#                           exit 1, or after a signal leave it stopped. scripts/deploy.sh --rollback
#                           --restore-db passes it, so a failed rollback never serves the snapshot. Without
#                           it (a recovery by hand), an unhealthy app is left on the restored files.
#
# Exit status:
#   0    restored (and, online, healthy).
#   1    failed, and the previous files are in place: before the swap nothing moved, or the undo put
#        every one back. (Without --undo-if-unhealthy, also: restored but not healthy, as the message
#        says.) The only status after which scripts/deploy.sh starts an app.
#   3    the previous files could not all be put back: the data directory is MIXED, the app is stopped,
#        and the message names the aside folder.
#   4    the app could not be stopped (nor killed) to undo: it may still run on the restored files, the
#        previous ones are in the aside folder.
#   130/143  interrupted (SIGINT/SIGTERM). A signal during the swap or the undo never stops the undo half
#        way: the previous files are put back first, the app is left stopped, and the message says so.
#        Before the swap, nothing has changed.
#
# How (Q3): everything is decrypted, checked and staged on the same volume first, owned by uid 10001
# with the app's modes, while the app still runs. Then, with the app stopped, a short run of renames moves
# the current files aside to <data-dir>/pre-restore-<UTC time>/ (never deleted) and the staged ones in:
# udgam.db (its -wal and -shm go aside), keys/, attestations/, evm/, anvil/. If any rename fails or the
# script is interrupted there, the staged files are dropped, every file moved aside goes back, the app is
# started again, and the script says so. media/ is merged afterwards, never replaced (photos are
# content-addressed). Online, the app must then report healthy, else it fails naming the aside folder.
# The app's boot migrates an older snapshot forward. The identity file is the owner's age PRIVATE key:
# bring it for the restore and remove it after. `oci:` settings come from /etc/udgam/backup.env
# (OCI_DRY_RUN=1 reads the local stand-in directory instead).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/../lib.sh"

archive="" identity="" snapshot="" offline=0 timeout=90 undo_unhealthy=0
while [ $# -gt 0 ]; do
  case "$1" in
    --archive) archive="$2"; shift 2 ;;
    --identity) identity="$2"; shift 2 ;;
    --snapshot) snapshot="$2"; shift 2 ;;
    --data-dir) DATA="$2"; shift 2 ;;
    --offline) offline=1; shift ;;
    --health-timeout) timeout="$2"; shift 2 ;;
    --undo-if-unhealthy) undo_unhealthy=1; shift ;;
    *) die "unknown argument $1 (see the header of $0)" ;;
  esac
done
if [ -n "$archive" ]; then
  [ -z "$snapshot" ] || die "--archive or --snapshot, not both"
  [ -r "$identity" ] || die "--archive needs --identity <age identity file>"
else
  [ -n "$snapshot" ] || die "nothing to restore: --archive or --snapshot"
  [ -r "$snapshot" ] || die "$snapshot not readable"
fi
require_root

conf="${UDGAM_BACKUP_ENV:-/etc/udgam/backup.env}"
if [ -r "$conf" ]; then
  # shellcheck source=/dev/null
  . "$conf"
fi

t0="$(date +%s)"
log "restore: start into $DATA"
if [ ! -d "$DATA" ]; then
  install -d -m 0700 "$DATA"
  own "$APP_UID:$APP_UID" "$DATA"
fi
work="$(mktemp -d "$DATA/.restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT
stage="$work/stage"
mkdir "$stage"

# 1. Fetch, decrypt, check and stage. Nothing on the volume changes yet.
db=""
if [ -n "$archive" ]; then
  if [ "${archive#oci:}" != "$archive" ]; then
    object="${archive#oci:}"
    if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
      cp "${OCI_DRY_RUN_DIR:-$DATA/backups/oci-dry-run}/$(basename "$object")" "$work/archive"
    else
      a=(--auth instance_principal --bucket-name "${OCI_BUCKET:?set OCI_BUCKET in $conf}" --name "$object" --file "$work/archive")
      [ -n "${OCI_NAMESPACE:-}" ] && a+=(--namespace-name "$OCI_NAMESPACE")
      oci os object get "${a[@]}" >/dev/null
    fi
    archive="$work/archive"
    log "restore: fetched $object ($(stat -c %s "$archive") bytes) in $(($(date +%s) - t0))s"
  fi
  t1="$(date +%s)"
  mkdir "$work/x"
  age -d -i "$identity" "$archive" | tar -C "$work/x" -xzf -
  shopt -s nullglob
  dbs=("$work"/x/backups/udgam-*.db)
  shopt -u nullglob
  [ "${#dbs[@]}" = 1 ] || die "the archive holds ${#dbs[@]} database snapshots, not 1"
  db="${dbs[0]}"
  [ -f "$work/x/keys/ledger.jwk" ] || die "the archive has no keys/ledger.jwk"
  log "restore: decrypted $(basename "$db") in $(($(date +%s) - t1))s"
else
  db="$snapshot"
fi

install -m 0600 "$db" "$stage/udgam.db"
own "$APP_UID:$APP_UID" "$stage/udgam.db"
items=(udgam.db)
if [ -n "$archive" ]; then
  for d in keys attestations evm anvil; do
    if [ -d "$work/x/$d" ]; then
      mv "$work/x/$d" "$stage/$d"
      own -R "$APP_UID:$APP_UID" "$stage/$d"
      items+=("$d")
    fi
  done
  chmod 0700 "$stage/keys"
fi
log "restore: staged ${items[*]}"

# 2. The swap: the app stopped, renames only, undone on any failure or interruption.
if [ "$offline" = 0 ]; then
  t2="$(date +%s)"
  compose stop app >/dev/null
  log "restore: app stopped in $(($(date +%s) - t2))s"
fi
aside="$DATA/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$aside"
moved=() placed=()
started=0     # the app may have been started on the restored files
interrupted=0 # 130 or 143 once SIGINT or SIGTERM arrived during the swap or the undo

# Put every previous file back. Runs on a failed or interrupted swap, and (--undo-if-unhealthy) on any
# failure or signal until the app is healthy on the restored files. Signals are ignored from its first
# line (only noted), and no step's failure is fatal, so it always reaches one of its exits:
#   1   every previous file is back and the app was started again on them;
#   130/143  the same, but interrupted: the app is left stopped;
#   3   some previous files could not be put back (mixed directory), the app is left stopped;
#   4   the app could not be stopped or killed: nothing was moved back.
undo_swap() {
  trap 'interrupted=130' INT
  trap 'interrupted=143' TERM
  trap - ERR
  set +e
  local i f failed=0 id
  log "restore: ${1:-the swap failed}; putting the previous files back" >&2
  if [ "$started" = 1 ]; then
    if ! compose stop app >/dev/null; then
      id="$(app_container)"
      if [ -n "$id" ] && docker kill "$id" >/dev/null 2>&1; then
        log "restore: the app did not stop; killed it" >&2
      else
        log "restore: could not stop or kill the app: it may still be running on the restored files. Nothing was moved back; the previous files are in $aside" >&2
        exit 4
      fi
    fi
    # The restored database's own -wal/-shm, written once the app opened it: never pair them with the live database.
    rm -f "$DATA/udgam.db-wal" "$DATA/udgam.db-shm"
  fi
  for ((i = ${#placed[@]} - 1; i >= 0; i--)); do
    f="${placed[$i]}"
    rm -rf "${DATA:?}/$f" || failed=1
  done
  for f in "${moved[@]}"; do
    if [ ! -e "$DATA/$f" ]; then mv "$aside/$f" "$DATA/$f" || failed=1; else failed=1; fi
  done
  if [ "$failed" = 0 ] && { [ ! -d "$aside" ] || rmdir "$aside" 2>/dev/null; }; then
    if [ "$interrupted" != 0 ]; then
      log "restore: interrupted; every previous file is back (from $aside), and the app is left stopped (deploy/compose.sh up -d app)" >&2
      exit "$interrupted"
    fi
    log "restore: every previous file was moved back; nothing changed" >&2
    if [ "$offline" = 0 ]; then
      compose up -d app >/dev/null || log "restore: could not start the app again (deploy/compose.sh up -d app)" >&2
    fi
    exit 1
  fi
  log "restore: some previous files could not be moved back; they are in $aside. The data directory is mixed: the app is left stopped" >&2
  [ "$offline" = 1 ] || compose stop app >/dev/null 2>&1
  exit 3
}

# What follows the renames: the photo merge and the ownership. A failure returns 1, never exits.
finish_placing() {
  if [ -n "$archive" ] && [ -d "$work/x/media" ]; then
    mkdir -p "$DATA/media" || return 1
    tar -C "$work/x/media" -cf - . | tar -C "$DATA/media" --skip-old-files -xf - || return 1
    own -R "$APP_UID:$APP_UID" "$DATA/media" || return 1
  fi
  own "$APP_UID:$APP_UID" "$DATA" || return 1
}

trap undo_swap ERR
trap 'interrupted=130; undo_swap "interrupted"' INT
trap 'interrupted=143; undo_swap "interrupted"' TERM
for f in udgam.db-wal udgam.db-shm "${items[@]}"; do
  if [ -e "$DATA/$f" ]; then
    mv "$DATA/$f" "$aside/$f"
    moved+=("$f")
  fi
done
for f in "${items[@]}"; do
  mv "$stage/$f" "$DATA/$f"
  placed+=("$f")
done

if [ "$undo_unhealthy" = 1 ] && [ "$offline" = 0 ]; then
  # From the swap until the app is healthy on the restored files, every failure and every signal runs
  # the undo: the traps stay armed, and each step below is guarded.
  log "restore: $(basename "$db") is now $DATA/udgam.db; in place: ${items[*]}; previous files in $aside" || true
  finish_placing || undo_swap "placing the restored files failed"
  t3="$(date +%s)" || undo_swap "the clock failed"
  started=1
  compose up -d app >/dev/null || undo_swap "could not start the app on the restored files"
  wait_healthy "$timeout" || undo_swap "the app did not report healthy within ${timeout}s on the restored files"
  trap - ERR INT TERM
  [ "${#moved[@]}" -gt 0 ] || rmdir "$aside" || true
  log "restore: app healthy in $(($(date +%s) - t3))s"
else
  trap - ERR INT TERM
  [ "${#moved[@]}" -gt 0 ] || rmdir "$aside"
  log "restore: $(basename "$db") is now $DATA/udgam.db; in place: ${items[*]}$([ "${#moved[@]}" -gt 0 ] && echo "; previous files in $aside")"
  finish_placing || die "placing the restored files failed (the previous files are in $aside)"
  if [ "$offline" = 0 ]; then
    t3="$(date +%s)"
    compose up -d app >/dev/null || die "could not start the app (the previous files are in $aside)"
    wait_healthy "$timeout" || die "the app did not report healthy within ${timeout}s after the restore (the previous files are in $aside)"
    log "restore: app healthy in $(($(date +%s) - t3))s"
  fi
fi
log "restore: done in $(($(date +%s) - t0))s"
