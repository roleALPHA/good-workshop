# GoodWorkshop help

The help pages served at <https://doc.goodworkshop.org>: Markdown files, built with
[Starlight](https://starlight.astro.build) into a static site with full-text search
(Pagefind) in each language.

```bash
pnpm --dir help install
pnpm --dir help dev       # http://localhost:4321/de/
pnpm --dir help build     # checks the locales, builds, validates every internal link
```

The image is `help/Dockerfile`: the built site behind nginx (unprivileged) on port 8080. The
cloud deployment builds it next to the app image and serves it as `doc.goodworkshop.org`.

## Rules for pages

- **Four languages, same paths.** Every page exists as
  `src/content/docs/{de,en,fr,es}/<group>/<slug>.md` with the same English slug in all
  four. The language picker relies on it, and `scripts/check-locales.mjs` fails the build
  otherwise. German is the source; write it first, then translate.
- **Frontmatter:** `title`, `description` (one sentence, shown in search and link
  previews) and `sidebar.order`. Use the order from the table below.
- **Words from the app, verbatim.** A button, a menu entry or a heading is named exactly
  as `src/messages/<locale>.json` names it in that language — the reader is looking for
  that word on screen. Bold it: **Parken**.
- **Address the reader like the app does:** du (de), you (en), tu (fr), tú (es).
- **Links** are absolute, with the language and a trailing slash:
  `[Parkplatz](/de/agenda/parking/)`. The build fails on a dead one.
- **Asides** for what must not be missed: `:::note`, `:::tip`, `:::caution`, `:::danger`.
  Cards, steps and tabs need `.mdx` and
  `import { Card, CardGrid, LinkCard, Steps, Tabs, TabItem } from '@astrojs/starlight/components'`.
- **Screenshots** live in `src/assets/<locale>/` and are referenced relatively, e.g.
  `![…](../../../../assets/de/agenda.png)` from a page in a group directory.
- **Cloud-only** features say so in an aside at the top of the page.
- **No foreign trademarks as method names.** Describe a method neutrally; tools such as
  Claude or ChatGPT may be named.
- A feature that changes in the app changes here too, in all four languages.

## Every change is checked against the help

Every change — feature, fix, permissions, visibility, UI text, MCP tool, configuration,
operations — is checked against these pages, and any page it makes wrong is corrected **in
the same pull request**. Checking is always done; writing only when needed. The result goes
into the pull request description as a line of its own, in one of two forms:

- `Hilfe: nachgezogen – sharing/share-with-people, ai/tools (de/en/fr/es)`
- `Hilfe: geprüft, nichts betroffen – <one sentence why, e.g. "only an internal test">`

"Nothing affected" is an answer, not an omission: a missing line means nobody checked. Tests,
CI and refactorings without a change in behaviour get the line too, with that reason.

The expensive mistake is not the forgotten page about the feature but the forgotten _other_
page. In v0.8.30 folders without access became invisible; `library/folders-and-workshops` was
updated. Left behind were "inherited shares" and "moving means sharing" in
`sharing/share-with-people`, the folder path in `sharing/export`, the **Ordner** line in
`start/how-it-works` and `list_folders` in `ai/tools` — each of them half wrong afterwards.

### 1. Write the change down as sentences

Before touching a page: what is true now, what is no longer true? As a list of statements the
way a reader would find them in the help ("Wer keinen Zugriff auf einen Ordner hat, sieht ihn
nicht"). A fix can change a statement too: what used to work and is now refused is often
described somewhere as a possibility. Sources:

```bash
git diff origin/main --stat
git diff origin/main -- src/messages/de.json       # new, changed, removed UI texts
git diff origin/main -- 'src/server/mcp/*'          # tools, descriptions, scopes
git diff origin/main -- src/domain/agenda/access.ts src/domain/workshop/folder-access.ts
```

### 2. Find every page that talks about it

Do not stop at the obvious page. Search in German (the source), for the term **and** for the
old words:

```bash
grep -rn -i "<term>" help/src/content/docs/de
grep -rn "<old UI text>" help/src/content/docs        # all four languages
```

Then always read these cross-cutting pages. They summarise, and so they go stale first:

| When this changes …                      | … read these pages                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| permissions, roles, visibility, sharing  | `sharing/share-with-people`, `account/members`, `start/how-it-works`, `library/trash` |
| what is in an export or a printout       | `sharing/export`, `sharing/print`                                                     |
| an MCP tool, a scope or its behaviour    | `ai/tools`, `ai/introduction`, `ai/connect` (scopes), `ai/examples`                   |
| library, folders, tags                   | `library/*`, `start/finding-your-way`, `start/quickstart`                             |
| sign-in, mail, account                   | `troubleshooting/sign-in`, `account/*`                                                |
| configuration, environment variable, ops | `self-hosting/*` (and `README.md`/`.env.example`, checked by `pnpm check:docs`)       |
| cloud only                               | `cloud/*`, with an aside at the top of the page                                       |
| a known problem is fixed                 | `troubleshooting/known-issues` — remove the entry                                     |

Name the pages you are going to touch before writing — that list is what a reviewer can check.

### 3. Write: German first, then en, fr, es

The rules for pages above apply. In addition: **the same place** in all four languages — same
section, same order — and a screenshot that shows the changed screen is called out as stale,
not left standing silently.

Check that every bolded term in the changed lines really is in the app:

```bash
for l in de en fr es; do
  git diff -U0 origin/main -- help/src/content/docs/$l | grep '^+' \
    | grep -oE '\*\*[^*]+\*\*' | sort -u | tr -d '*' | while read -r term; do
      grep -qF "\"$term\"" src/messages/$l.json || grep -qF "$term" src/messages/$l.json \
        || echo "$l: »$term« steht nicht in src/messages/$l.json"
    done
done
```

A hit is not always an error (levels such as **Admin** are sometimes running text), but each
one wants a look.

### 4. Check

```bash
pnpm --dir help build        # check-locales (four languages, same slugs, frontmatter) + dead links
pnpm format:check            # Prettier also runs over help/**/*.md
```

The CI job is called "Help site" and also builds the Docker image.

### 5. Live only after a release

The help is **not** delivered on merge. The cloud deployment builds this directory as the `doc`
image, so a change reaches doc.goodworkshop.org only with a release. Afterwards, check that the
sentence is really online:

```bash
curl -sS https://doc.goodworkshop.org/de/<group>/<slug>/ | grep -c "<part of the new sentence>"
```

### Pitfalls

- **Only the feature page updated** — see v0.8.30 above. Step 2 exists because of it.
- **A language forgotten:** `check-locales` notices missing _pages_, not a missing
  _paragraph_. Starlight silently falls back to German for a missing page; for a missing
  paragraph nobody says anything.
- **UI text translated instead of looked up:** "Access" in French is **Accès** in the app,
  not "Accéder". The reader looks for the word on screen.

## Pages

| Group (`directory`) | Slug                     | Order | German title                   |
| ------------------- | ------------------------ | ----: | ------------------------------ |
| `start`             | `introduction`           |     1 | Einführung                     |
|                     | `quickstart`             |     2 | Den ersten Workshop planen     |
|                     | `how-it-works`           |     3 | Wie GoodWorkshop aufgebaut ist |
|                     | `finding-your-way`       |     4 | Sich zurechtfinden             |
| `library`           | `folders-and-workshops`  |     1 | Ordner und Workshops           |
|                     | `tags`                   |     2 | Schlagwörter                   |
|                     | `trash`                  |     3 | Papierkorb                     |
| `agenda`            | `days`                   |     1 | Tage                           |
|                     | `blocks`                 |     2 | Blöcke und Bausteintypen       |
|                     | `timing`                 |     3 | Dauer und Startzeiten          |
|                     | `clusters-and-breakouts` |     4 | Abschnitte und Breakouts       |
|                     | `parking`                |     5 | Parkplatz                      |
|                     | `responsible`            |     6 | Verantwortliche                |
|                     | `live-editing`           |     7 | Gemeinsam live bearbeiten      |
| `sharing`           | `share-with-people`      |     1 | Mit Personen teilen            |
|                     | `share-links`            |     2 | Freigabelinks                  |
|                     | `print`                  |     3 | Drucken                        |
|                     | `export`                 |     4 | Als Markdown exportieren       |
| `ai`                | `introduction`           |     1 | Mit dem KI-Assistenten planen  |
|                     | `connect`                |     2 | Einen Assistenten verbinden    |
|                     | `tools`                  |     3 | Werkzeug-Referenz              |
|                     | `examples`               |     4 | Beispiele                      |
| `account`           | `profile-and-language`   |     1 | Profil und Sprache             |
|                     | `passkeys`               |     2 | Passkeys                       |
|                     | `members`                |     3 | Mitglieder                     |
|                     | `branding`               |     4 | Branding                       |
|                     | `mail`                   |     5 | Mailversand                    |
| `cloud`             | `overview`               |     1 | GoodWorkshop Cloud             |
|                     | `sign-up`                |     2 | Registrieren und Testphase     |
|                     | `pricing-and-billing`    |     3 | Preise und Abrechnung          |
|                     | `invoices`               |     4 | Rechnungen                     |
|                     | `vouchers`               |     5 | Gutscheine                     |
|                     | `discover`               |     6 | Methoden entdecken             |
| `self-hosting`      | `installation`           |     1 | Installation                   |
|                     | `configuration`          |     2 | Konfiguration                  |
|                     | `tls`                    |     3 | HTTPS und Reverse Proxy        |
|                     | `upgrade`                |     4 | Aktualisieren und sichern      |
|                     | `data-protection`        |     5 | Datenschutz                    |
| `troubleshooting`   | `overview`               |     1 | Übersicht                      |
|                     | `sign-in`                |     2 | Anmeldung und Anmeldelink      |
|                     | `ai-connection`          |     3 | KI-Verbindung                  |
|                     | `known-issues`           |     4 | Bekannte Probleme              |
|                     | `support`                |     5 | Support                        |

Each language also has an `index.mdx`: the start page with cards into the groups.
