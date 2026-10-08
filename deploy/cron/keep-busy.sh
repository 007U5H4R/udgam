#!/usr/bin/env bash
# OPTIONAL guard against Oracle's idle reclamation of Always Free compute (TKT-27, TSK-27.6).
# Only for the case where the owner declines Pay-As-You-Go; read docs/ops/oracle-idle.md first. It burns
# CPU on purpose: that is its whole job, and the waste is why PAYG is the recommendation.
#
#   keep-busy.sh [minutes]          (default 55; cron starts it every hour, see deploy/cron/crontab)
#
# It holds about KEEP_BUSY_PERCENT (default 25, capped at 40) of the instance's total CPU for the given
# minutes (capped at 59), split across every core as a duty cycle of busy-loop bursts and sleeps, at the
# lowest priority (nice 19), so the app always wins the CPU. Oracle counts an instance idle only when CPU
# p95, network and (A1) memory are ALL under 20 % for 7 days, so lifting CPU p95 over 20 % is enough.
# One copy at a time (flock). KEEP_BUSY_SECONDS overrides the duration and KEEP_BUSY_DRY_RUN=1 only prints
# the plan (tests).
set -euo pipefail

minutes="${1:-55}"
percent="${KEEP_BUSY_PERCENT:-25}"
[[ "$minutes" =~ ^[0-9]+$ ]] || { echo "keep-busy: minutes must be a whole number" >&2; exit 2; }
[[ "$percent" =~ ^[0-9]+$ ]] || { echo "keep-busy: KEEP_BUSY_PERCENT must be a whole number" >&2; exit 2; }
[ "$minutes" -le 59 ] || minutes=59
[ "$percent" -le 40 ] || percent=40
[ "$percent" -ge 1 ] || { echo "keep-busy: nothing to do at 0 %" >&2; exit 0; }
seconds="${KEEP_BUSY_SECONDS:-$((minutes * 60))}"

lockdir=/run/lock
[ -d "$lockdir" ] && [ -w "$lockdir" ] || lockdir="${TMPDIR:-/tmp}"
exec 9>"$lockdir/udgam-keep-busy.lock"
flock -n 9 || { echo "keep-busy: already running" >&2; exit 0; }

cores="$(nproc)"
# Each core repeats a 1-second cycle: busy for percent/100 s, then idle for the rest.
busy="$(awk -v p="$percent" 'BEGIN { printf "%.2f", p / 100 }')"
idle="$(awk -v p="$percent" 'BEGIN { printf "%.2f", 1 - p / 100 }')"
echo "keep-busy: ${percent}% of $cores cores for ${seconds}s at nice 19"
[ "${KEEP_BUSY_DRY_RUN:-0}" = 1 ] && exit 0

worker() {
  local end=$((SECONDS + seconds))
  while [ "$SECONDS" -lt "$end" ]; do
    timeout "$busy" sh -c 'while :; do :; done' || true
    sleep "$idle"
  done
}

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT INT TERM
renice -n 19 -p $$ >/dev/null
for _ in $(seq 1 "$cores"); do
  worker &
  pids+=("$!")
done
wait "${pids[@]}"
echo "keep-busy: done"
