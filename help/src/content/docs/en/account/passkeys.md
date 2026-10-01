---
title: Passkeys
description: Sign in with your fingerprint, face or a security key instead of a link by e-mail.
sidebar:
  order: 2
---

GoodWorkshop has no password. You sign in either through a **sign-in link by e-mail** or with a
**passkey**. A passkey is a key that lives on your device and that you unlock with your
fingerprint, face, device PIN or a security key. The key itself never leaves your device.

The advantage: you don't have to wait for an e-mail. Especially on your phone in the workshop
room, that is often the faster way in.

## Create a passkey

1. Open the account menu at the top right and choose **Security**.
2. Under **Name (optional)**, enter a name by which you'll recognize the device later, such as
   “MacBook”, “iPhone” or “YubiKey”. If you leave the field empty, GoodWorkshop assigns one.
3. Click **Create a passkey**. The button now shows **Waiting for the device …**
4. Confirm in your browser's or operating system's dialog, for example with your fingerprint.

The page then reloads, and the passkey appears in the list.

:::tip
Create a passkey on every device you work with regularly – or use one that syncs through your
Apple or Google account or a password manager.
:::

## Read the list

Each passkey is listed with its name, plus:

| Detail                   | Meaning                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **synced**               | The passkey is synced across your devices, for example through a password manager. |
| **last used** and a date | When you last signed in with it.                                                   |
| **not used yet**         | You created it but have never used it to sign in.                                  |

If you don't have a passkey yet, it says: “No passkey yet. Until there is, every sign-in goes
through a link by e-mail.”

## Sign in with a passkey

On the sign-in page, click **Sign in with a passkey** and confirm on your device. You don't need
to type an e-mail address for that.

The sign-in link by e-mail keeps working, even if you have passkeys. It's your way in when you're
sitting at someone else's device.

## Remove a passkey

Click **Remove** in the passkey's row. It disappears immediately, without confirmation. Remove a
passkey, for example, when you sell or lose a device.

## When no passkey can be created

Browsers only allow passkeys over HTTPS (or on `localhost`). If an installation runs on a plain
`http://` address, the page shows a notice, and **Create a passkey** is locked. The sign-in link
by e-mail then remains the way in.

:::note
This only affects self-hosted installations. How to set up HTTPS is described under
[HTTPS and reverse proxy](/en/self-hosting/tls/).
:::

Other messages and what they mean:

- **The passkey could not be confirmed.** The device responded, but the server couldn't verify
  the response. Try again.
- **This passkey is unknown.** A passkey GoodWorkshop doesn't know was used to sign in – for
  example because it was removed. Sign in with a sign-in link and create a new one.

If you cancel the device's dialog yourself, simply nothing happens – that isn't worth an error
message.

:::tip[For admins of self-hosted installations]
Without [mail delivery](/en/account/mail/) set up, only people who already have a passkey can get
in. A passkey for yourself is therefore a good safety net.
:::

## See also

- [Profile and language](/en/account/profile-and-language/)
- [Sign-in and sign-in link](/en/troubleshooting/sign-in/)
- [Mail delivery](/en/account/mail/)
