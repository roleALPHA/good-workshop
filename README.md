# GoodWorkshop

Open-Source-Workshopplanung. Selbst gehostet, MCP-fähig.

Agenden aus Modulen, Clustern und Workshoptagen bauen, per Drag & Drop umsortieren, als
Markdown exportieren — und die Daten bleiben auf der eigenen Maschine.

> **Status: in Entwicklung.** Meilenstein 1 (Editor-Kern) ist im Bau. Noch kein Release.

## Was GoodWorkshop kann

**Agenden bauen.** Ein Workshop besteht aus Tagen, ein Tag aus Modulen — Übungen, Inputs,
Pausen —, die sich zu Clustern gruppieren lassen. Umsortiert wird per Drag & Drop; Zeiten
rechnen sich mit. Es gibt 15 eingebaute Modultypen, und eigene lassen sich anlegen.

**Zu zweit am selben Tag arbeiten.** Mehrere Personen können denselben Workshoptag
gleichzeitig bearbeiten. Wer gerade dabei ist, steht in der Anwesenheitsliste; Änderungen
erscheinen sofort bei allen und führen zusammen, statt sich zu überschreiben.

**Wiederfinden.** Workshops liegen in Ordnern und tragen Tags, beides optional. Ordner, Tag
und Suche stehen in der URL — eine gefilterte Bibliothek ist also ein Link, den man
weitergeben und wiederfinden kann. Tags entstehen beim Tippen; ein Tag, auf den nichts mehr
zeigt, verschwindet von selbst.

**Im Team arbeiten.** Ein Admin lädt unter **Mitglieder** per E-Mail-Adresse ein. Zugriff auf
einen einzelnen Workshop vergibt die Eigentümerin unter **Zugriff**: Bearbeiten oder Lesen,
pro Mitglied.

**Nach eigenem Aussehen.** Unter **Branding** lassen sich ein Logo und eine Akzentfarbe
setzen; die passenden Abstufungen für hell und dunkel erzeugt der Server selbst. Die
Fußzeile bleibt `GoodWorkshop · powered by roleALPHA`.

**Mit einem KI-Client verbinden.** GoodWorkshop ist ein MCP-Server: Claude Desktop, Claude
Code oder ein anderer MCP-Client kann Workshops lesen und schreiben. Ein Token legst du unter
**Token** in deinen Einstellungen an; im Client trägst du es als `Authorization: Bearer gwp_…`
gegen `https://<host>/api/mcp` ein. Ein Token handelt als die Person, die es angelegt hat —
es kann nie mehr, als diese Person selbst darf, und Nutzerverwaltung kann es gar nicht.

Wie das innen gebaut ist und warum, steht in [docs/architektur.md](docs/architektur.md).

## Mitwirken

```bash
pnpm install
pnpm db:up      # Postgres und ein Mailfänger für die Entwicklung
pnpm dev
```

| Befehl               | Zweck                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `pnpm lint`          | ESLint inkl. der Projekt-Guardrails                                      |
| `pnpm typecheck`     | `tsc --noEmit`                                                           |
| `pnpm test`          | Vitest (Unit + Komponente)                                               |
| `pnpm test:coverage` | mit Coverage-Schwellen auf `src/domain` und `src/features`               |
| `pnpm test:db`       | Mandantentrennung und Auth gegen eine echte Datenbank                    |
| `pnpm test:e2e`      | Playwright (Desktop + Pixel 5) gegen den gebauten Standalone-Server      |
| `pnpm format`        | Prettier                                                                 |
| `pnpm build`         | Produktions-Build (`output: 'standalone'`)                               |
| `pnpm check:docs`    | prüft, ob README, `.env.example` und `compose.yaml` noch zum Code passen |

Drei verbindliche Konventionen, für jeden Beitrag:

- [UI und UX](docs/konventionen-ui.md) — Mobile-first, Bearbeiten an Ort und Stelle statt in
  Dialogen, Farbtokens, Branding, Accessibility
