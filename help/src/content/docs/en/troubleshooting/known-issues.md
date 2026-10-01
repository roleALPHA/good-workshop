---
title: Known issues
description: Current limitations of GoodWorkshop that are recorded as such in the documentation or in the code.
sidebar:
  order: 4
---

This page lists what GoodWorkshop deliberately can't do, or can't do yet. The list is short,
because it only includes what the project itself records as a limitation. Bugs that aren't listed
here you report via [Support](/en/troubleshooting/support/).

## For everyone

### OAuth access can't be revoked in GoodWorkshop

If you connect Claude, ChatGPT or another client over OAuth, the access currently only ends when
you disconnect the connector in the client. The consent page does mention the settings under
**AI Connection**, but there is no button for OAuth access there yet. You revoke tokens there with
**Revoke**. See [AI connection](/en/troubleshooting/ai-connection/).

### After signing in, you don't get back to the consent page

If you're not signed in when a client sends you to the consent page, you sign in and land in the
library instead of on **Allow access?**. Then start connecting again from the client. Workaround:
sign in beforehand in the same browser.

### Formatted text fields can't be edited

You can edit plain paragraphs in any text field. But if a field contains formatting such as lists
or bold text, the editor shows: “Contains formatting. Editing comes with the text editor — until
then the content here stays untouched.” The content is kept in full instead of being flattened at
the first keystroke — but for now it is read-only in the editor.

### A deleted name stays in the editing history

If you delete a name in the editor, it disappears from the current agenda, but not yet from the
live editing history. If something has to be gone completely, delete the workshop and empty the
[bin](/en/library/trash/).

## Self-hosted

### Passkeys only with HTTPS and a fixed hostname

Without HTTPS there are no passkeys except on `localhost`; the sign-in link by e-mail is then the
only way in. Changing the hostname after passkeys have been registered invalidates all of them. See
[HTTPS and reverse proxy](/en/self-hosting/tls/).

### No automatic deletion of old data

A Community installation has no retention job. Expired sign-in links, sessions, share link visits
(each with an IP address) and the audit log stay until you delete them. The queries for that are
under [Data protection](/en/self-hosting/data-protection/).

### Automatic updates skip the migration

An updater like Watchtower only replaces the app container; the `migrate` service doesn't run.
Without `GW_MIGRATE_ON_START=1` and the matching override file, the new app starts against the old
schema. See [Upgrading and backups](/en/self-hosting/upgrade/).

### Throttling applies per process

The limits for passkey requests and for `/api/mcp` are counted in memory. If several app containers
run side by side, the effective limit multiplies by their number. The limit for sign-in links per
recipient address, on the other hand, is counted in the database and applies exactly.

### Without a proper client address, one shared counter

If no client address arrives behind the proxy, all requests fall into the same counter — then
`/api/mcp` can answer with `rate_limited` even though individual people are doing little. Check
`X-Forwarded-For` and `GW_TRUSTED_PROXIES`.

### Mail credentials depend on the application key

A backup without the application key comes back with empty mail credentials. Everything else is
kept; you enter the credentials again. Back up the key too, see
[Upgrading and backups](/en/self-hosting/upgrade/).

## Read on

- [Overview](/en/troubleshooting/overview/)
- [Support](/en/troubleshooting/support/)
- [GitHub issues](https://github.com/roleALPHA/good-workshop/issues)
