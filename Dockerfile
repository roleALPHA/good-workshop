# syntax=docker/dockerfile:1.7

# GoodWorkshop -- single self-contained image for on-prem deployment.
#
# Build:  docker build -t goodworkshop .
# Run:    docker run -p 3000:3000 goodworkshop
#
# No secret ever enters an ARG or a layer. Everything the app needs at runtime
# (DATABASE_URL, AUTH_SECRET, GW_APP_URL, ...) arrives as an environment
# variable when the container starts.

ARG NODE_VERSION=22-alpine

# --- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    PNPM_HOME=/pnpm pnpm install --frozen-lockfile

# --- builder ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runner -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Baked in at build time so /api/health can report which image is running --
# that is how a rolling deploy notices it is serving the wrong version.
ARG GW_VERSION=dev
ENV GW_VERSION=${GW_VERSION}

# `output: 'standalone'` traces exactly the files the server needs, so the
# runtime layer carries no package manager and no dev dependencies.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# The operational half of the image: migrations, provisioning and the CLI that
# gets an operator in when there is neither HTTPS nor SMTP. Without these the
# container serves pages but cannot set up or repair its own database.
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
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
