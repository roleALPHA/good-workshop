# syntax=docker/dockerfile:1.7

# GoodWorkshop -- single self-contained image for on-prem deployment.
#
# Build:  docker build -t goodworkshop .
# Run:    docker run -p 3000:3000 goodworkshop
#
# No secret ever enters an ARG or a layer. Everything the app needs at runtime
# (DATABASE_URL, GW_APP_URL, SMTP_URL, ...) arrives as an environment variable
# when the container starts.
#
# There is no AUTH_SECRET, despite what this comment used to say. Sessions are
# rows in Postgres with a per-session random secret, not signed tokens, so
# there is no signing key -- and naming one told operators they had taken a
# precaution that does not exist.

ARG NODE_VERSION=22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

# --- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY scripts/licenses.mjs ./scripts/licenses.mjs
# The notice file is written HERE, in the same RUN as the install, and for one
# reason: `pnpm licenses list` reads the pnpm store, and the store only exists
# inside this cache mount. The builder stage receives node_modules but no
# store, so the same command fails there with
# ERR_PNPM_MISSING_PACKAGE_INDEX_FILE -- which is exactly how it failed once.
#
# What it produces is the copyright lines and licence texts of everything that
# ships. MIT, BSD and Apache all require those to travel WITH the distributed
# software, and a list in the source repository does not discharge that for
# somebody who only ever receives the image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    PNPM_HOME=/pnpm pnpm install --frozen-lockfile && \
    PNPM_HOME=/pnpm node scripts/licenses.mjs --notices THIRD-PARTY-LICENSES.txt

# --- builder ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
# community | cloud. Only this stage sees it: the build picks the edition's code
# and records the choice in dist/edition.json, which is what migrate and
# provision read at runtime. The runner stage never gets the variable, so a
# container cannot be switched to another edition by its environment.
ARG GW_EDITION=community
# Where the cloud build finds its accounting and payment adapters, relative to
# this build context. Only the private cloud build passes it; left empty, the
# build uses the adapters that refuse every invoice and every charge.
ARG GW_BILLING_ADAPTERS=
# Where the cloud build finds the Discover catalogue. Left empty, the build gets
# a catalogue with nothing in it -- an empty library, not a broken one.
ARG GW_CATALOG=
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN GW_EDITION=${GW_EDITION} GW_BILLING_ADAPTERS=${GW_BILLING_ADAPTERS} \
    GW_CATALOG=${GW_CATALOG} pnpm build && \
    if [ "${GW_EDITION}" != "cloud" ]; then rm -rf drizzle-cloud && mkdir drizzle-cloud; fi

# --- runner -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# The Node base image is a development image: it ships npm, npx, corepack and
# Yarn, and with them a few hundred packages this server never loads -- tar,
# pacote, sigstore and friends, each with advisories of their own that an
# operator's scanner then reports against GoodWorkshop. Nothing here runs a
# package manager at runtime, so they go. `apk upgrade` because the base image
# digest is pinned: without it, an OpenSSL fix published after the pin would
# only arrive when somebody moves the pin, and the image scan in CI would fail
# on exactly that in the meantime.
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Baked in at build time so /api/health can report which image is running --
# that is how a rolling deploy notices it is serving the wrong version.
#
# Twice, on purpose. compose passes GW_VERSION from the .env into the container,
# which replaces this value with the image TAG -- right for /api/health, and
# the reason the footer once read "main". GW_BUILD is the same value under a
# name compose leaves alone, so the footer can still say which build it is.
ARG GW_VERSION=dev
ENV GW_VERSION=${GW_VERSION} \
    GW_BUILD=${GW_VERSION}

# `output: 'standalone'` traces exactly the files the server needs, so the
# runtime layer carries no package manager and no dev dependencies.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=deps --chown=node:node /app/THIRD-PARTY-LICENSES.txt ./THIRD-PARTY-LICENSES.txt
# Apache 2.0 section 4 asks that whoever receives the software also receives a
# copy of the licence (a) and the NOTICE file (d). An image pulled onto
# somebody's server is exactly that, whether or not they ever see this repo.
COPY --chown=node:node LICENSE ./LICENSE
COPY --chown=node:node NOTICE ./NOTICE

# The operational half of the image: migrations, provisioning and the CLI that
# gets an operator in when there is neither HTTPS nor SMTP. Without these the
# container serves pages but cannot set up or repair its own database.
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
# Empty in a community image; see the builder stage.
COPY --from=builder --chown=node:node /app/drizzle-cloud ./drizzle-cloud
COPY --from=builder --chown=node:node /app/src/domain/moduleType/builtins.json ./src/domain/moduleType/builtins.json

# `output: standalone` traces only what the SERVER imports. The scripts pull in
# the migrator, which no route touches, so it would be traced away.
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# The collaboration server. Bundled separately because nothing a route imports
# reaches it, so Next's output tracing would leave it out entirely -- and it
# runs in THIS image rather than a second one, so an on-prem install stays
# "one image plus Postgres".
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=deps --chown=node:node /app/node_modules/ws ./node_modules/ws

USER node
EXPOSE 3000 3001

# Fail-closed: a non-2xx or an unreachable server marks the container unhealthy
# instead of letting a load balancer keep sending traffic to it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Both processes, one container. See scripts/start-container.mjs for why there
# is no supervisor.
CMD ["node", "scripts/start-container.mjs"]
