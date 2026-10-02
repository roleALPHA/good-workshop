---
title: Preise und Abrechnung
description: Die zwei Abrechnungsmodelle der Cloud, Zahlungsmethode, Planwechsel, Kündigung und was die Zustände eines Workspaces bedeuten.
sidebar:
  order: 3
---

:::note
Diese Seite gilt nur für die GoodWorkshop Cloud. Die Abrechnung sehen nur Admins.
:::

Alles rund ums Geld steht auf einer Seite: Öffne oben rechts das Kontomenü und wähle unter
**Verwaltung** den Eintrag **Abrechnung**.

## Zwei Abrechnungsmodelle

Pro Workspace gilt ein Modell. Du wählst es bei der Registrierung und kannst es jeden Monat
wechseln.

| Modell           | Abgerechnet wird                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **Pro Nutzer**   | jedes aktive Mitglied pro Monat, tagesgenau anteilig                                           |
| **Pro Workshop** | jeder neu angelegte Workshop, einmal, im Monat seiner Anlage – bei beliebig vielen Mitgliedern |

Die aktuellen Beträge stehen auf der [Preisseite](https://goodworkshop.org/de/preise) und unter
**Abrechnungsmodell** in der Auswahl. Alle Preise sind netto zuzüglich Umsatzsteuer:

- Unternehmen in Österreich zahlen 20 % USt.
- Unternehmen in anderen EU-Ländern mit gültiger UID-Nummer zahlen netto (Reverse Charge).
- Unternehmen außerhalb der EU zahlen keine österreichische USt.

### Wer im Modell „Pro Nutzer“ zählt

Gezählt wird jedes Mitglied für jeden Tag, an dem es **Aktiv** war. Eingeladene, die sich noch
nie angemeldet haben, abgeschaltete Mitglieder und Gäste ohne Konto zählen nicht. Unter
**Dieser Monat bisher** siehst du den Stand, etwa „3,5 Nutzer-Monate“, und den Nettobetrag
bis heute.

Tage der Testphase und Workshops, die in der Testphase angelegt wurden, werden nicht
berechnet.

## Das Modell wechseln

1. Wähle unter **Abrechnungsmodell** das andere Modell.
2. Klick auf **Übernehmen**.

Ein Wechsel gilt ab dem nächsten Monatsersten. Bis dahin steht dort „Ab dem nächsten
Monat: …“; der laufende Monat läuft noch nach dem bisherigen Modell.

## Die Zahlungsmethode

Bezahlt wird per Karte, eingezogen vom Zahlungsdienstleister. Die Kartendaten gibst du auf
dessen Seite ein; GoodWorkshop sieht und speichert sie nie.

1. Klick unter **Zahlungsmethode** auf **Zahlungsmethode hinterlegen** (oder später
   **Zahlungsmethode ändern**).
2. Gib auf der Seite des Zahlungsdienstleisters deine Karte ein.
3. Du kommst zurück zur Abrechnung. Dort steht „Eine Zahlungsmethode ist hinterlegt.“

Direkt darunter löst du einen [Gutschein](/de/cloud/vouchers/) ein.

## Die Rechnungsdaten

Unter **Rechnungsdaten** stehen **Firmenname**, Adresse, **UID-Nummer** und die
**Rechnungs-E-Mail**, an die Rechnungen und Hinweise zur Zahlung gehen. Änderungen sicherst du
mit **Speichern**; eine UID-Nummer prüft GoodWorkshop im EU-Register VIES.

Abgerechnet wird monatlich im Nachhinein, eingezogen frühestens zwei Tage nach der Rechnung.
Mehr dazu unter [Rechnungen](/de/cloud/invoices/).

## Die Zustände eines Workspaces

Unter **Abrechnung** steht der Status; unter der Kopfzeile sehen alle einen Hinweis dazu.

| Status                 | Hinweis unter der Kopfzeile                     | Was es heißt                                                                                                                  | Wie es weitergeht                                                                                                             |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Testphase bis …**    | „Testphase: noch … Tage.“                       | Alles geht, kostenlos.                                                                                                        | Am Ende mit Zahlungsmethode **Aktiv**, ohne **Schreibgeschützt**.                                                             |
| **Aktiv**              | keiner                                          | Alles geht.                                                                                                                   | –                                                                                                                             |
| **Schreibgeschützt**   | „Lesen und Exportieren geht, Ändern nicht.“     | Die Testphase ist ohne Zahlungsmethode abgelaufen, oder eine Rechnung ließ sich auch nach den Wiederholungen nicht einziehen. | Nach der Testphase: Zahlungsmethode hinterlegen. Bei offener Rechnung: Zahlung klären, du bekommst eine Erinnerung mit Frist. |
| gesperrt               | „… wegen einer offenen Zahlung gesperrt.“       | Nach der Zahlungserinnerung kam binnen 14 Tagen keine Zahlung. Exportieren geht weiterhin.                                    | Sobald die Zahlung eingeht, geht es von selbst weiter.                                                                        |
| **Pausiert**           | „Inhalte lassen sich lesen, aber nicht ändern.“ | Wir haben den Workspace angehalten.                                                                                           | Schreib dem [Support](/de/troubleshooting/support/).                                                                          |
| **Wird am … gelöscht** | „… wird am … gelöscht.“                         | Löschung beantragt oder Vertrag beendet. Lesen und Exportieren geht bis zum Datum.                                            | Bis dahin lässt sich das mit **Löschung zurücknehmen** abbrechen, auch nach einer Kündigung.                                  |

:::tip
Auch schreibgeschützt, gesperrt oder vor der Löschung kannst du deine Workshops
[als Markdown exportieren](/de/sharing/export/).
:::

## Kündigen

Der Vertrag lässt sich zum Ende jedes Kalendermonats kündigen.

1. Klick unter **Vertrag kündigen** auf **Vertrag kündigen**.
2. Lies den Hinweis und klick auf **Zum Monatsende kündigen**.

Bis zum Monatsende arbeitet ihr normal weiter, der letzte Monat wird regulär abgerechnet.
Danach wird der Workspace schreibgeschützt (Status **Wird am … gelöscht**); 30 Tage lang lassen
sich alle Workshops noch exportieren, dann werden die Inhalte gelöscht. Bis zum Monatsende
nimmst du die Kündigung mit **Kündigung zurücknehmen** zurück, danach mit **Löschung zurücknehmen** –
der Workspace läuft dann weiter, als hättest du nicht gekündigt. Ein [Gutschein](/de/cloud/vouchers/)
ändert daran nichts: Er bestimmt, was berechnet wird, nicht ob der Vertrag läuft.

## Den Workspace sofort löschen

**Workspace löschen** wartet nicht auf das Monatsende. Tipp zur Bestätigung den Namen des
Workspaces ein und klick auf **Löschung beantragen**. Der Workspace wird sofort
schreibgeschützt und nach 30 Tagen endgültig gelöscht, mit allen Workshops, Mitgliedern und
Freigaben. Der laufende Monat wird anteilig abgerechnet. Bis dahin kannst du mit
**Löschung zurücknehmen** abbrechen.

:::danger
Nach Ablauf der 30 Tage sind die Inhalte weg. Exportiere vorher, was du behalten willst.
:::

## Preisänderungen

Neue Preise erfährst du mindestens sechs Wochen vorher, per Mail und unter der Kopfzeile („Ab
dem … gelten neue Preise.“). Sie gelten ab einem Monatsersten; bei einer Erhöhung kannst du bis
dahin kündigen.

## Siehe auch

- [Rechnungen](/de/cloud/invoices/)
- [Gutscheine](/de/cloud/vouchers/)
- [Mitglieder](/de/account/members/)
- [Preise](https://goodworkshop.org/de/preise) und [AGB](https://goodworkshop.org/de/agb)
