---
title: Wie GoodWorkshop aufgebaut ist
description: Bibliothek, Ordner, Workshops, Tage und Blöcke – wie die Teile zusammenhängen und warum du Startzeiten nie eintippst.
sidebar:
  order: 3
---

Wer das Modell einmal kennt, findet sich überall zurecht. Es hat fünf Ebenen, und jede steckt in
der darüber.

```text
Bibliothek                 alles in deinem Workspace
└─ Ordner                  optional, beliebig tief verschachtelt
   └─ Workshop             Titel, Tags, Parkplatz, Zugriff
      └─ Tag               Name, Datum, Beginn, Notiz zum Tag
         ├─ Block          Typ, Titel, Dauer, Beschreibung …
         ├─ Abschnitt      fasst Blöcke nacheinander zusammen
         │  └─ Block
         └─ Breakout       Stränge, die gleichzeitig laufen
            └─ Strang
               └─ Block
```

## Die Ebenen

| Ebene          | Was sie ist                                                                                                                                                 | Wo du sie bearbeitest                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Bibliothek** | Alle Workshops, die du sehen darfst. Admins sehen alle im Workspace.                                                                                        | [Ordner und Workshops](/de/library/folders-and-workshops/) |
| **Ordner**     | Sortieren, nicht besitzen: Ordner gehören dem Workspace, nicht einer Person. Du siehst die, auf die du Zugriff hast. Ein Workshop liegt in höchstens einem. | Spalte **Ordner** in der Bibliothek                        |
| **Workshop**   | Das, was du planst. Er gehört der Person, die ihn angelegt hat, trägt Tags und hat einen Parkplatz.                                                         | Kopf der Workshop-Seite                                    |
| **Tag**        | Ein Workshoptag mit eigenem Beginn, eigenem Datum und eigener Agenda. Ein Workshop hat immer mindestens einen.                                              | [Tage](/de/agenda/days/)                                   |
| **Block**      | Ein Programmpunkt: Check-in, Impuls, Gruppenarbeit, Pause. Der Typ bestimmt Farbe, übliche Dauer und Zusatzfelder.                                          | [Blöcke und Bausteintypen](/de/agenda/blocks/)             |

:::caution[„Tag“ heißt zweierlei]
Ein **Tag** ist in GoodWorkshop sowohl ein Workshoptag als auch ein Schlagwort am Workshop (das
Feld **+ Tag** unter dem Titel). Deshalb heißen die Knöpfe für Tage **Workshoptag** und
**Workshoptag löschen**. Mehr zu Schlagwörtern unter [Schlagwörter](/de/library/tags/).
:::

## Abschnitte und Breakouts

Ein **Abschnitt** fasst Blöcke unter einer Überschrift zusammen, die nacheinander laufen – etwa
„Ankommen & Rahmen“ mit Check-in, Agenda und Energizer. Die Abschnittszeile zeigt, wie viele
Blöcke darin stehen und wie lange sie zusammen dauern.

Ein **Breakout** ist ein Abschnitt, dessen **Stränge** gleichzeitig laufen: parallele
Kleingruppen in verschiedenen Räumen, jede mit ihrem eigenen kleinen Ablauf. Alle Stränge
beginnen, wenn der Breakout beginnt, und der Breakout endet, wenn der längste Strang endet.
Blöcke hängen immer an einem Strang, nie direkt am Breakout. Einen Breakout in einem Breakout
gibt es nicht. Details unter [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/).

## Der Parkplatz gehört zum Workshop

Ein Block, den du **Parken** lässt, verschwindet aus dem Ablauf, behält aber Beschreibung,
Material und Notizen. Er zählt nicht mehr zur Zeit und steht unter der Agenda bei **Geparkt**.
Weil der Parkplatz dem ganzen Workshop gehört, kannst du eine Übung, die am ersten Tag keinen
Platz hatte, am zweiten Tag wieder **In den Ablauf** holen. Auch wenn du einen Tag löschst,
bleiben seine geparkten Blöcke erhalten. Mehr unter [Parkplatz](/de/agenda/parking/).

## Startzeiten werden berechnet

Du tippst nie eine Startzeit für einen Block ein. GoodWorkshop rechnet sie aus:

> Beginn des Tags + Dauer aller Blöcke davor = Startzeit des Blocks

Ändert sich eine Dauer oder die Reihenfolge, wandern alle folgenden Zeiten mit. Die Kopfzeile des
Tags zeigt Beginn und Ende, wie viel davon Inhalt und wie viel Pause ist und wie viele Blöcke der
Tag hat.

Die einzige Ausnahme ist eine **fixierte Startzeit**: Ein Block, den du an eine Uhrzeit
nagelst, bleibt dort stehen. Endet der Block davor früher, entsteht eine Lücke, die als
**Puffer** angezeigt wird. Endet er später, steht in der Zeile zum Beispiel „Überschneidet den
vorherigen Block um 20m“ – GoodWorkshop kürzt nichts heimlich. Mehr unter
[Dauer und Startzeiten](/de/agenda/timing/).

## Weiter

- [Den ersten Workshop planen](/de/start/quickstart/)
- [Sich zurechtfinden](/de/start/finding-your-way/)
- [Dauer und Startzeiten](/de/agenda/timing/)
