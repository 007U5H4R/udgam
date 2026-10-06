#!/usr/bin/env bash
# Nightly encrypted off-instance backup (TKT-27, TSK-27.5, TC-088). Cron runs it at 02:30 IST (21:00 UTC)
# from /etc/cron.d/udgam (deploy/cron/crontab); run it by hand the same way:
#
#   sudo /opt/udgam/deploy/cron/backup.sh
#
#   1. snapshot the database: `pnpm db:backup` (libSQL VACUUM INTO) in a one-off app container;
#   2. tar the snapshot with DATA_DIR/keys (the ledger key, the user and EVM keys), plus media/ when
#      BACKUP_MEDIA=1, and encrypt the stream with `age` to the owner's public key. Nothing unencrypted
#      that holds a key is ever written: tar streams straight into age;
#   3. upload the archive to OCI Object Storage as the instance principal (`oci os object put`);
#   4. keep RETENTION_DAYS (14) of snapshots and archives, locally and in the bucket.
#
# Settings: /etc/udgam/backup.env (UDGAM_BACKUP_ENV; deploy/backup.env.example lists them).
# OCI_DRY_RUN=1 swaps the bucket for a local directory (OCI_DRY_RUN_DIR, default
# DATA_DIR/backups/oci-dry-run): the upload, listing and pruning become file copies. For drills and tests.
# Logs the start, each step's size and duration, and the end. Prints no secret.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
. "$here/../lib.sh"

conf="${UDGAM_BACKUP_ENV:-/etc/udgam/backup.env}"
if [ -r "$conf" ]; then
  # shellcheck source=/dev/null
  . "$conf"
fi
RETENTION_DAYS="${RETENTION_DAYS:-14}"
OCI_PREFIX="${OCI_PREFIX:-backups/}"
DRY_DIR="${OCI_DRY_RUN_DIR:-$DATA/backups/oci-dry-run}"

recipients=()
[ -n "${AGE_RECIPIENT:-}" ] && recipients+=(-r "$AGE_RECIPIENT")
[ -n "${AGE_RECIPIENTS_FILE:-}" ] && recipients+=(-R "$AGE_RECIPIENTS_FILE")
[ "${#recipients[@]}" -gt 0 ] || die "no age recipient: set AGE_RECIPIENT in $conf"
[ "${OCI_DRY_RUN:-0}" = 1 ] || [ -n "${OCI_BUCKET:-}" ] || die "no bucket: set OCI_BUCKET in $conf (or OCI_DRY_RUN=1)"
[ -d "$DATA/keys" ] || die "$DATA/keys not found: nothing would restore the ledger key"

oci_args() {
  local a=(--auth instance_principal --bucket-name "$OCI_BUCKET")
  [ -n "${OCI_NAMESPACE:-}" ] && a+=(--namespace-name "$OCI_NAMESPACE")
  printf '%s\n' "${a[@]}"
}

# Upload $1 as object $2. The one step that leaves the instance.
upload() {
  if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
    mkdir -p "$DRY_DIR"
    cp "$1" "$DRY_DIR/$(basename "$2")"
    return
  fi
  local a
  mapfile -t a < <(oci_args)
  oci os object put "${a[@]}" --name "$2" --file "$1" --force --no-multipart >/dev/null
}

# Delete bucket objects under the prefix created more than RETENTION_DAYS ago. Prints how many.
prune_remote() {
  if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
    find "$DRY_DIR" -maxdepth 1 -type f -name 'udgam-*' -mtime +"$((RETENTION_DAYS - 1))" -print -delete | wc -l
    return
  fi
  local a cutoff names n=0
  mapfile -t a < <(oci_args)
  cutoff="$(date -u -d "-$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%S)"
  names="$(oci os object list "${a[@]}" --prefix "$OCI_PREFIX" --all --fields name,timeCreated \
    --query "data[?\"time-created\" < '$cutoff'].name | join(' ', @)" --raw-output)"
  for name in $names; do
    oci os object delete "${a[@]}" --object-name "$name" --force >/dev/null
    n=$((n + 1))
  done
  echo "$n"
}

lockdir=/run/lock
[ -d "$lockdir" ] || lockdir="${TMPDIR:-/tmp}"
exec 9>"$lockdir/udgam-backup.lock"
flock -n 9 || die "another backup is running"

t0="$(date +%s)"
log "backup: start"

snap="$(snapshot_db nightly)"
name="$(basename "$snap" .db)"
log "backup: snapshot $(basename "$snap") ($(stat -c %s "$snap") bytes) in $(($(date +%s) - t0))s"

parts=("backups/$(basename "$snap")" keys)
[ "${BACKUP_MEDIA:-0}" = 1 ] && [ -d "$DATA/media" ] && parts+=(media)
archive="$DATA/backups/$name.tar.gz.age"
t1="$(date +%s)"
(umask 077 && tar -C "$DATA" -czf - "${parts[@]}" | age "${recipients[@]}" -o "$archive.partial")
mv "$archive.partial" "$archive"
log "backup: encrypted $(basename "$archive") (${parts[*]}; $(stat -c %s "$archive") bytes) in $(($(date +%s) - t1))s"

t2="$(date +%s)"
upload "$archive" "$OCI_PREFIX$(basename "$archive")"
log "backup: uploaded $OCI_PREFIX$(basename "$archive")$([ "${OCI_DRY_RUN:-0}" = 1 ] && echo " (OCI_DRY_RUN: to $DRY_DIR)") in $(($(date +%s) - t2))s"

local_pruned="$(find "$DATA/backups" -maxdepth 1 -type f -name 'udgam-*' -mtime +"$((RETENTION_DAYS - 1))" -print -delete | wc -l)"
remote_pruned="$(prune_remote)"
log "backup: retention $RETENTION_DAYS days: removed $local_pruned local, $remote_pruned remote"
log "backup: done in $(($(date +%s) - t0))s"
