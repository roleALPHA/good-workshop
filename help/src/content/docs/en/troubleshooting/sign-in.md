---
title: Sign-in and sign-in link
description: When the sign-in link doesn't arrive or has expired, the passkey fails, or setting up a new installation gets stuck.
sidebar:
  order: 2
---

GoodWorkshop has no password. You either use **Sign in with a passkey** or have a link sent to you
by e-mail with **Send a sign-in link**. The messages below appear exactly like this in the app —
search for the text you see.

## “Check your inbox.” — but nothing arrives

After you submit, the sign-in page **always** shows “Check your inbox. If there is an account for
that address, a sign-in link is on its way.” That's intentional: the page doesn't reveal to anyone
which addresses have an account. That's also why you don't see an error when something went wrong.

Go through these in order:

1. Check your **spam folder**.
2. **Check the address.** A link only goes to an address that has an active account. Typos don't
   stand out, because the page reports the same thing in every case.
3. **Wait a moment.** At most five links go out per address in 15 minutes. Further requests are
   silently dropped.
4. **Self-hosted:** Is mail delivery set up at all? See below.

### Self-hosted: no mail delivery

A fresh installation doesn't send e-mails until someone sets up delivery. As an admin, check under
**Mail delivery** whether a transport is selected, and use **Send a test message** there. If
`GW_MAIL_TRANSPORT` is in the `.env`, the `.env` wins.

If delivery fails, the app's log says `magic link delivery failed`. With Microsoft Graph, `403` or
`invalid_client` point to a missing **application permission** `Mail.Send` with admin consent, or
an expired secret. With `GW_MAIL_TRANSPORT=console`, the link is in `docker compose logs app`.

Without any mail delivery, you get in through the command line. The link is valid for 15 minutes
and works once:

```bash
docker compose exec app node scripts/cli.mjs login-link --email you@example.com
```

## “This link has expired or has already been used. Ask for a new one.”

A sign-in link works once and only briefly — how long is stated in the e-mail and on the sign-in
page (normally 15 minutes). Ask for a new one.

The link doesn't sign you in right away: it opens the **Confirm sign-in** page, and only the
**Sign in** button uses it up. That way mail filters such as Microsoft Defender Safe Links, which
open every link in advance, can't use it up before you do.

## “The link was incomplete. Ask for a new one.”

The address was cut off while copying, for example by a line break in your mail program. Click the
link directly in the e-mail or ask for a new one.

## The address in the link is wrong (self-hosted)

Sign-in links are built from `GW_APP_URL`. If the link points to a different address than the one
you use in the browser, correct `GW_APP_URL` in the `.env` and restart, see
[Configuration](/en/self-hosting/configuration/).

## Passkey

| Message                                                                                        | Cause and solution                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| “Passkeys need HTTPS and are not available on this address. The sign-in link by e-mail works.” | The installation runs without HTTPS. Browsers only allow passkeys over HTTPS or on `localhost`. Use the sign-in link, see [HTTPS and reverse proxy](/en/self-hosting/tls/).                                                                      |
| “Passkeys need HTTPS. This installation runs on …”                                             | The same cause, when creating a passkey under **Security**.                                                                                                                                                                                      |
| “The passkey could not be confirmed.”                                                          | The passkey isn't (or is no longer) known to this account — for example because it was removed —, the account isn't active, or the installation's hostname has changed. Sign in with a sign-in link and create a new passkey under **Security**. |

If you cancel your device's prompt yourself, the page shows no error — just try again.

:::caution[Self-hosted: hostname changed?]
Passkeys are tied to the hostname (`GW_RP_ID`). After a change of hostname, **all** registered
passkeys are invalid. Everyone has to sign in once with a sign-in link and create new passkeys.
:::

## “Please sign in.”

Your session has expired. A session ends when it hasn't been used for a while (self-hosted:
`GW_SESSION_IDLE_DAYS`, default 14 days), and at the latest after a fixed maximum duration. Sign in
again.

## Invitation to a workshop

| Message                                                              | Meaning                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| “That does not match. Check the address the invitation was sent to.” | The address entered isn't the one that was invited.                                           |
| “This invitation is no longer valid”                                 | The link was withdrawn, has expired or doesn't exist. Whoever invited you can send a new one. |
| “Too many attempts. Wait a minute and try again.”                    | Too many entries in a short time.                                                             |

## Setting up a new installation (self-hosted)

| Problem                                      | Solution                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| No setup key in the log                      | The key is in the log of `app`, not of `migrate`. If it isn't there, restart `app`: `docker compose restart app`, then `docker compose logs app`. |
| “That setup key is not correct.”             | The key changes at every restart. Use the **newest** one from the log.                                                                            |
| “Too many attempts. Please try again later.” | Wait a minute.                                                                                                                                    |
| `/setup` redirects to the sign-in page       | There is already an administrator. If `GW_BOOTSTRAP_ADMIN_EMAIL` was set, the one-time link is in `docker compose logs migrate`.                  |
| Signed in, but not an admin                  | `docker compose exec app node scripts/cli.mjs admin promote --email you@example.com`                                                              |

This is covered in detail in the README under
[Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).

## Read on

- [Passkeys](/en/account/passkeys/)
- [Mail delivery](/en/account/mail/)
- [Support](/en/troubleshooting/support/) — if you can't get into the cloud at all
