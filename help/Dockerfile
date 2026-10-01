# The help site: built with Starlight, served as static files.
FROM node:22-alpine AS build
WORKDIR /help
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# nginx rather than Caddy: static files need no Go runtime, and the Caddy
# binary carried a dozen fixed-but-unshipped Go advisories that failed the
# deployment's scan. The unprivileged variant runs as uid 101 on port 8080.
FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /help/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/de/ || exit 1
