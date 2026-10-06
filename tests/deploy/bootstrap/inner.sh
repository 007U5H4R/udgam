#!/usr/bin/env bash
# Runs inside the container started by tests/deploy/bootstrap/run.sh. Exits non-zero on any failed check.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Test-only plumbing (never part of bootstrap): the egress proxy's CA, a no-op systemctl, and an
# instance-like starting point with iptables-persistent present, as on Oracle's Ubuntu images.
if [ -f /test-ca.crt ]; then
  apt-get update -qq && apt-get install -y -qq ca-certificates >/dev/null
  cp /test-ca.crt /usr/local/share/ca-certificates/test-ca.crt
  update-ca-certificates >/dev/null
  export PIP_CERT=/etc/ssl/certs/ca-certificates.crt
fi
apt-get update -qq
apt-get install -y -qq iptables iptables-persistent >/dev/null
printf '#!/bin/sh\necho "systemctl $*" >>/var/log/systemctl-calls\n' >/usr/local/bin/systemctl
chmod +x /usr/local/bin/systemctl

# Oracle's default Ubuntu rule set: everything but SSH is rejected.
mkdir -p /etc/iptables
cat >/etc/iptables/rules.v4 <<'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
-A INPUT -p icmp -j ACCEPT
-A INPUT -i lo -j ACCEPT
-A INPUT -p udp --sport 123 -j ACCEPT
-A INPUT -p tcp -m state --state NEW -m tcp --dport 22 -j ACCEPT
-A INPUT -j REJECT --reject-with icmp-host-prohibited
-A FORWARD -j REJECT --reject-with icmp-host-prohibited
COMMIT
EOF
iptables-restore </etc/iptables/rules.v4

# The repository as the instance has it, with a names-only env template (TKT-28 ships the real one).
mkdir -p /opt/udgam/deploy
cp /src/bootstrap.sh /opt/udgam/deploy/bootstrap.sh
printf 'BETTER_AUTH_SECRET=\nBETTER_AUTH_URL=\nUDGAM_DOMAIN=\n' >/opt/udgam/deploy/app.env.example

# The block volume: an unformatted loop device.
truncate -s 64M /var/tmp/volume.img
dev="$(losetup -f --show /var/tmp/volume.img)"
export UDGAM_VOLUME_DEVICE="$dev" UDGAM_FORMAT_VOLUME=1
B=/opt/udgam/deploy/bootstrap.sh

snapshot() { { cat /etc/fstab; iptables -S INPUT; cat /etc/iptables/rules.v4; ls -la /etc/udgam 2>&1; findmnt /mnt/udgam-data 2>&1 || true; } | sha256sum; }

echo "== dry run on a fresh instance"
before="$(snapshot)"
$B --dry-run | tee /var/tmp/dry1.log
[ "$(snapshot)" = "$before" ] || fail "--dry-run changed something"
grep -q '^would:' /var/tmp/dry1.log || fail "--dry-run reported nothing to do on a fresh instance"
! grep -q '^did:' /var/tmp/dry1.log || fail "--dry-run printed did:"

echo "== first run"
$B | tee /var/tmp/run1.log
grep -q '^did:' /var/tmp/run1.log || fail "first run did nothing"

echo "== second run"
after1="$(snapshot)"
$B | tee /var/tmp/run2.log
if grep '^did:' /var/tmp/run2.log; then fail "second run changed something"; fi
[ "$(snapshot)" = "$after1" ] || fail "second run changed the state"

echo "== dry run after"
$B --dry-run | tee /var/tmp/dry2.log
if grep '^would:' /var/tmp/dry2.log; then fail "dry run after bootstrap still has work"; fi

echo "== state"
mountpoint -q /mnt/udgam-data || fail "volume not mounted"
grep -E '^UUID=[0-9a-f-]+ /mnt/udgam-data ext4 defaults,_netdev,nofail 0 2$' /etc/fstab || fail "fstab line"
[ "$(stat -c '%u:%g %a' /mnt/udgam-data)" = "10001:10001 700" ] || fail "volume owner/mode"
[ "$(stat -c '%u:%g %a' /etc/udgam/app.env)" = "0:0 600" ] || fail "app.env owner/mode"
grep -n 'udgam-' /etc/iptables/rules.v4
awk '/udgam-tcp-80/ { a = NR } /^-A INPUT -j REJECT/ { r = NR } END { exit !(a && r && a < r) }' /etc/iptables/rules.v4 || fail "rules.v4 order"
iptables -S INPUT
iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport 443 -m comment --comment udgam-tcp-443 -j ACCEPT || fail "live 443"
docker compose version
oci --version
df -h /mnt/udgam-data

echo "== a remount from fstab (as at boot)"
umount /mnt/udgam-data
mount -a
mountpoint -q /mnt/udgam-data || fail "fstab entry does not mount"
umount /mnt/udgam-data
losetup -d "$dev"
echo "PASS: bootstrap is idempotent"
