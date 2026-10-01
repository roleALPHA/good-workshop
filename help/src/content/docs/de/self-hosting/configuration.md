---
title: Konfiguration
description: Die wichtigsten Umgebungsvariablen einer selbst betriebenen GoodWorkshop-Installation, nach Zweck gruppiert.
sidebar:
  order: 2
---

Eine selbst betriebene Installation wird über die `.env` neben der `compose.yaml` konfiguriert.
Diese Seite ordnet die wichtigsten Variablen nach Zweck. Die vollständige, maßgebliche Tabelle
steht im Abschnitt
[Configuration](https://github.com/roleALPHA/good-workshop/blob/main/README.md#configuration) der
README; jede Variable ist außerdem in der `.env.example` kommentiert.

:::note[Keine Datenbank-Passwörter in der `.env`]
Die Passwörter der Datenbankrollen erzeugt der Stack beim ersten Start selbst, in eigene
Docker-Volumes. Es gibt dafür nichts einzutragen.
:::

## Pflichtwerte

| Variable      | Pflicht   | Bedeutung                                                                                            |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`  | ja        | Adresse, unter der die App erreichbar ist. Anmeldelinks und der Passkey-Ursprung hängen daran.       |
| `GW_HOSTNAME` | für `tls` | Name im Zertifikat, wird an Caddy durchgereicht.                                                     |
| `GW_VERSION`  | ja        | Image-Tag: `latest` oder eine feste Nummer wie `0.8.22`. Steht in der Fußzeile und in `/api/health`. |

`GW_APP_URL` muss genau die Adresse sein, die im Browser steht. Passt sie nicht, öffnen
Anmeldelinks die falsche Adresse, und der Live-Editor bleibt ohne Verbindung.

## Mailversand

Den Mailversand kannst du in der Oberfläche unter **Mailversand** einrichten
([Mailversand](/de/account/mail/)) oder in der `.env`. Die Umgebung gewinnt pro Feld; die
Oberfläche markiert solche Felder mit **aus der Umgebung**.

| Variable                                                 | Wann        | Bedeutung                                                                                 |
| -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                      | optional    | `smtp`, `graph`, `console` oder `none`. Leer: die Einstellungen in der Oberfläche gelten. |
| `SMTP_URL` / `SMTP_URL_FILE`                             | mit `smtp`  | Relay-URL, direkt oder aus einer Datei                                                    |
| `SMTP_FROM`                                              | mit `smtp`  | Absenderadresse                                                                           |
| `GW_GRAPH_TENANT_ID`                                     | mit `graph` | Microsoft-365-Mandant, als Domain oder Verzeichnis-ID                                     |
| `GW_GRAPH_CLIENT_ID`                                     | mit `graph` | Anwendungs-ID der App-Registrierung                                                       |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | mit `graph` | Secret der Registrierung, direkt oder aus einer Datei                                     |
| `GW_GRAPH_SENDER`                                        | mit `graph` | Postfach, von dem aus verschickt wird                                                     |

Für Microsoft Graph brauchst du eine App-Registrierung in Entra ID mit der
**Anwendungsberechtigung** `Mail.Send` (nicht der delegierten) samt Administratorzustimmung.

:::tip[Geheimnisse in Dateien]
Enthält `SMTP_URL` ein Passwort, gehört es in eine Datei: `SMTP_URL_FILE=/run/secrets/smtp_url`.
Eine Umgebungsvariable taucht in `docker inspect`, in `/proc/<pid>/environ` und in jedem
Core-Dump auf. Dasselbe gilt für `GW_GRAPH_CLIENT_SECRET_FILE`.
:::

:::caution[`console` ist eine bewusste Entscheidung]
Mit `GW_MAIL_TRANSPORT=console` landen vollständige, gültige Anmeldelinks im Container-Log. Wer
`docker logs` lesen kann — die Docker-Gruppe, ein Log-Sammler, ein Auszug für den Support —,
kann sich einen Link für **jede** Adresse ausstellen lassen. Die App warnt beim Start davor.
:::

## Anmeldung und Sitzungen

| Variable               | Standard              | Bedeutung                                                                              |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `GW_RP_ID`             | Host aus `GW_APP_URL` | WebAuthn-Relying-Party-ID. Eine spätere Änderung macht jeden Passkey ungültig.         |
| `GW_SESSION_IDLE_DAYS` | `14`                  | Nach wie vielen unbenutzten Tagen eine Sitzung abläuft                                 |
| `GW_TRUSTED_PROXIES`   | `1`                   | Anzahl der Proxys vor der App. Nur für Drosselung und Logs, nie für eine Berechtigung. |

## Erstes Admin-Konto

Nur für Installationen, die ein Skript aufsetzt. Der normale Weg ist `/setup`, siehe
[Installation](/de/self-hosting/installation/).

| Variable                        | Bedeutung                                                         |
| ------------------------------- | ----------------------------------------------------------------- |
| `GW_BOOTSTRAP_ADMIN_EMAIL`      | Legt beim allerersten Start einen Admin an und druckt seinen Link |
| `GW_BOOTSTRAP_ADMIN_FIRST_NAME` | Vorname, optional                                                 |
| `GW_BOOTSTRAP_ADMIN_LAST_NAME`  | Nachname, optional                                                |

## Betrieb

| Variable                                  | Standard        | Bedeutung                                                                                                   |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `GW_TIMEZONE`                             | `Europe/Berlin` | Zeitzone für Datumsangaben in der Oberfläche. Explizit setzen, damit Server und Browser gleich formatieren. |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`    | wird erzeugt    | Verschlüsselt die in der Oberfläche eingegebenen Mail-Zugangsdaten. **Gehört ins Backup.**                  |
| `GW_OPS_TOKEN`                            | leer            | Macht `/api/health` mit dem Header `x-ops-token` ausführlich: Version, Migrationsstand, Treiberfehler.      |
| `GW_MIGRATE_ON_START`                     | aus             | `1` lässt `app` vor dem Start migrieren, für Updater wie Watchtower                                         |
| `GW_PORT`, `GW_COLLAB_PORT`               | `3000`, `3001`  | Ports auf `127.0.0.1`, falls die Standardwerte belegt sind                                                  |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL` | leer            | Nur nötig, wenn der Kollaborationsdienst nicht unter `/collab` auf demselben Host liegt                     |

Ohne `GW_OPS_TOKEN` antwortet `/api/health` nur mit dem Status und den Namen der Prüfungen —
der Endpunkt ist öffentlich erreichbar. Was es mit `GW_SECRET_KEY` und `GW_MIGRATE_ON_START` auf
sich hat, steht unter [Aktualisieren und sichern](/de/self-hosting/upgrade/).

## Änderungen übernehmen

Nach einer Änderung an der `.env` bringst du den Stack erneut hoch:

```bash
docker compose --profile tls up -d
```

Ohne das Profil `tls` (eigener Proxy, SSH-Tunnel) lässt du `--profile tls` weg, siehe
[HTTPS und Reverse Proxy](/de/self-hosting/tls/).

## Weiterlesen

- [Installation](/de/self-hosting/installation/)
- [HTTPS und Reverse Proxy](/de/self-hosting/tls/)
- [Mailversand](/de/account/mail/)
- [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)
