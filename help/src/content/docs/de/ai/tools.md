---
title: Werkzeug-Referenz
description: Alle Werkzeuge, die der MCP-Server von GoodWorkshop einem KI-Assistenten anbietet – mit Zweck, wichtigen Parametern und nötigem Bereich.
sidebar:
  order: 3
---

Diese Seite listet jedes Werkzeug, das GoodWorkshop einem verbundenen Assistenten anbietet. Du musst die Werkzeuge nicht selbst aufrufen – der Assistent wählt sie anhand deiner Bitte. Die Referenz hilft dir einzuschätzen, was möglich ist, und eine Antwort des Assistenten nachzuvollziehen.

Werkzeugnamen, Parameter und Beschreibungen sind englisch, weil sie für das Modell geschrieben sind. Deine Bitten formulierst du in jeder Sprache.

## Lesehilfe

**Bereich** sagt, welche Berechtigung das Werkzeug braucht (siehe [Einen Assistenten verbinden](/de/ai/connect/)):

| Kürzel | Bereich                                     |
| ------ | ------------------------------------------- |
| L      | **Workshops lesen** (`workshops:read`)      |
| S      | **Workshops schreiben** (`workshops:write`) |
| T      | **Modultypen lesen** (`module_types:read`)  |

Zusätzlich gelten immer deine eigenen Rechte am Workshop: Was du nur lesen darfst, kann auch der Assistent nicht ändern.

**Zeiten** sind Minuten seit Mitternacht: `540` ist 09:00. **Dauern** sind Minuten.

**IDs** sind lange Kennungen, die der Assistent aus vorherigen Antworten übernimmt, zum Beispiel aus `list_workshops` oder `get_workshop`.

**`expectedVersion`** nehmen alle Werkzeuge, die den Inhalt eines Tags ändern. Der Assistent schickt die Version mit, die er zuletzt gelesen hat. Hat sich der Workshop seitdem geändert – etwa weil du parallel bearbeitest –, wird die Änderung abgelehnt statt deine Arbeit zu überschreiben.

## Bibliothek und Ordner

| Werkzeug        | Was es tut                                                                                        | Wichtige Parameter                            | Bereich |
| --------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| `list_folders`  | Liefert den Ordnerbaum in Anzeigereihenfolge – nur die Ordner, auf die du Zugriff hast.           | –                                             | L       |
| `create_folder` | Legt einen Ordner an, oben oder in einem anderen Ordner. Namen sind unter Geschwistern eindeutig. | `name`, `parentId`                            | S       |
| `move_folder`   | Verschiebt einen Ordner samt Inhalt. Nur für Admins des Arbeitsbereichs.                          | `folderId`, `parentId` (null = oberste Ebene) | S       |
| `delete_folder` | Löscht einen Ordner. Unterordner und Workshops darin rücken eine Ebene hoch. Nur für Admins.      | `folderId`                                    | S       |
| `list_tags`     | Liefert alle verwendeten [Schlagwörter](/de/library/tags/) mit Anzahl.                            | –                                             | L       |

## Workshops

| Werkzeug            | Was es tut                                                                                                                                                                    | Wichtige Parameter                                                                                                          | Bereich |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| `list_workshops`    | Liefert die Workshops, die du öffnen darfst, zuletzt geänderte zuerst, seitenweise.                                                                                           | `folderId`, `tagId`, `search` (Teil des Titels), `cursor`, `limit` (1–100)                                                  | L       |
| `create_workshop`   | Legt einen Workshop mit seinem ersten Tag an.                                                                                                                                 | `title`, `folderId`, `date` (Datum des ersten Tags, JJJJ-MM-TT)                                                             | S       |
| `rename_workshop`   | Ändert den Titel.                                                                                                                                                             | `workshopId`, `title`                                                                                                       | S       |
| `move_workshop`     | Legt einen Workshop in einen Ordner oder nimmt ihn heraus.                                                                                                                    | `workshopId`, `folderId` (null = ohne Ordner)                                                                               | S       |
| `set_workshop_tags` | Ersetzt die Schlagwörter durch die angegebene vollständige Liste. Neue Schlagwörter entstehen dabei; eine leere Liste entfernt alle.                                          | `workshopId`, `tags` (bis 24)                                                                                               | S       |
| `export_workshop`   | Liefert den ganzen Workshop als ein Markdown-Dokument, alle Tage in Reihenfolge – dasselbe wie der [Markdown-Export](/de/sharing/export/). Moderationsnotizen nur auf Wunsch. | `workshopId`, `flavor` (`agenda` = Tabelle, `outline` = Überschriften und Text), `locale` (`de`, `en`, `fr`, `es`), `notes` | L       |

