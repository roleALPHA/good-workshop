---
title: HTTPS and reverse proxy
description: HTTPS with the bundled Caddy profile or your own reverse proxy, including the /collab WebSocket path and streaming.
sidebar:
  order: 3
---

GoodWorkshop belongs behind HTTPS. Without HTTPS there are **no passkeys**, the session cookie
doesn't carry `Secure`, and it travels over the network in plain text, just like the sign-in links.
You have two ways: the bundled `tls` profile or your own reverse proxy.

## The container itself

`app` deliberately binds only to `127.0.0.1` — without a proxy in front of it, nothing is reachable
from outside, even with a misconfigured firewall. Two services run in the container:

| Service               | Port on `127.0.0.1` | Variable         | What for                                 |
| --------------------- | ------------------- | ---------------- | ---------------------------------------- |
| Application           | `3000`              | `GW_PORT`        | all pages, `/api/…`, `/api/mcp`          |
| Collaboration service | `3001`              | `GW_COLLAB_PORT` | WebSocket for the live editor, `/collab` |

The second port exists because Next can't serve a WebSocket upgrade from a route handler. Both come
from the same image.

## Way 1: The `tls` profile (recommended)

```bash
docker compose --profile tls up -d
```

The profile additionally starts a Caddy that takes over ports 80 and 443 and automatically fetches
a certificate from Let's Encrypt. For that you need:

- `GW_HOSTNAME` in the `.env` — if the value is missing, Caddy doesn't start and reports
  “GW_HOSTNAME must be set: the host name the TLS certificate is issued for.”
- a hostname that publicly resolves to this server
- free ports 80 and 443

The bundled `Caddyfile` also takes care of:

- compression (`encode zstd gzip`)
- the `Strict-Transport-Security` header
- access logs in their own volume, deleted after 14 days (`roll_keep_for 336h`)
- forwarding `/collab` to the collaboration service and everything else to the app

:::note[Hostname in the certificate]
With the bundled Caddy, your hostname is sent to Let's Encrypt for issuance and appears in public
Certificate Transparency logs. That's the hostname, not user data.
:::

## Way 2: Your own reverse proxy

If you already have a proxy on the host (nginx, Traefik, your own Caddy), start the stack
**without** the profile:

```bash
docker compose up -d
```

Your proxy then has to do three things.

### 1. `/collab` to port 3001, with WebSocket upgrade

Everything under `/collab` goes to the collaboration service, and the WebSocket upgrade has to get
through unchanged. If `/collab` lands at the application on port 3000, it can't serve it.

### 2. Everything else to port 3000, without buffering

Next.js streams server components. A proxy that buffers responses delivers pages only in one piece.
Turn off buffering for this route.

### 3. Pass on the real client address

The app reads the client address from `X-Forwarded-For`, counting as many entries from the right as
`GW_TRUSTED_PROXIES` says (default `1`). If there are two proxies in a row, set `2`. The value is
only used for throttling and logs, never for authorization — a wrong value costs you the
throttling, not the security.

### Template: the bundled Caddyfile

This is how it looks in the repo's Caddyfile. There the targets are called `app:3000` and
`app:3001`, because Caddy runs in the same Compose network; a proxy directly on the host reaches the
same services via `127.0.0.1` and the ports from the table above.

```
	handle /collab* {
		reverse_proxy app:3001
	}

	reverse_proxy app:3000 {
		# Next.js streams server components; buffering would make the page appear
		# only in one piece.
		flush_interval -1
	}
```

The app sets its security headers (CSP, `frame-ancestors`, `nosniff`, referrer and permissions
policy, HSTS) itself; your proxy doesn't need to add them.

### Other paths for the collaboration service

If the collaboration service doesn't live under `/collab` on the same hostname, you need
`GW_COLLAB_URL` (the address for the browser) and possibly `GW_COLLAB_INTERNAL_URL` (the address
through which the app itself reaches the service when an MCP write enters a room). In the normal
case, both stay empty.

## Without a proxy: SSH tunnel

To try it out, it also works entirely without a proxy, through a tunnel:

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` then has to point to the address the browser actually uses. Without HTTPS, passkeys
only work on `localhost`.

## Check that everything gets through

| Symptom                                                                                        | Cause                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| The certificate isn't issued                                                                   | The hostname doesn't resolve to this server, or 80/443 are taken                                                                                     |
| The editor permanently shows “No connection. Your changes will be sent as soon as it is back.” | `/collab` isn't forwarded, or `GW_APP_URL` doesn't match the address in the browser — the socket refuses a foreign origin and writes that to the log |
| Pages appear with a delay and only all at once                                                 | The proxy buffers the responses                                                                                                                      |
| No passkey offered                                                                             | No HTTPS                                                                                                                                             |
| Claude or ChatGPT can't connect                                                                | The installation isn't reachable from the internet over HTTPS                                                                                        |

:::caution[Don't change the hostname afterwards]
Passkeys are tied to `GW_RP_ID`, which, without a value of its own, follows the host from
`GW_APP_URL`. Changing the hostname after passkeys have been registered invalidates all of them.
:::

## Read on

- [Configuration](/en/self-hosting/configuration/)
- [Passkeys](/en/account/passkeys/)
- [Live editing together](/en/agenda/live-editing/)
- [Connect an assistant](/en/ai/connect/)
