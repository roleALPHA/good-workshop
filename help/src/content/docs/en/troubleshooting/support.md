---
title: Support
description: How to get help in GoodWorkshop Cloud, where to write without signing in, and who looks after self-hosted installations.
sidebar:
  order: 5
---

Where you get help depends on where your GoodWorkshop runs: in
[GoodWorkshop Cloud](/en/cloud/overview/) or on a server that you or your organization runs
yourselves.

| You use …                                | Then …                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| the cloud and can sign in                | write via the support form in the profile menu                                   |
| the cloud and can't get in               | send an e-mail to [support@goodworkshop.org](mailto:support@goodworkshop.org)    |
| a self-hosted installation               | contact the person who runs it                                                   |
| GoodWorkshop and found a bug in the code | report it as a [GitHub issue](https://github.com/roleALPHA/good-workshop/issues) |

Many questions are already answered in this help. It's worth checking the troubleshooting
[Overview](/en/troubleshooting/overview/) first.

## In the cloud: the support form

:::note[Cloud only]
The support form only exists in GoodWorkshop Cloud. In a self-hosted installation, the **Support**
entry is missing from the profile menu.
:::

1. Open the profile menu at the top right.
2. Choose **Support**.
3. Enter a **Subject** and your **Message**.
4. Click **Send request**.

The page then confirms: “Thank you! Your request reached us as ticket #…. The answer comes by
e-mail.” The answer goes to the address you're signed in with.

**What is sent along automatically:** your workspace, your role, the GoodWorkshop version and the
language you use the app in. You don't need to add those.

**What helps:** Describe what you did, what happened and what you expected. If there's an error
message on the screen, copy it in word for word. If an AI assistant got a message with a reference
(“under the reference …”), include that reference — it lets us find the cause in the log.

### When the form doesn't work

| Message                                                                                                  | What to do                                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| “The form is not available right now. Write to us directly at support@goodworkshop.org.”                 | Send an e-mail to [support@goodworkshop.org](mailto:support@goodworkshop.org).         |
| “Your request could not be delivered just now. Please write to us directly at support@goodworkshop.org.” | The same: the request didn't arrive, so write by e-mail.                               |
| “Too many attempts. Please try again later.”                                                             | Only a few requests per hour are possible per person. Wait a while or write by e-mail. |

## In the cloud, without signing in

If you can't get into your account — no sign-in link arrives, the passkey is refused — write to
[support@goodworkshop.org](mailto:support@goodworkshop.org). Give your account's e-mail address
and, if you know it, the name of your workspace. It's worth checking
[Sign-in and sign-in link](/en/troubleshooting/sign-in/) first.

## Self-hosted installations

A self-hosted installation is looked after by whoever runs it — usually your organization's IT or
the person who set up GoodWorkshop. We have no access to such installations and see no data from
them.

If you run the installation yourself:

- Step-by-step help is under [Installation](/en/self-hosting/installation/) and in the README under
  [Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).
- The log names most causes: `docker compose logs app` and `docker compose logs migrate`.
- What deliberately doesn't work yet is listed under [Known issues](/en/troubleshooting/known-issues/).

## Report a bug

If you've found a bug in GoodWorkshop itself, open an
[issue on GitHub](https://github.com/roleALPHA/good-workshop/issues). Helpful are:

- the version (shown in the app's footer and in `/api/health`)
- what you did, what happened and what you expected
- the relevant excerpt from the log

:::caution[No secrets in issues]
Issues are public. Remove tokens, sign-in links, passwords and personal data from log excerpts
before you paste them. With `GW_MAIL_TRANSPORT=console`, the log contains valid sign-in links.
:::

## Read on

- [Overview](/en/troubleshooting/overview/)
- [Sign-in and sign-in link](/en/troubleshooting/sign-in/)
- [GoodWorkshop Cloud](/en/cloud/overview/)
