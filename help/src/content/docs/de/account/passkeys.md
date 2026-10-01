---
title: Passkeys
description: Mit Fingerabdruck, Gesicht oder Sicherheitsschlüssel anmelden statt mit einem Link per E-Mail.
sidebar:
  order: 2
---

GoodWorkshop hat kein Passwort. Du meldest dich entweder über einen **Anmeldelink per E-Mail**
an oder mit einem **Passkey**. Ein Passkey ist ein Schlüssel, der auf deinem Gerät liegt und
den du mit Fingerabdruck, Gesicht, Geräte-PIN oder einem Sicherheitsschlüssel freigibst. Der
Schlüssel selbst verlässt dein Gerät nie.

Der Vorteil: Du musst nicht auf eine Mail warten. Gerade auf dem Handy im Workshopraum ist
das oft der schnellere Weg hinein.

## Einen Passkey anlegen

1. Öffne oben rechts das Kontomenü und wähle **Sicherheit**.
2. Gib unter **Name (optional)** einen Namen ein, an dem du das Gerät später erkennst, etwa
   „MacBook“, „iPhone“ oder „YubiKey“. Lässt du das Feld leer, vergibt GoodWorkshop einen.
3. Klick auf **Passkey anlegen**. Der Knopf zeigt jetzt **Warte auf das Gerät …**
4. Bestätige im Dialog deines Browsers oder Betriebssystems, zum Beispiel mit dem
   Fingerabdruck.

Danach lädt die Seite neu, und der Passkey steht in der Liste.

:::tip
Leg einen Passkey auf jedem Gerät an, mit dem du regelmäßig arbeitest – oder nutze einen, der
sich über dein Konto bei Apple, Google oder einem Passwortmanager synchronisiert.
:::

## Die Liste lesen

Jeder Passkey steht mit seinem Namen in der Liste, dazu:

| Angabe                    | Bedeutung                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| **synchronisiert**        | Der Passkey wird über deine Geräte hinweg synchronisiert, etwa über einen Passwortmanager. |
| **zuletzt** und ein Datum | Wann du dich zuletzt damit angemeldet hast.                                                |
| **noch nicht benutzt**    | Du hast ihn angelegt, aber noch nie zum Anmelden verwendet.                                |

Hast du noch keinen Passkey, steht dort: „Noch kein Passkey. Bis dahin führt jede Anmeldung
über einen Link per E-Mail.“

## Mit einem Passkey anmelden

Klick auf der Anmeldeseite auf **Mit Passkey anmelden** und bestätige auf deinem Gerät. Eine
E-Mail-Adresse musst du dafür nicht eintippen.

Der Anmeldelink per E-Mail funktioniert weiterhin, auch wenn du Passkeys hast. Er ist dein
Weg hinein, wenn du an einem fremden Gerät sitzt.

## Einen Passkey entfernen

Klick in der Zeile des Passkeys auf **Entfernen**. Er verschwindet sofort, ohne Rückfrage.
Entferne einen Passkey zum Beispiel, wenn du ein Gerät verkaufst oder verloren hast.

## Wenn sich kein Passkey anlegen lässt

Browser erlauben Passkeys nur über HTTPS (oder auf `localhost`). Läuft eine Installation über
eine einfache `http://`-Adresse, zeigt die Seite einen Hinweis, und **Passkey anlegen** ist
gesperrt. Der Anmeldelink per E-Mail bleibt dann der Weg hinein.

:::note
Das betrifft nur selbst betriebene Installationen. Wie du HTTPS einrichtest, steht unter
[HTTPS und Reverse Proxy](/de/self-hosting/tls/).
:::

Weitere Meldungen und was sie heißen:

- **Der Passkey konnte nicht bestätigt werden.** Das Gerät hat geantwortet, aber der Server
  konnte die Antwort nicht prüfen. Versuch es noch einmal.
- **Dieser Passkey ist unbekannt.** Beim Anmelden wurde ein Passkey verwendet, den
  GoodWorkshop nicht kennt – etwa weil er entfernt wurde. Melde dich per Anmeldelink an und
  leg einen neuen an.

Brichst du den Dialog des Geräts selbst ab, passiert einfach nichts – das ist keine
Fehlermeldung wert.

:::tip[Für Admins selbst betriebener Installationen]
Ohne eingerichteten [Mailversand](/de/account/mail/) kommt nur hinein, wer schon einen
Passkey hat. Ein Passkey für dich selbst ist deshalb eine gute Rückversicherung.
:::

## Siehe auch

- [Profil und Sprache](/de/account/profile-and-language/)
- [Anmeldung und Anmeldelink](/de/troubleshooting/sign-in/)
- [Mailversand](/de/account/mail/)
