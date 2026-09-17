# Architecture and design decisions

The README describes what GoodWorkshop does and how to install it. This is why it is built the
way it is on the inside — for everybody working on it, or wanting to understand an
installation more deeply.

## In three sentences

Next.js 15 with React 19 and PostgreSQL, one application with tenant isolation that is in
every case enforced by row level security in the database. The editor works on a CRDT (Yjs);
the relational tables remain the authoritative record. What ships is a single Docker image
plus Postgres.

## Tenant isolation

Every table carries `tenant_id` and is under `FORCE ROW LEVEL SECURITY`; the policies apply
`to gw_app` and compare against `app.current_tenant()`. The application sets that value in
every transaction through `withTenant()` — an ESLint guardrail forbids importing the raw `db`
handle outside `src/server/db`, so that no query can get around it.

`FORCE` is the decisive part: the owner of a table bypasses its own policies unless they are
forced — and `gw_owner` owns every table here, because that role runs the migrations.
`scripts/migrate.mjs` therefore applies `FORCE` on every run to every table with a policy, so
that a table added next year does not quietly miss out.

The identity tables (`identity`, `webauthn_credential`, `email_token`, `auth_session`, …) are
locked for `gw_app`. Whoever needs them explicitly enters through `set local role gw_auth`;
because `gw_app` is NOINHERIT, that right ends with the transaction. An ORM mistake outside the
auth module therefore cannot read sign-in material.

### Finding the tenant before a credential names one

Most requests arrive with their tenant attached: a session, a personal access token, an OAuth
access token and a guest cookie each name one. A handful of moments do not — somebody signing
in, a guest opening a share link, an OAuth client registering or redeeming a code, a logged-out
visitor looking at the login page, first-run setup. Every one of those asks
[`edition`](../src/server/edition/index.ts), and nothing else in the application names a tenant
id of its own; `src/server/edition/edition.test.ts` fails the build when something does.

The Community Edition answers each question with its one fixed tenant and without a database
read, which is exactly how self-hosted installations have always behaved. The seam exists so
that an edition with many tenants can answer the same questions from the credential in hand —
the identity, the hash of a code or token — without a second code path through sign-in, OAuth
or sharing. Which edition a build is gets decided when it is built, never by an environment
variable an operator could set: `GW_EDITION` is a Docker build argument, the build points
`@gw/edition` at `community.ts` or `cloud.ts` and records the choice in `dist/edition.json`, and
migrate and provision read that file. Only a cloud build applies `drizzle-cloud/` — one
membership per person, and the SECURITY DEFINER functions that find the tenant behind an
identity, a share link, an authorization code or an OAuth token.

## Database roles

| Role       | For what                         | Particularity                      |
| ---------- | -------------------------------- | ---------------------------------- |
| `postgres` | creating roles, schema ownership | only in the `migrate` container    |
| `gw_owner` | migrations                       | owns the schema, NOINHERIT         |
| `gw_app`   | the application                  | RLS forced, NOBYPASSRLS, NOINHERIT |
| `gw_auth`  | the sign-in path only            | no login, is entered               |
| `gw_ops`   | maintenance and tests            | BYPASSRLS                          |

Creating roles is an operator action and not a migration — which is why `db-bootstrap.mjs`
does it as superuser, and `gw_owner` deliberately has no right to.

Every login role gets its own random password into a file on first start
(`scripts/db-secrets.mjs`), and every service receives only the files it needs: the web
container knows `gw_app` and nothing else. The long reasoning, and why the earlier route
through peer authentication could not work, is a comment in `compose.yaml` and in
`scripts/db-secrets.mjs`.

## Live collaboration

Several people edit the same workshop day at once; a CRDT (Yjs) does the merging, so that
simultaneous changes to different blocks — and to different fields of the same block — both
survive.

**Yjs is the editing layer, Postgres remains the record.** Export, print and every read query
read the relational tables and know nothing about a CRDT. A materialiser writes the state
back; `collab_state.materialized_up_to` says how far behind the tables are.

**A day has exactly one write path.** The materialiser writes the document into the tables and
deletes anything there that the document does not know about — otherwise deletions could not
be transferred. Which makes every second write path onto the same day a silent data loss:
written, deleted again a few seconds later, and only when somebody happens to have the day
open. So _everything_ that changes a day — the editor as much as MCP — goes through the room.
The room fills its document from the database on opening, so that even a write into a day
nobody has ever opened starts from the real state.

