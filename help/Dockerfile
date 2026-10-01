# The help site: built with Starlight, served as static files by Caddy.
FROM node:22-alpine AS build
WORKDIR /help
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /help/dist /srv
# No TLS and no admin endpoint in here, so nothing needs to be written at
# runtime and the server does not need root.
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/de/ || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
