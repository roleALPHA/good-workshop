---
title: Branding
description: Logo, Name und Akzentfarbe des Workspaces festlegen – und welche Grenzen dafür gelten.
sidebar:
  order: 4
---

Mit dem Branding bekommt GoodWorkshop das Gesicht deiner Organisation: ein Logo und eine
Akzentfarbe. Mehr nicht, und das mit Absicht. Die Fußzeile bleibt, wie sie ist, und die
Farben der Bausteintypen bleiben unberührt.

Öffne oben rechts das Kontomenü und wähle unter **Verwaltung** den Eintrag **Branding**.

:::note
Das Branding ändern nur Admins. Es gilt für alle im Workspace.
:::

## Ein Logo hochladen

1. Klick unter **Logo** auf **Logo hochladen** (oder **Logo ersetzen**, wenn schon eines da
   ist).
2. Wähle die Datei aus.

Das Logo erscheint in der Kopfzeile. Mit **Entfernen** nimmst du es wieder weg.

| Grenze  | Wert               |
| ------- | ------------------ |
| Formate | SVG, PNG oder WebP |
| Größe   | höchstens 256 KB   |

:::tip
Ein SVG bleibt in jeder Größe scharf und ist meist das kleinste. Achte beim Export auf drei
Dinge, sonst lehnt GoodWorkshop die Datei ab:

- keine Skripte und keine Interaktivität – viele Programme nennen das „einfaches SVG“,
- keine Verweise nach außen – Schriften und Bilder eingebettet,
- keine DTD und keine Entities.
  :::

Wo das Logo außerdem auftaucht, hängt von der Installation ab: Wer GoodWorkshop selbst
betreibt, sieht es auch auf der Anmeldeseite. In der GoodWorkshop Cloud zeigt die Anmeldeseite
kein Workspace-Logo, denn dort steht vor der Anmeldung noch nicht fest, zu welchem Workspace
jemand gehört.

## Einen Namen statt eines Logos

Hast du kein Logo, trag unter **Name (wenn kein Logo gesetzt ist)** den Namen ein, der in der
Kopfzeile stehen soll. Ist ein Logo gesetzt, zeigt die Kopfzeile das Logo.

## Die Akzentfarbe festlegen

Die Akzentfarbe färbt die Knöpfe und hervorgehobenen Flächen der Oberfläche.

1. Trag unter **Akzentfarbe** einen **Hex-Wert** ein, etwa `#7c3aed`.
2. Drück die Eingabetaste oder verlass das Feld. GoodWorkshop speichert sofort und zeigt
   **Gespeichert.**

Einen eigenen Speichern-Knopf gibt es hier nicht; dasselbe gilt für den Namen.

Aus dem einen Farbwert baut der Server alle Abstufungen für den hellen und den dunklen Modus.
Dabei prüft er den Kontrast. Eine Farbe, mit der Text unlesbar würde, lehnt er ab und sagt dir
warum:

| Meldung                                                        | Was zu tun ist                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| „Grau hat keinen Farbton …“                                    | Nimm einen bunten Ton. Aus Grau, Schwarz oder Weiß lässt sich keine Akzentfarbe bauen.           |
| „Dieser Ton erreicht im hellen (oder dunklen) Modus nur …:1 …“ | Der Kontrast liegt unter 4,5:1. Nimm einen etwas dunkleren oder kräftigeren Ton derselben Farbe. |
| „Bitte eine Farbe als Hex-Wert angeben …“                      | Der Wert ist kein Hex-Wert. Schreib ihn mit `#` und sechs Stellen.                               |

Sehr kräftige Farben dämpft GoodWorkshop ohne Nachfrage leicht ab, damit sie als Akzent
wirken und nicht leuchten. Deine Eingabe bleibt trotzdem die Grundlage.

:::note[Warum die Bausteintypen ihre Farben behalten]
Die Farben der Bausteintypen bedeuten etwas – eine Pause sieht aus wie eine Pause. Würde die
Hausfarbe alle Typen übermalen, wäre die Agenda nicht mehr lesbar. Die Farbe eines
Bausteintyps änderst du deshalb einzeln beim Typ selbst; mehr dazu unter
[Blöcke und Bausteintypen](/de/agenda/blocks/).
:::

## Siehe auch

- [Mitglieder](/de/account/members/)
- [Mailversand](/de/account/mail/)
- [Drucken](/de/sharing/print/)
