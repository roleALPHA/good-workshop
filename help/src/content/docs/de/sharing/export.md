---
title: Als Markdown exportieren
description: Einen Tag oder den ganzen Workshop als Markdown-Datei herunterladen – zum Einfügen in Wiki, Notizen, E-Mail oder zum Weitergeben.
sidebar:
  order: 4
---

Jede Agenda lässt sich jederzeit als Markdown-Datei herunterladen. Markdown ist reiner Text mit ein paar Zeichen für Überschriften und Tabellen. Du kannst ihn in ein Wiki, ein Notizwerkzeug, ein Ticket oder eine E-Mail einfügen, und eine Tabelle daraus bleibt dabei eine Tabelle.

## Exportieren in drei Schritten

1. Öffne einen Tag des Workshops.
2. Lege oben rechts mit den beiden Häkchen fest, was mitkommt:
   - **Ganzer Workshop** – alle Tage in einer Datei statt nur des geöffneten.
   - **Mit Moderationsnotizen** – deine Notizen zu den Blöcken.
3. Klicke auf **Markdown**. Dein Browser lädt eine `.md`-Datei herunter, benannt nach dem Workshop.

Beide Häkchen gelten auch für [Drucken](/de/sharing/print/) – sie beantworten dieselbe Frage: Für wen ist diese Kopie?

:::caution[Notizen sind standardmäßig draußen]
Felder, die ein Bausteintyp als privat kennzeichnet – heute die Moderationsnotizen –, sind nur mit **Mit Moderationsnotizen** in der Datei. Das Häkchen ist bei jedem Öffnen aus. Gib eine Datei mit Notizen nicht an Teilnehmende weiter.
:::

## Was in der Datei steht

**Am Anfang ein Kopfbereich** mit Angaben für Werkzeuge, die Markdown-Metadaten lesen: Titel, Datum (bei mehreren Tagen eine Liste der Daten) und Gesamtdauer. Beim ganzen Workshop kommen der Ordnerpfad, die [Schlagwörter](/de/library/tags/) und die Zahl der Tage dazu.

**Dann der Titel** des Workshops als Überschrift. Beim ganzen Workshop folgt jeder Tag unter einer eigenen Überschrift: seinem Namen, sonst seinem Datum, sonst „Tag 1“, „Tag 2“ …

**Pro Tag eine Zusammenfassung**: Name, Datum, Beginn und Ende sowie die Aufteilung, zum Beispiel „5h 30m Inhalt, 1h 15m Pausen“.

**Darunter der Ablauf als Tabelle** mit den Spalten Zeit, Dauer, Block und Info:

| Spalte | Inhalt                                                                                   |
| ------ | ---------------------------------------------------------------------------------------- |
| Zeit   | Startzeit; 🔒 bei [fester Startzeit](/de/agenda/timing/)                                 |
| Dauer  | Dauer des Blocks oder Abschnitts                                                         |
| Block  | Titel; [Abschnitte](/de/agenda/clusters-and-breakouts/) fett, eingerückte Einträge mit ↳ |
| Info   | Verantwortlich, Bausteintyp, gegebenenfalls „⚠ Überschneidung“                           |

Bei einem Breakout steht in der Info-Spalte die Zahl der Stränge mit dem Hinweis „parallel“, bei jedem Strang „Strang 1 von 3“. So ist klar, warum dieselbe Uhrzeit mehrfach vorkommt.

**Zum Schluss ein Abschnitt „Details“** mit der Beschreibung und den weiteren Feldern jedes Blocks – Material, Sozialform und was der Bausteintyp sonst mitbringt –, jeweils mit ihrer Beschriftung aus der App.

Ganz unten steht eine Zeile mit dem Hinweis auf GoodWorkshop.

:::note[Was nicht exportiert wird]
Blöcke auf dem [Parkplatz](/de/agenda/parking/) stehen nicht im Zeitplan und deshalb auch nicht in der Datei.
:::

## Ein Tag oder der ganze Workshop

| Auswahl                  | Ergebnis                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ohne **Ganzer Workshop** | Eine Datei mit dem geöffneten Tag.                                                                                                                                                      |
| mit **Ganzer Workshop**  | Eine Datei mit allen Tagen in ihrer Reihenfolge – kein Archiv mit Einzeldateien. Ein Workshop ohne Tage ergibt eine Datei mit Titel und dem Satz „Dieser Workshop hat noch keinen Tag.“ |

## Sprache der Datei

Die Datei ist in der Sprache geschrieben, die du in deinem [Profil](/de/account/profile-and-language/) eingestellt hast: Spaltennamen, Bausteintypen und Feldbeschriftungen. Deine eigenen Texte – Titel, Beschreibungen – bleiben, wie du sie geschrieben hast.

:::tip[Für eine andere Sprache exportieren]
Brauchst du die Agenda für Teilnehmende in einer anderen Sprache, hänge an die Adresse des Downloads `?locale=en` an (oder `fr`, `es`, `de`); steht dort schon ein `?`, dann `&locale=en`. Dein Profil musst du dafür nicht umstellen.
:::

## Wer exportieren darf

Exportieren kann jedes Mitglied, das den Workshop sehen darf – mit **Lesen**, **Bearbeiten** oder als Eigentümer:in. Gäste über einen [Freigabelink](/de/sharing/share-links/) können nicht exportieren.

Der Export funktioniert auch, wenn dein Arbeitsbereich schreibgeschützt oder wegen einer offenen Zahlung gesperrt ist. Deine Inhalte kommen immer heraus.

:::tip[Export über den KI-Assistenten]
Ein [verbundener KI-Assistent](/de/ai/introduction/) holt denselben Text mit dem Werkzeug `export_workshop` – praktisch, wenn er den Workshop zusammenfassen, übersetzen oder in eine E-Mail gießen soll. Siehe [Beispiele](/de/ai/examples/).
:::

## Siehe auch

- [Drucken](/de/sharing/print/) – derselbe Ablauf auf Papier oder als PDF
- [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/)
- [Verantwortliche](/de/agenda/responsible/)
- [Werkzeug-Referenz](/de/ai/tools/)
