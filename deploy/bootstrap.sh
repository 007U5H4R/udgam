#!/usr/bin/env bash
# Prepare the Oracle A1 instance (Ubuntu 24.04 aarch64) for the Udgam stack (TKT-27, TSK-27.4).
# Idempotent: every step checks first and prints `ok:` when nothing needs doing, `did:` when it changed
# something. A second run prints no `did:` line. `--dry-run` changes nothing and prints `would:` instead.
#
#   sudo UDGAM_VOLUME_DEVICE=/dev/oracleoci/oraclevdb deploy/bootstrap.sh [--dry-run]
#
# Steps:
#   1. base packages (ca-certificates, curl, gnupg, age, iptables-persistent, python3-venv);
#   2. Docker Engine + the compose plugin from Docker's apt repository (key fingerprint checked);
#   3. the block volume at /mnt/udgam-data through /etc/fstab (UUID, `defaults,_netdev,nofail`), formatted
#      ext4 only when UDGAM_FORMAT_VOLUME=1 and it has no filesystem; owned by uid 10001 (the image's
#      `udgam` user), mode 0700, with backups/ and anvil/ inside;
#   4. a hard-link check on the volume: the ledger and user key files are created with link(2)
#      (src/lib/crypto/key-file.ts, so exactly one process creates a key); a filesystem without hard
#      links would fail first boot;
#   5. host firewall: Oracle's Ubuntu images REJECT everything but SSH in INPUT even when the VCN
#      security list allows more. 80/tcp, 443/tcp and 443/udp are accepted ahead of that REJECT, live and
#      in /etc/iptables/rules.v4 (edited in place, never `netfilter-persistent save`, which would also
#      freeze Docker's own chains). Docker publishes Caddy's ports itself (DNAT + its FORWARD rules);
#   6. /etc/udgam/app.env (0600 root) from deploy/app.env.example, names only, never overwritten: the
#      owner types the secrets in on the instance;
#   7. the OCI CLI in /opt/oci-cli, every package pinned by hash (deploy/oci-cli-requirements.txt), for
#      instance-principal backup uploads;
#   8. /etc/udgam/backup.env (0600 root) from deploy/backup.env.example, never overwritten, and the
#      nightly backup job: /etc/cron.d/udgam from deploy/cron/crontab (kept equal to it).
#
# The repository is expected at /opt/udgam (the crontab names that path).
# Environment (paths are overridable for tests; the defaults are the instance's):
#   UDGAM_VOLUME_DEVICE   the attached block volume (needed until it is mounted and in fstab)
#   UDGAM_FORMAT_VOLUME=1 allow mkfs.ext4 on a device with no filesystem (never on one that has one)
#   UDGAM_MOUNT (/mnt/udgam-data)  UDGAM_ETC (/etc/udgam)  FSTAB (/etc/fstab)
#   IPTABLES_RULES (/etc/iptables/rules.v4)  OCI_CLI_DIR (/opt/oci-cli)
set -euo pipefail

DRY=0
[ "${1:-}" = --dry-run ] && DRY=1

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MNT="${UDGAM_MOUNT:-/mnt/udgam-data}"
ETC="${UDGAM_ETC:-/etc/udgam}"
FSTAB="${FSTAB:-/etc/fstab}"
RULES="${IPTABLES_RULES:-/etc/iptables/rules.v4}"
OCI_DIR="${OCI_CLI_DIR:-/opt/oci-cli}"
OCI_VERSION="$(sed -n 's/^oci-cli==\([^ ]*\) .*/\1/p' "$REPO/deploy/oci-cli-requirements.txt")"
APP_UID=10001
DOCKER_KEY_FPR=9DC858229FC7DD38854AE2D88D81803C0EBFCD88
export DEBIAN_FRONTEND=noninteractive

ok() { echo "ok: $*"; }
did() { if [ "$DRY" = 1 ]; then echo "would: $*"; else echo "did: $*"; fi; }
die() {
  echo "error: $*" >&2
  exit 1
}
# Run a changing command, or only describe it under --dry-run.
run() { if [ "$DRY" = 1 ]; then :; else "$@"; fi; }

[ "$(id -u)" = 0 ] || die "run as root (sudo)"
if [ "$(uname -m)" != aarch64 ]; then echo "warn: $(uname -m), not aarch64; continuing" >&2; fi