- [Tests](docs/konventionen-tests.md) — Testpyramide, Mandantentrennungs-Tests, Flake-Politik
- [CI/CD](docs/konventionen-ci.md) — GitHub Actions, Docker-Build, Release nach `ghcr.io`

Zwei Guardrails werden von ESLint erzwungen und sind kein Stilthema:

- **Keine rohen Hex-Farben** in `src/components`, `src/features`, `src/app`.
  Kategoriefarben laufen über die `.cat-*`-OKLCH-Tokens, Akzente über `--brand-*`.
- **Kein Import des rohen `db`-Handles** außerhalb von `src/server/db`. Jede Query läuft
  durch `withTenant()`, damit `app.tenant_id` gesetzt ist — davon hängt die
  Mandantentrennung ab.

Wer an Installation, Migrationen oder der Dokumentation arbeitet, findet die Details hier:

- [Doku mitziehen](docs/doku-mitziehen.md) — was `pnpm check:docs` prüft, was er nicht kann,
  und was bei welcher Änderung nachzuziehen ist
- [Installation und Upgrade](docs/installation-und-upgrade.md) — die Startkette, die
  Vorprüfung, die Datenbankrollen und woran sich beim Ändern leicht etwas bricht

## Installation (On-Premise)

### Voraussetzungen

- Docker mit Compose v2 (`docker compose version`), amd64 oder arm64
- Ein Hostname, der öffentlich auf diesen Server auflöst, und die Ports 80 und 443 frei —
  beides braucht Let's Encrypt für die Zertifikatsausstellung
- Kein Postgres nötig: die Datenbank läuft im Stack und ist von außen nicht erreichbar
- Keine Passwörter zu vergeben: der Stack erzeugt die Datenbank-Geheimnisse beim ersten
  Start selbst

### 1. Dateien holen

Gebraucht werden `compose.yaml`, `Caddyfile` und eine `.env`:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

### 2. Image bereitstellen

**Es gibt noch kein veröffentlichtes Release.** Bis der erste `v*`-Tag steht, wird das Image
selbst gebaut und bekommt den Tag, den `compose.yaml` erwartet:

```bash
docker build -t ghcr.io/rolealpha/good-workshop:local .
```

In der `.env` dann `GW_VERSION=local`. Sobald es Releases gibt, entfällt dieser Schritt.

### 3. `.env` ausfüllen

Vier Werte sind Pflicht; ohne sie startet der Stack nicht und sagt, welcher fehlt:

```bash
GW_APP_URL=https://workshop.example.com   # die Adresse, unter der die App erreichbar ist
GW_HOSTNAME=workshop.example.com          # der Name im Zertifikat (Profil `tls`)
GW_MAIL_TRANSPORT=smtp                    # smtp | graph | console | none
GW_VERSION=local                          # oder der Release-Tag
```

Bei `GW_MAIL_TRANSPORT=smtp` zusätzlich `SMTP_URL` und `SMTP_FROM`. Enthält die `SMTP_URL`
ein Passwort, gehört sie besser in eine Datei: `SMTP_URL_FILE=/run/secrets/smtp_url`. Eine
Environment-Variable steht in `docker inspect`, in `/proc/<pid>/environ` und in jedem
Core-Dump.

**Microsoft 365 ohne SMTP:** Viele Mandanten haben SMTP AUTH abgeschaltet — dort ist
`GW_MAIL_TRANSPORT=graph` nicht der bequemere, sondern der einzige Weg. Gebraucht wird eine
App-Registrierung in Entra ID mit der **Anwendungsberechtigung** `Mail.Send` (nicht der
delegierten) samt Administratorzustimmung, dazu das Postfach, aus dem gesendet wird:

```bash
GW_MAIL_TRANSPORT=graph
GW_GRAPH_TENANT_ID=contoso.onmicrosoft.com   # oder die Verzeichnis-ID
GW_GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
GW_GRAPH_CLIENT_SECRET_FILE=/run/secrets/graph_secret
GW_GRAPH_SENDER=workshop@contoso.com
```

