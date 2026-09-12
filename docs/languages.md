# Languages

Binding when a string a person reads is added or changed, when a catalog is edited, or when
something new has to decide which language it speaks.

GoodWorkshop speaks German, English, French and Spanish. **German is the source text**: it is
what the code was written in, what the E2E suite asserts against, and what every other catalog
is a translation of.

## Where the language comes from

```
identity.locale  →  gw_locale cookie  →  Accept-Language  →  de
```

Resolved once, in `src/i18n/request.ts`, by the pure function in `src/i18n/resolve.ts`.

There is **no locale in the URL**. The application lives entirely behind a session, so there is
nothing to index and nothing to share as a language-specific link; the language is a property
of the person, not of the address. That also keeps next-intl's middleware out of the tree,
which matters more than it sounds: `src/middleware.ts` carries the CSP nonce to the renderer
through `NextResponse.next({ request: { headers } })`, and a second `NextResponse.next()` from
a composed middleware drops it silently. The symptom is not an error — it is a theme flash on
every page load.

Resolution happens in `getRequestConfig` and not in middleware because `readSession()` reaches
Postgres through `withAuth`, while middleware runs on the edge across a matcher that includes
`/api/health` and `/api/mcp`. It costs nothing: `readSession` is wrapped in React `cache()`, and
it was already being called two or three times per render.

Two rules that are easy to break:

- **A dead database must not throw there.** Otherwise `/login` becomes a stack trace and there
  is no way back in. `src/app/page.tsx` makes the same allowance.
- **Nothing under `src/server/auth/**` may ever call `getTranslations()`.** That is an infinite
  loop, and it is a tempting thing to add when somebody wants a translated "session expired".

## Where the strings live

| Namespace     | Reaches the browser | Contents                                                |
| ------------- | ------------------- | ------------------------------------------------------- |
| `common`      | yes                 | labels used in three or more places                     |
| `nav`         | yes                 | the app shell header                                    |
| `auth`        | yes                 | login, setup                                            |
| `library`     | yes                 | library, folders, bin                                   |
| `workshop`    | yes                 | the workshop and access screens                         |
| `agenda`      | yes                 | agenda, inspector, drag announcements                   |
| `settings`    | yes                 | language, passkeys, tokens                              |
| `admin`       | yes                 | branding, members, mail                                 |
| `errors`      | yes                 | `ActionError` codes, domain and field error keys        |
| `enums`       | yes                 | values that come out of the database                    |
| `meta`        | no                  | document titles and the description                     |
| `export`      | no                  | the Markdown exporter's own chrome                      |
| `mail`        | no                  | the two mail templates                                  |
| `moduleTypes` | no                  | the built-in block types — a file of its own, see below |

The split is the one line `CLIENT_NAMESPACES` in `src/i18n/config.ts`. At the current size the
difference is a few kilobytes; it is a lever for when the catalog is ten times larger.

`agenda` is deliberately a **feature** namespace rather than a route: the same components render
under `/w/[id]/d/[dayId]` and under `/print/...`.

## Errors carry a key, not a sentence

A domain error reaches three audiences with three languages: the person in the browser in their
own, an MCP client in English, and a log that belongs to an operator. A German sentence thrown
from `src/domain` forces all three into German — and `getTranslations()` cannot live down there,
because the same layer serves the collaboration server, which runs outside any request.

So `src/domain` throws `DomainError` with a key and primitive parameters, and exactly two places
turn that into a sentence: `src/server/actions/context.ts` for the web and
`src/server/mcp/errors.ts` in English. `Error.message` is the key itself, so anything that logs
an error prints something unambiguous rather than half a translation in the wrong language.

`ActionResult` still carries a rendered `message` alongside the key. That is not redundancy: it
is what let the twenty call sites doing `setError(result.message)` keep working while the seam
was introduced.

## The built-in block types

The fifteen built-ins are seeded **per tenant, in German** by `scripts/provision.mjs` — plain
Node with no catalog loader, running on every boot, writing into a `not null` column. The row
stays the stored truth; translation happens on the way out.

`localiseModuleType` rewrites only what a person reads: the name, the description, and inside
the JSON Schema the `title`, the field `description`, `x-gw.group`, `x-gw.help` and an injected
`x-gw.enumLabels`. Never `properties`, `required`, `type`, `enum`, `format` or `maxLength` — the
schema that comes out validates exactly the same documents, so `validate.ts` and every
`additionalProperties: false` are untouched by it.

Three consequences worth knowing:

- **A customised row is returned untouched.** `customized_at is not null` is the same predicate
  `provision.mjs` uses to decide the row belongs to the tenant. Translating half of it would
  also mistranslate by design: somebody renaming _Material_ to _Material & Medien_ keeps the
  field key `materials`, and a per-field fallback would cheerfully serve "Matériel" over their
  edit.
