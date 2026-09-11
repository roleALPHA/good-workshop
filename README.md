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
und gibt dessen Login-Link ebenfalls auf stdout aus. Das ist ein unterstützter Weg und
kein Notbehelf — aber eine bewusste Entscheidung, kein Standardwert: wer
`docker logs` lesen kann, kann sich damit für **jede** Adresse einen Anmeldelink
ausstellen lassen. Die Anwendung sagt das beim Start noch einmal.

## Installation (On-Premise)

### Voraussetzungen

- Docker mit Compose v2 (`docker compose version`), amd64 oder arm64
- Ein Hostname, der öffentlich auf diesen Server auflöst, und die Ports 80 und 443 frei —
  beides braucht Let's Encrypt für die Zertifikatsausstellung
- Kein Postgres nötig: die Datenbank läuft im Stack und ist von außen nicht erreichbar

### 1. Dateien holen

Gebraucht werden `compose.yaml`, `Caddyfile` und eine `.env`. Am einfachsten über das
Repository:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

### 2. Image bereitstellen

**Es gibt noch kein veröffentlichtes Release.** Bis der erste `v*`-Tag steht, gibt es auf
`ghcr.io` nichts zu ziehen — das Image wird selbst gebaut und bekommt den Tag, den
`compose.yaml` erwartet:

```bash
docker build -t ghcr.io/rolealpha/good-workshop:local .
```

In der `.env` dann `GW_VERSION=local`. Sobald es Releases gibt, entfällt dieser Schritt
und `GW_VERSION` trägt den Release-Tag.

### 3. `.env` ausfüllen

Vier Werte sind Pflicht; ohne sie startet der Stack nicht und sagt welcher fehlt:

```bash
GW_APP_URL=https://workshop.example.com   # muss exakt der Adresse entsprechen, unter der die App erreichbar ist
GW_HOSTNAME=workshop.example.com          # der Name im Zertifikat (Profil `tls`)
GW_MAIL_TRANSPORT=smtp                    # smtp | console | none -- siehe oben
GW_VERSION=local                          # oder der Release-Tag
```

Bei `GW_MAIL_TRANSPORT=smtp` zusätzlich `SMTP_URL` und `SMTP_FROM`. Enthält die
`SMTP_URL` ein Passwort, gehört sie besser in ein Docker Secret: Datei anlegen,
`SMTP_URL_FILE=/run/secrets/smtp_url` setzen. Eine Environment-Variable steht in
`docker inspect`, in `/proc/<pid>/environ` und in jedem Core-Dump.

**Den Hostnamen jetzt festlegen.** `GW_RP_ID` leitet sich daraus ab, und eine spätere
Änderung macht jeden registrierten Passkey ungültig — siehe oben.

### 4. Starten

```bash
docker compose --profile tls up -d
```

Der Reihe nach: `db` startet, `migrate` legt Rollen an, wandert die Migrationen durch und
provisioniert die 15 eingebauten Modultypen, `app` startet erst, wenn `migrate` sauber
durch ist, dann nimmt `caddy` 80 und 443 und holt das Zertifikat.

Läuft es, meldet sich der Healthcheck:

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

Ein `503` ist kein Absturz, sondern die ehrliche Antwort „dieser Container kann nicht
ausliefern" — `checks` sagt, ob es an der Datenbank oder am Migrationsstand liegt.

### 5. Den ersten Admin anlegen

Ohne Admin gibt es keinen Weg in die Oberfläche. Zwei Wege:

**Über die CLI** — funktioniert immer, auch ohne Mailversand:

```bash
docker compose exec app node scripts/cli.mjs admin create --email du@example.com
```

Der Befehl druckt einen einmaligen Anmeldelink. Danach geht alles Weitere in der
Oberfläche: Mitglieder einladen, Rollen setzen, Branding, Token.

**Oder beim allerersten Start automatisch:** `GW_BOOTSTRAP_ADMIN_EMAIL=du@example.com` in
die `.env`, bevor der Stack das erste Mal hochkommt. Der Link steht dann in
`docker compose logs migrate`, ist eine Stunde gültig und wird genau einmal gedruckt — bei
späteren Starts passiert nichts mehr, auch wenn die Variable stehen bleibt.

### Ohne HTTPS betreiben

