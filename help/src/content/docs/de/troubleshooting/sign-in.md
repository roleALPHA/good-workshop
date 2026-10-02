---
title: Anmeldung und Anmeldelink
description: Wenn der Anmeldelink nicht ankommt, abgelaufen ist, der Passkey scheitert oder die Einrichtung einer neuen Installation hängt.
sidebar:
  order: 2
---

GoodWorkshop kennt kein Passwort. Du meldest dich entweder **Mit Passkey anmelden** an oder lässt
dir über **Anmeldelink schicken** einen Link per E-Mail senden. Die Meldungen unten stehen genau
so in der App — such nach dem Text, den du siehst.

## „Schau in dein Postfach.“ — aber es kommt nichts

Nach dem Absenden zeigt die Anmeldeseite **immer** „Schau in dein Postfach. Falls es zu dieser
Adresse ein Konto gibt, ist ein Anmeldelink unterwegs.“ Das ist Absicht: Die Seite verrät
niemandem, welche Adressen ein Konto haben. Darum siehst du auch keinen Fehler, wenn etwas nicht
geklappt hat.

Geh der Reihe nach durch:

1. **Spam-Ordner** prüfen.
2. **Die Adresse prüfen.** Ein Link geht nur an eine Adresse, zu der es ein aktives Konto gibt.
   Tippfehler fallen nicht auf, weil die Seite in jedem Fall dasselbe meldet.
3. **Kurz warten.** Pro Adresse gehen in 15 Minuten höchstens fünf Links hinaus. Weitere Anfragen
   werden still verworfen.
4. **Selbst betrieben:** Ist überhaupt ein Mailversand eingerichtet? Siehe unten.

### Selbst betrieben: kein Mailversand

Eine frische Installation verschickt keine Mails, bis jemand den Versand einrichtet. Prüfe als
Admin unter **Mailversand**, ob ein Transport gewählt ist, und nutze dort **Testnachricht
schicken**. Steht `GW_MAIL_TRANSPORT` in der `.env`, gewinnt die `.env`.

Scheitert der Versand, steht das im Log der App als `magic link delivery failed`. Bei Microsoft
Graph deuten `403` oder `invalid_client` auf eine fehlende **Anwendungsberechtigung** `Mail.Send`
mit Administratorzustimmung oder ein abgelaufenes Secret. Mit `GW_MAIL_TRANSPORT=console` steht
der Link in `docker compose logs app`.

Ohne jeden Mailversand kommst du über die Kommandozeile hinein. Der Link gilt 15 Minuten und
einmal:

```bash
docker compose exec app node scripts/cli.mjs login-link --email you@example.com
```

## „Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.“

Ein Anmeldelink gilt einmal und nur kurz — wie lange, steht in der Mail und auf der Anmeldeseite
(normalerweise 15 Minuten). Fordere einen neuen an.

Der Link meldet dich nicht sofort an: Er öffnet die Seite **Anmeldung bestätigen**, und erst der
Knopf **Anmelden** verbraucht ihn. So können Mailfilter wie Microsoft Defender Safe Links, die
jeden Link vorab öffnen, ihn nicht vor dir verbrauchen.

## „Der Link war unvollständig. Fordere einen neuen an.“

Die Adresse ist beim Kopieren abgeschnitten worden, etwa durch einen Zeilenumbruch im Mailprogramm.
Klick den Link direkt in der Mail an oder fordere einen neuen an.

## Die Adresse im Link stimmt nicht (selbst betrieben)

Anmeldelinks werden aus `GW_APP_URL` gebaut. Zeigt der Link auf eine andere Adresse als die, die
du im Browser benutzt, korrigiere `GW_APP_URL` in der `.env` und starte neu, siehe
[Konfiguration](/de/self-hosting/configuration/).

## Passkey

| Meldung                                                                                                         | Ursache und Lösung                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| „Passkeys brauchen HTTPS und sind auf dieser Adresse nicht verfügbar. Der Anmeldelink per E-Mail funktioniert.“ | Die Installation läuft ohne HTTPS. Browser erlauben Passkeys nur über HTTPS oder auf `localhost`. Nimm den Anmeldelink, siehe [HTTPS und Reverse Proxy](/de/self-hosting/tls/).                                                                        |
| „Passkeys brauchen HTTPS. Diese Installation läuft auf …“                                                       | Dieselbe Ursache, beim Anlegen eines Passkeys unter **Sicherheit**.                                                                                                                                                                                    |
| „Der Passkey konnte nicht bestätigt werden.“                                                                    | Der Passkey ist diesem Konto nicht (mehr) bekannt — etwa weil er entfernt wurde —, das Konto ist nicht aktiv, oder der Hostname der Installation hat sich geändert. Melde dich per Anmeldelink an und leg unter **Sicherheit** einen neuen Passkey an. |

Brichst du die Abfrage deines Geräts selbst ab, zeigt die Seite keinen Fehler — versuch es einfach
noch einmal.

:::caution[Selbst betrieben: Hostname geändert?]
Passkeys hängen am Hostnamen (`GW_RP_ID`). Nach einem Wechsel des Hostnamens sind **alle**
registrierten Passkeys ungültig. Alle müssen sich einmal per Anmeldelink anmelden und neue
Passkeys anlegen.
:::

## „Bitte melde dich an.“

Deine Sitzung ist abgelaufen. Eine Sitzung endet, wenn sie eine Weile nicht benutzt wurde
(selbst betrieben: `GW_SESSION_IDLE_DAYS`, Standard 14 Tage), und spätestens nach einer festen
Höchstdauer. Melde dich neu an.

## Einladung zu einem Workshop

| Meldung                                                                              | Bedeutung                                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| „Das passt nicht zusammen. Prüfe die Adresse, an die die Einladung geschickt wurde.“ | Die eingegebene Adresse ist nicht die eingeladene.                                                                   |
| „Diese Einladung gilt nicht mehr“                                                    | Der Link wurde zurückgezogen, ist abgelaufen oder existiert nicht. Wer dich eingeladen hat, kann eine neue schicken. |
| „Zu viele Versuche. Warte eine Minute und versuche es dann noch einmal.“             | Zu viele Eingaben in kurzer Zeit.                                                                                    |

## Neue Installation einrichten (selbst betrieben)

| Problem                                                   | Lösung                                                                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kein Einrichtungsschlüssel im Log                         | Der Schlüssel steht im Log von `app`, nicht von `migrate`. Steht er dort nicht, starte `app` neu: `docker compose restart app`, danach `docker compose logs app`. |
| „Der Einrichtungsschlüssel stimmt nicht.“                 | Der Schlüssel ändert sich bei jedem Neustart. Nimm den **neuesten** aus dem Log.                                                                                  |
| „Zu viele Versuche. Bitte versuch es später noch einmal.“ | Eine Minute warten.                                                                                                                                               |
| `/setup` leitet auf die Anmeldung um                      | Es gibt schon eine Administratorin. Wurde `GW_BOOTSTRAP_ADMIN_EMAIL` gesetzt, steht der einmalige Link in `docker compose logs migrate`.                          |
| Angemeldet, aber kein Admin                               | `docker compose exec app node scripts/cli.mjs admin promote --email you@example.com`                                                                              |

Ausführlich steht das in der README unter
[Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).

## Weiterlesen

- [Passkeys](/de/account/passkeys/)
- [Mailversand](/de/account/mail/)
- [Support](/de/troubleshooting/support/) — wenn du in der Cloud gar nicht hineinkommst
