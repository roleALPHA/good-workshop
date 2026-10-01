---
title: Übersicht
description: Vom Symptom zur passenden Hilfeseite — für Anmeldung, KI-Verbindung, Live-Editor und den eigenen Betrieb.
sidebar:
  order: 1
---

Such dein Symptom in den Tabellen und spring auf die passende Seite. Viele Meldungen in
GoodWorkshop sind ganze Sätze; die Hilfeseiten zitieren sie wörtlich, damit die Suche oben sie
findet. Kopier den Text, den du siehst, einfach in die Suche.

## Anmelden

| Symptom                                                                        | Seite                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Nach **Anmeldelink schicken** kommt keine Mail an                              | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| „Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.“ | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| „Der Link war unvollständig. Fordere einen neuen an.“                          | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| Kein Knopf **Mit Passkey anmelden**, stattdessen „Passkeys brauchen HTTPS …“   | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| „Der Passkey konnte nicht bestätigt werden.“                                   | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| „Diese Einladung gilt nicht mehr“                                              | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |
| „Bitte melde dich an.“ mitten in der Arbeit                                    | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/) |

## KI-Assistent

| Symptom                                                                | Seite                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude oder ChatGPT erreichen den Server nicht                         | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| HTTP 401 mit `invalid_token`                                           | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| HTTP 429 mit `rate_limited`                                            | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| Fehler auf der Seite **Zugriff erlauben?**                             | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| `This token does not have the "…" scope.`                              | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| `The call failed. The operator can find the cause in the server log …` | [KI-Verbindung](/de/troubleshooting/ai-connection/)    |
| Einen OAuth-Zugang zurückziehen                                        | [Bekannte Probleme](/de/troubleshooting/known-issues/) |

## Arbeiten in der Agenda

| Symptom                                                                          | Seite                                                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| „Keine Verbindung. Deine Änderungen werden übertragen, sobald sie wieder steht.“ | [Gemeinsam live bearbeiten](/de/agenda/live-editing/); selbst betrieben: [HTTPS und Reverse Proxy](/de/self-hosting/tls/) |
| „Jemand anderes hat diesen Workshop inzwischen geändert.“                        | [Gemeinsam live bearbeiten](/de/agenda/live-editing/)                                                                     |
| „Enthält Formatierung. Bearbeiten kommt mit dem Text-Editor …“                   | [Bekannte Probleme](/de/troubleshooting/known-issues/)                                                                    |
| „Dieser Workspace ist schreibgeschützt.“ (Cloud)                                 | [Preise und Abrechnung](/de/cloud/pricing-and-billing/)                                                                   |

## Selbst betreiben

| Symptom                                                                           | Seite                                                                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GW_APP_URL must be set` beim Start                                               | [Installation](/de/self-hosting/installation/)                                                                           |
| Caddy startet nicht, „GW_HOSTNAME muss gesetzt sein …“                            | [HTTPS und Reverse Proxy](/de/self-hosting/tls/)                                                                         |
| Das Zertifikat wird nicht ausgestellt                                             | [HTTPS und Reverse Proxy](/de/self-hosting/tls/)                                                                         |
| Kein Einrichtungsschlüssel im Log, oder „Der Einrichtungsschlüssel stimmt nicht.“ | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)                                                                |
| `/api/health` antwortet 503 mit `database`                                        | Die Datenbank ist nicht erreichbar oder startet noch — kurz warten, siehe [Installation](/de/self-hosting/installation/) |
| `/api/health` antwortet 503 mit `migrations`                                      | [Aktualisieren und sichern](/de/self-hosting/upgrade/)                                                                   |
| `migrate` bricht mit „MIGRATION STOPPED“ ab                                       | [Aktualisieren und sichern](/de/self-hosting/upgrade/)                                                                   |
| Graph antwortet `403` oder `invalid_client`                                       | [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)                                                                |
| Sicherung wiederherstellen, Mail-Zugangsdaten sind leer                           | [Aktualisieren und sichern](/de/self-hosting/upgrade/)                                                                   |
| Die Oberfläche ist in der falschen Sprache                                        | [Profil und Sprache](/de/account/profile-and-language/)                                                                  |

:::tip[Erst ins Log schauen]
Bei einer selbst betriebenen Installation nennt das Log fast immer die Ursache:
`docker compose logs app` für die Anwendung, `docker compose logs migrate` für Start und Update.
:::

## Nichts passt?

- Was bewusst noch nicht geht, steht unter [Bekannte Probleme](/de/troubleshooting/known-issues/).
- Wie du uns oder den Betreiber deiner Installation erreichst, steht unter
  [Support](/de/troubleshooting/support/).