Möglich, mit drei Konsequenzen, die man kennen sollte: **keine Passkeys** (WebAuthn läuft
außerhalb von `localhost` nicht über `http://`), das Session-Cookie trägt kein `Secure` und
reist im Klartext, und Anmeldelinks tun das ebenfalls.

`app` bindet bewusst nur auf `127.0.0.1` — ohne den Proxy ist von außen nichts erreichbar,
auch bei falsch stehender Firewall nicht. Für einen Zugang ohne das `tls`-Profil braucht es
also einen eigenen Reverse Proxy auf dem Host oder einen SSH-Tunnel:

```bash
docker compose up -d          # ohne --profile tls
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` muss dann auf die Adresse zeigen, die der Browser tatsächlich benutzt.

### Aktualisieren

```bash
# .env: GW_VERSION auf den neuen Tag setzen
docker compose pull
docker compose --profile tls up -d
```

`migrate` läuft bei jedem Start mit und `app` wartet darauf — ein Container, der gegen ein
Schema ausliefert, das er nicht versteht, kommt damit gar nicht erst hoch.

> **Einmalig beim Upgrade auf diese Version.** Eine neue Migration verlangt, dass Modul und
> Cluster zu dem Workshop gehören, auf dessen Tag sie liegen. Bestehende Installationen
> können Zeilen haben, bei denen das nicht stimmt; die Migration bricht dann ab. Vorher
> prüfen:
>
> ```sql
> select m.id from module m join workshop_day d on d.id = m.day_id
> where d.workshop_id <> m.workshop_id;
> ```
>
> Leeres Ergebnis heißt: der Lauf geht durch. Sonst ist erst zu klären, wohin diese Blöcke
> gehören — das ist eine inhaltliche Frage, keine technische.

### Sichern

Die Datenbank ist die vollständige Akte, Logos eingeschlossen — sie liegen als Zeile, nicht
im Dateisystem. Ein `pg_dump` genügt also:

```bash
docker compose exec -u postgres db pg_dump goodworkshop > goodworkshop-$(date +%F).sql
```

Das `-u postgres` ist nötig: die Rollen haben keine Passwörter und authentifizieren sich
über den Unix-Socket per Peer-Auth, also muss der Prozess im Container dem Rollennamen
entsprechen.

### Konfiguration

| Variable                                  | Pflicht    | Bedeutung                                                                                                                                              |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GW_APP_URL`                              | ja         | Adresse, unter der die App erreichbar ist. Leitet Anmeldelinks und die WebAuthn-Origin ab.                                                             |
| `GW_HOSTNAME`                             | für `tls`  | Name im Zertifikat. Wird an Caddy durchgereicht.                                                                                                       |
| `GW_MAIL_TRANSPORT`                       | ja         | `smtp`, `console` oder `none`.                                                                                                                         |
| `GW_VERSION`                              | ja         | Image-Tag. Bewusst ohne Standardwert — ein beweglicher Tag ist kein Deployment.                                                                        |
| `SMTP_URL` / `SMTP_URL_FILE`              | bei `smtp` | Relay-URL, direkt oder aus einer Datei (Docker Secret).                                                                                                |
| `SMTP_FROM`                               | bei `smtp` | Absenderadresse.                                                                                                                                       |
| `GW_RP_ID`                                | nein       | WebAuthn Relying Party ID. Leer = Host aus `GW_APP_URL`. Nachträgliche Änderung entwertet alle Passkeys.                                               |
| `GW_BOOTSTRAP_ADMIN_EMAIL`                | nein       | Legt beim allerersten Start einen Admin an und druckt dessen Link.                                                                                     |
| `GW_OPS_TOKEN`                            | nein       | Macht `/api/health` mit Header `x-ops-token` ausführlich (Version, Migrationsstand, Treiberfehler). Ohne ihn bleibt der öffentliche Endpunkt wortkarg. |
| `GW_TRUSTED_PROXIES`                      | nein       | Zahl der Proxys davor (Standard 1). Nur für Drosselung und Logs, nie für eine Berechtigung.                                                            |
| `GW_SESSION_IDLE_DAYS`                    | nein       | Nach wie vielen Tagen ohne Nutzung eine Session verfällt (Standard 14).                                                                                |
| `GW_PORT`, `GW_COLLAB_PORT`               | nein       | Ports auf `127.0.0.1`, falls die Standardwerte belegt sind.                                                                                            |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL` | nein       | Nur nötig, wenn der Kollaborations-Dienst nicht unter `/collab` auf demselben Host liegt.                                                              |