# 1. Base packages ------------------------------------------------------------------------------------
missing=()
for p in ca-certificates curl gnupg age iptables-persistent python3-venv; do
  dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
done
if [ "${#missing[@]}" -eq 0 ]; then
  ok "base packages"
else
  run apt-get update -qq
  run apt-get install -y -qq "${missing[@]}"
  did "installed ${missing[*]}"
fi

# 2. Docker Engine + compose plugin -------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "docker and the compose plugin"
else
  if [ "$DRY" = 0 ]; then
    install -d -m 0755 /etc/apt/keyrings
    key="$(mktemp)"
    curl -fsSL --max-time 60 https://download.docker.com/linux/ubuntu/gpg -o "$key"
    gpg --show-keys --with-colons "$key" | grep -q "^fpr:::::::::$DOCKER_KEY_FPR:" || die "Docker's apt key fingerprint is not $DOCKER_KEY_FPR"
    install -m 0644 "$key" /etc/apt/keyrings/docker.asc
    rm -f "$key"
    # shellcheck disable=SC1091
    codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" >/etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
  fi
  did "installed Docker Engine and the compose plugin"
fi

# 3. Block volume -------------------------------------------------------------------------------------
if mountpoint -q "$MNT"; then
  dev="$(findmnt -no SOURCE "$MNT")"
  ok "$MNT mounted ($dev)"
else
  dev="${UDGAM_VOLUME_DEVICE:-}"
  [ -n "$dev" ] || die "$MNT is not mounted: set UDGAM_VOLUME_DEVICE to the attached block volume (lsblk)"
  [ -b "$dev" ] || [ -f "$dev" ] || die "$dev is not a block device"
fi
uuid="$(blkid -s UUID -o value "$dev" 2>/dev/null || true)"
if [ -z "$uuid" ]; then
  [ "${UDGAM_FORMAT_VOLUME:-0}" = 1 ] || die "$dev has no filesystem; set UDGAM_FORMAT_VOLUME=1 to format it ext4 (this erases it)"
  if [ "$DRY" = 1 ]; then
    did "format $dev ext4, add its UUID to $FSTAB (nofail) and mount it at $MNT"
  else
    mkfs.ext4 -q -L udgam-data "$dev"
    uuid="$(blkid -s UUID -o value "$dev")"
    did "formatted $dev ext4 (UUID=$uuid)"
  fi
fi
if [ -n "$uuid" ]; then
  if grep -Eq "^UUID=${uuid}[[:space:]]" "$FSTAB" 2>/dev/null; then
    ok "$FSTAB has UUID=$uuid"
  else
    run sh -c "printf 'UUID=%s %s ext4 defaults,_netdev,nofail 0 2\n' '$uuid' '$MNT' >>'$FSTAB'"
    did "added UUID=$uuid $MNT to $FSTAB (nofail)"
  fi
  if ! mountpoint -q "$MNT"; then
    run mkdir -p "$MNT"
    run mount "$MNT"
    did "mounted $MNT"
  fi
fi

# 4. Data layout and the hard-link check --------------------------------------------------------------
if [ -d "$MNT" ] && mountpoint -q "$MNT"; then
  for d in "$MNT" "$MNT/backups" "$MNT/anvil"; do
    if [ -d "$d" ] && [ "$(stat -c '%u:%g %a' "$d")" = "$APP_UID:$APP_UID 700" ]; then
      ok "$d (uid $APP_UID, 0700)"
    else
      run install -d -o "$APP_UID" -g "$APP_UID" -m 0700 "$d"
      did "$d owned by uid $APP_UID, 0700"
    fi
  done
  probe="$MNT/.udgam-link-probe.$$"
  if [ "$DRY" = 0 ] || [ -w "$MNT" ]; then
    : >"$probe"
    if ln "$probe" "$probe.2" 2>/dev/null && [ "$(stat -c %h "$probe")" = 2 ]; then
      ok "hard links work on $MNT (the key files are created with link(2))"
    else
      rm -f "$probe" "$probe.2"
      die "hard links fail on $MNT: the ledger key cannot be created there (use ext4 or xfs)"
    fi
    rm -f "$probe" "$probe.2"
  fi
fi