The collaboration service runs as **its own process in the same image** on port 3001 — Next
cannot serve a WebSocket upgrade from a route handler. A second image would have been the more
comfortable route and would have broken the promise of "one image plus Postgres". The proxy
forwards `/collab` there; it authenticates with the same session cookie that opens the editor --
or, for an invited guest, with theirs. Nothing in the socket decides whether a guest may write:
it demands `workshop.content.write` before the upgrade, so a guest invited only to read is
refused at the handshake by the capability table alone.

**The handshake is not the last word.** A socket stays open for hours, and access is withdrawn
in the web process, which has no line to this one. The shared line is Postgres: triggers on every
table that decides access (sessions, members, tokens, invitations, collaborators, folders,
workshops, days — `drizzle/0009_access_changed_notify.sql`) send an empty `NOTIFY`, and the
collaboration server asks every open socket's credential again through the normal access check.
The notification carries nothing to trust; it is only a reason to ask. Because a notification can
be lost, every socket is also checked on a timer, and a message on a check that has grown old
waits for a fresh one before it is applied — so a late notification cannot let a withdrawn guest
write into the record. A "no" closes the socket with code 4401.

**Being allowed in is not a blank cheque.** The frame limit bounds one message; `limits.ts` bounds
the rest: messages and bytes per socket (token buckets, close code 4429), messages waiting to be
handled, bytes buffered towards a socket that stopped reading, connections per room, and the
encoded size of a day's document (close code 4413). The document limit is checked _before_ an
update is applied, because afterwards it has already been broadcast and queued for the log.
Tombstones count towards it, so a document churned to its limit stays there — which locks one
day, and not the service.

## The library

The visibility rule is in the SQL and not a filter afterwards. That is why pages work at all:
filter in the application and a page of twenty rows delivers three visible ones, `LIMIT`
returns pages that are too short and `OFFSET` skips rows nobody ever saw.

Paging is by key, not by `OFFSET`: somebody editing a workshop on the side pushes it upwards,
and with `OFFSET` you would get the same row twice or not at all.

Search is `ILIKE` over the title, not a tsvector. At a few thousand rows that costs nothing,
saves a migration — and "strat" still finds "Strategie", which a stemmed index does not do
without a prefix query.

Tags appear as you type. A management screen you have to visit first is a step nobody wants
and a screen nobody maintains; a tag nothing points at any more disappears by itself.

## OAuth for MCP clients

A personal access token is the right credential for a client somebody configures by hand.
It is the wrong one for a client that has to onboard a stranger: ChatGPT's developer-mode
connectors accept only OAuth or no authentication at all, and the claude.ai connector UI is in
the same place. So `/api/mcp` is now a proper OAuth 2.1 resource server, and this installation
is its own authorization server.

**Both credentials resolve through the same door.** `resolveBearer` reads the prefix — `gwp_` is
a personal access token, `gwo_` an OAuth access token, `gwr_` a refresh token and therefore
refused here — and everything downstream only ever asks the two questions it always asked: who
is this, and what may it do.

Four decisions worth knowing, because each has a tempting alternative:

- **Registration is open**, as RFC 7591 describes it, because the specification expects a client
  the operator has never heard of to be able to start. What makes that acceptable is that a
  registration grants _nothing_: it is a name and a redirect target, and every permission still
  comes from a person at the consent screen. It is rate limited per address, which is the only
  defence available to an endpoint that must stay reachable by strangers.
- **PKCE is S256 or nothing.** OAuth 2.1 keeps `plain` for clients that cannot compute a hash; a
  service reachable over HTTPS is not one, and accepting it would mean accepting a challenge
  that protects nothing.
- **Redirect targets match exactly.** Prefix matching is how an open redirector is built by
  accident — "the registered URI plus anything" includes paths the client never asked for. A
  broken request is therefore shown ON the consent screen rather than bounced to an address we
  have not validated, and a refusal is validated the same way an approval is.