`move_workshop`, `rename_workshop` und `set_workshop_tags` brauchen mindestens **Bearbeiten** am Workshop.

Als Ziel (`folderId`, `parentId`) taugt nur ein Ordner, auf den du Zugriff hast; jeder andere gilt als nicht vorhanden. Das betrifft `create_folder`, `create_workshop` und `move_workshop`.

## Papierkorb

Diese Werkzeuge darf nur die Eigentümer:in des Workshops oder ein Admin des Arbeitsbereichs verwenden – wie in der App (siehe [Papierkorb](/de/library/trash/)).

| Werkzeug           | Was es tut                                                                                                           | Wichtige Parameter | Bereich |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- |
| `trash_workshop`   | Legt einen Workshop in den Papierkorb. Nichts geht verloren.                                                         | `workshopId`       | S       |
| `list_trash`       | Liefert die Workshops im Papierkorb, zuletzt gelöschte zuerst.                                                       | –                  | L       |
| `restore_workshop` | Holt einen Workshop mit Ordner und Schlagwörtern zurück.                                                             | `workshopId`       | S       |
| `purge_workshop`   | Löscht einen Workshop **endgültig**, mit allen Tagen und Blöcken. Nur für Workshops, die schon im Papierkorb liegen. | `workshopId`       | S       |

:::danger[`purge_workshop` lässt sich nicht rückgängig machen]
Der Assistent ist angewiesen, dieses Werkzeug nur zu verwenden, wenn du ausdrücklich um endgültiges Löschen bittest.
:::

## Tage

| Werkzeug        | Was es tut                                                                                                                                                                                | Wichtige Parameter                                            | Bereich |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------- |
| `list_days`     | Liefert die Tage eines Workshops in Reihenfolge.                                                                                                                                          | `workshopId`                                                  | L       |
| `create_day`    | Hängt einen Tag hinten an. Ohne Startzeit übernimmt er die des letzten Tags.                                                                                                              | `workshopId`, `title`, `date`, `startMinute`                  | S       |
| `update_day`    | Ändert Name, Datum, Beginn oder Notiz eines Tags; Weggelassenes bleibt. `date: null` entfernt das Datum, ein leerer `note` die Notiz.                                                     | `workshopId`, `dayId`, `title`, `date`, `startMinute`, `note` | S       |
| `set_day_start` | Setzt nur den Beginn eines Tags.                                                                                                                                                          | `workshopId`, `dayId`, `startMinute`                          | S       |
| `move_day`      | Ändert die Reihenfolge der Tage.                                                                                                                                                          | `workshopId`, `dayId`, `afterId` (null = an den Anfang)       | S       |
| `delete_day`    | Löscht einen Tag mit seinem Ablauf. Geparkte Blöcke bleiben erhalten und wandern auf den Tag davor (beim ersten Tag auf den danach). Der letzte verbliebene Tag lässt sich nicht löschen. | `workshopId`, `dayId`                                         | S       |

Mehr zu Tagen unter [Tage](/de/agenda/days/).

## Lesen

| Werkzeug            | Was es tut                                                                                                                                                   | Wichtige Parameter                                                                                      | Bereich |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------- |
| `list_module_types` | Liefert alle verfügbaren [Bausteintypen](/de/agenda/blocks/) mit Kennung, Standarddauer und Feldern. Der Assistent ruft das vor dem Anlegen von Blöcken auf. | –                                                                                                       | T       |
| `get_workshop`      | Liest einen Tag: berechnete Startzeiten, alle IDs, Abschnitte und Breakouts, geparkte Blöcke dieses Tags und der anderen Tage, dazu die aktuelle Version.    | `workshopId`, `dayId` (ohne: erster Tag), `view` (`outline` oder `markdown`), `locale` (für `markdown`) | L       |

