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
forwards `/collab` there; it authenticates with the same session cookie that opens the editor.

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

## Access and invitations

A membership starts as "invited"; only opening the sign-in link activates it. An admin cannot
activate anybody by decree — otherwise they could invite a foreign address and take over the
account that results.

Access to a single workshop is granted from inside the tenant, never by e-mail address: an
address is an identity, and identities are global; inviting by address would silently grant
access across a tenant boundary.

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
the ordering, and on an error apply half of it. A declarative write is all or nothing.

Every change optionally takes `expectedVersion`. Without it a client with a five-minute-old
state silently overwrites live editing — which is then reported as "the AI deleted my
workshop".

There is deliberately **no** area for user administration: an MCP client must never be able to
invite users or make anybody an admin.

**A model is a collaborator, not a second write path.** Writing tools go through the same room
as a browser: the model appears in the presence list, its block shows up immediately for
everybody who has the day open, and both changes merge rather than overwrite. If the
collaboration service is not running, the call fails with a named error rather than writing
data that disappears shortly afterwards.

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
