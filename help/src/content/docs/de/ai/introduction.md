---
title: Mit dem KI-Assistenten planen
description: Was MCP ist, was ein verbundener KI-Assistent wie Claude oder ChatGPT in GoodWorkshop tun kann – und was er bewusst nicht kann.
sidebar:
  order: 1
---

GoodWorkshop hat einen eingebauten **MCP-Server**. Damit kannst du einen KI-Assistenten wie Claude, ChatGPT oder Gemini mit deinen Workshops verbinden und ihn bitten, eine Agenda zu entwerfen, umzubauen oder zusammenzufassen. Was er schreibt, landet direkt in deiner Bibliothek – kein Kopieren, kein Abtippen.

## Was ist MCP?

MCP (Model Context Protocol) ist ein offener Standard, über den KI-Assistenten mit anderen Programmen arbeiten. Ein Programm bietet dem Assistenten **Werkzeuge** an – bei GoodWorkshop zum Beispiel „Workshop anlegen“, „Tag lesen“ oder „ganze Agenda schreiben“. Der Assistent entscheidet anhand deiner Bitte, welche Werkzeuge er aufruft.

Du verbindest den Assistenten einmal mit der Adresse deiner Installation, zum Beispiel `https://goodworkshop.org/api/mcp` in der GoodWorkshop Cloud. Wie das geht, steht unter [Einen Assistenten verbinden](/de/ai/connect/).

## Was der Assistent kann

Ein verbundener Assistent kann, was du in der Bibliothek und im Tageseditor auch kannst:

| Bereich            | Beispiele                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Bibliothek         | Ordner anlegen, Workshops anlegen, umbenennen, in Ordner legen, Schlagwörter setzen        |
| Papierkorb         | Workshops in den Papierkorb legen, wiederherstellen, endgültig löschen                     |
| Tage               | Tage anlegen, umsortieren, löschen; Name, Datum, Beginn und Notiz ändern                   |
| Agenda             | einen ganzen Tag in einem Zug schreiben, mit Abschnitten und Breakouts                     |
| Blöcke             | einzelne oder viele Blöcke ändern, verschieben, parken, löschen; Verantwortliche eintragen |
| Lesen              | einen Tag mit allen Zeiten lesen, den ganzen Workshop als Markdown holen                   |
| Methoden entdecken | in der Methodensammlung suchen und Einträge übernehmen (nur Cloud)                         |

Die vollständige Liste mit allen Parametern steht in der [Werkzeug-Referenz](/de/ai/tools/), Anregungen für Bitten unter [Beispiele](/de/ai/examples/).

Ein paar Dinge macht der Assistent so wie GoodWorkshop selbst:

- **Startzeiten rechnet GoodWorkshop aus** dem Beginn des Tags und den Dauern. Der Assistent setzt sie nicht, er kann einen Block aber auf eine feste Uhrzeit legen – siehe [Dauer und Startzeiten](/de/agenda/timing/).
- **Ganze Agenden schreibt er in einem Aufruf.** Das ist alles oder nichts: Passt ein Block nicht, wird gar nichts geschrieben, und der Assistent erfährt, was zu korrigieren ist.
- **Er schreibt live mit.** Hast du den Tag gerade offen, siehst du seine Änderungen sofort, und er erscheint beim [gemeinsamen Bearbeiten](/de/agenda/live-editing/) als **KI-Assistent**. Damit er nichts überschreibt, was du gerade geändert hast, kann er bei jeder Änderung die Version mitschicken, die er zuletzt gelesen hat. Hat sich der Workshop inzwischen geändert, lehnt GoodWorkshop die Änderung ab, und der Assistent muss neu lesen.

## Was der Assistent nicht kann

:::caution[Bewusst ausgeschlossen]
Über MCP gibt es **keine** Werkzeuge für:

- **Mitglieder** – niemanden einladen, entfernen oder zum Admin machen,
- **Freigaben** – keinen Workshop und keinen Ordner [mit Personen teilen](/de/sharing/share-with-people/),
- **Freigabelinks** – keine [Gäste einladen](/de/sharing/share-links/) oder Links entziehen,
- **Tokens** – keine Zugangsschlüssel anlegen oder zurückziehen.

Zugang zu deinen Daten an andere zu vergeben ist ein Schritt, den du selbst in der App gehst – kein Modell soll das in deinem Namen tun können.
:::

Außerdem gilt:

- **Der Assistent handelt als du.** Er kann nie mehr, als du selbst darfst. Einen Workshop, den du nur lesen darfst, kann er nicht ändern; Ordner verschieben oder löschen kann er nur, wenn du Admin des Arbeitsbereichs bist. Er sieht auch nur die Workshops, die du in deiner Bibliothek siehst.
- **Was er darf, legst du beim Verbinden fest** – über die Bereiche, die du erlaubst (etwa nur lesen oder auch schreiben). Siehe [Einen Assistenten verbinden](/de/ai/connect/).
- **Bausteintypen ändert er nicht.** Er liest sie, um zu wissen, welche Felder ein Block hat.
- **Die Mitgliederliste sieht er nicht.** Verantwortliche nennt er mit vollem Namen; passt ein Name zu niemandem im Arbeitsbereich, wird die Person als extern eingetragen – siehe [Verantwortliche](/de/agenda/responsible/).

:::note[Endgültiges Löschen]
Endgültig löschen kann der Assistent nur einen Workshop, der schon im [Papierkorb](/de/library/trash/) liegt, und er ist angewiesen, das nur auf deine ausdrückliche Bitte zu tun. Formuliere entsprechend klar, wenn du das willst – und lieber gar nicht, wenn nicht.
:::

## Wo die Verbindung lebt

In GoodWorkshop findest du alles zur Verbindung im Profilmenü oben rechts unter **KI-Verbindung**: die Server-URL, Anleitungen für einzelne Clients und deine persönlichen Tokens.

## Siehe auch

- [Einen Assistenten verbinden](/de/ai/connect/)
- [Werkzeug-Referenz](/de/ai/tools/)
- [Beispiele](/de/ai/examples/)
- [KI-Verbindung – Fehlerbehebung](/de/troubleshooting/ai-connection/)
