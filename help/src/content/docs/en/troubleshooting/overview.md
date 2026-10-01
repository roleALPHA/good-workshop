---
title: Overview
description: From the symptom to the right help page — for sign-in, the AI connection, the live editor and running it yourself.
sidebar:
  order: 1
---

Find your symptom in the tables and jump to the right page. Many messages in GoodWorkshop are
whole sentences; the help pages quote them word for word so that the search at the top finds them.
Just copy the text you see into the search.

## Signing in

| Symptom                                                                   | Page                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| No e-mail arrives after **Send a sign-in link**                           | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| “This link has expired or has already been used. Ask for a new one.”      | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| “The link was incomplete. Ask for a new one.”                             | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| No **Sign in with a passkey** button, but “Passkeys need HTTPS …” instead | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| “The passkey could not be confirmed.”                                     | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| “This invitation is no longer valid”                                      | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |
| “Please sign in.” in the middle of your work                              | [Sign-in and sign-in link](/en/troubleshooting/sign-in/) |

## AI assistant

| Symptom                                                                | Page                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| Claude or ChatGPT can't reach the server                               | [AI connection](/en/troubleshooting/ai-connection/) |
| HTTP 401 with `invalid_token`                                          | [AI connection](/en/troubleshooting/ai-connection/) |
| HTTP 429 with `rate_limited`                                           | [AI connection](/en/troubleshooting/ai-connection/) |
| Error on the **Allow access?** page                                    | [AI connection](/en/troubleshooting/ai-connection/) |
| `This token does not have the "…" scope.`                              | [AI connection](/en/troubleshooting/ai-connection/) |
| `The call failed. The operator can find the cause in the server log …` | [AI connection](/en/troubleshooting/ai-connection/) |
| Revoking OAuth access                                                  | [Known issues](/en/troubleshooting/known-issues/)   |

## Working in the agenda

| Symptom                                                           | Page                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| “No connection. Your changes will be sent as soon as it is back.” | [Live editing together](/en/agenda/live-editing/); self-hosted: [HTTPS and reverse proxy](/en/self-hosting/tls/) |
| “Somebody else has changed this workshop in the meantime.”        | [Live editing together](/en/agenda/live-editing/)                                                                |
| “Contains formatting. Editing comes with the text editor …”       | [Known issues](/en/troubleshooting/known-issues/)                                                                |
| “This workspace is read-only.” (cloud)                            | [Pricing and billing](/en/cloud/pricing-and-billing/)                                                            |

## Self-hosting

| Symptom                                                      | Page                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL must be set` at startup                          | [Installation](/en/self-hosting/installation/)                                                                        |
| Caddy doesn't start, “GW_HOSTNAME must be set …”             | [HTTPS and reverse proxy](/en/self-hosting/tls/)                                                                      |
| The certificate isn't issued                                 | [HTTPS and reverse proxy](/en/self-hosting/tls/)                                                                      |
| No setup key in the log, or “That setup key is not correct.” | [Sign-in and sign-in link](/en/troubleshooting/sign-in/)                                                              |
| `/api/health` answers 503 with `database`                    | The database isn't reachable or is still starting — wait a moment, see [Installation](/en/self-hosting/installation/) |
| `/api/health` answers 503 with `migrations`                  | [Upgrading and backups](/en/self-hosting/upgrade/)                                                                    |
| `migrate` aborts with “MIGRATION STOPPED”                    | [Upgrading and backups](/en/self-hosting/upgrade/)                                                                    |
| Graph answers `403` or `invalid_client`                      | [Sign-in and sign-in link](/en/troubleshooting/sign-in/)                                                              |
| Restoring a backup, mail credentials are empty               | [Upgrading and backups](/en/self-hosting/upgrade/)                                                                    |
| The interface is in the wrong language                       | [Profile and language](/en/account/profile-and-language/)                                                             |

:::tip[Check the log first]
With a self-hosted installation, the log almost always names the cause:
`docker compose logs app` for the application, `docker compose logs migrate` for startup and
updates.
:::

## Nothing fits?

- What deliberately doesn't work yet is listed under [Known issues](/en/troubleshooting/known-issues/).
- How to reach us or the operator of your installation is described under
  [Support](/en/troubleshooting/support/).
