#!/usr/bin/env bash
# Fail when a server secret reached the client bundle (technical-plan TSK-19.7, TC-075, EVAL-083).
#
# Usage: scripts/ci/check-bundle-secrets.sh [env-file] [next-dir]
#   env-file  fake secret values the build ran with (default .env.ci.example)
#   next-dir  the build output (default .next)
# Build first with the env file loaded:  set -a; . ./.env.ci.example; set +a; pnpm build
#
# Greps .next/static (everything the browser can download) and any prerendered
# .next/server/app/**/*.html for each secret's value. A hit names the variable and exits 1; values are
# never printed. Exit 2 when the env file or the build output is missing.
set -euo pipefail

ENV_FILE="${1:-.env.ci.example}"
NEXT_DIR="${2:-.next}"
# Every secret name in .env.example (tests/bundle-secrets.test.ts keeps the lists in step).
SECRET_NAMES=(BETTER_AUTH_SECRET GFW_API_KEY CDSE_CLIENT_ID CDSE_CLIENT_SECRET ARCGIS_API_KEY MAPTILER_KEY)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "check-bundle-secrets: env file $ENV_FILE not found" >&2
  exit 2
fi
if [[ ! -d "$NEXT_DIR/static" ]]; then
  echo "check-bundle-secrets: $NEXT_DIR/static not found (build first)" >&2
  exit 2
fi

targets=("$NEXT_DIR/static")
if [[ -d "$NEXT_DIR/server/app" ]]; then
  while IFS= read -r -d '' f; do targets+=("$f"); done < <(find "$NEXT_DIR/server/app" -name '*.html' -print0)
fi

# The value assigned to $1 in the env file (the last assignment wins). Never echoed.
value_of() {
  local line value=''
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$1="* ]]; then value="${line#*=}"; fi
  done <"$ENV_FILE"
  printf '%s' "$value"
}

failed=0
for name in "${SECRET_NAMES[@]}"; do
  value="$(value_of "$name")"
  if [[ ${#value} -lt 8 ]]; then
    echo "::error::$name has no fake value of 8+ characters in $ENV_FILE"
    failed=1
    continue
  fi
  rc=0
  grep -rqF -- "$value" "${targets[@]}" || rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "::error::the value of $name appears in the client bundle ($NEXT_DIR/static or prerendered HTML)"
    failed=1
  elif [[ $rc -ne 1 ]]; then
    echo "::error::could not search the client bundle for $name (grep exit $rc)"
    failed=1
  fi
done

if [[ $failed -eq 0 ]]; then
  echo "check-bundle-secrets: none of ${#SECRET_NAMES[@]} secret values is in the client bundle"
fi
exit "$failed"
