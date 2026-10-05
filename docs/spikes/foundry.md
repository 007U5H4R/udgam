# Spike: Foundry and Anvil in the cloud VM and on ARM (TKT-22 → TASK-23)

**Question.** Does Foundry install, and does Anvil run, (a) in the claude.ai/code VM (x86_64) and
(b) on linux/arm64 (Oracle A1)?

**Answer.** (a) **Yes.** Verified end to end on 2026-10-05. (b) The arm64 release asset exists. Its
digest checks out, and it is a valid aarch64 ELF that needs glibc ≥ 2.35. It was **not executed**:
the VM has no Docker daemon and no QEMU/binfmt. The run on real hardware is **deferred to TKT-27
(TSK-27.1)**, as the plan allows. **Decision: GO for M-002**, with the constraints in §7.

## 1. Versions

| Component | Pinned version | Source |
|---|---|---|
| Foundry (forge, anvil, cast) | **v1.8.3**, commit `cae51ad458f6abb64852b7709eb784352429825d`, built 2026-09-15T10:46:16Z | GitHub release `foundry-rs/foundry` v1.8.3 |
| solc | **0.8.37** (`0.8.37+commit.f401782d`). This is what `forge init` resolves today. | GitHub release `ethereum/solidity` v0.8.37 |
| forge-std | default branch at `forge init` time, cloned by forge | `github.com/foundry-rs/forge-std` |

Exact output of `--version` in the VM (it is the same for forge, anvil and cast, apart from the name):

```
forge Version: 1.8.3
Commit SHA: cae51ad458f6abb64852b7709eb784352429825d
Build Timestamp: 2026-09-15T10:46:16.519267388Z (1789469176)
Build Profile: dist
```

## 2. Release assets and digests

Stage 6 research said each tarball has a `.sha256` and a sigstore attestation. The first part needed
a correction: the checksum sidecar is **`foundry_v1.8.3_linux_<arch>.sha256`** (no `.tar.gz` in the
name). `…tar.gz.sha256` returns 404. The asset is named `arm64`, not `aarch64`, as research said.

Each tarball digest was checked three ways: `sha256sum -c` against the release's `.sha256` sidecar,
GitHub's published asset digest (read from the release's asset list), and a local `sha256sum` of the
download. All three agree.

| Asset | Size | sha256 |
|---|---|---|
| `foundry_v1.8.3_linux_amd64.tar.gz` | 113,058,051 B | `7ca48e6ca3cac1bce1403ca67e5bc1dc3bc1fd818199c9957c7165079c228568` |
| `foundry_v1.8.3_linux_arm64.tar.gz` | 121,395,735 B | `93fc23be26c8a902ca58fe54aa6ca28c880b58af95d052674933161df7928e6d` |
| `solc-static-linux` (v0.8.37, x86_64) | 15,473,648 B | `5de843c2c93563cc66425c99a4fb13fdbf32b4c4ae07469480faaf126e14404a` |
| `solc-static-linux-arm` (v0.8.37, aarch64) | — | `717142f4275804e75c3d0bafd264db669da9cf411550c7c29cc68f634d17a9da` |

Release URLs:
- `https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_{amd64,arm64}.tar.gz`
  (plus `.sha256`, `.attestation.txt`, `.sigstore.json` and `.spdx.json` alongside)
- `https://github.com/ethereum/solidity/releases/download/v0.8.37/solc-static-linux{,-arm}`

The Foundry release also ships a sigstore bundle (`…sigstore.json`). It was **not** verified
cryptographically here, because `rekor.sigstore.dev` and the GitHub attestations API are not
reachable from the VM (§4). The owner can check it locally with
`gh attestation verify foundry_v1.8.3_linux_arm64.tar.gz --repo foundry-rs/foundry`. This is optional:
the pinned digests already match GitHub's published ones.

Unpacked sizes (amd64): forge 101.2 MB, cast 73.9 MB, anvil 50.4 MB, chisel 53.0 MB, solar 8.2 MB.
The setup step extracts only **forge, anvil and cast (216 MB on disk)**. arm64 sizes are within 1%
of these.

## 3. Install commands (what `scripts/cloud-setup.sh` now does)

