---
title: Beispiele
description: Beispiel-Bitten an einen verbundenen KI-Assistenten – vom ganzen Workshoptag mit Breakout bis zum Export – und was der Assistent dabei in GoodWorkshop tut.
sidebar:
  order: 4
---

Die folgenden Bitten funktionieren mit jedem verbundenen Assistenten, ob Claude, ChatGPT oder Gemini. Du schreibst ganz normal, auf Deutsch oder in einer anderen Sprache. Unter jeder Bitte steht, welche [Werkzeuge](/de/ai/tools/) der Assistent typischerweise verwendet. Das genaue Vorgehen entscheidet das Modell selbst.

Voraussetzung: Der Assistent ist [verbunden](/de/ai/connect/), und für alles, was schreibt, hat er den Bereich **Workshops schreiben**.

## 1. Einen ganzen Workshoptag mit Breakout planen

> Leg einen Workshop „Teamtag Vertrieb“ am 12. März an. Beginn 9:00. Erst Ankommen und Check-in, dann ein Impuls zur Jahresplanung, danach 60 Minuten Kleingruppen in drei Räumen – Bestandskunden, Neukunden, Partner – mit je einer Arbeitsphase und einem Ergebnis-Flipchart. Danach Mittagessen, am Nachmittag Ergebnisse im Plenum, Entscheidung über die drei wichtigsten Maßnahmen und Check-out.

Was der Assistent tut:

1. `list_module_types` – lernt die Bausteintypen deines Arbeitsbereichs kennen, etwa Check-in, Impuls, Breakout-Session, Mittagessen.
2. `create_workshop` mit Titel und Datum – legt den Workshop samt erstem Tag an.
3. `apply_agenda` – schreibt den ganzen Tag in **einem** Aufruf. Die Kleingruppen werden ein Breakout mit drei Strängen, die gleichzeitig laufen, jeder mit seinen eigenen Blöcken.

Startzeiten musst du nicht nennen: GoodWorkshop rechnet sie aus dem Beginn und den Dauern aus. Mehr zum Aufbau unter [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/).

:::tip[Erst zeigen lassen, dann schreiben]
Sag dazu „Zeig mir den Ablauf erst, bevor du ihn anlegst“, wenn du vorher drüberschauen willst.
:::

## 2. Einen zweiten Tag ergänzen

> Häng an den Teamtag einen zweiten Tag am 13. März an, Beginn 8:30, halber Tag: Rückblick auf Tag 1, Maßnahmenplanung in Paaren, Abschluss.

Der Assistent sucht den Workshop mit `list_workshops`, legt den Tag mit `create_day` an und füllt ihn mit `apply_agenda`.

## 3. Einen Block parken und später zurückholen

> Park im Teamtag den Impuls zur Jahresplanung, wir brauchen die Zeit für die Kleingruppen. Verlängere dafür das Breakout um 20 Minuten.

1. `get_workshop` – liest den Tag mit allen IDs.
2. `update_modules` – setzt beim Impuls `parked: true` und ändert die Dauern der Blöcke in den Strängen, in einem Aufruf.

Der Block bleibt auf dem [Parkplatz](/de/agenda/parking/) erhalten. Später:

> Hol den geparkten Impuls auf Tag 2, gleich nach dem Rückblick.

Der Assistent verwendet `move_module` mit `toDayId` und setzt den Block an die gewünschte Stelle.

## 4. Eine Pause auf eine feste Uhrzeit legen

> Das Mittagessen muss um 12:30 beginnen, egal was davor passiert.

Der Assistent setzt mit `update_module` eine feste Startzeit (`pinnedStartMinute: 750`). Läuft der Vormittag länger, zeigt GoodWorkshop eine Überschneidung an – siehe [Dauer und Startzeiten](/de/agenda/timing/).

## 5. Verantwortliche eintragen