### Wenn es nicht läuft

| Symptom                                              | Ursache                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GW_APP_URL muss gesetzt sein` beim `up`             | Pflichtwert fehlt in der `.env`. Die Meldung nennt ihn.                                                                                                            |
| Caddy startet nicht, „GW_HOSTNAME muss gesetzt sein" | `tls`-Profil ohne Hostnamen.                                                                                                                                       |
| Zertifikat wird nicht ausgestellt                    | Hostname löst nicht auf diesen Server auf, oder 80/443 sind belegt.                                                                                                |
| `/api/health` meldet 503 mit `database`              | Datenbank nicht erreichbar oder noch im Hochlauf.                                                                                                                  |
| `/api/health` meldet 503 mit `migrations`            | `migrate` ist nicht durchgelaufen: `docker compose logs migrate`.                                                                                                  |
| Kein Anmeldelink im Postfach                         | `GW_MAIL_TRANSPORT` prüfen. Bei `console` steht er in `docker compose logs app`.                                                                                   |
| Anmeldung klappt, Passkey-Angebot fehlt              | Kein HTTPS — erwartetes Verhalten, siehe oben.                                                                                                                     |
| Editor zeigt dauerhaft „offline"                     | Der Kollaborations-Dienst ist nicht erreichbar oder `GW_APP_URL` passt nicht zur Adresse im Browser: der Socket weist fremde Herkunft ab und schreibt das ins Log. |

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

Für eine Installation siehe oben — `compose.yaml` bringt Datenbank, Migration, Anwendung
und Proxy mit. Das Image allein baut man so:

```bash
docker build -t goodworkshop .
```

Ohne Datenbank startet es zwar, liefert aber nichts aus und sagt das: `/api/health`
antwortet mit 503 und nennt `database` als Ursache.

Das Image ist multi-stage gebaut, läuft als non-root `node`, lädt rund 70 MB herunter
(entpackt etwa 316 MB) und hat einen `HEALTHCHECK` auf `/api/health`, der auch meldet,
welcher Commit läuft. Kein Secret steckt in einem Layer — alles, was zur
Laufzeit gebraucht wird (`DATABASE_URL`, `GW_APP_URL`, `SMTP_URL`, …), kommt als
Environment-Variable beim Start. Ein `AUTH_SECRET` gibt es nicht: Sessions sind Zeilen
in Postgres mit einem eigenen Zufallsgeheimnis je Session, keine signierten Token — es
gibt also keinen Signaturschlüssel zu setzen.

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

Ist kein Mailversand eingerichtet (`GW_MAIL_TRANSPORT=console`, für On-Premise ohne
Relay), zeigt die Oberfläche den Link an, statt zu behaupten, er sei verschickt. Gehört
die Adresse schon einem aktiven Mitglied, wird kein Link gezeigt: für jemanden mit Konto
wäre das keine Einladung, sondern dessen Anmeldung. Wer ihn öffnet, ist als die eingeladene Person angemeldet — das steht dabei.

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

Der Endpunkt steht hinter dem Catch-all des Proxys, antwortet also dem offenen Internet.
Deshalb sagt er von sich aus nur, ob es geht und welche Prüfung gescheitert ist — nicht,
welcher Commit läuft, welche Migrationen fehlen oder was der Datenbanktreiber gemeldet hat.
Das alles braucht eine Betreiberin, nicht ein Fremder: mit gesetztem `GW_OPS_TOKEN` und dem
Header `x-ops-token` kommt die ausführliche Fassung.

```bash
curl -fsS -H "x-ops-token: $GW_OPS_TOKEN" https://workshop.example.com/api/health
```

## Architektur in drei Sätzen

Ein **Modul** (Typ, Dauer, typspezifische Attribute als JSON) hängt an einem **Cluster**
oder direkt an einem **Workshoptag**; ein Tag gehört zu einem **Workshop**. Startzeiten
werden nie gespeichert, sondern aus der Tagesstartzeit und den Dauern berechnet — mit
optionalen gepinnten Blöcken, deren Überschneidungen angezeigt und nie automatisch
aufgelöst werden. Mandantentrennung liegt in Postgres Row Level Security, damit die
Community-Edition (ein Default-Tenant) und die Cloud-Edition denselben Code fahren.

## Lizenz

[AGPL-3.0-only](LICENSE)
