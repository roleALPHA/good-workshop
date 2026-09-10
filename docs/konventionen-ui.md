# UI- und UX-Konventionen

Verbindlich für jede Änderung an einer React-Komponente, an Tailwind-Tokens, am Layout oder an Farben.

## Mobile-first ist keine Floskel

Moderator:innen lesen ihre Agenda **am Workshop-Tag auf dem Handy**, nicht am Laptop. Die Leseansicht ist der meistgenutzte Screen pro Workshop. Handy-Lesbarkeit ist ein Akzeptanzkriterium, kein Nice-to-have.

### Breakpoints

| Bereich               | Verhalten                              |
| --------------------- | -------------------------------------- |
| `< 640px` — Phone     | Leseansicht (read-only), Karten-Layout |
| `640–1023px` — Tablet | Leseansicht, zweispaltig wo sinnvoll   |
| `≥ 1024px` — Desktop  | Voller Editor mit Drag & Drop          |

Der Editor blendet unter 1024 px eine freundliche Notiz plus „Read-only ansehen"-Button ein. **Keine kaputte Mini-Version des Editors.**

### Die Agenda kollabiert zu Karten, nicht zu horizontalem Scroll

`--gw-cols` gilt erst ab `md`. Darunter wird jede Zeile eine Karte:

- farbige Kategorieleiste links (4 px)
- Zeit und Dauer als fette Kopfzeile
- Titel darunter
- Beschreibung über die volle Breite
- Zusatzinfo als eingeklapptes Disclosure

Cluster werden zu `position: sticky` Section-Headern mit laufender Uhrzeit.

### Harte Mindestwerte

- Fließtext **nie unter 16 px** — darunter zoomt iOS Safari beim Fokus in ein Input hinein.
- Zeilenlänge 45–75 Zeichen.
- Touch-Ziele ≥ **44 × 44 px**, Abstand zwischen Tap-Zielen ≥ 8 px.
- **Nie horizontal scrollen.** Ein `overflow-x` auf `<body>` ist ein Bug, kein Kompromiss. Lange Inhalte brechen um oder bekommen ihren eigenen Scroll-Container.
- `dvh` statt `vh` für alles Vollbildhohe; `env(safe-area-inset-*)` für Sticky-Footer.

### Auf Phones wird kein Editor gebootet

Beschreibungen rendern dort als statisches HTML. Niemals eine TipTap-`EditorView`-Instanz unter 1024 px.

## Farben

- Kategoriefarben **nur** über die `.cat-*`-OKLCH-Tokens.
- Akzentfarben **nur** über `--brand-*`.
- **Nie rohe Hex-Werte im Komponentencode.** Eine ESLint-Regel bricht darauf.
- Jede Farbfläche erfüllt WCAG AA (4.5:1 für Text) in **beiden** Themes.
- **Kein Zustand nur über Farbe.** Pins, Overlaps und Konflikte tragen immer zusätzlich Icon oder Text.

### Tenant-Branding fasst `--brand-*` an und nie `.cat-*`