```bash
curl -sSfL -o foundry.tar.gz \
  https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_amd64.tar.gz
echo "7ca48e6c…228568  foundry.tar.gz" | sha256sum -c --status   # full digest in the script
mkdir -p ~/.foundry/bin && tar -xzf foundry.tar.gz -C ~/.foundry/bin forge anvil cast

curl -sSfL -o ~/.svm/0.8.37/solc-0.8.37 \
  https://github.com/ethereum/solidity/releases/download/v0.8.37/solc-static-linux   # then sha256 check + chmod 0755
```

`foundryup` was **not** used. It resolves versions through `api.github.com`, which is unreachable
here, and it adds an unpinned installer to the trust path. The setup block is idempotent: it skips
when `~/.foundry/bin/forge --version` reports exactly `1.8.3`, and when `~/.svm/0.8.37/solc-0.8.37`
reports `0.8.37`. If a download fails it warns and carries on, so M-001 sessions still set up
offline. A digest mismatch always exits 1.

## 4. Network hosts (claude.ai/code egress proxy)

| Host | Needed for | Result |
|---|---|---|
| `github.com` → `release-assets.githubusercontent.com` | release tarballs, `.sha256`, solc static binaries | **allowed** (113 MB in about 1.3 s) |
| `github.com` (git smart HTTP) | `forge init` / `forge install` cloning `forge-std` | **allowed** |
| `binaries.soliditylang.org` | forge's automatic solc download (svm) | **blocked** (`connect_rejected`): the reason solc is pre-installed |
| `api.github.com` (repos not attached to the session) | `foundryup` version lookup; release asset metadata | **blocked** for unattached repos |
| `rekor.sigstore.dev`, GitHub attestations API | sigstore verification | **blocked** |
| `ghcr.io` | official container image manifest | **allowed** |

No host needs adding to the allow-list, provided solc comes from the GitHub release, as the setup
script does. GitHub Actions runners reach `binaries.soliditylang.org` directly. CI should still use
the same pinned solc for reproducibility.

## 5. x86_64 result (claude.ai/code VM, Ubuntu 24.04, glibc 2.39): PASS

| Check | Result | Time |
|---|---|---|
| Download + verify + extract | 3 binaries in `~/.foundry/bin` | about 1.3 s download, 4.4 s extract |
| `forge/anvil/cast --version` | all print `1.8.3` (output in §1) | — |
| `anvil --port 8545 --silent &` until the RPC is ready | ready | 0.24 s |
| `cast block-number` | `0`. `cast chain-id` gives `31337` | — |
| `cast send --value 1ether` from dev account 0 to dev account 1 | status `0x1`, mined in block 1; balance 10000 → 10001 ETH; block number becomes `1` | — |
| `kill` anvil | stopped cleanly | — |
| `anvil --block-time 1` | block number `2` after about 2 s | — |
| `forge init --no-git` (clones forge-std) | ok | 1.2 s |
| `forge test`, first try, solc not installed | **FAIL**: `binaries.soliditylang.org` blocked | — |
| `forge test` with solc 0.8.37 in `~/.svm` | 2/2 pass (`test_Increment`, `testFuzz_SetNumber`, 256 runs) | 1.25 s cold compile, 0.24 s warm |
| `forge test --offline --use 0.8.37` | 2/2 pass, no network at all | 1.1 s cold |
| `bash scripts/cloud-setup.sh` on a fresh `$HOME` state | `did: foundry 1.8.3 …`, `did: solc 0.8.37 …` | about 7 s total |
| Second run | only `ok:` lines, including `ok: foundry 1.8.3 already satisfied` (TC-002) | 0.5 s |
| Offline run (curl fails) | warns, exits 0 | — |
| Tampered download (wrong bytes) | `error: sha256 mismatch`, exits 1 | — |

## 6. linux/arm64 result: asset confirmed, execution DEFERRED to TKT-27 (TSK-27.1)

- `docker buildx` v0.31.1 is installed, but **no Docker daemon is running** (no `/var/run/docker.sock`).
  There is also no QEMU or `binfmt_misc`. So the plan's `--platform linux/arm64 debian:bookworm-slim`
  run is impossible here. **It is not marked passed.**
