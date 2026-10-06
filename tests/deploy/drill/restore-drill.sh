#!/usr/bin/env bash
# Local backup-and-restore drill (TKT-27, TSK-27.5, the local half of TC-088). Local only; run as root.
#
#   tests/deploy/drill/restore-drill.sh <scratch-dir>
#
# 1. seed a demo database into <scratch>/data (`pnpm seed`), start the app image on it, and fetch a
#    batch's proof feed and the published ledger key; the clean-room checker verifies the feed;
# 2. back up with deploy/cron/backup.sh to a scratch age key, the bucket stood in by a directory
#    (OCI_DRY_RUN=1), while that app is running;
# 3. restore the uploaded archive with deploy/cron/restore.sh into an empty <scratch>/fresh (--offline);
# 4. start a second app on the restored directory: the same feed must verify with the same kid.
# Needs the udgam-app:current image. The auth secrets are generated per container and never printed; the
# age identity stays in <scratch> (delete the directory after). Prints timings and the verdicts.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
S="$(realpath -m "${1:?usage: restore-drill.sh <scratch-dir>}")"
rm -rf "$S"
mkdir -p "$S/data" "$S/fresh" "$S/bucket"
cd "$repo"
now() { date +%s.%N; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1fs", b - a }'; }

start_app() { # name port data-dir
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  export BETTER_AUTH_SECRET
  docker run -d --name "$1" -p "127.0.0.1:$2:3000" -v "$3:/data" -e BETTER_AUTH_SECRET \
    -e BETTER_AUTH_URL="https://localhost:$2" -e PUBLIC_BASE_URL="https://localhost:$2" \
    -e REMOTE_SENSING_PROVIDER=live -e GFW_API_KEY=local-placeholder -e CDSE_CLIENT_ID=local-placeholder \
    -e CDSE_CLIENT_SECRET=local-placeholder "${UDGAM_DRILL_IMAGE:-udgam-app:current}" >/dev/null
  unset BETTER_AUTH_SECRET
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$2/api/health")" = 200 ] && return 0
    sleep 1
  done
  echo "app $1 not healthy; its last log lines (names only, never values, EXE55):" >&2
  docker logs --tail 40 "$1" >&2 || true
  return 1
}

fetch_and_check() { # port out-prefix batch hash
  curl -sf "http://127.0.0.1:$1/api/verify/$3?h=$4" -o "$2.feed.json"
  curl -sf "http://127.0.0.1:$1/.well-known/udgam-ledger-key" -o "$2.keys.json"
  node -e 'const k=require(process.argv[1]).keys; console.log("kid " + k.map((x) => x.kid).join(","))' "$2.keys.json"
  ./node_modules/.bin/tsx evals/scorers/independent-verifier/cli.ts "$2.feed.json" "$2.keys.json"
}

cleanup() { docker rm -f udgam-drill-a udgam-drill-b >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== 1. seed and serve"
t="$(now)"
NODE_ENV=development DATA_DIR="$S/data" pnpm seed
chown -R 10001:10001 "$S/data"
chmod 0700 "$S/data"
echo "seeded in $(since "$t")"
read -r batch hash < <(node -e '
  const { createClient } = require("@libsql/client");
  const db = createClient({ url: "file:" + process.argv[1] });
  db.execute("SELECT id, short_hash FROM batches ORDER BY id LIMIT 1").then((r) => { console.log(r.rows[0].id, r.rows[0].short_hash); db.close(); });' "$S/data/udgam.db")
echo "batch $batch"
start_app udgam-drill-a 4703 "$S/data"
fetch_and_check 4703 "$S/before" "$batch" "$hash"

echo "== 2. back up (app running)"
age-keygen -o "$S/age.key" 2>/dev/null
t="$(now)"
AGE_RECIPIENT="$(age-keygen -y "$S/age.key")" UDGAM_BACKUP_ENV=/nonexistent UDGAM_DATA_DIR="$S/data" \
  OCI_DRY_RUN=1 OCI_DRY_RUN_DIR="$S/bucket" deploy/cron/backup.sh
echo "backup took $(since "$t")"
object="backups/$(basename "$(ls "$S/bucket"/udgam-*.tar.gz.age)")"
echo "bucket holds $object"
if tar -tzf "$S/bucket/$(basename "$object")" >/dev/null 2>&1; then echo "FAIL: the archive is readable without the key" >&2; exit 1; fi

echo "== 3. restore into an empty directory"
t="$(now)"
UDGAM_BACKUP_ENV=/nonexistent OCI_DRY_RUN=1 OCI_DRY_RUN_DIR="$S/bucket" \
  deploy/cron/restore.sh --archive "oci:$object" --identity "$S/age.key" --data-dir "$S/fresh" --offline
echo "restore took $(since "$t")"

echo "== 4. serve the restored copy"
t="$(now)"
start_app udgam-drill-b 4704 "$S/fresh"
echo "restored app healthy in $(since "$t")"
fetch_and_check 4704 "$S/after" "$batch" "$hash"
if cmp -s "$S/before.keys.json" "$S/after.keys.json"; then echo "same published key (kid unchanged)"; else echo "FAIL: the published key changed" >&2; exit 1; fi
if cmp -s "$S/before.feed.json" "$S/after.feed.json"; then echo "feed byte-identical before and after"; else echo "note: the feed bytes differ"; fi
echo "PASS: restored certificate verifies with the same kid"
