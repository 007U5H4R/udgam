#!/usr/bin/env bash
# Nightly encrypted off-instance backup (TKT-27, TSK-27.5, TC-088). Cron runs it at 02:30 IST (21:00 UTC)
# from /etc/cron.d/udgam (deploy/cron/crontab); run it by hand the same way:
#
#   sudo /opt/udgam/deploy/cron/backup.sh
#
#   1. snapshot the database: `pnpm db:backup` (libSQL VACUUM INTO) in a one-off app container;
#   2. tar the snapshot with DATA_DIR/keys (the ledger, user and EVM keys), attestations/ (the organic
#      certificates the database points at) and evm/ (the contract deployment record); anvil/ (the
#      chain state) when app.env sets LEDGER_ADAPTER=evm; media/ (the capture photos) when
#      BACKUP_MEDIA=1. The stream goes straight into `age` to the owner's public key: nothing
#      unencrypted that holds a key is written, and a failed run leaves no partial archive;
#   3. upload the archive to OCI Object Storage as the instance principal (`oci os object put`);
#   4. retention, locally and in the bucket: archives and snapshots whose name is older than
#      RETENTION_DAYS (a whole number >= 1, default 14) go, except the newest 3 of each kind, today's,
#      and the snapshot scripts/deploy.sh recorded for --restore-db. Only this script's own names
#      (udgam-<UTC stamp>-<label>...) are ever touched.
#
# Any failed step fails the run (non-zero exit, no "done" line). Settings: /etc/udgam/backup.env
# (UDGAM_BACKUP_ENV; deploy/backup.env.example lists them). OCI_DRY_RUN=1 swaps the bucket for a local
# directory (OCI_DRY_RUN_DIR, default DATA_DIR/backups/oci-dry-run), for drills. Prints no secret.
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
KEEP_NEWEST=3
DRY_DIR="${OCI_DRY_RUN_DIR:-$DATA/backups/oci-dry-run}"

require_root
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
  die "RETENTION_DAYS must be a whole number of days, at least 1"
fi
recipients=()
[ -n "${AGE_RECIPIENT:-}" ] && recipients+=(-r "$AGE_RECIPIENT")
[ -n "${AGE_RECIPIENTS_FILE:-}" ] && recipients+=(-R "$AGE_RECIPIENTS_FILE")
[ "${#recipients[@]}" -gt 0 ] || die "no age recipient: set AGE_RECIPIENT in $conf"
[ "${OCI_DRY_RUN:-0}" = 1 ] || [ -n "${OCI_BUCKET:-}" ] || die "no bucket: set OCI_BUCKET in $conf (or OCI_DRY_RUN=1)"
[ -d "$DATA/keys" ] || die "$DATA/keys not found: nothing would restore the ledger key"

oci_args=(--auth instance_principal --bucket-name "${OCI_BUCKET:-}")
[ -n "${OCI_NAMESPACE:-}" ] && oci_args+=(--namespace-name "$OCI_NAMESPACE")

# The bucket: put, list (one name per line, under the prefix) and delete. The only steps that leave the
# instance; each failure fails the run.
bucket_put() {
  if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
    mkdir -p "$DRY_DIR"
    cp "$1" "$DRY_DIR/$(basename "$2")"
  else
    oci os object put "${oci_args[@]}" --name "$2" --file "$1" --force --no-multipart >/dev/null
  fi
}
bucket_list() {
  if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
    find "$DRY_DIR" -maxdepth 1 -type f -printf "$OCI_PREFIX%f\n"
  else
    local out
    out="$(oci os object list "${oci_args[@]}" --prefix "$OCI_PREFIX" --all --fields name \
      --query "data[].name | join(' ', @)" --raw-output)" || return 1
    tr ' ' '\n' <<<"$out"
  fi
}
bucket_delete() {
  if [ "${OCI_DRY_RUN:-0}" = 1 ]; then
    rm "$DRY_DIR/$(basename "$1")"
  else
    oci os object delete "${oci_args[@]}" --object-name "$1" --force >/dev/null
  fi
}

