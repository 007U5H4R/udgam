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
