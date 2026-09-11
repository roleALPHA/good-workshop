# Architektur und Entwurfsentscheidungen

Die README beschreibt, was GoodWorkshop kann und wie man es installiert. Hier steht, warum
es innen so gebaut ist — für alle, die daran arbeiten oder eine Installation tiefer
verstehen wollen.

## In drei Sätzen

Next.js 15 mit React 19 und PostgreSQL, eine Anwendung mit Mandantentrennung, die in
jedem Fall durch Row Level Security in der Datenbank durchgesetzt wird. Der Editor
arbeitet auf einem CRDT (Yjs), die relationalen Tabellen bleiben die maßgebliche Akte.
Ausgeliefert wird ein einziges Docker-Image plus Postgres.

## Mandantentrennung

Jede Tabelle trägt `tenant_id` und steht unter `FORCE ROW LEVEL SECURITY`; die Policies
gelten `to gw_app` und vergleichen gegen `app.current_tenant()`. Die Anwendung setzt diesen
Wert in jeder Transaktion über `withTenant()` — ein ESLint-Guardrail verbietet den Import
des rohen `db`-Handles außerhalb von `src/server/db`, damit keine Query daran vorbeikommt.

`FORCE` ist dabei das Entscheidende: Der Eigentümer einer Tabelle umgeht seine eigenen
Policies, solange sie nicht erzwungen sind — und `gw_owner` besitzt jede Tabelle hier, weil
diese Rolle die Migrationen fährt. `scripts/migrate.mjs` setzt `FORCE` deshalb bei jedem
Lauf auf jede Tabelle mit Policy, damit eine Tabelle, die nächstes Jahr dazukommt, es nicht
still verpasst.

Die Identitätstabellen (`identity`, `webauthn_credential`, `email_token`, `auth_session`, …)
sind für `gw_app` gesperrt. Wer sie braucht, tritt ausdrücklich über `set local role gw_auth`
ein; weil `gw_app` NOINHERIT ist, endet das Recht mit der Transaktion. Ein ORM-Fehler
außerhalb des Auth-Moduls kann deshalb kein Anmeldematerial lesen.

## Datenbankrollen

| Rolle      | Wofür                           | Besonderheit                          |
| ---------- | ------------------------------- | ------------------------------------- |
| `postgres` | Rollen anlegen, Schema-Eigentum | nur im `migrate`-Container            |
| `gw_owner` | Migrationen                     | besitzt das Schema, NOINHERIT         |
| `gw_app`   | die Anwendung                   | RLS erzwungen, NOBYPASSRLS, NOINHERIT |
| `gw_auth`  | nur der Anmeldepfad             | kein Login, wird betreten             |
| `gw_ops`   | Wartung und Tests               | BYPASSRLS                             |

Rollen anzulegen ist eine Betreiberhandlung und keine Migration — deshalb macht das
`db-bootstrap.mjs` als Superuser, und `gw_owner` hat bewusst kein Recht dazu.

Jede Login-Rolle bekommt beim ersten Start ein eigenes zufälliges Passwort in eine Datei
(`scripts/db-secrets.mjs`), und jeder Dienst erhält nur die Dateien, die er braucht: der
Web-Container kennt ausschließlich `gw_app`. Die ausführliche Begründung, und warum der
frühere Weg über Peer-Authentifizierung nicht funktionieren konnte, steht als Kommentar in
`compose.yaml` und in `scripts/db-secrets.mjs`.

## Live-Kollaboration

Mehrere Personen bearbeiten denselben Workshoptag gleichzeitig; die Zusammenführung
übernimmt ein CRDT (Yjs), sodass gleichzeitige Änderungen an verschiedenen Blöcken — und an
verschiedenen Feldern desselben Blocks — beide überleben.

**Yjs ist die Bearbeitungsschicht, Postgres bleibt die Akte.** Export, Druck und jede
Leseabfrage lesen die relationalen Tabellen und wissen nichts von einem CRDT. Ein
Materializer schreibt den Stand zurück; `collab_state.materialized_up_to` sagt, wie weit die
Tabellen hinterherhängen.

