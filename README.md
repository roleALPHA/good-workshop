# GoodWorkshop

Open-Source-Workshopplanung. Selbst gehostet, MCP-fähig.

Eine freie Alternative zu SessionLab: Agenden aus Modulen, Clustern und Workshoptagen
bauen, per Drag & Drop umsortieren, als Markdown exportieren — und die Daten bleiben
auf der eigenen Maschine.

> **Status: in Entwicklung.** Meilenstein 1 (Editor-Kern) ist im Bau. Noch kein Release.

## Zwei Dinge, die bei einer On-Prem-Installation zuerst schiefgehen

**1. Passkeys brauchen HTTPS.** Außer auf `localhost` funktionieren WebAuthn-Passkeys
nicht über `http://`. Wer auf `http://192.168.1.50:3000` hostet, kann Passkeys gar nicht
nutzen. Deshalb sind E-Mail-Magic-Links ein vollwertiger eigenständiger Auth-Pfad, kein
Fallback — und das `tls`-Compose-Profil (Caddy, automatisches HTTPS) ist der empfohlene
Weg, nicht der Anhang.

**2. `GW_RP_ID` ist an den Hostnamen gebunden.** Eine Hostname-Änderung nach der
Passkey-Registrierung invalidiert _jeden_ registrierten Passkey. Vorher den Hostnamen
festlegen.

Falls weder HTTPS noch SMTP verfügbar sind: `GW_MAIL_TRANSPORT=console` druckt Magic
Links auf stdout, und `GW_BOOTSTRAP_ADMIN_EMAIL` legt beim ersten Start einen Admin an
und gibt dessen Login-Link ebenfalls auf stdout aus.

## Entwicklung

```bash
pnpm install
pnpm dev
```

| Befehl               | Zweck                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm lint`          | ESLint inkl. der Projekt-Guardrails                                 |
| `pnpm typecheck`     | `tsc --noEmit`                                                      |
| `pnpm test`          | Vitest (Unit + Komponente)                                          |
| `pnpm test:coverage` | mit Coverage-Schwellen auf `src/domain` und `src/features`          |
| `pnpm test:e2e`      | Playwright (Desktop + Pixel 5) gegen den gebauten Standalone-Server |
| `pnpm test:e2e:ui`   | dieselbe Suite im Playwright-UI-Modus                               |
| `pnpm format`        | Prettier                                                            |
| `pnpm build`         | Produktions-Build (`output: 'standalone'`)                          |

### Arbeitsweisen

Drei verbindliche Konventionen, für jeden Beitrag:

- [UI und UX](docs/konventionen-ui.md) — Mobile-first, Bearbeiten an Ort und Stelle statt in Dialogen, Farbtokens, Branding, Accessibility
- [Tests](docs/konventionen-tests.md) — Testpyramide, Mandantentrennungs-Tests, Flake-Politik
- [CI/CD](docs/konventionen-ci.md) — GitHub Actions, Docker-Build, Release nach ghcr.io

Zwei Guardrails werden von ESLint erzwungen und sind kein Stilthema:

- **Keine rohen Hex-Farben** in `src/components`, `src/features`, `src/app`. Kategoriefarben
  laufen über die `.cat-*`-OKLCH-Tokens, Akzente über `--brand-*`.
- **Kein Import des rohen `db`-Handles** außerhalb von `src/server/db`. Jede Query läuft
  durch `withTenant()`, damit `app.tenant_id` gesetzt ist — davon hängt die
  Mandantentrennung ab.

## Docker

```bash
docker build -t goodworkshop .
docker run -p 3000:3000 goodworkshop
```

Das Image ist multi-stage gebaut, läuft als non-root `node`, lädt rund 70 MB herunter
(entpackt etwa 316 MB) und hat einen `HEALTHCHECK` auf `/api/health`, der auch meldet,
welcher Commit läuft. Kein Secret steckt in einem Layer — alles, was zur
Laufzeit gebraucht wird (`DATABASE_URL`, `AUTH_SECRET`, `GW_APP_URL`, …), kommt als
Environment-Variable beim Start.

Releases entstehen aus einem Git-Tag `v*` und landen als Multi-Arch-Image
(`linux/amd64` + `linux/arm64`, jeweils nativ gebaut) inklusive SBOM und Provenance auf
`ghcr.io`.

## MCP

GoodWorkshop ist ein MCP-Server: ein LLM-Client wie Claude Desktop oder Claude Code kann
Workshops lesen und schreiben.

```bash
docker compose exec app node scripts/cli.mjs token create \
  --email du@example.com --name "Claude" --scopes workshops:read,workshops:write,module_types:read
