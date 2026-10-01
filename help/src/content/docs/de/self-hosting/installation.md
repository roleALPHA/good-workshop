---
title: Installation
description: GoodWorkshop mit Docker Compose auf dem eigenen Server installieren und das erste Admin-Konto über /setup anlegen.
sidebar:
  order: 1
---

Die Community-Edition von GoodWorkshop läuft als ein Container-Image plus Postgres, gestartet mit
Docker Compose. Für Planung und Durchführung deiner Workshops fällt keine Lizenzgebühr an, auch
nicht bei kommerzieller Nutzung. Wenn du keinen Server betreiben willst: Die
[GoodWorkshop Cloud](/de/cloud/overview/) ist dasselbe Produkt, gehostet.

Diese Seite fasst die Installation zusammen. Maßgeblich ist der Abschnitt
[Installation (on-premise)](https://github.com/roleALPHA/good-workshop/blob/main/README.md#installation-on-premise)
in der README.

## Voraussetzungen

| Was        | Anforderung                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| Docker     | Docker mit Compose v2 (`docker compose version`), amd64 oder arm64                 |
| Hostname   | Ein Name, der öffentlich auf diesen Server auflöst                                 |
| Ports      | 80 und 443 frei — Let's Encrypt braucht beide für das Zertifikat                   |
| Datenbank  | Nichts zu tun: Postgres läuft im Stack und ist von außen nicht erreichbar          |
| Passwörter | Nichts zu tun: Der Stack erzeugt die Datenbank-Passwörter beim ersten Start selbst |

## 1. Dateien holen

Du brauchst `compose.yaml`, `Caddyfile` und eine `.env`:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

## 2. Image wählen

Die Releases liegen in der GitHub Container Registry. `compose.yaml` zieht das Image, das
`GW_VERSION` nennt. `latest` zeigt immer auf das neueste stabile Release. Jedes Release gibt es
außerdem unter seiner eigenen Nummer — damit bleibst du auf einer Version, bis du selbst
aktualisierst. Bauen musst du nichts.

:::caution[Ohne „v“]
Der Image-Tag hat kein „v“: Release `v0.8.22` heißt als Image `0.8.22`. Mit dem „v“ scheitert
der Download mit „not found“.
:::

## 3. Die `.env` ausfüllen

Drei Werte sind Pflicht. Fehlt einer, startet der Stack nicht und nennt den fehlenden Wert:

```bash
GW_APP_URL=https://workshop.example.com   # the address the app is reachable at
GW_HOSTNAME=workshop.example.com          # the name in the certificate (profile `tls`)
GW_VERSION=latest                         # the newest stable release, or e.g. 0.8.22 to pin one
```

**Mail kann warten.** Für den ersten Start brauchst du keinen Mailversand: Die
Einrichtungsseite zeigt deinen Anmeldelink selbst an. Danach richtest du den Versand in der
Oberfläche unter **Mailversand** ein, siehe [Mailversand](/de/account/mail/). Alle weiteren
Variablen stehen unter [Konfiguration](/de/self-hosting/configuration/).

:::danger[Den Hostnamen jetzt festlegen]
Passkeys hängen am Hostnamen. Wer ihn später ändert, macht **jeden** bereits registrierten
Passkey ungültig. Entscheide den Namen vor dem ersten Start.
:::

## 4. Starten

```bash
docker compose --profile tls up -d
```

Der Reihe nach passiert Folgendes:

1. `secrets` erzeugt die Datenbank-Passwörter, je Rolle eines.
2. `db` startet.
3. `migrate` legt die Rollen an, prüft die vorhandenen Daten, spielt die Migrationen ein und
   richtet die Bausteintypen ein.
4. `app` startet erst, wenn `migrate` sauber durchgelaufen ist.
5. `caddy` übernimmt die Ports 80 und 443 und holt das Zertifikat.

Läuft alles, antwortet der Healthcheck:

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

Ein `503` ist kein Absturz, sondern die ehrliche Antwort „dieser Container kann nicht
ausliefern“. `checks` sagt, ob es an der Datenbank oder am Migrationsstand liegt.

## 5. Die Installation im Browser übernehmen

Eine frische Installation meldet sich bei jedem Start im Log, bis jemand sie übernimmt:

```bash
docker compose logs app
```

```
  This installation has no administrator yet.

    https://workshop.example.com/setup
    Setup key: 7Qb3…

  The key is valid until this process restarts.
```

1. Öffne die angezeigte Adresse `/setup`.
2. Trag **Vorname**, **Nachname** und **Deine E-Mail-Adresse** ein.
3. Füge den **Einrichtungsschlüssel** aus dem Log ein.
4. Klick auf **Installation einrichten**.

Ist noch kein Mailversand eingerichtet, steht der Anmeldelink direkt auf der Seite. Er gilt
einmal und läuft ab. Alles Weitere — Mailversand, weitere Personen, Branding — erledigst du
danach in der Oberfläche.

:::note[Der Schlüssel ist die ganze Zugangskontrolle]
Wer `docker compose logs app` lesen kann, ist der Betreiber. Der Schlüssel liegt nur im
Speicher: Nach einem Neustart von `app` gilt ein neuer. Sobald es eine Administratorin gibt,
verschwindet `/setup` endgültig — eine Installation lässt sich nicht ein zweites Mal
übernehmen.
:::

### Zwei andere Wege zum ersten Admin

**Über die Kommandozeile**, mit einer Shell auf dem Server:

```bash
docker compose exec app node scripts/cli.mjs admin create \
  --email you@example.com --first-name Anna --last-name Berger
```

**Beim allerersten Start:** Setz `GW_BOOTSTRAP_ADMIN_EMAIL=you@example.com` in die `.env`, bevor
der Stack zum ersten Mal hochfährt. Der Link steht dann in `docker compose logs migrate`, gilt eine
Stunde und wird genau einmal gedruckt. Das ist für Installationen gedacht, die ein Skript statt
einer Person aufsetzt.

Findest du den Schlüssel oder den Link nicht, hilft
[Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) weiter.

## Weiterlesen

- [Konfiguration](/de/self-hosting/configuration/): alle wichtigen Variablen
- [HTTPS und Reverse Proxy](/de/self-hosting/tls/): ohne Caddy oder hinter einem eigenen Proxy
- [Aktualisieren und sichern](/de/self-hosting/upgrade/): Updates und Backups
- [Datenschutz](/de/self-hosting/data-protection/): was du als Betreiber wissen musst
