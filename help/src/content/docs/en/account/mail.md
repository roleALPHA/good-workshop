---
title: Mail delivery
description: Decide how GoodWorkshop sends sign-in links and invitations – over SMTP or Microsoft 365 – and test the delivery.
sidebar:
  order: 5
---

GoodWorkshop sends sign-in links and invitations by e-mail. Without mail delivery, only people
who already have a [passkey](/en/account/passkeys/) can get in. You'll mostly need this page if
you run GoodWorkshop yourself.

Open the account menu at the top right and choose **Mail delivery** under **Administration**.

:::note
Only admins set up mail delivery.
:::

## Choose the way

Under **How should mail be sent?** there are four options:

| Way                         | What for                                               |
| --------------------------- | ------------------------------------------------------ |
| **Microsoft Graph**         | For Microsoft 365 without SMTP AUTH.                   |
| **SMTP**                    | A classic mail relay.                                  |
| **Write to the server log** | No delivery. Sign-in links end up in the server's log. |
| **No delivery**             | Sign-in links only exist through the command line.     |

:::caution
**Write to the server log** is meant for getting started or for a test installation. Anybody
who can read the log can get into any account.
:::

## Set up SMTP

1. Choose **SMTP**.
2. Under **SMTP URL**, enter your relay's address including credentials, for example
   `smtps://user:password@relay.example.com:465`.
3. Under **Sender address**, enter the address the e-mails should come from.
4. Click **Save**.

## Set up Microsoft 365 via Graph

Many Microsoft 365 organizations have turned off SMTP AUTH. Then the way through Microsoft Graph
remains.

For that, you need an app registration in Entra ID with the **application permission**
`Mail.Send` and admin consent. From it you take:

| Field                      | Where from                           |
| -------------------------- | ------------------------------------ |
| **Directory or tenant ID** | the ID of your Entra directory       |
| **Application ID**         | the ID of the app registration       |
| **Client secret**          | a secret key of the app registration |
| **Sender mailbox**         | the mailbox that sends               |

Choose **Microsoft Graph**, fill in the four fields and click **Save**.

## Secrets stay secret

The password in the SMTP URL and the client secret are stored encrypted and never shown again.
If one is stored, the field says “stored — leave empty to keep it”. If you leave it empty, the
stored value is kept.

## Values from the environment

If you run GoodWorkshop yourself, you can also set mail delivery in the installation's `.env`.
These values take precedence. The page shows such fields locked and with the note
**from the environment**; they can only be changed on the server.

| Variable                                                                                | Field                                         |
| --------------------------------------------------------------------------------------- | --------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                                                     | the way: `smtp`, `graph`, `console` or `none` |
| `SMTP_URL`, `SMTP_FROM`                                                                 | **SMTP URL**, **Sender address**              |
| `GW_GRAPH_TENANT_ID`, `GW_GRAPH_CLIENT_ID`, `GW_GRAPH_CLIENT_SECRET`, `GW_GRAPH_SENDER` | the four Graph fields                         |

More about these variables under [Configuration](/en/self-hosting/configuration/).

## Send a test message

Whether a relay works only shows when something is sent. Without a test, the first attempt is
somebody's sign-in link – and a failure then looks like a broken account.

1. Save your settings first. The test uses what is saved.
2. Under **Send a test message**, enter an address in the **To** field.
3. Click **Send**.

If it works, it says “Sent to … If nothing arrives: check the spam folder.” If delivery fails,
the page shows the mail server's response word for word, for example
`535 authentication failed`. That exact message is what you need to find the problem.

:::tip
Once the test message arrives, sign-in links and invitations go the same way from now on.
:::

## Working without mail delivery

Even with no mail delivery at all, you can bring people into the workspace: when you
[invite](/en/account/members/) someone, GoodWorkshop then shows the sign-in link directly, and you
pass it on in person. With a passkey, everyone gets in without e-mail afterwards.

## See also

- [Sign-in and sign-in link](/en/troubleshooting/sign-in/)
- [Configuration](/en/self-hosting/configuration/)
- [Passkeys](/en/account/passkeys/)
- [Members](/en/account/members/)