> Trag bei allen Blöcken am Vormittag Anna Berger als verantwortlich ein, bei den Kleingruppen zusätzlich je eine Person aus dem Kundenteam: Herr Kaya, Frau Lind und Frau Novak.

Der Assistent ändert alle betroffenen Blöcke mit `update_modules` in einem Aufruf. Mitglieder deines Arbeitsbereichs erkennt GoodWorkshop am **exakten vollen Namen**. Wer nicht passt – hier die Personen, die nur mit Nachnamen genannt sind –, wird als externe Person eingetragen. Eine Liste der Mitglieder bekommt der Assistent nicht. Mehr unter [Verantwortliche](/de/agenda/responsible/).

## 6. Den Workshop exportieren und weiterverarbeiten

> Hol dir den Teamtag als Text und schreib daraus eine kurze Einladungsmail an die Teilnehmenden, auf Englisch. Ohne meine Moderationsnotizen.

Der Assistent ruft `export_workshop` auf – mit `locale: en` und ohne Notizen – und erhält den ganzen Workshop als Markdown, alle Tage in Reihenfolge. Daraus formuliert er die Mail. Dasselbe Dokument bekommst du in der App über den [Markdown-Export](/de/sharing/export/).

## 7. Die Bibliothek aufräumen

> Leg alle Workshops mit „Vertrieb“ im Titel in einen neuen Ordner „Vertrieb 2026“ und gib ihnen das Schlagwort „intern“.

`create_folder`, dann `list_workshops` mit Suche, je Workshop `move_workshop` und `set_workshop_tags`. Workshops, die du nur lesen darfst, lässt der Assistent dabei aus – er kann nie mehr als du.

:::caution[Schlagwörter werden ersetzt]
`set_workshop_tags` setzt die **vollständige** Liste. Bitte deshalb ausdrücklich darum, vorhandene Schlagwörter zu behalten, wenn du nur eines hinzufügen willst.
:::

## 8. Eine Methode übernehmen (nur Cloud)

> Such mir in der Methodensammlung einen kurzen Einstieg für 20 Personen, höchstens 15 Minuten. Zeig mir zwei Vorschläge, und den, den ich auswähle, hängst du an den Anfang von Tag 2.

1. `list_discover_entries` mit `groupSize` und `maxMinutes`.
2. `get_discover_entry` – zeigt dir die Vorschläge mit allen Blöcken.
3. Nach deiner Wahl `adopt_discover_entry` mit Workshop und Tag. Der Baustein landet als Kopie am **Ende** des Tags; danach verschiebt der Assistent ihn mit `move_module` an den Anfang.

Nur in der [GoodWorkshop Cloud](/de/cloud/discover/).

## Was nicht geht

> Teil den Teamtag mit meinem Kollegen.

Das lehnt der Assistent ab oder verweist dich auf die App: Freigaben, [Freigabelinks](/de/sharing/share-links/) und Mitglieder gibt es über MCP bewusst nicht. Teilen machst du selbst unter **Zugriff** – siehe [Mit Personen teilen](/de/sharing/share-with-people/).

## Tipps für gute Ergebnisse

- **Nenne Rahmen**: Datum, Beginn, Gruppengröße, Räume, feste Termine wie das Mittagessen.
- **Sag, ob ersetzt oder ergänzt wird.** Soll der ganze Ablauf neu geschrieben werden, kann der Assistent den Tag ersetzen (`mode: replace`); sonst hängt er an.
- **Lass dir Zwischenstände zeigen**, wenn ein Tag schon offen bei anderen ist – Änderungen erscheinen sofort beim [gemeinsamen Bearbeiten](/de/agenda/live-editing/).
- **Endgültiges Löschen nur ausdrücklich.** Für `purge_workshop` braucht es deine klare Bitte.

## Siehe auch

- [Werkzeug-Referenz](/de/ai/tools/)
- [Mit dem KI-Assistenten planen](/de/ai/introduction/)
- [Einen Assistenten verbinden](/de/ai/connect/)
