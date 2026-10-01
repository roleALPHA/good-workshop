---
title: Support
description: Wie du in der GoodWorkshop Cloud Hilfe bekommst, wohin du ohne Anmeldung schreibst und wer selbst betriebene Installationen betreut.
sidebar:
  order: 5
---

Wo du Hilfe bekommst, hängt davon ab, wo dein GoodWorkshop läuft: in der
[GoodWorkshop Cloud](/de/cloud/overview/) oder auf einem Server, den du oder deine Organisation
selbst betreibt.

| Du nutzt …                                          | Dann …                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| die Cloud und kannst dich anmelden                  | schreibst du über das Support-Formular im Profilmenü                                    |
| die Cloud und kommst nicht hinein                   | schreibst du eine E-Mail an [support@goodworkshop.org](mailto:support@goodworkshop.org) |
| eine selbst betriebene Installation                 | wendest du dich an die Person, die sie betreibt                                         |
| GoodWorkshop und hast einen Fehler im Code gefunden | meldest du ihn als [GitHub-Issue](https://github.com/roleALPHA/good-workshop/issues)    |

Viele Fragen beantwortet schon diese Hilfe. Ein Blick in die [Übersicht](/de/troubleshooting/overview/)
der Fehlerbehebung lohnt sich vorher.

## In der Cloud: das Support-Formular

:::note[Nur in der Cloud]
Das Support-Formular gibt es nur in der GoodWorkshop Cloud. In einer selbst betriebenen
Installation fehlt der Eintrag **Support** im Profilmenü.
:::

1. Öffne oben rechts das Profilmenü.
2. Wähle **Support**.
3. Gib einen **Betreff** und deine **Nachricht** ein.
4. Klick auf **Anfrage senden**.

Danach bestätigt die Seite: „Danke! Deine Anfrage ist als Ticket #… bei uns angekommen. Die Antwort
kommt per E-Mail.“ Die Antwort geht an die Adresse, mit der du angemeldet bist.

**Was automatisch mitgeht:** dein Workspace, deine Rolle, die Version von GoodWorkshop und die
Sprache, in der du die App benutzt. Das musst du nicht dazuschreiben.

**Was hilft:** Beschreib, was du gemacht hast, was passiert ist und was du erwartet hast. Steht
eine Fehlermeldung auf dem Bildschirm, kopier sie wörtlich hinein. Hat ein KI-Assistent eine
Meldung mit einer Referenz bekommen („under the reference …“), gib diese Referenz mit — damit
finden wir die Ursache im Log.

### Wenn das Formular nicht funktioniert

| Meldung                                                                                                      | Was du tust                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| „Das Formular ist gerade nicht verfügbar. Schreib uns direkt an support@goodworkshop.org.“                   | Schreib eine E-Mail an [support@goodworkshop.org](mailto:support@goodworkshop.org).          |
| „Deine Anfrage konnte gerade nicht zugestellt werden. Schreib uns bitte direkt an support@goodworkshop.org.“ | Dasselbe: Die Anfrage ist nicht angekommen, schreib per E-Mail.                              |
| „Zu viele Versuche. Bitte versuch es später noch einmal.“                                                    | Pro Person sind nur wenige Anfragen pro Stunde möglich. Warte etwas oder schreib per E-Mail. |

## In der Cloud, ohne Anmeldung

Kommst du nicht in dein Konto — kein Anmeldelink kommt an, der Passkey wird abgelehnt —, schreib an
[support@goodworkshop.org](mailto:support@goodworkshop.org). Nenn die E-Mail-Adresse deines Kontos
und, wenn du sie weißt, den Namen deines Workspaces. Vorher lohnt sich ein Blick auf
[Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/).

## Selbst betriebene Installationen

Eine selbst betriebene Installation betreut, wer sie betreibt — meist die IT deiner Organisation
oder die Person, die GoodWorkshop eingerichtet hat. Wir haben keinen Zugriff auf solche
Installationen und sehen keine Daten daraus.

Wenn du die Installation selbst betreibst:

- Die Schritt-für-Schritt-Hilfe steht unter [Installation](/de/self-hosting/installation/) und in
  der README unter
  [Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).
- Die meisten Ursachen nennt das Log: `docker compose logs app` und `docker compose logs migrate`.
- Was bewusst noch nicht geht, steht unter [Bekannte Probleme](/de/troubleshooting/known-issues/).

## Fehler melden

Hast du einen Fehler in GoodWorkshop selbst gefunden, öffne ein
[Issue auf GitHub](https://github.com/roleALPHA/good-workshop/issues). Hilfreich sind:

- die Version (steht in der Fußzeile der App und in `/api/health`)
- was du gemacht hast, was passiert ist und was du erwartet hast
- der passende Auszug aus dem Log

:::caution[Keine Geheimnisse in Issues]
Issues sind öffentlich. Entferne Tokens, Anmeldelinks, Passwörter und personenbezogene Daten aus
Logauszügen, bevor du sie einfügst. Mit `GW_MAIL_TRANSPORT=console` enthält das Log gültige
Anmeldelinks.
:::

## Weiterlesen

- [Übersicht](/de/troubleshooting/overview/)
- [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)
- [GoodWorkshop Cloud](/de/cloud/overview/)
