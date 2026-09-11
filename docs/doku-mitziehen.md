# Die README zieht mit

Die README ist kein Begleittext, sondern der einzige Weg, auf dem eine Betreiberin erfährt,
was zu setzen ist. Eine falsche Anleitung ist schlimmer als keine: sie wird befolgt.

## Der Chokepoint

```bash
pnpm check:docs
```

Läuft im CI im Job `Lint & Typecheck` und braucht keine Datenbank. Er prüft **nicht**, ob
Sätze stimmen — er prüft die Kopplungen, an denen die Doku hier bisher still falsch wurde:

| Frage                                                                          | Warum sie gestellt wird                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Erreicht jede dokumentierte Variable auch wirklich einen Container?            | `GW_OPS_TOKEN` und `GW_COLLAB_URL` standen in `.env.example` und in der README-Tabelle und wurden nie durchgereicht. Der beschriebene Healthcheck war unbenutzbar. |
| Ist jede Variable, die `compose.yaml` aus der `.env` erwartet, dokumentiert?   | Sonst startet der Stack mit einer Fehlermeldung über einen Wert, von dem die Anleitung nie sprach.                                                                 |
| Steht jede Pflichtvariable in der Tabelle unter `### Konfiguration`?           | Geprüft wird die **erste Spalte der Tabelle**, nicht jede Erwähnung im Fließtext: die Tabelle ist, was man liest, um zu erfahren, was es überhaupt gibt.           |
| Ist jede `process.env.GW_*` im Code dokumentiert **oder** ausdrücklich intern? | Damit „undokumentiert" eine Entscheidung mit Begründung ist und kein Versehen.                                                                                     |
| Existiert jeder Befehl, den die README druckt?                                 | `pnpm`-Scripts, `cli.mjs`-Befehle, Compose-Dienste, Compose-Profile, `scripts/*.mjs`.                                                                              |
| Dasselbe für `docs/*.md` und die Skills                                        | Vieles davon stand einmal in der README. Ein Befehl darf nicht dadurch ungeprüft werden, dass er umzieht.                                                          |
| Steht eine Datenbank-Verbindung oder Passwortdatei in `.env.example`?          | Die gehören nach `compose.yaml`. Wer `DATABASE_PASSWORD_FILE` umbiegt, gibt dem Web-Container eine Rolle, die er nicht haben soll.                                 |

## Wenn `check:docs` anschlägt

Die Meldung nennt die Stelle. Es gibt genau drei richtige Reaktionen — die Prüfung
abzuschwächen ist keine davon:

1. **Die Doku nachziehen**, wenn der Code recht hat.
2. **Den Code reparieren**, wenn die Doku recht hat. Das war bei `GW_OPS_TOKEN` der Fall: nicht
   die README log, sondern `compose.yaml` reichte den Wert nicht durch.
3. **Die Variable als intern eintragen** — in `INTERNAL` in
   [`scripts/check-docs.mjs`](../scripts/check-docs.mjs), **mit Begründung in derselben
   Zeile**. Ein Eintrag ohne Begründung ist genau das Versehen, das die Liste verhindern soll.

Für Werte, die nie in den Node-Prozess gelangen, weil Compose selbst oder ein anderer
Container sie verbraucht (`GW_HOSTNAME`, `GW_PORT`), gibt es `INFRA` — dort gilt dieselbe
Regel, und zusätzlich muss der Wert in `compose.yaml` tatsächlich vorkommen.

## Wo was hingehört

Die README beantwortet zwei Fragen: **Was kann das?** und **Wie installiere ich es?** In
dieser Reihenfolge, gefolgt von den Stolperfallen.

Alles, was eine Entwurfsentscheidung begründet -- warum die Sichtbarkeitsregel im SQL steht,
warum ein SVG abgelehnt statt bereinigt wird, wie der Materializer arbeitet --, gehört nach
[`docs/architektur.md`](architektur.md). Nicht, weil es unwichtig wäre, sondern
weil eine Betreiberin, die in zwanzig Minuten installieren will, es nicht lesen muss.

Die Prüfung dafür ist einfach: **Braucht man diesen Absatz, um die Installation zum Laufen zu
bringen oder um zu verstehen, was das Produkt kann?** Wenn nein, gehört er nach `docs/`.

## Was der Checker nicht kann

Er liest keine Sätze. Diese Stellen sind von Hand nachzuziehen, wenn sie betroffen sind:

- **Beispielausgaben.** Die Healthcheck-Antwort in Schritt 4 ist die echte Antwort eines
  laufenden Servers. Ändert sich das JSON, ist sie neu zu erzeugen, nicht zu erraten.
- **Startreihenfolge.** Wird die Kette in `migrate` länger oder kürzer, gehört das in Schritt 4
  und in die Tabelle unter „Aktualisieren".
- **Begründungen.** Warum `-u postgres` bei `pg_dump` nötig ist, warum es ohne HTTPS keine
  Passkeys gibt — solche Sätze werden falsch, wenn sich die Mechanik darunter ändert.
- **Die Symptomtabelle.** Eine neue Fehlermeldung, die eine Betreiberin sehen kann, gehört
  dort hinein. Sie ist der Ort, an dem jemand nachschlägt, der gerade festhängt.

## Vor dem Commit

Wurde eine der folgenden Sachen angefasst, ist die README mitzuziehen — der Checker fängt nur
die mechanische Hälfte:

| Geändert                                   | Nachziehen                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `process.env.GW_*` hinzugefügt/entfernt    | `.env.example`, Konfigurationstabelle, ggf. `INTERNAL`                                         |
| `compose.yaml` (Dienst, Port, Profil, Env) | Schritte 3–4, Konfigurationstabelle                                                            |
| `scripts/cli.mjs`                          | Schritt 5, alle Stellen mit `cli.mjs`                                                          |
| `package.json`-Scripts                     | Tabelle unter „Arbeitsweisen"                                                                  |
| Neue Migration                             | „Aktualisieren"; bei Datenvoraussetzung siehe [`install-upgrade`](installation-und-upgrade.md) |
| Datenbankrollen, Geheimnisse, Volumes      | `docs/architektur.md`, der Abschnitt „Sichern“, und der CI-Job `On-Prem-Stack`                 |
| `/api/health`                              | Abschnitt „Healthcheck", Beispielausgabe, Symptomtabelle                                       |
| Eine Betreiber-sichtbare Fehlermeldung     | Symptomtabelle                                                                                 |

Dann:

```bash
pnpm check:docs && pnpm format:check
```