Modultyp-Farben sind **Semantik** („check-in ist rosa"), keine Dekoration. Ihre gegenseitige Unterscheidbarkeit hängt an der OKLCH-Kalibrierung. Ein Tenant, der sein Corporate-Blau über alle Modultypen legt, macht die Agenda unlesbar. Einzelne Modultyp-Farben ändert man in `/admin/module-types` — dort gehören sie hin.

## Footer

`<AppFooter>` mit `GoodWorkshop · powered by roleALPHA` ist auf **jeder** Ansicht vorhanden — App-Shell, Login, mobile Leseansicht, Print-View. Beim Bauen einer neuen Top-Level-Ansicht wird er mitgezogen. Der String liegt nicht in den i18n-Katalogen und wird nicht aus Tenant-Daten interpoliert.

## Bearbeitet wird an Ort und Stelle, nicht in einem Dialog

**Die wichtigste Interaktionsregel dieses Produkts.** Wer etwas ändern will, tut es dort, wo es steht — Titel, Dauer, Beschreibung und die typspezifischen Felder eines Moduls werden direkt in der Zeile bearbeitet, in der sie stehen.

Warum das keine Geschmacksfrage ist: ein Dialog schiebt einen Modus zwischen die Moderatorin und die Agenda, die sie gerade liest. Genau das darf ein Planungswerkzeug nicht — der Sinn der Tagesansicht ist, dass das Dokument sichtbar bleibt, während man daran arbeitet. Ein Modal blendet den Kontext aus, in dem die Entscheidung überhaupt Sinn ergibt („passt diese Dauer zum Rest des Vormittags?").

Konkret:

- **Keine Modals für Bearbeitung.** Modals bleiben Bestätigungen für Unumkehrbares (Löschen) und echten Kontextwechseln vorbehalten.
- **Kein Speichern-Knopf für Feldänderungen.** Übernommen wird bei Blur, nicht bei jedem Tastendruck: mitten im Wort zu validieren markiert halb Getipptes als falsch, und jedes Zeichen zu persistieren macht aus einem Satz vierzig Schreibvorgänge.
- **Kein Bearbeiten-Modus.** Es gibt keinen Umschalter zwischen Lesen und Ändern. Felder sind rahmenlos, bis man sie berührt.
- **Ungültige Eingaben kehren zurück, statt zu raten.** Eine still falsch geratene Dauer verschiebt jeden folgenden Block und fällt niemandem auf.
- **Zusatzfelder klappen in derselben Zeile auf**, nicht in einem Seitenpanel. Die Ruhe der eingeklappten Tabelle ist das, was das erst leistbar macht: geschlossen zeigt eine Zeile vier Felder, alles andere erscheint auf Wunsch und faltet sich wieder weg.

Wenn eine Änderung sich nicht sinnvoll inline unterbringen lässt, ist meist die Zeile zu voll — nicht der Dialog fällig.

## Interaktion

- Inline-Editing ohne sichtbare Input-Rahmen bis Hover/Fokus. Die Tabelle liest sich als Dokument, nicht als Formular.
- Typografie statt Rahmen: eine Haarlinie zwischen Zeilen, keine vertikalen Gitterlinien.
- Jede Hover-Affordance hat ein `focus-within`-Pendant — **auf Touch gibt es kein Hover**.
- Motion nur wo sie etwas bedeutet, immer mit `prefers-reduced-motion`.
- Skeletons in Grid-Form, keine Spinner.
- Optimistisch mit Toast nur bei Fehler, plus dezentes „Alle Änderungen gespeichert".
- `font-variant-numeric: tabular-nums` auf jeder Zeit und Dauer — sonst zittert die Spalte bei jedem Tastendruck.

## Accessibility

`role="treegrid"`, Zeilen mit `aria-level` / `aria-posinset` / `aria-setsize` / `aria-expanded`, Roving `tabindex`. ↑/↓ Fokus, →/← Cluster auf/zu, Enter Titel editieren, ⌘⌥↑/↓ Zeile verschieben. Drag-Ansagen sprechen die Domäne, nicht Koordinaten: „Icebreaker auf Position 3 in Sektion Warm-up verschoben. Neue Startzeit 09:15."

## Checkliste vor jedem UI-PR

- [ ] bei 375 × 667 tatsächlich gelesen
- [ ] kein horizontaler Scroll
- [ ] Touch-Ziele ≥ 44 px
- [ ] Tastaturbedienung durchgespielt
- [ ] Dark Mode geprüft
- [ ] `prefers-reduced-motion` geprüft
- [ ] Kontrast gemessen
- [ ] keine rohen Hex-Farben
- [ ] `<AppFooter>` vorhanden
- [ ] kein Dialog für etwas, das inline gehört
