# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Anvil for the `evm` Compose profile (TKT-27, TSK-27.2): the pinned Foundry release, checked against the
# sha256 digests in scripts/cloud-setup.sh and docs/spikes/foundry.md. Only `anvil` is installed.
# BuildKit fetches the tarball for the build's own architecture (arm64 on the A1 instance).
#
# BASE_IMAGE is pinned by digest (docs/ops/deploy.md, "Bumping a pinned image"); a mirror may stand in
# for Docker Hub with the same digest.
ARG BASE_IMAGE=debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
# Set by BuildKit for every build (amd64 locally, arm64 on the instance); global, so FROM can use it.
ARG TARGETARCH

FROM scratch AS foundry-amd64
ADD --checksum=sha256:7ca48e6ca3cac1bce1403ca67e5bc1dc3bc1fd818199c9957c7165079c228568 \
    https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_amd64.tar.gz /foundry.tar.gz

FROM scratch AS foundry-arm64
ADD --checksum=sha256:93fc23be26c8a902ca58fe54aa6ca28c880b58af95d052674933161df7928e6d \
    https://github.com/foundry-rs/foundry/releases/download/v1.8.3/foundry_v1.8.3_linux_arm64.tar.gz /foundry.tar.gz

FROM foundry-${TARGETARCH} AS foundry

FROM ${BASE_IMAGE}
RUN --mount=from=foundry,target=/foundry \
    tar --no-same-owner -xzf /foundry/foundry.tar.gz -C /usr/local/bin anvil && \
    chmod 0755 /usr/local/bin/anvil && \
    groupadd --system --gid 10001 udgam && \
    useradd --system --uid 10001 --gid udgam --no-create-home --shell /usr/sbin/nologin udgam && \
    anvil --version
USER udgam
ENTRYPOINT ["anvil"]
