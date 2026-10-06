#!/usr/bin/env bash
# Restore the database (and keys) from a backup (TKT-27, TSK-27.5, TC-088).
#
#   restore.sh --archive <file.tar.gz.age | oci:<object-name>> --identity <age-identity-file> [options]
#       an encrypted nightly archive (deploy/cron/backup.sh): the database snapshot and DATA_DIR/keys,
#       plus media/ when it was archived. `oci:` fetches the object from the bucket first.
#   restore.sh --snapshot <file.db> [options]
#       a local plain snapshot (`pnpm db:backup`, e.g. scripts/deploy.sh's pre-deploy one): the database
#       only; the keys on the volume are kept.
#
# Options:
#   --data-dir <dir>  restore into this directory (default UDGAM_DATA_DIR, /mnt/udgam-data)
#   --offline         do not stop or start the app (a fresh directory, a drill, or the app already down)
#
# Online (the default) it stops the app, moves the current database files and keys aside to
# <data-dir>/pre-restore-<UTC time>/ (never deleted), puts the backup in place owned by uid 10001, starts
# the app and waits up to 90 s for it to report healthy; the app's boot migrates an older snapshot
# forward. The identity file is the owner's age PRIVATE key: bring it for the restore and remove it after.
# Settings for `oci:` come from /etc/udgam/backup.env, as for backup.sh (OCI_DRY_RUN=1 reads the local
# stand-in directory instead). Logs each step's duration.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/../lib.sh"

archive="" identity="" snapshot="" offline=0
while [ $# -gt 0 ]; do
  case "$1" in
    --archive) archive="$2"; shift 2 ;;
    --identity) identity="$2"; shift 2 ;;
    --snapshot) snapshot="$2"; shift 2 ;;
    --data-dir) DATA="$2"; shift 2 ;;
    --offline) offline=1; shift ;;
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

conf="${UDGAM_BACKUP_ENV:-/etc/udgam/backup.env}"
if [ -r "$conf" ]; then
  # shellcheck source=/dev/null
  . "$conf"
fi

t0="$(date +%s)"
log "restore: start into $DATA"
mkdir -p "$DATA"
work="$(mktemp -d "$DATA/.restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT

db="" keys=""
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
  keys="$work/x/keys"
  log "restore: decrypted $(basename "$db") with keys/ in $(($(date +%s) - t1))s"
else
  db="$snapshot"
fi

if [ "$offline" = 0 ]; then
  t2="$(date +%s)"
  compose stop app >/dev/null
  log "restore: app stopped in $(($(date +%s) - t2))s"
fi

aside="$DATA/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
moved=()
for f in udgam.db udgam.db-wal udgam.db-shm; do
  [ -e "$DATA/$f" ] && moved+=("$f")
done
[ -n "$keys" ] && [ -e "$DATA/keys" ] && moved+=(keys)
if [ "${#moved[@]}" -gt 0 ]; then
  mkdir -m 0700 "$aside"
  for f in "${moved[@]}"; do mv "$DATA/$f" "$aside/$f"; done
  log "restore: moved ${moved[*]} aside to $aside"
fi

install -m 0600 -o "$APP_UID" -g "$APP_UID" "$db" "$DATA/udgam.db"
if [ -n "$keys" ]; then
  cp -a "$keys" "$DATA/keys"
  chown -R "$APP_UID:$APP_UID" "$DATA/keys"
  chmod 0700 "$DATA/keys"
fi
if [ -n "$archive" ] && [ -d "$work/x/media" ]; then
  mkdir -p "$DATA/media"
  cp -an "$work/x/media/." "$DATA/media/"
  chown -R "$APP_UID:$APP_UID" "$DATA/media"
fi
chown "$APP_UID:$APP_UID" "$DATA"
log "restore: $(basename "$db") is now $DATA/udgam.db$([ -n "$keys" ] && echo ', keys restored')"

if [ "$offline" = 0 ]; then
  t3="$(date +%s)"
  compose up -d app >/dev/null
  wait_healthy 90 || die "the app did not report healthy within 90 s after the restore (the previous files are in $aside)"
  log "restore: app healthy in $(($(date +%s) - t3))s"
fi
log "restore: done in $(($(date +%s) - t0))s"
