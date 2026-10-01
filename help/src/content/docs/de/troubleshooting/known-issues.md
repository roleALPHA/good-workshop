---
title: Bekannte Probleme
description: Aktuelle Einschränkungen von GoodWorkshop, die in der Dokumentation oder im Code als solche festgehalten sind.
sidebar:
  order: 4
---

Hier steht, was GoodWorkshop derzeit bewusst nicht oder noch nicht kann. Die Liste ist kurz, weil
sie nur aufnimmt, was im Projekt selbst als Einschränkung festgehalten ist. Fehler, die hier nicht
stehen, meldest du über den [Support](/de/troubleshooting/support/).

## Für alle

### Ein OAuth-Zugang lässt sich in GoodWorkshop nicht zurückziehen

Verbindest du Claude, ChatGPT oder einen anderen Client per OAuth, endet der Zugang bisher nur,
wenn du den Connector im Client trennst. Die Freigabeseite erwähnt zwar die Einstellungen unter
**KI-Verbindung**, dort gibt es für OAuth-Zugänge aber noch keinen Knopf. Tokens ziehst du dort
mit **Zurückziehen** zurück. Siehe [KI-Verbindung](/de/troubleshooting/ai-connection/).

### Nach der Anmeldung geht es nicht zur Freigabeseite zurück

Bist du nicht angemeldet, wenn ein Client dich zur Freigabe schickt, meldest du dich an und
landest in der Bibliothek statt auf **Zugriff erlauben?**. Starte das Verbinden im Client dann
noch einmal. Abhilfe: vorher im selben Browser anmelden.

### Formatierte Textfelder lassen sich nicht bearbeiten

Einfache Absätze kannst du in jedem Textfeld bearbeiten. Enthält ein Feld aber Formatierung wie
Listen oder Fettdruck, zeigt der Editor: „Enthält Formatierung. Bearbeiten kommt mit dem
Text-Editor — bis dahin bleibt der Inhalt hier unangetastet.“ Der Inhalt bleibt vollständig
erhalten, statt beim ersten Tippen plattgedrückt zu werden — ist im Editor aber vorerst nur
lesbar.

### Ein gelöschter Name bleibt im Bearbeitungsverlauf

Löschst du einen Namen im Editor, verschwindet er aus der aktuellen Agenda, aber noch nicht aus
dem Verlauf der Live-Bearbeitung. Muss etwas vollständig weg, lösche den Workshop und leere den
[Papierkorb](/de/library/trash/).

## Selbst betrieben

### Passkeys nur mit HTTPS und festem Hostnamen

Ohne HTTPS gibt es außer auf `localhost` keine Passkeys; der Anmeldelink per E-Mail ist dann der
einzige Weg hinein. Wer den Hostnamen ändert, nachdem Passkeys registriert wurden, macht alle
ungültig. Siehe [HTTPS und Reverse Proxy](/de/self-hosting/tls/).

### Kein automatisches Löschen alter Daten

Eine Community-Installation hat keinen Aufbewahrungsjob. Abgelaufene Anmeldelinks, Sitzungen,
Freigabelink-Besuche (jeweils mit IP-Adresse) und das Audit-Protokoll bleiben liegen, bis du sie
löschst. Die Abfragen dafür stehen unter [Datenschutz](/de/self-hosting/data-protection/).

### Automatische Updates überspringen die Migration

Ein Updater wie Watchtower ersetzt nur den App-Container; der Dienst `migrate` läuft dabei nicht.
Ohne `GW_MIGRATE_ON_START=1` und die passende Override-Datei startet die neue App gegen das alte
Schema. Siehe [Aktualisieren und sichern](/de/self-hosting/upgrade/).

### Drosselung gilt pro Prozess

Die Grenzen für Passkey-Abfragen und für `/api/mcp` werden im Speicher gezählt. Laufen mehrere
App-Container nebeneinander, vervielfacht sich die wirksame Grenze mit ihrer Zahl. Die Grenze für
Anmeldelinks pro Empfängeradresse zählt dagegen in der Datenbank und gilt genau.

### Ohne passende Absenderadresse ein gemeinsamer Zähler

Kommt hinter dem Proxy keine Absenderadresse an, fallen alle Anfragen in denselben Zähler — dann
kann `/api/mcp` mit `rate_limited` antworten, obwohl einzelne Personen wenig tun. Prüfe
`X-Forwarded-For` und `GW_TRUSTED_PROXIES`.

### Mail-Zugangsdaten hängen am Anwendungsschlüssel

Eine Sicherung ohne den Anwendungsschlüssel kommt mit leeren Mail-Zugangsdaten zurück. Alles
andere bleibt erhalten; die Zugangsdaten gibst du neu ein. Sichere den Schlüssel mit, siehe
[Aktualisieren und sichern](/de/self-hosting/upgrade/).

## Weiterlesen

- [Übersicht](/de/troubleshooting/overview/)
- [Support](/de/troubleshooting/support/)
- [GitHub-Issues](https://github.com/roleALPHA/good-workshop/issues)
