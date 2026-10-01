---
title: Aktualisieren und sichern
description: Eine selbst betriebene Installation auf eine neue Version bringen, Migrationen verstehen und die Datenbank sichern.
sidebar:
  order: 4
---

Ein Update ist bei GoodWorkshop derselbe Ablauf wie die Installation: Bei jedem Start läuft
dieselbe Kette aus Prüfung und Migration. Vorher kommt immer eine Sicherung. Die Details stehen in
der README unter
[Updating](https://github.com/roleALPHA/good-workshop/blob/main/README.md#updating) und
[Backing up](https://github.com/roleALPHA/good-workshop/blob/main/README.md#backing-up) sowie in
[docs/installation-and-upgrade.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/installation-and-upgrade.md).

## Auf eine neue Version aktualisieren

Welche Versionen es gibt, steht auf der
[Release-Seite](https://github.com/roleALPHA/good-workshop/releases). Aus dem Verzeichnis mit der
`compose.yaml`:

```bash
# 1. Back up. An upgrade without a backup is a bet.
scripts/backup.sh before-upgrade-$(date +%F).sql.gz

# 2. Fetch the new image. With GW_VERSION=latest that is all;
#    with a pinned version, point GW_VERSION in the .env at the new tag first.
docker compose pull

# 3. Bring it up.
docker compose --profile tls up -d
```

Mit einer festen Version trägst du vor Schritt 2 die neue Nummer in `GW_VERSION` ein — ohne „v“.
Ohne Profil `tls` lässt du `--profile tls` weg.

## Was beim Start mit der Datenbank passiert

`migrate` läuft bei jedem Start, und `app` wartet darauf. Ein Container, der gegen ein Schema
liefe, das er nicht versteht, kommt so gar nicht erst hoch.

| Schritt            | Was er tut                                                      |
| ------------------ | --------------------------------------------------------------- |
| `db-bootstrap.mjs` | legt Rollen an und setzt ihre Passwörter                        |
| `preflight.mjs`    | **liest nur** und prüft, ob die Daten zu den Migrationen passen |
| `migrate.mjs`      | spielt ausstehende Migrationen ein                              |
| `provision.mjs`    | richtet Bausteintypen ein                                       |

### Wenn die Vorprüfung anhält

Findet die Vorprüfung Zeilen, die einer Migration im Weg stehen, bricht `migrate` mit
„MIGRATION STOPPED“ ab. Die Datenbank ist dann **unverändert** — es gibt nichts zurückzurollen.
Die Meldung nennt die betroffenen Zeilen, die Abfrage, mit der du sie ansiehst, und die
Entscheidung, die zu treffen ist. Danach startest du mit demselben Befehl neu.

Was ein Update finden würde, siehst du auch ohne zu aktualisieren:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

:::caution[Wenn eine Migration mittendrin scheitert]
Dann ist der Stand in `drizzle.__drizzle_migrations` maßgeblich: Er sagt, was eingespielt wurde.
Der Weg zurück führt von dort über die Sicherung. Den Grund nennt `docker compose logs migrate`.
:::

### Automatische Updates (Watchtower)

Ein Updater wie Watchtower ersetzt **nur** den Container, den er beobachtet. Der Dienst `migrate`
läuft dabei nie, und die neue App würde gegen das alte Schema laufen. Dafür gibt es
`GW_MIGRATE_ON_START=1` zusammen mit einer `compose.override.yaml` aus der README
([Automatic updates](https://github.com/roleALPHA/good-workshop/blob/main/README.md#automatic-updates)).
Der Preis: `app` hält dann auch die Passwörter des Superusers und von `gw_owner`, und die
Rollentrennung ist für diesen Container aufgehoben. Entscheide das bewusst.

## Sichern

Die Datenbank ist der vollständige Bestand, Logos eingeschlossen — sie sind Zeilen, keine Dateien.
Ein Dump genügt:

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

Nimm das Skript statt einer handgeschriebenen `pg_dump`-Zeile. Die Zeile legt auch dann eine
Datei an, wenn nichts gesichert wurde. Das Skript schreibt erst daneben, prüft, ob der Dump bis
zu seiner Abschlusszeile durchgelaufen ist, und gibt ihm erst dann den endgültigen Namen.

### Der Anwendungsschlüssel gehört dazu

Der Anwendungsschlüssel entschlüsselt die Mail-Zugangsdaten, die in der Oberfläche eingegeben
wurden. Er steht nicht im Dump:

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

Geht er verloren, kommt die Sicherung mit **leeren** Mail-Zugangsdaten zurück. Alles andere —
Workshops, Mitglieder, Branding — übersteht das, die Zugangsdaten gibst du einmal neu ein.

### Was in die nächtliche Sicherung gehört

Genau drei Dinge: der Dump, der Anwendungsschlüssel und die `.env`. Die Datenbank-Passwörter
nicht — die erzeugt der Stack bei Bedarf neu. Prüfe, was im Archiv steht, nicht nur, ob es da ist.
Ein gescheiterter Dump kann ein gültiges, aber leeres gzip-Archiv hinterlassen:

```bash
gzip -dc goodworkshop.sql.gz | tail -c 400 | grep -c 'dump complete'
```

Für Sicherungen außer Haus liegen drei Skripte im Repo, gedacht als systemd-Timer:

| Skript                        | Was es beantwortet                              | Wo es läuft                            |
| ----------------------------- | ----------------------------------------------- | -------------------------------------- |
| `scripts/backup-offsite.sh`   | Liegt der heutige Stand verschlüsselt woanders? | auf dem Server, täglich                |
| `scripts/backup-verify.sh`    | Kommt die Sicherung tatsächlich zurück?         | auf dem Server, wöchentlich            |
| `scripts/backup-freshness.sh` | Wird überhaupt noch gesichert?                  | **auf einem anderen Rechner**, täglich |

Konfiguration und systemd-Units stehen in der README.

## Wiederherstellen

Die Datenbank-Passwörter stehen nicht im Dump, und eine Wiederherstellung auf einem neuen Server
braucht sie auch nicht: `secrets` erzeugt neue, und `migrate` setzt sie auf die Rollen. Die
Rollen selbst sind in keinem Dump enthalten; sie legt `db-bootstrap.mjs` an. Zurück brauchst du
also den Dump, den Anwendungsschlüssel und die `.env`.

Einen fertigen Wiederherstellungsbefehl für die laufende Installation dokumentiert das Repo
nicht. Wie ein Dump in ein frisches Postgres zurückgelesen wird, zeigt `scripts/backup-verify.sh`:
Es macht genau das in Wegwerf-Containern, ohne den Produktiv-Stack zu berühren. Probier die
Wiederherstellung aus, bevor du sie brauchst.

:::note[Aufbewahrung ist ein Versprechen]
Die Offsite-Sicherung behält 14 tägliche, 8 wöchentliche und 12 monatliche Stände. Was du
einstellst, gehört auch in deine Datenschutzerklärung, siehe [Datenschutz](/de/self-hosting/data-protection/).
:::

## Weiterlesen

- [Installation](/de/self-hosting/installation/)
- [Konfiguration](/de/self-hosting/configuration/)
- [Bekannte Probleme](/de/troubleshooting/known-issues/)
