# GoodWorkshop help

The help pages served at <https://doc.goodworkshop.org>: Markdown files, built with
[Starlight](https://starlight.astro.build) into a static site with full-text search
(Pagefind) in each language.

```bash
pnpm --dir help install
pnpm --dir help dev       # http://localhost:4321/de/
pnpm --dir help build     # checks the locales, builds, validates every internal link
```

The image is `help/Dockerfile`: the built site behind a small Caddy on port 8080. The
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