lockdir="${UDGAM_LOCK_DIR:-/run/lock}"
[ -d "$lockdir" ] || lockdir="${TMPDIR:-/tmp}"
exec 9>"$lockdir/udgam-backup.lock"
flock -n 9 || die "another backup is running"

t0="$(date +%s)"
log "backup: start"

snap="$(snapshot_db nightly)" || die "the database snapshot failed"
name="$(basename "$snap" .db)"
log "backup: snapshot $(basename "$snap") ($(stat -c %s "$snap") bytes) in $(($(date +%s) - t0))s"

parts=("backups/$(basename "$snap")" keys)
live=0 # a live directory is archived: tar may see a file change while it reads (exit 1)
for d in attestations evm; do [ -d "$DATA/$d" ] && parts+=("$d"); done
if [ "$(env_value LEDGER_ADAPTER)" = evm ] && [ -d "$DATA/anvil" ]; then
  parts+=(anvil)
  live=1
fi
if [ "${BACKUP_MEDIA:-0}" = 1 ] && [ -d "$DATA/media" ]; then
  parts+=(media)
  live=1
fi
archive="$DATA/backups/$name.tar.gz.age"
trap 'rm -f "$archive.partial"' EXIT
t1="$(date +%s)"
set +e
(
  umask 077
  tar -C "$DATA" --warning=no-file-changed -czf - "${parts[@]}" | age "${recipients[@]}" -o "$archive.partial"
  st=("${PIPESTATUS[@]}")
  [ "${st[1]}" = 0 ] || exit 3
  [ "${st[0]}" = 0 ] || { [ "${st[0]}" = 1 ] && [ "$live" = 1 ]; } || exit 2
)
rc=$?
set -e
case "$rc" in
  0) ;;
  2) die "tar failed; no archive written" ;;
  *) die "encryption failed; no archive written" ;;
esac
mv "$archive.partial" "$archive"
log "backup: encrypted $(basename "$archive") (${parts[*]}; $(stat -c %s "$archive") bytes) in $(($(date +%s) - t1))s"

object="$OCI_PREFIX$(basename "$archive")"
t2="$(date +%s)"
bucket_put "$archive" "$object"
log "backup: uploaded $object$([ "${OCI_DRY_RUN:-0}" = 1 ] && echo " (OCI_DRY_RUN: to $DRY_DIR)") in $(($(date +%s) - t2))s"

# Retention. Names are matched strictly, so nothing else in the bucket or the folder is ever removed.
own_object="^${OCI_PREFIX//./\\.}udgam-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+\.tar\.gz\.age$"
# Captured first (not a process substitution), so a failed listing fails the run.
listing="$(bucket_list)" || die "listing the bucket failed; nothing pruned"
mapfile -t remote_old < <(grep -E "$own_object" <<<"$listing" | prunable "$RETENTION_DAYS" "$KEEP_NEWEST" "$object")
for o in "${remote_old[@]}"; do bucket_delete "$o"; done

protected="$(cat "$DATA/backups/last-predeploy" 2>/dev/null || true)"
local_removed=0
for kind in '\.tar\.gz\.age' '\.db'; do
  mapfile -t old < <(find "$DATA/backups" -maxdepth 1 -type f -printf '%f\n' |
    grep -E "^udgam-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$kind$" |
    prunable "$RETENTION_DAYS" "$KEEP_NEWEST" "$(basename "$archive")" "$(basename "$snap")" "$(basename "$protected")")
  for f in "${old[@]}"; do
    rm "$DATA/backups/$f"
    local_removed=$((local_removed + 1))
  done
done
log "backup: retention $RETENTION_DAYS days (newest $KEEP_NEWEST kept): removed $local_removed local, ${#remote_old[@]} remote"
log "backup: done in $(($(date +%s) - t0))s"