**Ein Tag hat genau einen Schreibweg.** Der Materializer schreibt das Dokument in die
Tabellen und löscht dort alles, was das Dokument nicht kennt — anders wären Löschungen nicht
übertragbar. Damit ist jeder zweite Schreibweg auf denselben Tag ein stiller Datenverlust:
geschrieben wird, ein paar Sekunden später wieder gelöscht, und nur dann, wenn zufällig
jemand den Tag offen hat. Deshalb geht _alles_, was einen Tag verändert — Editor wie MCP —,
durch den Raum. Der Raum füllt sein Dokument beim Öffnen aus der Datenbank, damit auch ein
Schreibvorgang in einen Tag, den nie jemand geöffnet hat, vom echten Stand ausgeht.

Der Kollaborations-Dienst läuft als **eigener Prozess im selben Image** auf Port 3001 — Next
kann aus einem Route-Handler kein WebSocket-Upgrade bedienen. Ein zweites Image wäre der
bequemere Weg gewesen und hätte die Zusage „ein Image plus Postgres" gebrochen. Der Proxy
leitet `/collab` dorthin; authentifiziert wird mit demselben Sitzungs-Cookie, das auch den
Editor öffnet.

## Die Bibliothek

Die Sichtbarkeitsregel steht im SQL und nicht als Filter danach. Das ist der Grund, warum
Seiten überhaupt funktionieren: filtert man erst in der Anwendung, liefert eine Seite von
zwanzig Zeilen drei sichtbare, `LIMIT` gibt zu kurze Seiten zurück und `OFFSET` überspringt
Zeilen, die nie jemand gesehen hat.

Geblättert wird über einen Schlüssel, nicht über `OFFSET`: wer nebenbei einen Workshop
bearbeitet, schiebt ihn nach oben, und mit `OFFSET` bekäme man dieselbe Zeile zweimal oder
eine gar nicht.

Gesucht wird mit `ILIKE` über den Titel, nicht mit einem tsvector. Bei ein paar tausend
Zeilen kostet das nichts, spart eine Migration — und „strat" findet weiterhin „Strategie",
was gestemmte Indizes ohne Präfixabfrage nicht tun.

Tags entstehen beim Tippen. Ein eigener Verwaltungsbildschirm, den man vorher besuchen muss,
ist ein Schritt, den niemand will, und ein Bildschirm, den niemand pflegt; ein Tag, auf den
nichts mehr zeigt, verschwindet von selbst.

## Zugriff und Einladungen

Eine Mitgliedschaft beginnt als „eingeladen"; erst das Öffnen des Anmeldelinks aktiviert
sie. Ein Admin kann niemanden per Beschluss aktivieren — sonst könnte er eine fremde Adresse
einladen und das daraus entstehende Konto übernehmen.

Zugriff auf einen einzelnen Workshop wird aus dem Tenant heraus vergeben, nie über eine
E-Mail-Adresse: eine Adresse ist eine Identität, und Identitäten sind global; einladen über
die Adresse würde stillschweigend Zugriff über eine Mandantengrenze hinweg vergeben.

Wer keinen Zugriff hat, bekommt 404 statt 403: ein Workshop, den man nicht sehen darf, soll
nicht bestätigen, dass es ihn gibt.

Der letzte aktive Admin lässt sich weder degradieren noch abschalten. Ein Tenant ohne Admin
ist nur noch über eine Shell auf dem Server zu reparieren.

## Branding

Der Server nimmt Farbton und Buntheit aus **einem** Hex-Wert und erzeugt die Abstufungen für
hell und dunkel selbst; die Helligkeitsstufen bleiben fest. Genau das ist der Trick:
OKLCH-Helligkeit ist wahrnehmungsbezogen, also lässt sich die Markenfarbe austauschen, ohne
den Kontrast jeder Fläche neu zu prüfen. Eine Farbe, aus der keine lesbare Rampe wird, wird
beim Speichern abgelehnt, nicht später als unlesbare Seite entdeckt.