- Static evidence from the arm64 tarball (digest verified, §2): `anvil` is an `ELF 64-bit LSB pie
  executable, ARM aarch64`, interpreter `/lib/ld-linux-aarch64.so.1`, GNU/Linux ≥ 3.7.0. It is
  dynamically linked against `libc.so.6`, `libm.so.6` and `libgcc_s.so.1`, and its highest symbol
  version is **GLIBC_2.35**. So it runs on Debian bookworm (2.36) and Ubuntu 22.04+. It does **not** run
  directly on an Oracle Linux 9 host (glibc 2.34) or on Alpine/musl, so run it inside a
  bookworm-based container.
- `solc-static-linux-arm` v0.8.37 exists and is a statically linked aarch64 ELF.
- **Official multi-arch image: yes.** `ghcr.io/foundry-rs/foundry:v1.8.3` is an OCI image index
  (digest `sha256:2e4287278639262de76db72477301d5d3212fa1b1cce710d7d148750a46ce9e7`). Its platform
  manifests:
  - `linux/amd64`: `sha256:3c903c1f8a4be9b11bf067a15e63589896d2446b775bb7da7466a7346179220c`
  - `linux/arm64`: `sha256:0b9a126d7b78d87d77a8f3900a0ca6d948ed0cb597e142846bdba2d5b9f44738`

  It also has two attestation manifests. The digest was read from the registry, and the image was
  not pulled or run.
- **TKT-27 (TSK-27.1) must run on the A1 instance:** `uname -m` (expect `aarch64`), then
  `anvil --version` (expect `1.8.3`) and the §5 anvil smoke test (block number, `cast send`). Use
  either the image pinned by the arm64 digest above or the verified arm64 tarball on a bookworm base.

## 7. Decision: **GO** for M-002 (TKT-24 may start once its other dependencies are met)

Reasons: the pinned release installs reproducibly from allowed hosts with verified digests. Anvil and
forge pass every smoke check in the cloud VM. The only blocker, the solc download host, has a
verified, offline workaround that is already in the setup script. arm64 builds of both Foundry and
solc exist and match their digests, and an official arm64 image exists. The remaining arm64 risk is
low and sits inside TKT-27, which has to stand up the instance anyway.

**Constraints TKT-24 must follow:**
1. **Version pin.** Foundry `1.8.3` only, installed by `scripts/cloud-setup.sh` locally and in the
   cloud. In CI use the same pinned tarball and digest (or
   `foundry-rs/foundry-toolchain` with `version: v1.8.3`). Never use `nightly`, `stable` or bare
   `foundryup`.
2. **solc pin.** Set `solc_version = "0.8.37"` in `contracts/foundry.toml`, and also `offline = true`
   so that forge never tries `binaries.soliditylang.org`, which is blocked in the cloud. Keep
   `auto_detect_solc = false`. If the pin ever moves, update the digests in `cloud-setup.sh` in the
   same commit.
3. **forge-std.** Vendor it at a pinned tag (`forge install foundry-rs/forge-std@<tag>`, committed as
   a git submodule or as a copied `lib/`), so tests never fetch at run time. Cloning works through
   the proxy today, but CI must not depend on it.
4. **PATH.** The binaries live in `~/.foundry/bin`, which the setup script does not add to `PATH`.
   Scripts call `"$HOME/.foundry/bin/anvil"`, or prepend it. In GitHub Actions, append it to
   `$GITHUB_PATH` in the `contracts.yml` workflow.
5. **Anvil in tests.** Start with `anvil --port <free port> --chain-id 31337 --silent`. Use the
   default instant mining for unit and integration tests, and `--block-time 1` only where a test
   needs time to pass. Poll `cast chain-id` until it answers (about 0.25 s) instead of sleeping.
   Kill it **by PID** in teardown, never with `pkill -f`. Dev account keys are Anvil's public test
   mnemonic: never reuse them outside a local chain, and never put a real key in tests.
6. **CI.** Contracts tests run in a separate `contracts.yml` workflow (TKT-24 owns it). Do not
   rename the existing CI jobs: branch protection requires `audit (production dependencies)` and
   `bundle-secrets (no server secret in the client bundle)`. `setup-idempotent (TC-002)` already
   installs Foundry on its first run and must keep printing only `ok:` on the second.
7. **Disk.** Foundry adds about 216 MB under `$HOME`. Keep it out of the repo and out of Docker build
   contexts.