```

Das Token wird einmal angezeigt und nur als Hash gespeichert. Im Client als
`Authorization: Bearer gwp_…` gegen `https://<host>/api/mcp` eintragen.

Das wichtigste Werkzeug ist `apply_agenda`: es schreibt einen kompletten Tagesablauf in
einem Zug. Zwanzig einzelne, voneinander abhängige Aufrufe sind der Punkt, an dem Modelle
auseinanderfallen — sie verlieren Ids, driften in der Reihenfolge und wenden bei einem
Fehler die Hälfte an. Ein deklarativer Schreibvorgang ist ganz oder gar nicht.

Jede Änderung nimmt optional `expectedVersion`. Ohne das überschreibt ein Client mit
fünf Minuten altem Stand stillschweigend die Live-Bearbeitung — gemeldet wird das
anschließend als „die KI hat meinen Workshop gelöscht".

Es gibt bewusst **keinen** Bereich für Nutzerverwaltung: ein MCP-Client darf niemals
Nutzer einladen oder zu Admins machen.

**Ein Modell ist ein Kollaborator, kein zweiter Schreibweg.** Schreibende Werkzeuge
gehen durch denselben Raum wie ein Browser: das Modell taucht in der Anwesenheitsliste
auf, sein Block erscheint sofort bei allen, die den Tag offen haben, und beide
Änderungen führen zusammen statt sich zu überschreiben. Deshalb braucht auch der
MCP-Schreibpfad den Kollaborations-Dienst — läuft er nicht, schlägt der Aufruf mit
einer benannten Fehlermeldung fehl, statt Daten zu schreiben, die kurz darauf wieder
verschwinden.

## Live-Kollaboration

Mehrere Personen können denselben Workshoptag gleichzeitig bearbeiten. Die
Zusammenführung übernimmt ein CRDT (Yjs), sodass gleichzeitige Änderungen an
verschiedenen Blöcken — und an verschiedenen Feldern desselben Blocks — beide
überleben statt sich zu überschreiben.

**Yjs ist die Bearbeitungsschicht, Postgres bleibt die Akte.** Export, Druck und jede
Leseabfrage lesen die relationalen Tabellen und wissen nichts von einem CRDT. Ein
Materializer schreibt den Stand zurück; `collab_state.materialized_up_to` sagt, wie weit
die Tabellen hinterherhängen.

**Ein Tag hat genau einen Schreibweg.** Der Materializer schreibt das Dokument in die
Tabellen und löscht dort alles, was das Dokument nicht kennt — anders wären Löschungen
nicht übertragbar. Damit ist jeder zweite Schreibweg auf denselben Tag ein stiller
Datenverlust: geschrieben wird, ein paar Sekunden später wieder gelöscht, und nur dann,
wenn zufällig jemand den Tag offen hat. Deshalb geht _alles_, was einen Tag verändert —
Editor wie MCP —, durch den Raum. Der Raum füllt sein Dokument beim Öffnen aus der
Datenbank, damit auch ein Schreibvorgang in einen Tag, den nie jemand geöffnet hat, vom
echten Stand ausgeht.

Der Kollaborations-Dienst läuft als **eigener Prozess im selben Image** auf Port 3001 —
Next kann aus einem Route-Handler kein WebSocket-Upgrade bedienen. Ein zweites Image
wäre der bequemere Weg gewesen und hätte die Zusage „ein Image plus Postgres" gebrochen.
Der Proxy leitet `/collab` dorthin; authentifiziert wird mit demselben Sitzungs-Cookie,
das auch den Editor öffnet.

## Architektur in drei Sätzen

Ein **Modul** (Typ, Dauer, typspezifische Attribute als JSON) hängt an einem **Cluster**
oder direkt an einem **Workshoptag**; ein Tag gehört zu einem **Workshop**. Startzeiten
werden nie gespeichert, sondern aus der Tagesstartzeit und den Dauern berechnet — mit
optionalen gepinnten Blöcken, deren Überschneidungen angezeigt und nie automatisch
aufgelöst werden. Mandantentrennung liegt in Postgres Row Level Security, damit die
Community-Edition (ein Default-Tenant) und die Cloud-Edition denselben Code fahren.

## Lizenz

[AGPL-3.0-only](LICENSE)