Branding fasst `--brand-*` an und **nie** `.cat-*`. Modultyp-Farben sind Semantik („das ist
eine Pause"), keine Dekoration; ein Corporate-Blau über alle Modultypen macht die Agenda
unlesbar.

Ein hochgeladenes SVG wird **abgelehnt statt bereinigt**, wenn es Skripte, `<style>`,
Event-Handler oder externe Verweise enthält. Markup mit Mustern zu säubern ist der Weg, auf
dem Sanitizer umgangen werden: ein knapper Fehltreffer hinterlässt eine Datei, die die
Prüfung bestanden hat und trotzdem läuft. Zusätzlich wird das Logo ausschließlich in ein
`<img>` ausgeliefert — darin führen Browser kein Skript aus.

## MCP-Entwurf

Das wichtigste Werkzeug ist `apply_agenda`: es schreibt einen kompletten Tagesablauf in einem
Zug. Zwanzig einzelne, voneinander abhängige Aufrufe sind der Punkt, an dem Modelle
auseinanderfallen — sie verlieren Ids, driften in der Reihenfolge und wenden bei einem Fehler
die Hälfte an. Ein deklarativer Schreibvorgang ist ganz oder gar nicht.

Jede Änderung nimmt optional `expectedVersion`. Ohne das überschreibt ein Client mit fünf
Minuten altem Stand stillschweigend die Live-Bearbeitung — gemeldet wird das anschließend als
„die KI hat meinen Workshop gelöscht".

Es gibt bewusst **keinen** Bereich für Nutzerverwaltung: ein MCP-Client darf niemals Nutzer
einladen oder zu Admins machen.

**Ein Modell ist ein Kollaborator, kein zweiter Schreibweg.** Schreibende Werkzeuge gehen
durch denselben Raum wie ein Browser: das Modell taucht in der Anwesenheitsliste auf, sein
Block erscheint sofort bei allen, die den Tag offen haben, und beide Änderungen führen
zusammen statt sich zu überschreiben. Läuft der Kollaborations-Dienst nicht, schlägt der
Aufruf mit einer benannten Fehlermeldung fehl, statt Daten zu schreiben, die kurz darauf
wieder verschwinden.

## Das Docker-Image

Multi-stage gebaut, läuft als non-root `node`, lädt rund 70 MB herunter (entpackt etwa
316 MB) und hat einen `HEALTHCHECK` auf `/api/health`, der auch meldet, welcher Commit läuft.

Kein Secret steckt in einem Layer — alles, was zur Laufzeit gebraucht wird, kommt beim Start
dazu. Ein `AUTH_SECRET` gibt es nicht: Sessions sind Zeilen in Postgres mit einem eigenen
Zufallsgeheimnis je Session, keine signierten Token — es gibt also keinen Signaturschlüssel
zu setzen.

Releases entstehen aus einem Git-Tag `v*` und landen als Multi-Arch-Image (`linux/amd64` +
`linux/arm64`, jeweils nativ gebaut) inklusive SBOM und Provenance auf `ghcr.io`.

## Der Healthcheck

`/api/health` prüft die Datenbankverbindung **und** ob die Migrationen, die dieses Image
erwartet, auch angewendet sind. Ein Rolling Deploy mit ausstehender Migration fällt damit am
Healthcheck durch, statt Seiten gegen ein Schema auszuliefern, das er nicht versteht.

Eine Datenbank, die _voraus_ ist, wird gemeldet und toleriert: beim Rolling Deploy läuft die
Migration zuerst, und die alten Container liefern weiter aus, bis sie ersetzt sind. Daran zu
scheitern hieße, dass jedes Deployment die Installation kurz abschaltet.

Ohne Datenbank antwortet der Endpunkt mit 503 — der Container kann die Anwendung dann nicht
ausliefern. Die Testumgebung wartet deshalb auf die Startseite und nicht auf diesen Endpunkt:
„lauscht der Server" und „kann dieser Container die Anwendung ausliefern" sind zwei
verschiedene Fragen.

Der Endpunkt steht hinter dem Catch-all des Proxys, antwortet also dem offenen Internet.
Deshalb sagt er von sich aus nur, ob er gesund ist und welche Prüfung gescheitert ist. Erst
mit `GW_OPS_TOKEN` und dem Header `x-ops-token` nennt er Version, Migrationsstand und den
Treiberfehler im Klartext.