# 5. Host firewall ------------------------------------------------------------------------------------
rule_args() { echo "-p $1 -m state --state NEW -m $1 --dport $2 -m comment --comment udgam-$1-$2 -j ACCEPT"; }
for spec in "tcp 80" "tcp 443" "udp 443"; do
  # shellcheck disable=SC2086
  set -- $spec
  read -r -a args <<<"$(rule_args "$1" "$2")"
  if iptables -C INPUT "${args[@]}" 2>/dev/null; then
    ok "iptables accepts $2/$1"
  else
    at="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    if [ -n "$at" ]; then run iptables -I INPUT "$at" "${args[@]}"; else run iptables -A INPUT "${args[@]}"; fi
    did "iptables accepts $2/$1 (live)"
  fi
  line="-A INPUT $(rule_args "$1" "$2")"
  if [ ! -f "$RULES" ]; then
    echo "warn: $RULES missing; $2/$1 is open until the next reboot only" >&2
  elif grep -qF -- "--comment udgam-$1-$2 " "$RULES"; then
    ok "$RULES keeps $2/$1"
  else
    if [ "$DRY" = 0 ]; then
      tmp="$(mktemp)"
      awk -v rule="$line" '
        BEGIN { done = 0; infilter = 0 }
        /^\*filter/ { infilter = 1 }
        infilter && !done && (/^-A INPUT -j REJECT/ || /^COMMIT/) { print rule; done = 1 }
        { print }
        /^COMMIT/ { infilter = 0 }' "$RULES" >"$tmp"
      cat "$tmp" >"$RULES"
      rm -f "$tmp"
    fi
    did "$RULES keeps $2/$1 (before the INPUT REJECT)"
  fi
done

# 6. The app's environment file -----------------------------------------------------------------------
env_file="$ETC/app.env"
if [ -f "$env_file" ]; then
  if [ "$(stat -c '%u:%g %a' "$env_file")" = "0:0 600" ]; then
    ok "$env_file (0600 root)"
  else
    run chown 0:0 "$env_file"
    run chmod 0600 "$env_file"
    did "$env_file set to 0600 root"
  fi
else
  template="$REPO/deploy/app.env.example"
  [ -f "$template" ] || die "$template not found (TKT-28 adds it); cannot create $env_file"
  run install -d -m 0700 "$ETC"
  run install -o 0 -g 0 -m 0600 "$template" "$env_file"
  did "$env_file created from deploy/app.env.example (names only: type the values in on the instance)"
fi

# 7. OCI CLI ------------------------------------------------------------------------------------------
if [ -x "$OCI_DIR/bin/oci" ] && "$OCI_DIR/bin/oci" --version 2>/dev/null | grep -qxF "$OCI_VERSION"; then
  ok "oci-cli $OCI_VERSION"
else
  run python3 -m venv "$OCI_DIR"
  # Every package and its hashes are pinned (deploy/oci-cli-requirements.txt, generated by
  # `uv pip compile --generate-hashes`, identical for aarch64 and x86_64 on Python 3.12).
  run "$OCI_DIR/bin/pip" install --quiet --disable-pip-version-check --require-hashes -r "$REPO/deploy/oci-cli-requirements.txt"
  run ln -sf "$OCI_DIR/bin/oci" /usr/local/bin/oci
  did "installed oci-cli $OCI_VERSION in $OCI_DIR"
fi

# 8. Backup settings and the cron job --------------------------------------------------------------------
backup_env="$ETC/backup.env"
if [ -f "$backup_env" ]; then
  ok "$backup_env"
else
  run install -d -m 0700 "$ETC"
  run install -o 0 -g 0 -m 0600 "$REPO/deploy/backup.env.example" "$backup_env"
  did "$backup_env created from deploy/backup.env.example (fill in AGE_RECIPIENT and OCI_BUCKET)"
fi
cron_file="${UDGAM_CRON_FILE:-/etc/cron.d/udgam}"
if cmp -s "$REPO/deploy/cron/crontab" "$cron_file"; then
  ok "$cron_file"
else
  run install -o 0 -g 0 -m 0644 "$REPO/deploy/cron/crontab" "$cron_file"
  did "$cron_file installed (nightly backup 21:00 UTC = 02:30 IST)"
fi
[ "$REPO" = /opt/udgam ] || echo "warn: the repository is at $REPO; $cron_file runs /opt/udgam/deploy/cron/backup.sh" >&2

echo "bootstrap: done$([ "$DRY" = 1 ] && echo ' (dry run, nothing changed)')"