- **A client is offered reading and writing workshops**, not only reading. The specification's
  advice is to start small and step up, but a step-up needs a 403 with `insufficient_scope` at the
  HTTP level, and a refused write here is a tool result inside a 200 — no client ever stepped up,
  so Claude and ChatGPT were shown every write tool and could run none. Offering is not
  granting: the consent screen lists the scopes in words and a person decides. Block types stay
  read-only and the tenant is not offered at all. One list, `OAUTH_SCOPES`, feeds the default,
  the metadata document and the 401.
- **Tokens carry their audience.** The MCP specification requires a server to accept only tokens
  issued for itself; `resource` is stored on the row and compared on every call. Without it a
  client could carry a token minted here to somebody else's server, which is where a confused
  deputy starts.

The authorization code is spent inside the `UPDATE` that reads it (`used_at is null` is part of
the `WHERE`), so two requests racing on one code cannot both win — the loser of a read-then-write
race is somebody replaying a code they intercepted. Refresh tokens rotate for the same reason: a
stolen one works at most once, and the theft surfaces as the real client being logged out.

There is a second SECURITY DEFINER function, `app.resolve_oauth_token`, beside the one that
resolves personal access tokens. Two functions rather than one widened one: a PAT has no
audience and an OAuth token does, and folding them together would mean a null that means "skip a
security check". (A third, `app.forget_identity_if_orphaned`, answers a different question the
application's own role cannot ask — see Access and invitations below.)

**What is deliberately not built yet:** Client ID Metadata Documents, which the specification
prefers over dynamic registration; and a sign-in that returns to the consent screen afterwards —
somebody who is not logged in when a client sends them here signs in, lands in the library, and
starts the flow again from the client.

## Access and invitations

A membership starts as "invited"; only signing in through the link activates it. An admin cannot
activate anybody by decree — otherwise they could invite a foreign address and take over the
account that results.

**Opening a sign-in link spends nothing.** `/verify` only checks the token and shows a button;
the button consumes it. Mail scanners — Microsoft Defender's Safe Links above all — fetch every
link before the recipient does, and while the GET consumed the token, those recipients only
ever saw "expired".

**Disabling and removing are different answers.** Disabling revokes access and keeps the row;
removing deletes it, and a `disabled` row still holds a name and an address, which is precisely
what an erasure request is about. Removing therefore asks for a successor: `workshop.owner_id`
is `RESTRICT`, so the database already refuses to let a member vanish out from under a team's
agendas, and `folder.created_by` — which
[`folderRoleFromPath`](../src/domain/workshop/folder-access.ts) reads as folder ownership —
carries no foreign key at all, so nothing but the application keeps it pointing at somebody who
exists. Choosing the successor is a decision for the admin rather than a default, because every
default hands somebody else's work to whoever the code guessed.

Once the last membership is gone, so is the account — and that answer needs a third SECURITY
DEFINER function, [`app.forget_identity_if_orphaned`](../drizzle/sql/902_forget_identity.sql).
`gw_app` may read `member` but not `identity`, `gw_auth` the reverse, and the question "does
this person still belong to any workspace at all?" spans both. It runs with BYPASSRLS on
purpose: an admin of one workspace must not delete an account another workspace still uses, and
a membership count scoped by the caller's tenant would answer "none left" and be wrong.

Access to a single workshop is granted from inside the tenant, never by e-mail address: an
address is an identity, and identities are global; inviting by address would silently grant
access across a tenant boundary.

**A folder can be shared too, and it reaches the whole subtree.** One sentence — "the Acme team
works in Kunden/Acme" — instead of one grant per workshop. Three rules keep that from becoming a
way to give away things that are not yours, and all three live in
[`domain/workshop/folder-access.ts`](../src/domain/workshop/folder-access.ts) as pure functions
with test tables:

- **The nearest folder decides.** Walking up from the workshop, the first folder that says
  anything about this member is the answer — so a subtree shared as editor can still hold one
  folder that is read-only. A row on the workshop itself is nearer than any folder, which is how
  a single workshop is pinned back.
- **Nobody hands on more than they hold.** A folder editor may make editors and viewers; a
  folder viewer may only make viewers. The same rule applies backwards, which is the half that
  is easy to forget: without it a viewer could revoke an editor.
- **A folder grant is never ownership.** `workshop.delete` and `workshop.transfer` stay with the
  owner. Making a folder that other people file things in confers no right to throw their work
  away.

