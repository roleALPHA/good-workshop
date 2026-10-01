---
title: Dauer und Startzeiten
description: Wie GoodWorkshop Start- und Endzeiten aus Tagesbeginn und Dauern berechnet, wie du eine Uhrzeit fixierst und was bei Überschneidungen passiert.
sidebar:
  order: 3
---

In GoodWorkshop tippst du keine Startzeiten ein. Du gibst dem Tag einen Beginn und jedem Block eine Dauer, und die Uhrzeiten rechnen sich daraus: Der erste Block beginnt mit dem Tag, jeder weitere, wenn der vorige endet. Verschiebst du einen Block, änderst eine Dauer oder parkst etwas, stimmen alle Zeiten sofort wieder.

## Den Beginn des Tages setzen

Unter den Reitern der Tage steht das Feld **Beginn des Tags**. Ändere dort die Uhrzeit, und alle Blöcke rücken mit, außer denen, die du fixiert hast. Ein neuer Tag übernimmt den Beginn des bisher letzten Tages, siehe [Tage](/de/agenda/days/).

## Eine Dauer ändern

Die Dauer steht fett unter der Startzeit. Klick hinein und tippe eine neue. Das Feld versteht viele Schreibweisen:

| Du tippst                           | Ergebnis                          |
| ----------------------------------- | --------------------------------- |
| `45`, `45m`, `45 min`, `45 Minuten` | 45 Minuten                        |
| `1h30`, `1h 30m`, `1:30`            | 1 Stunde 30 Minuten               |
| `1,5h`, `1.5h`, `1 Std`             | 1 Stunde 30 Minuten bzw. 1 Stunde |

Die Kurzformen gelten in jeder Sprache der Oberfläche, die ausgeschriebenen Wörter in der Sprache, in der du GoodWorkshop nutzt. Enter oder ein Klick daneben übernimmt den Wert, Escape verwirft ihn. Was das Feld nicht eindeutig lesen kann, wird nicht geraten: Es springt auf den alten Wert zurück, und ein roter Rahmen warnt dich schon beim Tippen. Eine Dauer liegt zwischen 0 Minuten und 24 Stunden.

:::tip[Mit den Pfeiltasten]
Im Dauerfeld verlängert Pfeil hoch um 5 Minuten, Pfeil runter verkürzt um 5. Mit gedrückter Umschalttaste sind es 15 Minuten. Der Wert wird dabei sofort übernommen.
:::

Abschnitte und Breakouts haben keine eigene Dauer. Ihre ergibt sich aus den Blöcken darin, siehe [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/).

## Eine Startzeit fixieren

Manchmal ist eine Uhrzeit gesetzt: Das Mittagessen kommt um 12:30, der Vorstand um 14:00. Dann fixierst du den Block auf diese Uhrzeit.

1. Fahr mit der Maus über den Block oder klick hinein. Neben der Startzeit erscheint ein offenes Schloss. Auf einem Touchscreen ist es immer sichtbar.
2. Klick auf das Schloss (**Startzeit fixieren**). Der Block übernimmt die Uhrzeit, zu der er gerade beginnt. Am Ablauf ändert sich also zunächst nichts.
3. Trag im Feld **Fixierte Startzeit** die gewünschte Uhrzeit ein.

Ein fixierter Block zeigt ein geschlossenes Schloss. Er bleibt bei seiner Uhrzeit, egal was davor passiert. Die Blöcke danach rechnen ab seinem Ende weiter. Mit **Fixierung aufheben**, einem erneuten Klick auf das Schloss, rechnet er wieder ganz normal mit.

Auch einen Abschnitt oder einen Breakout kannst du so fixieren; sein Schloss sitzt in der Kopfzeile, auf dem Handy wird es dort nicht angezeigt. Die Stränge eines Breakouts beginnen immer gemeinsam mit dem Breakout.

## Lücken und Überschneidungen

Weil ein fixierter Block nicht nachgibt, passt der Ablauf davor nicht immer genau.

- **Lücke:** Endet der vorige Block früher, erscheint vor dem fixierten Block eine gestrichelte Linie mit **Puffer**, etwa „15m Puffer“. Das ist nur eine Anzeige, kein Block.
- **Überschneidung:** Endet der vorige Block später, steht am fixierten Block eine Warnung: **Überschneidet den vorherigen Block um 10m**. Die beiden Blöcke laufen dann rechnerisch gleichzeitig.

:::note
GoodWorkshop löst eine Überschneidung nie selbst auf, kürzt nichts und verschiebt nichts. Das ist Absicht: Oft ist sie nur ein Zwischenstand, bis du einen Block davor gekürzt hast. Die Warnung bleibt, bis die Zeiten wieder passen.
:::

## Ende des Tages

Unter dem letzten Block steht die Uhrzeit, zu der der Tag endet, mit dem Wort **Ende**. Dieselbe Zeit findest du oben in der Zusammenfassung, zusammen mit **Inhalt**, **Pausen** und der Zahl der Blöcke. Pausen sind die Zeiten der Typen **Pause**, **Mittagessen**, **Puffer** und **Notiz**, alles andere zählt als Inhalt. Geparkte Blöcke zählen gar nicht.

Läuft ein Tag über Mitternacht, steht hinter der Uhrzeit ein `(+1)`, etwa `01:30 (+1)`. Eine fixierte Uhrzeit, die vor dem Beginn des Tages liegt, gilt deshalb als Uhrzeit am Folgetag: Ein Block, den du bei einem Tagesbeginn um 20:00 auf 01:00 fixierst, steht bei `01:00 (+1)`.

## Verwandte Seiten

- [Tage](/de/agenda/days/)
- [Blöcke und Bausteintypen](/de/agenda/blocks/)
- [Abschnitte und Breakouts](/de/agenda/clusters-and-breakouts/)
- [Parkplatz](/de/agenda/parking/)
