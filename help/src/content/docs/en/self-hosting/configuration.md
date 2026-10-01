---
title: Configuration
description: The most important environment variables of a self-hosted GoodWorkshop installation, grouped by purpose.
sidebar:
  order: 2
---

A self-hosted installation is configured through the `.env` next to the `compose.yaml`. This page
sorts the most important variables by purpose. The complete, authoritative table is in the
[Configuration](https://github.com/roleALPHA/good-workshop/blob/main/README.md#configuration)
section of the README; every variable is also commented in `.env.example`.

:::note[No database passwords in the `.env`]
The stack generates the database roles' passwords itself on first start, into their own Docker
volumes. There is nothing to enter for them.
:::

## Required values

| Variable      | Required  | Meaning                                                                                           |
| ------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`  | yes       | The address at which the app is reachable. Sign-in links and the passkey origin depend on it.     |
| `GW_HOSTNAME` | for `tls` | The name in the certificate, passed on to Caddy.                                                  |
| `GW_VERSION`  | yes       | Image tag: `latest` or a fixed number such as `0.8.22`. Shown in the footer and in `/api/health`. |

`GW_APP_URL` must be exactly the address shown in the browser. If it doesn't match, sign-in links
open the wrong address, and the live editor stays without a connection.

## Mail delivery

You can set up mail delivery in the interface under **Mail delivery**
([Mail delivery](/en/account/mail/)) or in the `.env`. The environment wins field by field; the
interface marks such fields with **from the environment**.

| Variable                                                 | When         | Meaning                                                                           |
| -------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                      | optional     | `smtp`, `graph`, `console` or `none`. Empty: the settings in the interface apply. |
| `SMTP_URL` / `SMTP_URL_FILE`                             | with `smtp`  | Relay URL, directly or from a file                                                |
| `SMTP_FROM`                                              | with `smtp`  | Sender address                                                                    |
| `GW_GRAPH_TENANT_ID`                                     | with `graph` | Microsoft 365 tenant, as a domain or directory ID                                 |
| `GW_GRAPH_CLIENT_ID`                                     | with `graph` | Application ID of the app registration                                            |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | with `graph` | The registration's secret, directly or from a file                                |
| `GW_GRAPH_SENDER`                                        | with `graph` | The mailbox that sends                                                            |

For Microsoft Graph you need an app registration in Entra ID with the **application permission**
`Mail.Send` (not the delegated one) and admin consent.

:::tip[Secrets in files]
If `SMTP_URL` contains a password, it belongs in a file: `SMTP_URL_FILE=/run/secrets/smtp_url`. An
environment variable shows up in `docker inspect`, in `/proc/<pid>/environ` and in every core dump.
The same goes for `GW_GRAPH_CLIENT_SECRET_FILE`.
:::

:::caution[`console` is a deliberate decision]
With `GW_MAIL_TRANSPORT=console`, complete, valid sign-in links end up in the container log.
Anyone who can read `docker logs` — the docker group, a log collector, an excerpt for support —
can have a link issued for **any** address. The app warns about this at startup.
:::

## Sign-in and sessions

| Variable               | Default                | Meaning                                                                                       |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `GW_RP_ID`             | host from `GW_APP_URL` | WebAuthn relying party ID. Changing it later invalidates every passkey.                       |
| `GW_SESSION_IDLE_DAYS` | `14`                   | After how many unused days a session expires                                                  |
| `GW_TRUSTED_PROXIES`   | `1`                    | Number of proxies in front of the app. Only for throttling and logs, never for authorization. |

## First admin account

Only for installations that a script sets up. The normal way is `/setup`, see
[Installation](/en/self-hosting/installation/).

| Variable                        | Meaning                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `GW_BOOTSTRAP_ADMIN_EMAIL`      | Creates an admin on the very first start and prints their link |
| `GW_BOOTSTRAP_ADMIN_FIRST_NAME` | First name, optional                                           |
| `GW_BOOTSTRAP_ADMIN_LAST_NAME`  | Last name, optional                                            |

## Operation

| Variable                                  | Default         | Meaning                                                                                                 |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `GW_TIMEZONE`                             | `Europe/Berlin` | Time zone for dates in the interface. Set it explicitly so that server and browser format the same way. |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`    | generated       | Encrypts the mail credentials entered in the interface. **Belongs in the backup.**                      |
| `GW_OPS_TOKEN`                            | empty           | Makes `/api/health` detailed with the `x-ops-token` header: version, migration state, driver errors.    |
| `GW_MIGRATE_ON_START`                     | off             | `1` makes `app` migrate before starting, for updaters such as Watchtower                                |
| `GW_PORT`, `GW_COLLAB_PORT`               | `3000`, `3001`  | Ports on `127.0.0.1`, in case the defaults are taken                                                    |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL` | empty           | Only needed if the collaboration service doesn't live under `/collab` on the same host                  |

Without `GW_OPS_TOKEN`, `/api/health` answers only with the status and the names of the checks —
the endpoint is publicly reachable. What `GW_SECRET_KEY` and `GW_MIGRATE_ON_START` are about is
described under [Upgrading and backups](/en/self-hosting/upgrade/).

## Apply changes

After changing the `.env`, bring the stack up again:

```bash
docker compose --profile tls up -d
```

Without the `tls` profile (your own proxy, SSH tunnel), leave out `--profile tls`, see
[HTTPS and reverse proxy](/en/self-hosting/tls/).

## Read on

- [Installation](/en/self-hosting/installation/)
- [HTTPS and reverse proxy](/en/self-hosting/tls/)
- [Mail delivery](/en/account/mail/)
- [Sign-in and sign-in link](/en/troubleshooting/sign-in/)
