# syntax=docker/dockerfile:1
# Udgam production image (TKT-27, TSK-27.1). Built ON the Oracle A1 instance, so it is native linux/arm64
# there with no QEMU; nothing below is architecture-specific: `pnpm install` resolves the native packages
# (@img/sharp-linux-*, @libsql/linux-*-gnu) for the platform it runs on.
#
#   docker build -f deploy/Dockerfile -t udgam-app:$(git rev-parse --short HEAD) \
#     --build-arg UDGAM_COMMIT=$(git rev-parse --short HEAD) .
#
# NODE_IMAGE exists only so a registry mirror can stand in for Docker Hub when it rate-limits a pull
# (e.g. mirror.gcr.io/library/node:22-bookworm-slim). It must name the same official image.
ARG NODE_IMAGE=node:22-bookworm-slim

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

# --- build: next build (output: 'standalone'), then the artifact checks, then the migration bundle ---
FROM deps AS build
ARG UDGAM_COMMIT=unknown
ENV NODE_ENV=production \
    UDGAM_COMMIT=${UDGAM_COMMIT}
COPY . .
RUN pnpm build
# EXE39: no data, key or env file in any server trace. QA-M002-3: no whole-project trace, size budget.
RUN node scripts/ci/check-trace.mjs .next && \
    node deploy/check-standalone.mjs .next/standalone && \
    node deploy/build-migrate.mjs .next/standalone/migrate.mjs

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
# The code is root-owned and read-only to the app. Writable: /data (the volume) and Next's own cache.
RUN mkdir -p /app/.next/cache && chown udgam:udgam /app/.next/cache
USER udgam
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"]
ENTRYPOINT ["udgam-entrypoint"]
CMD ["node", "server.js"]
