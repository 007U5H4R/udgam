#!/usr/bin/env bash
# Exercise deploy/bootstrap.sh in a throwaway privileged ubuntu:24.04 container (TSK-27.4). Local only.
#
#   tests/deploy/bootstrap/run.sh [ubuntu-image]   (default ubuntu:24.04; a mirror may stand in)
#
# Inside (tests/deploy/bootstrap/inner.sh): an Oracle-style iptables rule set, an unformatted 64 MB loop
# device as the block volume, then bootstrap --dry-run (must change nothing), a real run, a second real
# run (must print no `did:`), and a final --dry-run (no `would:`). Package installs, Docker's apt
# repository and the pinned OCI CLI are real; only `systemctl` is a no-op (no systemd in a container).
# BOOTSTRAP_TEST_CA (optional): a CA bundle for a TLS-intercepting egress proxy, trusted inside only.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
image="${1:-ubuntu:24.04}"
ca=()
[ -n "${BOOTSTRAP_TEST_CA:-}" ] && ca=(-v "$BOOTSTRAP_TEST_CA:/test-ca.crt:ro")
docker run --rm --privileged \
  -v "$repo/deploy/bootstrap.sh:/src/bootstrap.sh:ro" \
  -v "$here/inner.sh:/src/inner.sh:ro" \
  "${ca[@]}" "$image" bash /src/inner.sh