Two consequences worth stating rather than discovering. A workshop **moved into** a shared
folder is shared by that move alone. And because delegation is open to everyone who holds
something, a viewer can widen the audience of a colleague's workshop — bounded to their own
level, but the circle grows without the owner acting. That is the price of folder-level sharing;
the alternative was an admin in the loop for every addition.

**A share link for somebody with no account is the exception, and it is not one.** A client, an
external co-trainer or a commissioning manager gets one agenda by e-mail — and that does not
cross the boundary the rule protects, for four reasons that are each load-bearing rather than
reassuring: it creates no `identity` and no `member`, so nothing global comes into existence;
the row lives in a tenant-scoped table under RLS and can name nothing outside its own tenant; it
grants exactly one workshop, never the library and never a second one; and the guest's session
lives in `share_session`, which has no `identity_id` column at all — so a guest session cannot
become a login. That last one is the shape of the schema rather than a rule somebody has to
remember.

The address on such a link is therefore not an identity. It is the **second factor**: the link
alone shows a form, and only the address the invitation was sent to opens the agenda. A link
that was forwarded, left in an inbox or found in a browser history is not a key. The token is
deliberately **not** single-use, unlike a magic link — a guest comes back to it tomorrow from
their phone — which is exactly why it needs a second factor at all.

Guests get their own roles rather than `viewer` and `editor`, because `editor` carries renaming,
tags, the bin and moving between folders. A guest invited to write edits agenda content and
nothing else, and a reader gets `workshop.read` alone: no print view and no Markdown download,
which would be a second and third surface to get wrong.

How long it lasts is **derived, not stored**: access ends after the last dated day of the
agenda. A date written into the row at invitation time would lock guests out of a workshop that
was moved by a week, and the person who rescheduled it would have no reason to suspect the
invitation. A workshop with no dates yet has no deadline, so only a withdrawal ends it.

Whoever has no access gets 404 rather than 403: a workshop you may not see should not confirm
that it exists.

The last active admin can neither be demoted nor switched off. A tenant without an admin can
only be repaired through a shell on the server.

## Languages

Four of them — German, English, French, Spanish — and no locale in the URL. The application
lives entirely behind a session, so there is nothing to index; the language is a property of
the person, not of the address.

**The key travels, not the sentence.** A domain error reaches three audiences with three
languages: the person in the browser in their own, an MCP client in English, and a log that
belongs to an operator. So `src/domain` throws keys and exactly two places turn them into
sentences. `Error.message` is the key itself, which means anything that logs an error prints
something unambiguous rather than half a translation in the wrong language.

**The stored row stays the truth; translation happens on the way out.** The fifteen built-in
block types are seeded per tenant in German by a plain boot script with no catalog loader.
`localiseModuleType` rewrites only what a person reads — never `properties`, `required`,
`type`, `enum` — so the schema still validates exactly the same documents. A row the tenant
has customised is returned untouched: mixed output, half in the tenant's wording and half
translated, is the worst of the three possible answers.

The details, and what deliberately stays untranslated, are in [Languages](languages.md).

## Branding

The server takes hue and chroma from **one** hex value and derives the light and dark steps
itself; the lightness steps stay fixed. That is exactly the trick: OKLCH lightness is
perceptual, so the brand colour can be swapped without re-checking the contrast of every
surface. A colour that would not produce a readable ramp is refused on saving, not discovered
later as an unreadable page.

