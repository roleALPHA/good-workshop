---
title: Data protection
description: What a self-hosted GoodWorkshop installation stores, where data goes and what you have to take care of yourself as the controller.
sidebar:
  order: 5
---

:::caution[Not legal advice]
This page describes factually what GoodWorkshop stores and where it sends data. It is a summary
of [docs/data-protection.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/data-protection.md);
all tables, queries and reasoning are there.
:::

## Who is responsible

If you install GoodWorkshop yourself, you are the **controller** of all the data in it. roleALPHA
only publishes the software and receives nothing from an installation: no telemetry, no “phoning
home”, no license check. `NEXT_TELEMETRY_DISABLED=1` is set in the image so that Next.js doesn't
send anything either.

In [GoodWorkshop Cloud](/en/cloud/overview/) this is different: there we operate the installation,
with a data processing agreement under Art. 28 GDPR.

## What is stored where

Everything lives in a single Postgres database. Personal data isn't written to any second store.

| What                          | Personal data                                            | Where from                           |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Accounts and memberships      | e-mail, language, first and last name, role, status      | registration or invitation           |
| Passkeys                      | public key, name, counter                                | whoever creates a passkey            |
| Sign-in links and invitations | e-mail, **requesting IP**, purpose, expiry               | every sign-in link, every invitation |
| Sessions                      | **IP, user agent**, hash of the session secret           | every sign-in                        |
| Share link visits             | **IP, user agent**                                       | every visit through a share link     |
| Audit log                     | who changed what on which object                         | changes via web and MCP              |
| Workshops, sections, blocks   | whatever facilitators type in: names, notes about people | the facilitators                     |
| Live editing                  | the same content once more, as CRDT updates              | the live editor                      |
| Tokens                        | hashes of tokens, bound to a member                      | tokens the member creates            |

Two things you should know for your record of processing activities:

- **IP addresses live in three places** (sign-in links, sessions, share link visits), and none of
  them expires by itself.
- **The real risk is the agenda content**, not the account data. Agendas often contain
  participants' names, and facilitator notes contain observations about people — as free text,
  and additionally in the live editing history.

The database itself enforces the separation between workspaces through row-level security.

## Where data leaves the installation

There are exactly four ways, three of which are off until you turn them on:

1. **Mail.** Sign-in links and invitations go through your SMTP relay or Microsoft Graph. The
   address and the workshop title leave the server. With `console`, nothing is sent — then a valid
   sign-in link is in the log.
2. **AI assistants (MCP).** Members can connect an assistant to their workshops. Its vendor
   receives workshop content. Private fields such as facilitator notes aren't included. Still, the
   AI vendor then belongs in your processing chain.
3. **Share links.** Whoever has the link sees the agenda. Visitors aren't identified, but IP and
   user agent are stored.
4. **Let's Encrypt**, if you use the bundled Caddy: your hostname appears in public Certificate
   Transparency logs.

Nothing else goes onto the network: no third-party fonts, no CDN, no analytics, no error service.

## What you have to delete yourself

:::danger[No automatic cleanup]
A Community installation has no retention job. Expired rows count as invalid when read, but are
never deleted. Storage limitation (Art. 5(1)(e) GDPR) is your duty as the controller.
:::

A scheduled job is enough. Adjust the periods to the retention period you have defined and written
down:

```sql
-- Login links and invitations: useless once expired.
DELETE FROM email_token   WHERE expires_at < now() - interval '30 days';

-- Sessions that can no longer be used.
DELETE FROM auth_session  WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';
DELETE FROM share_session WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';

-- The audit trail. Keep it as long as you can justify needing it, not longer.
DELETE FROM audit_event   WHERE created_at < now() - interval '1 year';
```

Run these statements with the owner role, not as `gw_app` — row-level security restricts `gw_app`
to one workspace.

## Access and erasure requests

- **Deleting yourself:** Anyone can delete their account under **Profile & settings** →
  **Delete account**. The last active admin can't.
- **By an admin:** under **Administration** → **Members**. The dialog asks who takes over the
  workshops and folders. With the last membership, the account disappears too, along with its
  sessions, sign-in links and passkeys.

What this does **not** cover, and what you have to check by hand: names in the agenda text and in
facilitator notes, the same names in the live editing history, and quotes in the audit log. The
names in the **Responsible** field also stay on the blocks, so the agenda stays readable. If an
erasure has to be complete, delete the affected workshop: first to the bin, then empty the bin.
That also takes the editing history with it.

## What you take care of yourself as the operator

- define and document retention periods, and schedule the deletions above
- a record of processing activities (Art. 30 GDPR)
- data processing agreements with your mail relay, your host and — if MCP is used — the AI vendor
- a privacy notice for people whose names end up in agendas
- backups: deletions don't reach backups already taken, see
  [Upgrading and backups](/en/self-hosting/upgrade/)
- disk encryption: Caddy takes care of HTTPS, but not of encryption at rest

## Read on

- [Members](/en/account/members/)
- [Bin](/en/library/trash/)
- [Planning with an AI assistant](/en/ai/introduction/)
- [Share links](/en/sharing/share-links/)
