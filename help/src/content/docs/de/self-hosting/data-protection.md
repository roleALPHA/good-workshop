---
title: Datenschutz
description: Was eine selbst betriebene GoodWorkshop-Installation speichert, wohin Daten gehen und was du als Verantwortlicher selbst regeln musst.
sidebar:
  order: 5
---

:::caution[Keine Rechtsberatung]
Diese Seite beschreibt sachlich, was GoodWorkshop speichert und wohin es Daten schickt. Sie ist
eine Zusammenfassung von
[docs/data-protection.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/data-protection.md);
dort stehen alle Tabellen, Abfragen und Begründungen.
:::

## Wer verantwortlich ist

Wer GoodWorkshop selbst installiert, ist **Verantwortlicher** für alle Daten darin. roleALPHA
veröffentlicht nur die Software und erhält aus einer Installation nichts: keine Telemetrie, kein
„nach Hause telefonieren“, keine Lizenzprüfung. Im Image ist `NEXT_TELEMETRY_DISABLED=1` gesetzt,
damit auch Next.js nichts sendet.

In der [GoodWorkshop Cloud](/de/cloud/overview/) ist das anders: Dort betreiben wir die
Installation, mit einem Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.

## Was wo gespeichert wird

Alles liegt in einer einzigen Postgres-Datenbank. Personenbezogenes wird in keinen zweiten
Speicher geschrieben.

| Was                           | Personenbezogene Daten                                   | Woher                                |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Konten und Mitgliedschaften   | E-Mail, Sprache, Vor- und Nachname, Rolle, Status        | Registrierung oder Einladung         |
| Passkeys                      | öffentlicher Schlüssel, Name, Zähler                     | wer einen Passkey anlegt             |
| Anmeldelinks und Einladungen  | E-Mail, **anfragende IP**, Zweck, Ablauf                 | jeder Anmeldelink, jede Einladung    |
| Sitzungen                     | **IP, User-Agent**, Hash des Sitzungsgeheimnisses        | jede Anmeldung                       |
| Freigabelink-Besuche          | **IP, User-Agent**                                       | jeder Besuch über einen Freigabelink |
| Audit-Protokoll               | wer was an welchem Objekt geändert hat                   | Änderungen über Web und MCP          |
| Workshops, Abschnitte, Blöcke | was Moderierende eintippen: Namen, Notizen über Personen | die Moderierenden                    |
| Live-Bearbeitung              | derselbe Inhalt noch einmal, als CRDT-Updates            | der Live-Editor                      |
| Tokens                        | Hashes von Tokens, an ein Mitglied gebunden              | Tokens, die das Mitglied anlegt      |

Zwei Dinge solltest du für dein Verarbeitungsverzeichnis wissen:

- **IP-Adressen liegen an drei Stellen** (Anmeldelinks, Sitzungen, Freigabelink-Besuche), und
  keine davon läuft von selbst ab.
- **Das eigentliche Risiko ist der Agenda-Inhalt**, nicht die Kontodaten. Agenden enthalten oft
  Namen von Teilnehmenden, Moderationsnotizen Beobachtungen über Personen — als freier Text, und
  zusätzlich im Verlauf der Live-Bearbeitung.

Die Trennung zwischen Workspaces erzwingt die Datenbank selbst über Row-Level-Security.

## Wohin Daten die Installation verlassen

Es gibt genau vier Wege, drei davon sind aus, bis du sie einschaltest:

1. **Mail.** Anmeldelinks und Einladungen gehen über dein SMTP-Relay oder Microsoft Graph.
   Adresse und Workshop-Titel verlassen den Server. Mit `console` wird nichts verschickt — dann
   steht ein gültiger Anmeldelink im Log.
2. **KI-Assistenten (MCP).** Mitglieder können einen Assistenten mit ihren Workshops verbinden.
   Dessen Anbieter erhält Workshop-Inhalte. Private Felder wie Moderationsnotizen sind nicht
   dabei. Trotzdem gehört der KI-Anbieter dann in deine Verarbeitungskette.
3. **Freigabelinks.** Wer den Link hat, sieht die Agenda. Besucher werden nicht identifiziert,
   IP und User-Agent werden aber gespeichert.
4. **Let's Encrypt**, wenn du den mitgelieferten Caddy nutzt: Dein Hostname erscheint in
   öffentlichen Certificate-Transparency-Logs.

Sonst geht nichts ins Netz: keine fremden Schriften, kein CDN, keine Analyse, kein
Fehlerdienst.

## Was du selbst löschen musst

:::danger[Kein automatisches Aufräumen]
Eine Community-Installation hat keinen Aufbewahrungsjob. Abgelaufene Zeilen gelten beim Lesen
als ungültig, werden aber nie gelöscht. Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO) ist
deine Pflicht als Verantwortlicher.
:::

Ein geplanter Job genügt. Passe die Fristen an die Aufbewahrungsdauer an, die du festgelegt und
aufgeschrieben hast:

```sql
-- Login links and invitations: useless once expired.
DELETE FROM email_token   WHERE expires_at < now() - interval '30 days';

-- Sessions that can no longer be used.
DELETE FROM auth_session  WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';
DELETE FROM share_session WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';

-- The audit trail. Keep it as long as you can justify needing it, not longer.
DELETE FROM audit_event   WHERE created_at < now() - interval '1 year';
```

Führe diese Anweisungen mit der Owner-Rolle aus, nicht als `gw_app` — Row-Level-Security
beschränkt `gw_app` auf einen Workspace.

## Auskunft und Löschung

- **Selbst löschen:** Jede Person löscht ihr Konto unter **Profil & Einstellungen** → **Konto
  löschen**. Der letzte aktive Admin kann das nicht.
- **Durch einen Admin:** unter **Verwaltung** → **Mitglieder**. Der Dialog fragt, wer Workshops
  und Ordner übernimmt. Mit der letzten Mitgliedschaft verschwindet auch das Konto samt
  Sitzungen, Anmeldelinks und Passkeys.

Was dabei **nicht** erfasst wird und du von Hand prüfen musst: Namen im Agenda-Text und in
Moderationsnotizen, dieselben Namen im Verlauf der Live-Bearbeitung und Zitate im
Audit-Protokoll. Auch die Namen im Feld **Verantwortlich** bleiben an den Blöcken stehen, damit die
Agenda lesbar bleibt. Muss eine Löschung vollständig sein, lösche den betroffenen Workshop:
erst in den Papierkorb, dann den Papierkorb leeren. Das nimmt auch den Bearbeitungsverlauf mit.

## Was du als Betreiber selbst regelst

- Aufbewahrungsfristen festlegen, dokumentieren und die Löschungen oben einplanen
- ein Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)
- Auftragsverarbeitungsverträge mit Mailrelay, Hoster und — wenn MCP genutzt wird — dem
  KI-Anbieter
- eine Datenschutzerklärung für Personen, deren Namen in Agenden landen
- Sicherungen: Löschungen erreichen bereits gezogene Backups nicht, siehe
  [Aktualisieren und sichern](/de/self-hosting/upgrade/)
- Verschlüsselung der Festplatte: HTTPS übernimmt Caddy, Verschlüsselung im Ruhezustand nicht

## Weiterlesen

- [Mitglieder](/de/account/members/)
- [Papierkorb](/de/library/trash/)
- [Mit dem KI-Assistenten planen](/de/ai/introduction/)
- [Freigabelinks](/de/sharing/share-links/)
