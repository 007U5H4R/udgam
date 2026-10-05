#!/usr/bin/env bash
# Idempotent setup for a claude.ai/code cloud session or CI runner (technical-plan §21, TC-002).
# Every step checks first and prints either `ok: <step> already satisfied` or `did: <step>`.
# Reads no secrets and prints no environment values.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ok()  { echo "ok: $1 already satisfied"; }
did() { echo "did: $1"; }

# --- Node >= 22 -------------------------------------------------------------
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -ge 22 ]; then
  ok "node >= 22"
else
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # nvm is not written for `set -eu`; relax both while it runs.
    set +eu
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm install 22
    nvm use 22
    set -eu
    [ "$(node_major)" -ge 22 ] || { echo "error: nvm did not provide Node >= 22." >&2; exit 1; }
    did "node 22 installed with nvm"
  else
    echo "error: Node >= 22 is required and nvm was not found." >&2
    echo "Install Node 22 (https://nodejs.org or https://github.com/nvm-sh/nvm), then re-run this script." >&2
    exit 1
  fi
fi

# --- pnpm (version pinned by package.json "packageManager") -------------------
# Strip any `+sha512.…` integrity suffix corepack may append.
PNPM_PINNED="$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')"
if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version)" = "$PNPM_PINNED" ]; then
  ok "pnpm $PNPM_PINNED"
else
  corepack enable
  corepack prepare "pnpm@$PNPM_PINNED" --activate
  did "pnpm $PNPM_PINNED activated with corepack"
fi

# --- dependencies -------------------------------------------------------------
# A stamp of the install inputs (lockfile, manifest, workspace settings) lives beside the installed
# modules, so it disappears together with node_modules.
STAMP=node_modules/.udgam-install-stamp
install_inputs_hash() {
  node -e 'const c=require("node:crypto"),fs=require("node:fs");const h=c.createHash("sha256");for(const f of ["pnpm-lock.yaml","package.json","pnpm-workspace.yaml"])if(fs.existsSync(f))h.update(f+"\0"+fs.readFileSync(f));process.stdout.write(h.digest("hex"))'
}
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$(install_inputs_hash)" ]; then
  ok "dependencies installed"
else
  pnpm install --frozen-lockfile
  install_inputs_hash > "$STAMP"
  did "dependencies installed (pnpm install --frozen-lockfile)"
fi

# --- Playwright Chromium ------------------------------------------------------
# claude.ai/code VMs ship Chromium at /opt/pw-browsers/chromium; playwright.config.ts uses it.
# CI runners have neither location on a first run, so they install (with system deps).
shopt -s nullglob
pw_cache=("$HOME"/.cache/ms-playwright/chromium-*)
shopt -u nullglob
if [ "${#pw_cache[@]}" -gt 0 ] || [ -e /opt/pw-browsers/chromium ]; then
  ok "playwright chromium"
else
  pnpm exec playwright install --with-deps chromium
  did "playwright chromium installed"
fi

# --- data directory -----------------------------------------------------------
DATA_PATH="${DATA_DIR:-./data}"
if [ -d "$DATA_PATH" ]; then
  ok "data directory"
else
  mkdir -p "$DATA_PATH"
  did "data directory created"
fi

# Foundry: added by TKT-22
# Pinned Foundry (forge, anvil, cast) and solc for the M-002 contracts (docs/spikes/foundry.md).
# Both come from GitHub release assets and are checked against the sha256 digests below.
# solc goes into the svm directory forge reads, because the claude.ai/code egress proxy blocks
# binaries.soliditylang.org. A failed download warns instead of failing, so M-001 work still sets up
# offline; a checksum mismatch always fails.
FOUNDRY_VERSION=1.8.3
SOLC_VERSION=0.8.37
FOUNDRY_BIN="${FOUNDRY_DIR:-$HOME/.foundry}/bin"
SOLC_PATH="$HOME/.svm/$SOLC_VERSION/solc-$SOLC_VERSION"
case "$(uname -m)" in
  x86_64 | amd64)
    FOUNDRY_ARCH=amd64
    FOUNDRY_SHA256=7ca48e6ca3cac1bce1403ca67e5bc1dc3bc1fd818199c9957c7165079c228568
    SOLC_ASSET=solc-static-linux
    SOLC_SHA256=5de843c2c93563cc66425c99a4fb13fdbf32b4c4ae07469480faaf126e14404a
    ;;
  aarch64 | arm64)
    FOUNDRY_ARCH=arm64
    FOUNDRY_SHA256=93fc23be26c8a902ca58fe54aa6ca28c880b58af95d052674933161df7928e6d
    SOLC_ASSET=solc-static-linux-arm
    SOLC_SHA256=717142f4275804e75c3d0bafd264db669da9cf411550c7c29cc68f634d17a9da
    ;;
  *) FOUNDRY_ARCH="" ;;
esac

# Downloads $1 to $2 and checks its sha256 ($3). Returns 1 when the download fails; exits on a mismatch.
fetch_verified() {
  if ! curl -sSfL --retry 2 -o "$2" "$1"; then
    echo "warn: download failed: $1" >&2
    return 1
  fi
  if ! echo "$3  $2" | sha256sum -c --status; then
    echo "error: sha256 mismatch for $1" >&2
    rm -f "$2"
    exit 1
  fi
}

if [ "$(uname -s)" != Linux ] || [ -z "$FOUNDRY_ARCH" ]; then
  echo "warn: no pinned Foundry build for $(uname -s)/$(uname -m); skipped" >&2
else
  # Capture first: under pipefail, `grep -q` closing the pipe early can fail the check.
  forge_version="$("$FOUNDRY_BIN/forge" --version 2>/dev/null || true)"
  if grep -qxF "forge Version: $FOUNDRY_VERSION" <<<"$forge_version"; then
    ok "foundry $FOUNDRY_VERSION"
  else
    foundry_tmp="$(mktemp -d)"
    trap 'rm -rf "$foundry_tmp"' EXIT
    tarball="$foundry_tmp/foundry.tar.gz"
    if fetch_verified \
      "https://github.com/foundry-rs/foundry/releases/download/v$FOUNDRY_VERSION/foundry_v${FOUNDRY_VERSION}_linux_$FOUNDRY_ARCH.tar.gz" \
      "$tarball" "$FOUNDRY_SHA256"; then
      mkdir -p "$FOUNDRY_BIN"
      tar -xzf "$tarball" -C "$FOUNDRY_BIN" forge anvil cast
      did "foundry $FOUNDRY_VERSION installed to $FOUNDRY_BIN (add it to PATH)"
    else
      echo "warn: foundry $FOUNDRY_VERSION not installed; only the M-002 contracts tasks need it" >&2
    fi
    rm -rf "$foundry_tmp"
  fi

  solc_version="$("$SOLC_PATH" --version 2>/dev/null || true)"
  if grep -qF "Version: $SOLC_VERSION+" <<<"$solc_version"; then
    ok "solc $SOLC_VERSION"
  else
    mkdir -p "$(dirname "$SOLC_PATH")"
    if fetch_verified \
      "https://github.com/ethereum/solidity/releases/download/v$SOLC_VERSION/$SOLC_ASSET" \
      "$SOLC_PATH.download" "$SOLC_SHA256"; then
      chmod 0755 "$SOLC_PATH.download"
      mv "$SOLC_PATH.download" "$SOLC_PATH"
      did "solc $SOLC_VERSION installed to $SOLC_PATH"
    else
      rm -f "$SOLC_PATH.download"
      echo "warn: solc $SOLC_VERSION not installed; only the M-002 contracts tasks need it" >&2
    fi
  fi
fi