## Ganze Agenda

| Werkzeug         | Was es tut                                                                                                                                                                                                                                         | Wichtige Parameter                                                                                   | Bereich |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------- |
| `apply_agenda`   | Schreibt einen ganzen Tagesablauf in einem Zug, jeden Block mit allen Feldern. **Alles oder nichts**: Nennt ein Block einen unbekannten Typ oder passen seine Felder nicht, wird nichts geschrieben, und alle Probleme werden auf einmal gemeldet. | `workshopId`, `dayId`, `mode` (`append` = anhängen, Standard; `replace` = Tag ersetzen), `items`     | S       |
| `update_modules` | Ändert Felder vieler Blöcke und Abschnitte eines Tags in einem Aufruf; IDs bleiben gleich. Ebenfalls alles oder nichts.                                                                                                                            | `workshopId`, `dayId`, `updates` (1–500 Einträge, je `moduleId` plus Felder wie bei `update_module`) | S       |

### Aufbau von `items`

Jeder Eintrag in `items` hat eine Art (`kind`):

| `kind`     | Bedeutung                                                                                  | Inhalt                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `module`   | ein Block                                                                                  | `typeKey` (aus `list_module_types`) und die Blockfelder unten                                                      |
| `cluster`  | ein [Abschnitt](/de/agenda/clusters-and-breakouts/), dessen Blöcke nacheinander laufen     | `title`, `color`, `pinnedStartMinute`, `children` (Blöcke)                                                         |
| `breakout` | ein Breakout: Stränge, die **gleichzeitig** laufen, etwa Kleingruppen in getrennten Räumen | `title`, `color`, `pinnedStartMinute`, `children` (Stränge mit `title`, `color` und eigenen Blöcken in `children`) |

Alle Stränge eines Breakouts beginnen mit ihm; er endet, wenn der längste Strang endet. Blöcke hängen immer an einem Strang, nie direkt am Breakout. Ein Breakout steht immer auf Tagesebene, nie in einem anderen.

### Blockfelder