Branding touches `--brand-*` and **never** `.cat-*`. Block type colours are semantics ("this is
a break"), not decoration; a corporate blue across every block type makes the agenda
unreadable.

An uploaded SVG is **refused rather than cleaned** when it contains scripts, `<style>`, event
handlers or external references. Cleaning markup with patterns is the route by which sanitisers
get bypassed: a near miss leaves a file that passed the check and still runs. On top of that
the logo is only ever served into an `<img>` — browsers run no script inside one.

## MCP design

The most important tool is `apply_agenda`: it writes a complete day agenda in one go. Twenty
separate, dependent calls are the point at which models fall apart — they lose ids, drift in
the ordering, and on an error apply half of it. A declarative write is all or nothing. Each block
carries all its fields in the same call — title, duration, pinned start, parked and `desc`, the
block type's own fields — so filling in an agenda is not one `update_module` per block. Every
`desc` is validated against its schema before anything is written, and the error names each
item (`items[1].children[0].desc.presenter`).

**Who is responsible for a block is a field of the block, not of its type.** Every block has
somebody who answers for it — a break as much as a presentation — so `responsible` sits beside
the title and the duration rather than in a `desc` a tenant can edit away. It holds one or more
people, each `{ name, memberId }`; a member carries their id, somebody from outside the workspace
only a name. The name is stored for members too: the print view, the export and a guest have no
member directory, and a guest must not be handed one. Where a directory is at hand the editor
shows a member under their current name. A model names people by `memberId` or by their exact
full name, first and last;
there is still no tool that lists the members, so a name that matches nobody is taken to be
somebody from outside.

Its counterpart for an agenda that already exists is `update_modules`: the fields of many blocks
and clusters of one day in one call, ids unchanged. It follows the same rule — every entry is
checked against the day before any is written, and the error names each one (`updates[2]`).

Every change optionally takes `expectedVersion`. Without it a client with a five-minute-old
state silently overwrites live editing — which is then reported as "the AI deleted my
workshop".

**A model can do what the library and the day editor let a person do** — create, move and
delete folders; create, rename, file, tag, bin, restore and purge workshops; add, change, order
and delete days; add, change, park, move and delete blocks and clusters, and move a block from
one day to another. Every tool calls the same
repository function behind the same capability check as the corresponding server action, so a
token never reaches further than its person: moving and deleting folders stays with tenant
admins, a viewer cannot rename, and `list_workshops` lists only what the library would.

There is deliberately **no** area for user administration and none for access: an MCP client
must never be able to invite users, make anybody an admin, or share a workshop or folder.
Handing out access on somebody's behalf is a step a model must not be able to take.

**A model is a collaborator, not a second write path.** Writing tools go through the same room
as a browser: the model appears in the presence list, its block shows up immediately for
everybody who has the day open, and both changes merge rather than overwrite. If the
collaboration service is not running, the call fails with a named error rather than writing
data that disappears shortly afterwards.

**The parking area belongs to the workshop, and a block crosses days as a copy and a deletion.**
Every day is a room of its own, and its materialiser deletes every row of its day that its
document does not hold. A block therefore cannot simply change its `day_id`: it is written into
the day it goes to — with a new id, so two open rooms never fight over one row — and only then
removed from the day it left. If the second step fails, the block exists twice, which somebody
can see; the other order would lose it. `get_workshop` lists what is parked on the other days,
`move_module` with `toDayId` brings a block over, and `delete_day` moves the parked blocks of
the day it deletes to a day that stays. The day editor uses the same functions
(`src/server/collab/across-days.ts`) through server actions, which open the rooms with the
person's own session cookie.

**MCP answers in English.** Tool descriptions are prompt material: a model reads them and
decides its next call from them. Four translated variants would be four artifacts whose
correctness means "the model still behaves", which nobody can review. The one exception is
`get_workshop` with `view: markdown`, which returns a document a person will paste somewhere
and therefore takes an explicit locale.

## The Docker image

Built multi-stage, runs as non-root `node`, downloads around 70 MB (roughly 316 MB unpacked)
and has a `HEALTHCHECK` on `/api/health` that also reports which commit is running.

No secret sits in a layer — everything needed at runtime arrives at start. There is no
`AUTH_SECRET`: sessions are rows in Postgres with a random secret of their own per session,
not signed tokens, so there is no signing key to set.

Releases come from a git tag `v*` and land as a multi-arch image (`linux/amd64` +
`linux/arm64`, each built natively) including SBOM and provenance on `ghcr.io`.

## The healthcheck

`/api/health` checks the database connection **and** whether the migrations this image expects
are actually applied. A rolling deploy with a pending migration therefore fails the healthcheck
rather than serving pages against a schema it does not understand.

A database that is _ahead_ is reported and tolerated: in a rolling deploy the migration runs
first and the old containers keep serving until they are replaced. Failing on that would mean
every deployment briefly switches the installation off.

Without a database the endpoint answers 503 — the container cannot serve the application then.
Which is why the test environment waits for the front page and not for this endpoint: "is the
server listening" and "can this container serve the application" are two different questions.

The endpoint sits behind the proxy's catch-all, so it answers the open internet. That is why on
its own it says only whether it is healthy and which check failed. Only with `GW_OPS_TOKEN` and
the header `x-ops-token` does it name the version, the migration state and the driver error in
the clear.
