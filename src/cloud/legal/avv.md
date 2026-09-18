<!-- Vor Veröffentlichung rechtlich prüfen lassen. Platzhalter in [eckigen Klammern] ausfüllen. -->

# Auftragsverarbeitungsvereinbarung

nach Art. 28 DSGVO zwischen dem Kunden (Verantwortlicher) und roleALPHA GmbH, Aschergasse 34, 1130 Wien (Auftragsverarbeiter). Sie ist Bestandteil des Vertrags über GoodWorkshop Cloud und gilt mit dessen Abschluss.

## 1. Gegenstand und Dauer

Der Auftragsverarbeiter betreibt GoodWorkshop Cloud für den Verantwortlichen. Die Vereinbarung gilt für die Dauer des Hauptvertrags.

## 2. Art und Zweck der Verarbeitung

Speichern, Anzeigen, gemeinsames Bearbeiten, Freigeben und Exportieren von Workshop-Planungen sowie der Versand von Anmelde- und Einladungs-E-Mails.

## 3. Arten von Daten und betroffene Personen

- Daten: Namen und E-Mail-Adressen, Rollen und Zugriffsrechte, Inhalte der Workshop-Planungen, technische Nutzungsdaten (z. B. Anmeldezeitpunkte)
- Betroffene: Mitglieder des Kunden, von ihm eingeladene Gäste, in Workshop-Planungen genannte Personen

## 4. Pflichten des Auftragsverarbeiters

1. Er verarbeitet die Daten nur auf dokumentierte Weisung des Verantwortlichen; der Hauptvertrag und die Einstellungen im Dienst gelten als Weisung.
2. Er verpflichtet alle Personen, die Zugang zu den Daten haben, zur Vertraulichkeit.
3. Er trifft die technischen und organisatorischen Maßnahmen nach Anlage 1.
4. Er unterstützt den Verantwortlichen bei Anfragen betroffener Personen, bei der Meldung von Datenschutzverletzungen und bei Datenschutz-Folgenabschätzungen.
5. Er meldet dem Verantwortlichen eine Verletzung des Schutzes personenbezogener Daten unverzüglich, spätestens binnen 48 Stunden nach Kenntnis.
6. Er stellt dem Verantwortlichen die Informationen zur Verfügung, die zum Nachweis dieser Pflichten erforderlich sind, und ermöglicht Überprüfungen nach vorheriger Ankündigung.

## 5. Unterauftragsverarbeiter

Der Verantwortliche stimmt dem Einsatz der folgenden Unterauftragsverarbeiter zu:

- netcup GmbH, Deutschland – Hosting in Rechenzentren in der EU
- Microsoft Ireland Operations Ltd., Irland – E-Mail-Versand
- Odoo S.A., Belgien – Buchhaltung und Rechnungsstellung
- Stripe Payments Europe Ltd., Irland – Zahlungsabwicklung

An Odoo und Stripe gehen ausschließlich die Daten, die eine Rechnung und deren Einzug erfordern: Firma, Rechnungsanschrift, UID-Nummer, Rechnungs-E-Mail und die abgerechneten Mengen. Workshop-Inhalte und die Namen der Mitglieder des Verantwortlichen erhalten sie nicht.

Über beabsichtigte Änderungen informiert der Auftragsverarbeiter mindestens 30 Tage vorher; der Verantwortliche kann aus wichtigem Grund widersprechen.

## 6. Ende der Verarbeitung

Nach Vertragsende kann der Verantwortliche seine Daten exportieren. Der Auftragsverarbeiter löscht sie spätestens 30 Tage nach Vertragsende, soweit keine gesetzliche Aufbewahrungspflicht besteht.

## Anlage 1: Technische und organisatorische Maßnahmen

- **Verschlüsselung:** Übertragung ausschließlich über TLS; Zugangsdaten zu Mailservern verschlüsselt gespeichert
- **Mandantentrennung:** Trennung der Kunden in der Datenbank durch erzwungene Row-Level-Security
- **Zugriffskontrolle:** Anmeldung ohne Passwort über Passkeys oder einmalige E-Mail-Links; Rollen und Rechte je Workshop und Ordner; getrennte Datenbankrollen mit minimalen Rechten
- **Betrieb:** Rechenzentren in der EU; signierte und auf Schwachstellen geprüfte Software-Images; regelmäßige Sicherheitsupdates
- **Verfügbarkeit:** tägliche Datensicherung mit Wiederherstellungstests
- **Nachvollziehbarkeit:** Protokollierung sicherheitsrelevanter Ereignisse