- **Missing keys fall back to the stored German**, per key. A built-in added in a release before
  its translations land renders in German rather than as a raw message key — and a raw key would
  not merely look wrong, it would end up in a Markdown file handed to participants.
- **The German catalog is generated from `builtins.json` and checked against it byte for byte.**
  Otherwise the two drift in the worst direction: a German facilitator sees the stored text
  while a French one sees the translation of a sentence that no longer exists.

This catalog is read **without next-intl**, through `src/i18n/module-type-catalog.ts`. Two
reasons, and the second is the load-bearing one: there is nothing to format — every value is a
plain string — and this path is reached from `domain/agenda/repo.ts`, which the collaboration
server imports and `scripts/build-collab.mjs` bundles into a single file. Going through
next-intl pulled `use-intl`, `intl-messageformat` and a hundred React references into a process
whose entire job is relaying WebSocket frames.

## What deliberately stays untranslated

- **`GoodWorkshop · powered by roleALPHA · AGPL-3.0`.** In the footer, the print view, the two
  mail signatures and the Markdown export. Not in the catalogs, not interpolated from tenant
  data — it lives in `src/lib/attribution.ts`, in the three shapes those surfaces need. A
  constant is not a translation.
- **MCP tool descriptions, server instructions and errors.** Prompt material for a model, not
  interface text: four variants would be four artifacts whose correctness means "the model still
  behaves", which no translator can check. The exception is `get_workshop` with
  `view: markdown`, which returns a document a person will paste somewhere and takes an explicit
  `locale`.
- **The duration input vocabulary** in `src/features/agenda/duration-vocabulary.ts`. Parser
  input, not display text: a translator editing a JSON string must not be able to break the
  most-used control in the application. The neutral forms (`90`, `1:30`, `1h30`, `1.5h`, `1,5h`)
  are accepted in every language, always.
- **Operator text.** Boot warnings, script output, WebSocket close reasons. English, hardcoded.
  It appears between `pg` errors and `docker compose` output that will never be translated
  either, and is read by the same person who is about to open the English README.
- **Tenant content.** Workshop titles, block titles, folder names, tags, the day note, custom
  block types. Those are what somebody wrote; nothing rewrites them.

## Times, dates and numbers

- `formatTime` takes the locale as a **required** parameter, not a defaulted one. Four of its
  thirteen call sites are server code with no request context — the exporter, the print page,
  MCP — and a forgotten argument there would fall back to German in a timetable, which is
  exactly the kind of wrong nobody notices.
- German, French and Spanish keep a 24-hour clock with a leading zero, which is also
  byte-for-byte what the function produced before it knew about languages. English gets a
  12-hour clock: `09:00 AM` is not how anybody writes half past nine.
- Dates go through next-intl's `useFormatter` with the named `short` format, defined once in
  `getRequestConfig`.
- `timeZone` is set explicitly there. Without it next-intl formats on the server in the server's
  zone and in the browser in the visitor's — and every date here comes out of a `timestamptz`,
  so the two disagree and React reports a hydration mismatch on a page nobody changed. See
  `GW_TIMEZONE`.

## Adding or changing a string

1. Put it in `src/messages/de.json` first — German is the source.
2. Translate it in the other three in the **same** commit. `src/i18n/catalogs.test.ts` insists,
   and the discipline is what stops a feature branch from becoming a six-week German-only one.
3. Numbers get `{x, number}`, counts get `{x, plural, …}`. Note that **French and Spanish both
   require a `many` category** that German and English do not — the test checks this against
   `Intl.PluralRules`, because a plural missing a category renders without an error and silently
   picks the wrong form.
4. Run `pnpm build` or `pnpm dev` once. next-intl regenerates `src/messages/de.d.json.ts` from
   the German catalog, and that declaration is what makes a mistyped key a compile error. It is
   types only — a stale one can never change behaviour, it just means `tsc` has not seen your new
   key yet.

Translations are written in the product's voice, not word for word: short, direct address
(du / you / tu / tú), no officialese. Loanwords that are loanwords in German too stay put:
Check-in, Check-out, Energizer, Fist of Five, Workshop. `Sozialform` is not "social form" but
`Format`; `Moderationsnotizen` are `Facilitator notes`, `notes d'animation`,
`notas de facilitación`.

## An ESLint rule watches the boundary

German prose in `src/components`, `src/features` or `src/app` is an error. Umlauts and ß are the
cheap, reliable tell — it will not catch "Save me", but it does catch the realistic case, which
is somebody adding a German label next to fifteen translated ones because that is what the file
used to look like.

Tests and fixtures are exempt, and the exemption block **restates the hex-colour rule**. Flat
config replaces a rule's options when a later block matches the same file, so an exemption that
only lists the German selectors would silently switch the colour guardrail off — which is
exactly the kind of guardrail failure that looks like everything is fine.
