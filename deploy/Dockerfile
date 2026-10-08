# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Udgam production image (TKT-27, TSK-27.1). Built ON the Oracle A1 instance, so it is native linux/arm64
# there with no QEMU; nothing below is architecture-specific: `pnpm install` resolves the native packages
# (@img/sharp-linux-*, @libsql/linux-*-gnu) for the platform it runs on.
#
#   docker build -f deploy/Dockerfile -t udgam-app:$(git rev-parse --short HEAD) \
#     --build-arg UDGAM_COMMIT=$(git rev-parse --short HEAD) .
#
# Base image and frontend are pinned by digest (multi-arch index digests, so arm64 on the instance); a bump
# is deliberate: docs/ops/deploy.md, "Bumping a pinned image". NODE_IMAGE exists only so a registry mirror
# can stand in for Docker Hub when it rate-limits a pull; it must carry the same digest, e.g.
# mirror.gcr.io/library/node:22-bookworm-slim@sha256:<the digest below>.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# pnpm at the version and sha512 package.json pins (packageManager); corepack checks the hash.
RUN corepack enable
WORKDIR /src

# --- deps: the locked dependency tree (cached until the lockfile changes) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# build_ca (optional): a build-time CA bundle for a TLS-intercepting egress proxy, passed with
# `--secret id=build_ca,src=<bundle>`. A secret mount never lands in a layer. Not needed on the instance.
RUN --mount=type=cache,id=udgam-pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi && \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# --- build: next build (output: 'standalone'), the operator tool bundles, then the artifact checks ---
FROM deps AS build
ARG UDGAM_COMMIT=unknown
ENV NODE_ENV=production \
    UDGAM_COMMIT=${UDGAM_COMMIT}
COPY . .
RUN pnpm build
# EXE39: no data, key or env file in any server trace. build-tools: migrate.mjs (the entrypoint's
# migration runner) and the accounts CLI (SEC-001), each one self-contained file beside server.js, so
# /app/accounts-create.mjs runs with plain node. QA-M002-3: no whole-project trace, size budget, and the
# bundles are checked as part of the server artifact.
RUN node scripts/ci/check-trace.mjs .next && \
    node deploy/build-tools.mjs .next/standalone && \
    node deploy/check-standalone.mjs .next/standalone

# --- runtime: the standalone server only, as a non-root user ---
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# uid/gid 10001: deploy/bootstrap.sh gives the data volume to this owner.
RUN groupadd --system --gid 10001 udgam && \
    useradd --system --uid 10001 --gid udgam --home-dir /app --no-create-home --shell /usr/sbin/nologin udgam && \
    mkdir -p /data && chown udgam:udgam /data && chmod 0700 /data
WORKDIR /app
COPY --from=build --chown=root:root /src/.next/standalone ./
COPY --from=build --chown=root:root /src/.next/static ./.next/static
COPY --from=build --chown=root:root /src/public ./public
COPY --chown=root:root --chmod=0755 deploy/entrypoint.sh /usr/local/bin/udgam-entrypoint
# `pnpm db:backup` without pnpm: deploy/cron/backup.sh and scripts/deploy.sh run it in this image.
COPY --chown=root:root deploy/db/backup.mjs ./deploy/db/backup.mjs
# The code is root-owned and read-only to the app. Writable: /data (the volume) and Next's own cache.
RUN mkdir -p /app/.next/cache && chown udgam:udgam /app/.next/cache
USER udgam
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"]
ENTRYPOINT ["udgam-entrypoint"]
CMD ["node", "server.js"]
