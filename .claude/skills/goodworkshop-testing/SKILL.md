---
name: goodworkshop-testing
description: 'Teststrategie für GoodWorkshop (Testpyramide: viele Unit- und Komponententests, wenige E2E). Nutze diesen Skill, wenn Tests geschrieben oder geändert werden, wenn Testlücken bewertet werden, oder wenn eine neue Domänentabelle oder pure Funktion entsteht.'
---

# goodworkshop-testing

## Testpyramide, breit unten

Richtwerte, keine Dogmen — aber eine **Umkehrung der Proportionen ist ein Review-Blocker**.

| Ebene                    | Anteil | Werkzeug                                             | Was gehört hierher                                                                                                                                            |
| ------------------------ | ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                     | ~70 %  | Vitest                                               | Pure Funktionen: `computeSchedule`, `getProjection`, `flatten`, `applyOp`/`invertOp`, `parseDuration`, Markdown-Serializer, Ajv-Validierung, fraktionale Keys |
| Integration / Komponente | ~25 %  | Vitest + Testing Library, Postgres-Service-Container | Komponenten mit echtem User-Event; Repository-Funktionen gegen eine echte DB inkl. RLS und Composite-FKs                                                      |
| E2E                      | ~5 %   | Playwright                                           | Nur kritische Pfade — nichts, was eine Ebene tiefer schon abgedeckt ist                                                                                       |

## Regeln

### Pure Funktionen bekommen Testtabellen, keine Einzelfälle

`computeSchedule`, `getProjection` und `parseDuration` haben jeweils eine erschöpfende `it.each`-Tabelle. Diese drei Tabellen werden **vor** der jeweiligen Implementierung geschrieben.

**`computeSchedule`:** leerer Tag · nur Pins · Pin vor Cursor (Overlap) · Pin nach Cursor (Gap) · Cluster-Pin · Übernacht-Session (`end > 1440`) · Null-Dauer-Module.

**`getProjection`:** rein ins Cluster · raus aus dem Cluster · zwischen Clustern · Cluster umsortieren · leeres Cluster · kollabiertes Cluster · erste Zeile · letzte Zeile · Cluster auf sich selbst · Tiefen-Clamp.

**`parseDuration`:** `45`, `45m`, `1h`, `1:30`, `1h30`, `90` — plus Müll, Negatives, Überlauf.

### Jede Domänentabelle braucht einen Cross-Tenant-Test

Bevor sie in `main` darf: in Tenant A schreiben, als Tenant B null Zeilen erwarten; zusätzlich muss ein Insert mit fremder `tenant_id` am `WITH CHECK` scheitern. Der RLS-Metadatentest (jede Tabelle hat `relrowsecurity`, `relforcerowsecurity` und eine Policy) läuft als eigener CI-Job und ist ein **Hard-Fail**.

Eine neue Tabelle ohne RLS ist ein stilles, totales Datenleck ohne Symptom. Dieser Test ist der wichtigste im Projekt.

### Komponententests fahren echtes `userEvent`

Nie direkte State-Manipulation. Getestet wird, was der Nutzer sieht — **Rollen und zugängliche Namen**, keine `data-testid`-Ketten, keine Snapshot-Tests ganzer Bäume.

### E2E läuft gegen das Standalone-Artefakt, nicht gegen `next dev`

`pnpm test:e2e` baut und startet `scripts/start-standalone.mjs` — byteweise das, was das Docker-Image ausliefert. `next start` funktioniert mit `output: 'standalone'` überhaupt nicht (es warnt und liefert etwas anderes aus). Wer die Kopierschritte in `start-standalone.mjs` ändert, muss sie im `Dockerfile` mitziehen: eine Abweichung dort heißt grüne Tests bei kaputtem Image.

### Elemente werden über Rollen und zugängliche Namen gefunden

Konkret in der Agenda: ein Block ist `getByRole('article', { name: <Titel> })`, ein Cluster `getByRole('group', { name: <Titel> })`, die Agenda selbst `getByRole('region', { name: /^Agenda/ })`.

**Nicht** `getByRole('listitem')` — die `<li>` in den Beschreibungen tragen dieselbe Rolle, und eine Query, die beides trifft, ist nicht nur ein Testproblem: sie zeigt, dass das Markup die Struktur nicht ausdrückt. Wenn ein Test hier kämpft, ist meist die Semantik zu reparieren, nicht der Selektor.

### E2E deckt genau diese Flows — mehr nicht

1. Magic-Link-Login
2. Workshop anlegen und Tag befüllen
3. Drag & Drop mit Maus **und** mit Tastatur, jeweils mit Assertion auf die neu berechneten Zeiten
4. Pin setzen und Nachrücken prüfen
5. Markdown-Export
6. 409-Konflikt in zwei Browser-Kontexten
7. Mobile-Viewport: Leseansicht ohne horizontalen Scroll, Fließtext ≥ 16 px, Karten statt Tabelle, sticky Cluster-Header

Flows, deren Feature noch nicht existiert, werden **nicht** als `test.fixme`-Attrappen vorweggenommen — sie stehen als Liste im Kopfkommentar von `e2e/agenda.spec.ts` und kommen mit ihrem Feature dazu.

Zwei Projekte, `desktop` und `mobile` (Pixel 5); Tests, die nur für eines gelten, schließen das andere per `test.skip(({ isMobile }) => …)` aus. In CI läuft die Suite auf zwei Shards.

### Keine Flakes

Ein flaky Test wird **sofort gefixt oder gelöscht**. `test.skip` mit Issue-Link ist die einzige erlaubte Zwischenstufe. Keine `waitForTimeout` — nur Web-First-Assertions.

### Fixtures statt Factories

Das `seed:demo`-Fixture ist die eine geteilte Datenbasis für Export-Snapshots, Perf-Messung und E2E.

### Perf ist ein Test

INP < 200 ms bei Drag-Start auf dem 150-Zeilen-Fixture läuft in CI, nicht als manuelle Übung.

### Coverage

80 % auf `src/domain/**` und `src/features/agenda/**` — die Zonen, in denen ein Bug still ist. **Kein globales Coverage-Ziel**; das erzeugt nur Alibi-Tests.