| Feld                | Bedeutung                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`             | Titel des Blocks                                                                                                                                                                                               |
| `durationMinutes`   | Dauer in Minuten                                                                                                                                                                                               |
| `pinnedStartMinute` | feste Startzeit (siehe [Dauer und Startzeiten](/de/agenda/timing/)); `null` löst sie                                                                                                                           |
| `desc`              | die Felder des Bausteintyps, etwa Beschreibung, Material oder Vortragende:r – geprüft gegen dessen Schema                                                                                                      |
| `parked`            | `true` legt den Block auf den [Parkplatz](/de/agenda/parking/)                                                                                                                                                 |
| `responsible`       | wer für den Block verantwortlich ist, bis zu 20 Personen: ein Mitglied per `memberId` oder exaktem vollem Namen, andere nur mit Namen; `[]` leert die Liste (siehe [Verantwortliche](/de/agenda/responsible/)) |
| `color`             | nur für Abschnitte: `rose`, `red`, `orange`, `amber`, `emerald`, `teal`, `cyan`, `blue`, `violet`, `slate`                                                                                                     |

## Einzelne Blöcke

| Werkzeug        | Was es tut                                                                                                                                                                                          | Wichtige Parameter                                                                                           | Bereich |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| `add_module`    | Legt einen einzelnen Block im Tag oder in einem Abschnitt bzw. Strang an – am Ende, oder mit `afterId` hinter einem Geschwister (null = ganz oben).                                                 | `workshopId`, `dayId`, `typeKey`, `title`, `durationMinutes`, `clusterId`, `afterId`                         | S       |
| `add_cluster`   | Legt einen Abschnitt im Tag an – am Ende oder mit `afterId` hinter einem Geschwister. Mit `mode: parallel` wird daraus ein Breakout; ein Strang ist ein Abschnitt mit `parentClusterId` = Breakout. | `workshopId`, `dayId`, `title`, `color`, `mode` (`sequential` oder `parallel`), `parentClusterId`, `afterId` | S       |
| `update_module` | Ändert Felder eines Blocks oder Abschnitts; Weggelassenes bleibt. `desc` ersetzt die ganze Beschreibung.                                                                                            | `workshopId`, `dayId`, `moduleId` und die Blockfelder                                                        | S       |
| `move_module`   | Verschiebt einen Block oder Abschnitt innerhalb des Tags – oder mit `toDayId` einen Block an das Ende eines anderen Tags desselben Workshops. Dort bekommt er eine neue ID.                         | `workshopId`, `moduleId`, `dayId` (wo er jetzt ist), `clusterId`, `afterId`, `toDayId`, `parked`             | S       |
| `delete_module` | Löscht einen Block endgültig. Ein gelöschter Abschnitt nimmt seine Blöcke im Ablauf mit, ein gelöschter Breakout seine Stränge samt Inhalt; geparkte Blöcke daraus bleiben.                         | `workshopId`, `dayId`, `moduleId`                                                                            | S       |

Alle Werkzeuge für Tage und Blöcke brauchen mindestens **Bearbeiten** am Workshop.

:::tip[Parken statt löschen]
Mit `update_module` und `parked: true` nimmt der Assistent einen Block aus dem Zeitplan, ohne ihn zu löschen. Der [Parkplatz](/de/agenda/parking/) gehört dem ganzen Workshop: `get_workshop` zeigt auch, was auf anderen Tagen geparkt ist, und `move_module` mit `toDayId` holt einen Block von dort in einen anderen Tag.
:::

## Methoden entdecken (nur Cloud)

:::note[Nur in der GoodWorkshop Cloud]
Diese vier Werkzeuge gibt es nur in der [GoodWorkshop Cloud](/de/cloud/overview/). Eine selbst betriebene Installation bietet sie gar nicht erst an. Mehr unter [Methoden entdecken](/de/cloud/discover/).
:::

| Werkzeug                | Was es tut                                                                                                                                                                                                                                                                                                                                 | Wichtige Parameter                                                                                                           | Bereich |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| `list_discover_filters` | Liefert die Filter der Methodensammlung mit ihren aktuellen Werten.                                                                                                                                                                                                                                                                        | `locale`                                                                                                                     | L       |
| `list_discover_entries` | Durchsucht die Methodensammlung, neueste zuerst. Ein Eintrag ist ein Tag oder mehrere – ein einzelner Baustein oder ein ganzes Programm.                                                                                                                                                                                                   | `facets` (Werte aus `list_discover_filters`; alle müssen zutreffen), `groupSize`, `maxMinutes`, `search`, `cursor`, `locale` | L       |
| `get_discover_entry`    | Zeigt einen Eintrag Tag für Tag mit allen Blöcken und Dauern. Der Assistent soll ihn dir zeigen, bevor er etwas übernimmt.                                                                                                                                                                                                                 | `entryId`, `locale`                                                                                                          | L       |
| `adopt_discover_entry`  | Übernimmt einen Eintrag als Kopie: ohne `workshopId` als neuen Workshop; mit `workshopId` als zusätzliche Tage hinten dran; mit `workshopId` und `dayId` die Blöcke ans Ende dieses Tags (nur bei Einträgen mit einem Tag). Name und Beginn des Tags bleiben unverändert. Ein Block, dessen Typ es bei dir nicht gibt, kommt als Notiz an. | `entryId`, `workshopId`, `dayId`, `title`, `folderId`, `locale`                                                              | S       |

## Was es nicht gibt

Kein Werkzeug verwaltet Mitglieder, Freigaben, Freigabelinks oder Tokens. Es gibt auch keines, das die Mitglieder deines Arbeitsbereichs auflistet. Das ist Absicht – siehe [Mit dem KI-Assistenten planen](/de/ai/introduction/).

## Siehe auch

- [Beispiele](/de/ai/examples/)
- [Einen Assistenten verbinden](/de/ai/connect/)
- [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/)
- [Blöcke und Bausteintypen](/de/agenda/blocks/)
