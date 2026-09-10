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

Ein Token legst du unter **Token** in deinen Einstellungen an. Es wird einmal angezeigt und
nur als Hash gespeichert; im Client trägst du es als `Authorization: Bearer gwp_…` gegen
`https://<host>/api/mcp` ein. Ein Token handelt als die Person, die es angelegt hat — es
kann nie mehr, als diese Person selbst darf.

Für Installationen ohne Browserzugang geht es auch von der Kommandozeile:

```bash
docker compose exec app node scripts/cli.mjs token create \
  --email du@example.com --name "Claude" --scopes workshops:read,workshops:write,module_types:read
```

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

## Bibliothek

Workshops liegen in Ordnern und tragen Tags; beides ist optional. Die Liste ist seitenweise
und wird serverseitig gefiltert — Ordner, Tag und Suche stehen in der URL, also ist eine
gefilterte Bibliothek ein Link, den man weitergeben und wiederfinden kann.

Die Sichtbarkeitsregel steht dabei im SQL und nicht als Filter danach. Das ist der Grund,
warum Seiten überhaupt funktionieren: filtert man erst in der Anwendung, liefert eine Seite
von zwanzig Zeilen drei sichtbare, `LIMIT` gibt zu kurze Seiten zurück und `OFFSET`
überspringt Zeilen, die nie jemand gesehen hat. Geblättert wird über einen Schlüssel, nicht
über `OFFSET`: wer nebenbei einen Workshop bearbeitet, schiebt ihn nach oben, und mit
`OFFSET` bekäme man dieselbe Zeile zweimal oder eine gar nicht.

Gesucht wird mit `ILIKE` über den Titel, nicht mit einem tsvector. Bei ein paar tausend
Zeilen kostet das nichts, spart eine Migration — und „strat" findet weiterhin „Strategie",
was gestemmte Indizes ohne Präfixabfrage nicht tun.

Tags entstehen beim Tippen. Ein eigener Verwaltungsbildschirm, den man vorher besuchen muss,
ist ein Schritt, den niemand will, und ein Bildschirm, den niemand pflegt; ein Tag, auf den
nichts mehr zeigt, verschwindet von selbst.

## Mitglieder und Zugriff

Ein Tenant-Admin lädt unter **Mitglieder** jemanden per E-Mail-Adresse ein. Die Mitgliedschaft
beginnt als „eingeladen"; erst das Öffnen des Anmeldelinks aktiviert sie. Ein Admin kann
niemanden per Beschluss aktivieren — sonst könnte er eine fremde Adresse einladen und das
daraus entstehende Konto übernehmen.

Ist kein Mailversand eingerichtet (`GW_MAIL_TRANSPORT=console`, der Standard für
On-Premise ohne Relay), zeigt die Oberfläche den Link an, statt zu behaupten, er sei
verschickt. Wer ihn öffnet, ist als die eingeladene Person angemeldet — das steht dabei.

Der letzte aktive Admin lässt sich weder degradieren noch abschalten. Ein Tenant ohne
Admin ist nur noch über eine Shell auf dem Server zu reparieren.

Zugriff auf einen einzelnen Workshop vergibt die Eigentümerin unter **Zugriff**:
Bearbeiten oder Lesen, pro Mitglied. Ausgewählt wird aus dem Tenant, nie über eine
E-Mail-Adresse — eine Adresse ist eine Identität, und Identitäten sind global; einladen
über die Adresse würde stillschweigend Zugriff über eine Mandantengrenze hinweg
vergeben. Wer keinen Zugriff hat, bekommt 404 statt 403: ein Workshop, den man nicht
sehen darf, soll nicht bestätigen, dass es ihn gibt.

## Branding

Ein Tenant-Admin setzt unter **Branding** ein Logo (SVG, PNG oder WebP, höchstens 256 KB)
und **einen** Hex-Wert als Akzentfarbe. Der Server nimmt Farbton und Buntheit daraus und
erzeugt die Abstufungen für hell und dunkel selbst — die Helligkeitsstufen bleiben fest.
Genau das ist der Trick: OKLCH-Helligkeit ist wahrnehmungsbezogen, also lässt sich die
Markenfarbe austauschen, ohne den Kontrast jeder Fläche neu zu prüfen. Eine Farbe, aus der
keine lesbare Rampe wird, wird beim Speichern abgelehnt, nicht später als unlesbare Seite
entdeckt.

Branding fasst `--brand-*` an und **nie** `.cat-*`. Modultyp-Farben sind Semantik („das ist
eine Pause"), keine Dekoration; ein Corporate-Blau über alle Modultypen macht die Agenda
unlesbar. Diese Farben ändert man einzeln beim jeweiligen Modultyp.

Ein hochgeladenes SVG wird **abgelehnt statt bereinigt**, wenn es Skripte, `<style>`,
Event-Handler oder externe Verweise enthält. Markup mit Mustern zu säubern ist der Weg, auf
dem Sanitizer umgangen werden: ein knapper Fehltreffer hinterlässt eine Datei, die die
Prüfung bestanden hat und trotzdem läuft. Zusätzlich wird das Logo ausschließlich in ein
`<img>` ausgeliefert — darin führen Browser kein Skript aus.

Die Fußzeile bleibt unverändert `GoodWorkshop · powered by roleALPHA`.

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

## Healthcheck

`/api/health` prüft die Datenbankverbindung **und** ob die Migrationen, die dieses Image
erwartet, auch angewendet sind. Ein Rolling Deploy mit ausstehender Migration fällt damit
am Healthcheck durch, statt Seiten gegen ein Schema auszuliefern, das er nicht versteht.

Eine Datenbank, die _voraus_ ist, wird gemeldet und toleriert: beim Rolling Deploy läuft die
Migration zuerst, und die alten Container liefern weiter aus, bis sie ersetzt sind. Das ist
der vorgesehene Zustand — daran zu scheitern hieße, dass jedes Deployment die Installation
auf dem Weg kurz abschaltet.

Ohne Datenbank antwortet der Endpunkt mit 503. Das ist beabsichtigt: der Container kann die
Anwendung dann nicht ausliefern. Die Testumgebung wartet deshalb auf die Startseite und
nicht auf diesen Endpunkt — „lauscht der Server" und „kann dieser Container die Anwendung
ausliefern" sind zwei verschiedene Fragen.

## Architektur in drei Sätzen

Ein **Modul** (Typ, Dauer, typspezifische Attribute als JSON) hängt an einem **Cluster**
oder direkt an einem **Workshoptag**; ein Tag gehört zu einem **Workshop**. Startzeiten
werden nie gespeichert, sondern aus der Tagesstartzeit und den Dauern berechnet — mit
optionalen gepinnten Blöcken, deren Überschneidungen angezeigt und nie automatisch
aufgelöst werden. Mandantentrennung liegt in Postgres Row Level Security, damit die
Community-Edition (ein Default-Tenant) und die Cloud-Edition denselben Code fahren.

## Lizenz

[AGPL-3.0-only](LICENSE)