Fehlt einer dieser Werte, sagt die Anwendung das beim Start — nicht erst, wenn sich jemand
nicht anmelden kann. Mit `Mail.Send` allein kann Graph nichts außer senden: die Berechtigung
erlaubt kein Lesen von Postfächern.

**Den Hostnamen jetzt festlegen** — eine spätere Änderung macht jeden registrierten Passkey
ungültig. Siehe [Stolperfallen](#stolperfallen).

### 4. Starten

```bash
docker compose --profile tls up -d
```

Der Reihe nach: `secrets` erzeugt die Datenbank-Passwörter, `db` startet, `migrate` legt die
Rollen an, prüft die vorhandenen Daten, wandert die Migrationen durch und provisioniert die
Modultypen. `app` startet erst, wenn `migrate` sauber durch ist, dann nimmt `caddy` 80 und
443 und holt das Zertifikat.

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

Der Befehl druckt einen einmaligen Anmeldelink. Alles Weitere geht dann in der Oberfläche.

**Oder beim allerersten Start automatisch:** `GW_BOOTSTRAP_ADMIN_EMAIL=du@example.com` in die
`.env`, bevor der Stack das erste Mal hochkommt. Der Link steht dann in
`docker compose logs migrate`, ist eine Stunde gültig und wird genau einmal gedruckt — bei
späteren Starts passiert nichts mehr, auch wenn die Variable stehen bleibt.

### Aktualisieren

```bash
# 1. Sichern. Ein Upgrade ohne Sicherung ist eine Wette.
scripts/backup.sh vor-upgrade-$(date +%F).sql.gz

# 2. Neues Image bereitstellen, GW_VERSION in der .env darauf setzen.
#    Solange es kein Release gibt, heißt das: neu bauen statt ziehen.
git pull
docker build -t ghcr.io/rolealpha/good-workshop:local .

# 3. Hochfahren.
docker compose --profile tls up -d
```

Sobald es Releases gibt, tritt in Schritt 2 `docker compose pull` an die Stelle des Baus.

`migrate` läuft bei jedem Start mit, und `app` wartet darauf — ein Container, der gegen ein
Schema ausliefert, das er nicht versteht, kommt gar nicht erst hoch.

**Vor den Migrationen läuft eine Vorprüfung, die nur liest.** Sie stellt fest, ob die
vorhandenen Daten die Bedingungen erfüllen, die eine ausstehende Migration stellt. Bricht sie
ab, ist die Datenbank **unverändert** — es gibt nichts zurückzurollen. Die Meldung nennt die
betroffenen Zeilen, die Abfrage zum Nachsehen und die Entscheidung, die zu treffen ist.

Ohne Upgrade nachsehen, was ein Upgrade vorfände:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

> **Konkret beim Upgrade auf diese Version.** Eine Migration verlangt, dass Modul und Cluster
> zu dem Workshop gehören, auf dessen Tag sie liegen. Bestehende Installationen können Zeilen
> haben, bei denen das nicht stimmt. Die Vorprüfung findet sie und benennt sie einzeln; wohin
> sie gehören, ist eine inhaltliche Frage, die kein Skript raten sollte.

### Sichern

Die Datenbank ist die vollständige Akte, Logos eingeschlossen — sie liegen als Zeile, nicht
im Dateisystem. Ein `pg_dump` genügt also:

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

Das Skript statt der Zeile von Hand, weil die Zeile von Hand auch dann eine Datei anlegt,
wenn nichts gesichert wurde: `pg_dump` schreibt seine Fehlermeldung nach stderr und lässt
stdout leer, die Umleitung hat die Zieldatei da längst angelegt. Am Ende liegt ein leeres
Archiv mit dem richtigen Namen und dem heutigen Datum im Verzeichnis. Das Skript schreibt
erst daneben, prüft, ob der Dump bis zu seiner Abschlusszeile durchgelaufen ist, und gibt ihm
den endgültigen Namen nur dann — die Sicherung von gestern bleibt bis dahin unberührt.

Die Datenbank-Passwörter liegen in eigenen Docker-Volumes (`secret_*`) und sind **nicht** im
Dump enthalten. Für eine Wiederherstellung auf einem neuen Server braucht es sie auch nicht:
`secrets` erzeugt neue, und `migrate` setzt sie auf den Rollen.

**Eine Ausnahme: der Anwendungsschlüssel.** Er entschlüsselt die Mail-Zugangsdaten, die in der
Oberfläche hinterlegt wurden, und ist das Einzige, was Werte lesen kann, die schon in der
Datenbank stehen. Er gehört deshalb zur Sicherung dazu:

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

Geht er verloren, kommt der Dump mit **leeren** Mail-Zugangsdaten zurück. Sonst bleibt alles
heil — Workshops, Mitglieder, Branding —, und die Zugangsdaten werden einmal neu eingetragen.

### Ohne HTTPS betreiben

Möglich, mit drei Konsequenzen: **keine Passkeys**, das Session-Cookie trägt kein `Secure`
und reist im Klartext, und Anmeldelinks tun das ebenfalls.

`app` bindet bewusst nur auf `127.0.0.1` — ohne Proxy ist von außen nichts erreichbar, auch
bei falsch stehender Firewall nicht. Für einen Zugang ohne das `tls`-Profil braucht es also
einen eigenen Reverse Proxy auf dem Host oder einen SSH-Tunnel:

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` muss dann auf die Adresse zeigen, die der Browser tatsächlich benutzt.

### Konfiguration

| Variable                                                 | Pflicht     | Bedeutung                                                                                                                                               |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`                                             | ja          | Adresse, unter der die App erreichbar ist. Leitet Anmeldelinks und die WebAuthn-Origin ab.                                                              |
| `GW_HOSTNAME`                                            | für `tls`   | Name im Zertifikat. Wird an Caddy durchgereicht.                                                                                                        |
| `GW_MAIL_TRANSPORT`                                      | ja          | `smtp`, `graph`, `console` oder `none`.                                                                                                                 |
| `GW_GRAPH_TENANT_ID`                                     | bei `graph` | Microsoft-365-Mandant, als Domäne oder Verzeichnis-ID.                                                                                                  |
| `GW_GRAPH_CLIENT_ID`                                     | bei `graph` | Anwendungs-ID der App-Registrierung.                                                                                                                    |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | bei `graph` | Das Geheimnis der Registrierung, direkt oder aus einer Datei.                                                                                           |
| `GW_GRAPH_SENDER`                                        | bei `graph` | Postfach, aus dem gesendet wird.                                                                                                                        |
| `GW_VERSION`                                             | ja          | Image-Tag. Bewusst ohne Standardwert — ein beweglicher Tag ist kein Deployment.                                                                         |
| `SMTP_URL` / `SMTP_URL_FILE`                             | bei `smtp`  | Relay-URL, direkt oder aus einer Datei.                                                                                                                 |
| `SMTP_FROM`                                              | bei `smtp`  | Absenderadresse.                                                                                                                                        |
| `GW_RP_ID`                                               | nein        | WebAuthn Relying Party ID. Leer = Host aus `GW_APP_URL`. Nachträgliche Änderung entwertet alle Passkeys.                                                |
| `GW_BOOTSTRAP_ADMIN_EMAIL`                               | nein        | Legt beim allerersten Start einen Admin an und druckt dessen Link.                                                                                      |
| `GW_OPS_TOKEN`                                           | nein        | Macht `/api/health` mit Header `x-ops-token` ausführlich (Version, Migrationsstand, Treiberfehler). Ohne ihn bleibt der öffentliche Endpunkt wortkarg.  |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`                   | nein        | Verschlüsselt die in der Oberfläche hinterlegten Mail-Zugangsdaten. Leer lassen: der Stack erzeugt ihn selbst. **Gehört ins Backup** — siehe „Sichern“. |
| `GW_TRUSTED_PROXIES`                                     | nein        | Zahl der Proxys davor (Standard 1). Nur für Drosselung und Logs, nie für eine Berechtigung.                                                             |
| `GW_SESSION_IDLE_DAYS`                                   | nein        | Nach wie vielen Tagen ohne Nutzung eine Session verfällt (Standard 14).                                                                                 |
| `GW_PORT`, `GW_COLLAB_PORT`                              | nein        | Ports auf `127.0.0.1`, falls die Standardwerte belegt sind.                                                                                             |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL`                | nein        | Nur nötig, wenn der Kollaborations-Dienst nicht unter `/collab` auf demselben Host liegt.                                                               |

## Stolperfallen

**1. Passkeys brauchen HTTPS.** Außer auf `localhost` funktionieren WebAuthn-Passkeys nicht
über `http://`. Wer auf `http://192.168.1.50:3000` hostet, kann sie gar nicht nutzen. Deshalb
sind E-Mail-Anmeldelinks ein vollwertiger eigener Weg und kein Notbehelf — und das
`tls`-Profil ist der empfohlene Weg, nicht der Anhang.

**2. `GW_RP_ID` hängt am Hostnamen.** Eine Hostname-Änderung nach der Passkey-Registrierung
macht _jeden_ registrierten Passkey ungültig. Vorher festlegen.

**3. `GW_MAIL_TRANSPORT=console` ist eine bewusste Entscheidung.** Ohne HTTPS und ohne SMTP
kommt man damit trotzdem hinein: Anmeldelinks werden auf stdout gedruckt. Aber wer
`docker logs` lesen kann — die Docker-Gruppe, ein Log-Aggregator, ein an den Support
geschickter Auszug —, kann sich für **jede** Adresse einen Link ausstellen lassen. Die
Anwendung sagt das beim Start noch einmal.

### Wenn es nicht läuft

| Symptom                                              | Ursache                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GW_APP_URL muss gesetzt sein` beim `up`             | Pflichtwert fehlt in der `.env`. Die Meldung nennt ihn.                                                                                                                        |
| Caddy startet nicht, „GW_HOSTNAME muss gesetzt sein" | `tls`-Profil ohne Hostnamen.                                                                                                                                                   |
| Zertifikat wird nicht ausgestellt                    | Hostname löst nicht auf diesen Server auf, oder 80/443 sind belegt.                                                                                                            |
| `/api/health` meldet 503 mit `database`              | Datenbank nicht erreichbar oder noch im Hochlauf.                                                                                                                              |
| `/api/health` meldet 503 mit `migrations`            | `migrate` ist nicht durchgelaufen: `docker compose logs migrate`.                                                                                                              |
| `migrate` bricht mit „MIGRATION GESTOPPT" ab         | Die Vorprüfung hat Zeilen gefunden, die einer Migration im Weg stehen. Die Datenbank ist unverändert; die Meldung nennt die Zeilen und die Entscheidung.                       |
| Kein Anmeldelink im Postfach                         | `GW_MAIL_TRANSPORT` prüfen. Bei `console` steht er in `docker compose logs app`.                                                                                               |
| Graph meldet `403` oder `invalid_client`             | Die App-Registrierung hat nicht die **Anwendungsberechtigung** `Mail.Send` mit Administratorzustimmung, oder das Geheimnis ist abgelaufen. Die Meldung steht im Log von `app`. |
| Anmeldung klappt, Passkey-Angebot fehlt              | Kein HTTPS — erwartetes Verhalten, siehe oben.                                                                                                                                 |
| Editor zeigt dauerhaft „offline"                     | Der Kollaborations-Dienst ist nicht erreichbar oder `GW_APP_URL` passt nicht zur Adresse im Browser: der Socket weist fremde Herkunft ab und schreibt das ins Log.             |

## Lizenz

AGPL-3.0-only.
