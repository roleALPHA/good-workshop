---
title: Installation
description: Install GoodWorkshop with Docker Compose on your own server and create the first admin account through /setup.
sidebar:
  order: 1
---

The GoodWorkshop Community Edition runs as one container image plus Postgres, started with Docker
Compose. There is no license fee for planning and running your workshops, not even for commercial
use. If you don't want to run a server: [GoodWorkshop Cloud](/en/cloud/overview/) is the same
product, hosted.

This page summarizes the installation. The authoritative source is the
[Installation (on-premise)](https://github.com/roleALPHA/good-workshop/blob/main/README.md#installation-on-premise)
section of the README.

## Requirements

| What      | Requirement                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| Docker    | Docker with Compose v2 (`docker compose version`), amd64 or arm64               |
| Hostname  | A name that publicly resolves to this server                                    |
| Ports     | 80 and 443 free — Let's Encrypt needs both for the certificate                  |
| Database  | Nothing to do: Postgres runs in the stack and isn't reachable from outside      |
| Passwords | Nothing to do: the stack generates the database passwords itself on first start |

## 1. Get the files

You need `compose.yaml`, `Caddyfile` and a `.env`:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

## 2. Choose the image

The releases live in the GitHub Container Registry. `compose.yaml` pulls the image that
`GW_VERSION` names. `latest` always points to the newest stable release. Each release is also
available under its own number — that way you stay on one version until you update yourself.
You don't need to build anything.

:::caution[Without the “v”]
The image tag has no “v”: release `v0.8.22` is called `0.8.22` as an image. With the “v”, the
download fails with “not found”.
:::

## 3. Fill in the `.env`

Three values are required. If one is missing, the stack doesn't start and names the missing value:

```bash
GW_APP_URL=https://workshop.example.com   # the address the app is reachable at
GW_HOSTNAME=workshop.example.com          # the name in the certificate (profile `tls`)
GW_VERSION=latest                         # the newest stable release, or e.g. 0.8.22 to pin one
```

**Mail can wait.** For the first start you don't need mail delivery: the setup page shows your
sign-in link itself. Afterwards you set up delivery in the interface under **Mail delivery**, see
[Mail delivery](/en/account/mail/). All other variables are listed under
[Configuration](/en/self-hosting/configuration/).

:::danger[Decide on the hostname now]
Passkeys are tied to the hostname. Changing it later invalidates **every** passkey already
registered. Decide on the name before the first start.
:::

## 4. Start

```bash
docker compose --profile tls up -d
```

The following happens in order:

1. `secrets` generates the database passwords, one per role.
2. `db` starts.
3. `migrate` creates the roles, checks the existing data, applies the migrations and sets up the
   block types.
4. `app` only starts once `migrate` has completed cleanly.
5. `caddy` takes over ports 80 and 443 and fetches the certificate.

When everything is running, the health check answers:

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

A `503` isn't a crash, but the honest answer “this container can't serve”. `checks` says whether
it's down to the database or the migration state.

## 5. Take over the installation in the browser

A fresh installation announces itself in the log at every start until someone takes it over:

```bash
docker compose logs app
```

```
  This installation has no administrator yet.

    https://workshop.example.com/setup
    Setup key: 7Qb3…

  The key is valid until this process restarts.
```

1. Open the `/setup` address shown.
2. Enter **First name**, **Last name** and **Your e-mail address**.
3. Paste the **Setup key** from the log.
4. Click **Set up this installation**.

If no mail delivery is set up yet, the sign-in link is shown right on the page. It works once and
then expires. Everything else — mail delivery, more people, branding — you take care of in the
interface afterwards.

:::note[The key is the entire access control]
Whoever can read `docker compose logs app` is the operator. The key only lives in memory: after a
restart of `app`, a new one applies. As soon as there is an administrator, `/setup` disappears for
good — an installation can't be taken over a second time.
:::

### Two other ways to the first admin

**From the command line**, with a shell on the server:

```bash
docker compose exec app node scripts/cli.mjs admin create \
  --email you@example.com --first-name Anna --last-name Berger
```

**On the very first start:** Set `GW_BOOTSTRAP_ADMIN_EMAIL=you@example.com` in the `.env` before
the stack starts up for the first time. The link is then in `docker compose logs migrate`, is valid
for one hour and is printed exactly once. This is meant for installations that a script sets up
rather than a person.

If you can't find the key or the link, [Sign-in and sign-in link](/en/troubleshooting/sign-in/)
will help.

## Read on

- [Configuration](/en/self-hosting/configuration/): all the important variables
- [HTTPS and reverse proxy](/en/self-hosting/tls/): without Caddy or behind your own proxy
- [Upgrading and backups](/en/self-hosting/upgrade/): updates and backups
- [Data protection](/en/self-hosting/data-protection/): what you need to know as the operator
