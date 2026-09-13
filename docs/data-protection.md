# Data protection, for whoever runs this

**This is not legal advice.** It is a factual description of what GoodWorkshop stores, where it
sends things, and what it does not clean up — written so that an operator can fill in their own
record of processing activities and answer a data-subject request without reading the schema.

The division of roles matters and is unusual in a good way: GoodWorkshop is self-hosted. Whoever
installs it is the **controller** for everything below. roleALPHA publishes the software and
receives no data from an installation — there is no telemetry, no phone-home, no licence check,
and `NEXT_TELEMETRY_DISABLED=1` is set in the image so Next.js sends nothing either.

## What is stored, and where it comes from

Everything lives in one Postgres database. Nothing personal is written to a second store.

| Table                                    | Personal data                                                          | Where it comes from                  |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `identity`                               | email, display name, locale, `avatar_url` (unused)                     | sign-up or invitation                |
| `member`                                 | display name per tenant, role, status, who invited                     | the admin who invited them           |
| `webauthn_credential`                    | passkey public key, nickname, counter                                  | the person registering a passkey     |
| `email_token`                            | email, **requesting IP**, purpose, expiry                              | every login link and invitation      |
| `auth_session`                           | **IP, user agent**, session secret hash, timestamps                    | every sign-in                        |
| `share_session`                          | **IP, user agent**                                                     | every visitor who opens a share link |
| `audit_event`                            | actor, action, entity, free-form `data` JSON                           | writes through the web UI and MCP    |
| `workshop`, `cluster`, `workshop_module` | whatever facilitators type — names of participants, notes about people | the facilitators                     |
| `collab_update`, `collab_state`          | the same content again, as CRDT updates                                | the live editor                      |
| `personal_access_token`, `oauth_token`   | token hashes tied to a member                                          | tokens the member created            |

Two things worth saying plainly to anyone filling in a processing record:

- **IP addresses are stored in three places** — `email_token.requested_ip`, `auth_session.ip`,
  `share_session.ip` — and none of them expires on its own. See the gap below.
- **The agenda content is the risk surface, not the account data.** A workshop agenda routinely
  contains participant names, and facilitator notes contain observations about people. That is
  ordinary text in `module`, and it is also duplicated in the CRDT log.

Tenant isolation is enforced in the database, not in application code: every tenant-scoped table
has row-level security enabled **and forced**, and the application connects as a role that cannot
bypass it. [docs/architecture.md](architecture.md) has the mechanism.

## Where data leaves the installation

There are exactly four ways, and three of them are switched off until an operator turns them on.

1. **Mail.** Login links and invitations go through your SMTP relay or Microsoft Graph
   (`GW_MAIL_TRANSPORT`). The recipient's address and the workshop title leave the server. With
   the `console` transport nothing is sent at all — the link is printed to the container log,
   which means **the log then contains a working login link**. Treat those logs accordingly.
2. **MCP / AI assistants.** A member can create a token that lets an assistant read and write
   their workshops. What the assistant's provider then receives is workshop content: titles,
   agendas, module text. Private fields — facilitator notes — are **not** included: the exporter
   filters them and MCP does not ask for them. Nonetheless, an operator whose facilitators use
   this has an AI provider in their processing chain and usually needs a contract with it. There
   is no way for you to see what a member did with their token after the fact beyond
   `audit_event` rows with `source = 'mcp'`.
3. **Share links.** A link opens a read-only view for anyone who has it. Visitors are not
   identified, but their IP and user agent are recorded in `share_session`.
4. **Let's Encrypt**, if you run the bundled Caddy: your hostname is submitted for certificate
   issuance and appears in public certificate transparency logs. That is the hostname, not user
   data.

Nothing else reaches the network. There are no third-party fonts, no CDN, no analytics, no error
reporting service — the browser talks only to your own hostname.

## The gap: nothing expires by itself

This is the part an operator has to act on, and it is stated first because it is the honest
answer rather than the flattering one.

**GoodWorkshop has no retention job.** Expired rows are treated as invalid when they are read,
but they are never deleted. Over time this accumulates:

- `email_token` rows, each with an email address and an IP, long after the link stopped working
- `auth_session` rows with IP and user agent, including revoked and expired ones
- `share_session` rows for every visitor who ever opened a share link
- `audit_event` rows, indefinitely

Storage limitation (Art. 5(1)(e) GDPR) is the controller's obligation, so it is yours to
implement. Until the application does it, a scheduled job is enough. Adjust the intervals to the
retention period you have decided on and written down:

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

Run these as the owner role, not as `gw_app` — row-level security scopes `gw_app` to one tenant
and these statements are meant to sweep all of them.

## Answering a data-subject request

**Access (Art. 15).** Everything about one person hangs off `identity.id`. The rows are in
`identity`, `member`, `webauthn_credential`, `auth_session`, `email_token` (matched by email),
`personal_access_token`, `oauth_token`, and `audit_event` via `actor_member_id`. Content they
wrote is not attributed to them per field — the CRDT log records authorship of edits, the
relational tables do not.

**Erasure (Art. 17).** Here is the second honest limitation: **the application has no delete
function for a person.** An admin can set a member to `disabled`, which revokes access, and that
is all the interface offers. Actual erasure is a database operation today, and it has an order:

```sql
-- 1. Workshops they own block the delete. This is deliberate -- `workshop.owner_id`
--    is RESTRICT so that removing a person cannot silently take a team's agendas
--    with it. Transfer them first, or delete them on purpose.
SELECT w.id, w.title
  FROM workshop w JOIN member m ON m.id = w.owner_id
  JOIN identity i ON i.id = m.identity_id
 WHERE i.email = 'person@example.org';

-- 2. Then the person. member rows, passkeys, sessions, personal access tokens
--    and OAuth grants follow by cascade. Content they wrote stays -- it belongs
--    to the workshop, not to them.
DELETE FROM identity WHERE email = 'person@example.org';

-- 3. Invitations that were never accepted have no identity to cascade from:
--    the row carries only the address.
DELETE FROM email_token WHERE email = 'person@example.org';
```

What this does **not** reach, and what you have to look at by hand:

- their name inside agenda content and facilitator notes, which is free text
- the same names inside `collab_update`, which is an append-only CRDT log: **deleting a name in
  the editor removes it from the current document but not from the update history** until that
  day's log is compacted
- `audit_event.data`, which may quote what was changed

If erasure has to be complete, the reliable route is to delete the workshops concerned rather
than to edit them: deleting a workshop row cascades through its days to `module`, `cluster`,
`collab_update` and `collab_state`, so the update history goes with it. In the interface that is
the second step of deleting a workshop — move it to the bin, then empty the bin.

**Rectification (Art. 16).** A person changes their own display name and language in the
interface. An email change goes through a verification token.

## What the operator has to do themselves

Not because it was forgotten, but because it cannot be shipped in a Docker image:

- Decide and document retention periods, then schedule the statements above.
- A record of processing activities (Art. 30) — the table at the top is the raw material.
- A data processing agreement with anyone who processes on your behalf: your mail relay, your
  hosting provider, and **the AI provider** if your facilitators use MCP tokens.
- A privacy notice for the people whose data ends up in agendas — participants, who typically
  never see this software at all.
- Backups: `scripts/backup.sh` writes a full dump. Deletions do not reach backups already taken,
  so your retention policy needs to cover them too.
- Technical and organisational measures: HTTPS is handled by the bundled Caddy, database
  encryption at rest is not — that is your disk.
