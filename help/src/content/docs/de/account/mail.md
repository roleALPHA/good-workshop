---
title: Mailversand
description: Festlegen, wie GoodWorkshop Anmeldelinks und Einladungen verschickt – per SMTP oder Microsoft 365 – und den Versand testen.
sidebar:
  order: 5
---

GoodWorkshop verschickt Anmeldelinks und Einladungen per E-Mail. Ohne Mailversand kommt nur
hinein, wer schon einen [Passkey](/de/account/passkeys/) hat. Diese Seite brauchst du vor
allem, wenn du GoodWorkshop selbst betreibst.

Öffne oben rechts das Kontomenü und wähle unter **Verwaltung** den Eintrag **Mailversand**.

:::note
Den Mailversand richten nur Admins ein.
:::

## Den Weg wählen

Unter **Wie sollen Mails verschickt werden?** stehen vier Möglichkeiten:

| Weg                             | Wofür                                                 |
| ------------------------------- | ----------------------------------------------------- |
| **Microsoft Graph**             | Für Microsoft 365 ohne SMTP AUTH.                     |
| **SMTP**                        | Ein klassisches Mailrelay.                            |
| **In das Server-Log schreiben** | Kein Versand. Anmeldelinks landen im Log des Servers. |
| **Kein Versand**                | Anmeldelinks gibt es nur über die Kommandozeile.      |

:::caution
**In das Server-Log schreiben** ist für den Anfang oder eine Testinstallation gedacht. Wer das
Log lesen kann, kommt in jedes Konto.
:::

## SMTP einrichten

1. Wähle **SMTP**.
2. Trag unter **SMTP-URL** die Adresse deines Relays samt Zugangsdaten ein, etwa
   `smtps://benutzer:passwort@relay.example.com:465`.
3. Trag unter **Absenderadresse** die Adresse ein, von der die Mails kommen sollen.
4. Klick auf **Speichern**.

## Microsoft 365 über Graph einrichten

Viele Microsoft-365-Organisationen haben SMTP AUTH abgeschaltet. Dann bleibt der Weg über
Microsoft Graph.

Du brauchst dafür eine App-Registrierung in Entra ID mit der **Anwendungsberechtigung**
`Mail.Send` samt Administratorzustimmung. Aus ihr übernimmst du:

| Feld                             | Woher                                        |
| -------------------------------- | -------------------------------------------- |
| **Verzeichnis- oder Mandant-ID** | die ID deines Entra-Verzeichnisses           |
| **Anwendungs-ID**                | die ID der App-Registrierung                 |
| **Client Secret**                | ein geheimer Schlüssel der App-Registrierung |
| **Absenderpostfach**             | das Postfach, aus dem gesendet wird          |

Wähle **Microsoft Graph**, füll die vier Felder aus und klick auf **Speichern**.

## Geheimnisse bleiben geheim

Das Passwort in der SMTP-URL und das Client Secret werden verschlüsselt gespeichert und nie
wieder angezeigt. Ist eines gespeichert, steht im Feld „gespeichert — leer lassen, um ihn zu
behalten“. Lässt du es leer, bleibt der gespeicherte Wert erhalten.

## Werte aus der Umgebung

Wer GoodWorkshop selbst betreibt, kann den Mailversand auch in der `.env` der Installation
festlegen. Diese Werte haben Vorrang. Die Seite zeigt solche Felder gesperrt und mit dem
Zusatz **aus der Umgebung**; ändern lassen sie sich nur auf dem Server.

| Variable                                                                                | Feld                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                                                     | der Weg: `smtp`, `graph`, `console` oder `none` |
| `SMTP_URL`, `SMTP_FROM`                                                                 | **SMTP-URL**, **Absenderadresse**               |
| `GW_GRAPH_TENANT_ID`, `GW_GRAPH_CLIENT_ID`, `GW_GRAPH_CLIENT_SECRET`, `GW_GRAPH_SENDER` | die vier Graph-Felder                           |

Mehr zu diesen Variablen steht unter [Konfiguration](/de/self-hosting/configuration/).

## Eine Testnachricht schicken

Ob ein Relay funktioniert, zeigt sich erst beim Verschicken. Ohne Test ist der erste Versuch
der Anmeldelink von jemandem – und ein Fehler sieht dann aus wie ein kaputtes Konto.

1. Speichere zuerst deine Einstellungen. Der Test verwendet, was gespeichert ist.
2. Trag unter **Testnachricht schicken** im Feld **An** eine Adresse ein.
3. Klick auf **Schicken**.

Klappt es, steht dort „Verschickt an … Wenn nichts ankommt: Spam-Ordner.“ Scheitert der
Versand, zeigt die Seite die Antwort des Mailservers wörtlich an, etwa
`535 authentication failed`. Genau diese Meldung brauchst du, um den Fehler zu finden.

:::tip
Kommt die Testnachricht an, gehen Anmeldelinks und Einladungen ab jetzt denselben Weg.
:::

## Ohne Mailversand arbeiten

Auch ganz ohne Mailversand kannst du Leute in den Workspace holen: Beim
[Einladen](/de/account/members/) zeigt GoodWorkshop den Anmeldelink dann direkt an, und du
gibst ihn persönlich weiter. Mit einem Passkey kommen alle danach ohne Mail hinein.

## Siehe auch

- [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)
- [Konfiguration](/de/self-hosting/configuration/)
- [Passkeys](/de/account/passkeys/)
- [Mitglieder](/de/account/members/)
