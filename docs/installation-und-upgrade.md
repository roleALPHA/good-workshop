# Installation und Upgrade

Eine Installation, die nur beim ersten Mal gelingt, ist keine. Die Routine hier ist darauf
gebaut, dass **jeder Start dieselbe Kette durchläuft** — frisch wie zum hundertsten Mal.

## Die Kette

`migrate` läuft bei jedem `up` mit; `app` hängt per `service_completed_successfully` daran und
startet gar nicht erst, wenn sie scheitert.

| Schritt            | Rolle                          | Schreibt?                                              |
| ------------------ | ------------------------------ | ------------------------------------------------------ |
| `db-secrets.mjs`   | — (eigener Dienst, vor `db`)   | ein Passwort je Rolle, nur wenn es fehlt               |
| `db-bootstrap.mjs` | `postgres` (Superuser)         | Rollen, Schema-Eigentum, Rollenpasswörter. Idempotent. |
| `preflight.mjs`    | `postgres` (Superuser)         | **nein — liest nur**                                   |
| `migrate.mjs`      | `gw_owner`                     | Schema, unter Advisory Lock                            |
| `provision.mjs`    | `gw_app`, mit Mandantenkontext | Modultypen, Bootstrap-Admin. Idempotent.               |

Die Rollentrennung ist der Sinn der Sache: Rollen anlegen ist eine Betreiberhandlung und keine
Migration; die Anwendung läuft mit der unprivilegierten Rolle, für die RLS, NOINHERIT und das
`revoke` auf die Identitätstabellen gebaut sind.

## Wie sich die Container anmelden

Jede Login-Rolle hat ein eigenes, zufälliges Passwort in einer Datei. `db-secrets.mjs` erzeugt
fehlende beim Start; **jede Rolle hat ihr eigenes Volume**, und ein Dienst mountet nur die, die
er braucht:

| Dienst    | bekommt                          |
| --------- | -------------------------------- |
| `db`      | `postgres`                       |
| `migrate` | `postgres`, `gw_owner`, `gw_app` |
| `app`     | **nur** `gw_app`                 |

**Diese Trennung nicht aufweichen.** Ein gemeinsames Verzeichnis für alle Geheimnisse legt das
Superuser-Passwort in genau den Container, den ein Angreifer zuerst erreicht — und damit ist
alles hinfällig, wofür RLS und NOINHERIT gebaut sind. Prüfen lässt sich das:

```bash
docker compose exec app ls /run/db-secrets
# gw_app -- und sonst nichts
```

Der Weg dahin gehört zur Begründung: Vorher stand hier Peer-Authentifizierung über einen
geteilten Socket, mit der schöneren Zusage „kein Passwort, nirgends". Sie konnte nicht
funktionieren — Peer vergleicht den OS-Benutzer des verbindenden Prozesses mit dem Rollennamen,
und der App-Container läuft als `node` (uid 1000), während der Datenbank-Container uid 70 als
`postgres` kennt und bei 1000 niemanden. Dazu initialisiert der Postgres-Entrypoint ohne
Passwort oder `trust` gar nicht erst. Der Stack startete auf einer frischen Installation nicht.

Das Passwort wird **aus der Datei in die Verbindungs-URL** gesetzt, nicht in eine
Environment-Variable — `docker inspect` druckt die Umgebung eines Containers. Zwei Stellen tun
das: `scripts/db-connect.mjs` für die Skripte und `withPasswordFile` in
`src/server/db/client.ts` für die Anwendung. Zwei Kopien, weil `allowJs: false` gilt und die
Skripte ungebaut laufen — wer die eine ändert, ändert die andere.

## Die Vorprüfung

Eine erzeugte Migration kann eine Bedingung hinzufügen, aber nicht sagen, was für die
vorhandenen Zeilen gelten muss, damit das gelingt. Stimmt es nicht, bricht Postgres **mitten im
Lauf** mit einem nackten Fehlercode ab. [`scripts/preflight.mjs`](../scripts/preflight.mjs)
stellt diese Fragen vorher.

### Eine neue Datenvoraussetzung eintragen

Fügt eine Migration eine Bedingung hinzu, die bestehende Zeilen verletzen können — eine
Composite-FK, ein `not null` ohne Default, ein neuer `unique`-Index —, gehört ein Eintrag in
`CHECKS`:

```js
{
  id: '<was nicht stimmt, in einem Satz>',
  migration: '<Dateiname der Migration>',
  relevant: (c) => /* false, sobald die Bedingung schon existiert */,
  find: `select ... limit ${SAMPLE_LIMIT}`,
  explain: ['Warum die Zeilen so entstehen konnten und welche Entscheidung ansteht.'],
  inspect: `-- die Abfrage, die ein Mensch von Hand laufen lässt`,
}
```

Drei Regeln, die aus Fehlern stammen:

1. **`relevant` fragt nach der Bedingung, nicht nach dem Namen.** Drizzles erzeugte
   Constraint-Namen sind länger als 63 Zeichen und werden von Postgres stillschweigend
   abgeschnitten — der Name in `pg_constraint` ist nicht der Name in der Migrationsdatei.
   `missingCompositeDayFk` fragt deshalb über die Spalten.
2. **Die Prüfung rät nicht.** Sie nennt die Zeilen und die Entscheidung. Wohin ein verirrter
   Block gehört, ist eine inhaltliche Frage; ein Skript, das sie beantwortet, schreibt
   irgendwann das Falsche in die Akte einer Kundin.
3. **Nach dem Eintrag: gegen eine betroffene Datenbank testen.** Ein Check, der nur auf der
   sauberen Datenbank lief, hat bewiesen, dass er nichts findet — mehr nicht.

### Warum die Vorprüfung als Superuser läuft

Jede Policy hier gilt `to gw_app`, und alle Tabellen stehen unter FORCE ROW LEVEL SECURITY —
das trifft auch den Eigentümer. Über `gw_owner` gelesen ist **jede Tabelle leer**. Eine
Vorprüfung über diese Verbindung würde einer kaputten Datenbank grünes Licht geben.

Deshalb: `ADMIN_DATABASE_URL`, und `assertSeesEveryRow()` weist die Verbindung zurück, wenn sie
doch der RLS unterliegt. **Diesen Schutz nicht entfernen.** Er ist der Unterschied zwischen
einer Prüfung und einer Zusicherung, die nie etwas geprüft hat.

Der Bypass ist hier vertretbar, weil er **nur liest**. Das Provisioning macht es ausdrücklich
anders: es setzt den Mandantenkontext und schreibt durch dieselbe Tür wie die Anwendung. Ein
Provisioning-Pfad mit Bypass-Rolle ist einer, der still in den falschen Mandanten schreibt.

## Upgrade

```bash
scripts/backup.sh vor-upgrade-$(date +%F).sql.gz
# GW_VERSION in der .env auf den neuen Tag; Image bereitstellen
docker compose --profile tls up -d
```

Ohne Upgrade nur prüfen, was ein Upgrade vorfände:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

Die Passwörter liegen in eigenen Volumes und sind **nicht** im Dump. Für eine
Wiederherstellung auf einem neuen Server braucht es sie auch nicht: `db-secrets.mjs` erzeugt
neue, und `db-bootstrap.mjs` setzt sie bei jedem Lauf auf den Rollen.

**Bricht die Vorprüfung ab, ist die Datenbank unverändert.** Es gibt nichts zurückzurollen: die
Zeilen richten, denselben Befehl erneut absetzen.

Schlägt dagegen `migrate` fehl, ist der Stand in `drizzle.__drizzle_migrations` maßgeblich —
dort steht, was angewandt wurde. Zurück geht es nur über den Dump.

## Was beim Ändern leicht kaputtgeht

- **`${VAR:?}` in `compose.yaml` außerhalb eines aktiven Profils.** Compose interpoliert die
  **ganze** Datei beim Laden, auch Dienste, deren Profil nicht aktiv ist. Ein Pflichtfeld am
  `caddy`-Dienst bricht damit jedes `up` ohne `tls` ab — und Betrieb ohne HTTPS ist
  ausdrücklich unterstützt. Solche Prüfungen gehören in den `command:` des Containers.
- **Eine Variable ergänzen und das Durchreichen vergessen.** `GW_OPS_TOKEN` und
  `GW_COLLAB_URL` hatten genau das. `pnpm check:docs` prüft es jetzt — siehe
  [`docs-mitziehen`](doku-mitziehen.md).
- **Etwas in `provision.mjs` nicht idempotent machen.** Es läuft bei jedem Boot. Der CI-Job
  `Schema & Tenant Isolation` ruft es deshalb zweimal hintereinander auf.
- **Den Datenbank-Zugang von außen öffnen.** `db` veröffentlicht bewusst keinen Port. Die
  Zusage, dass nur dieses Compose-Netz herankommt, hängt daran — mit einem Port-Mapping steht
  die Datenbank im Netz des Hosts und nur noch das Passwort dazwischen.
- **Einen Anmeldelink bei jedem Start drucken.** `bootstrapAdmin` druckt nur, wenn der Member
  neu angelegt wurde — sonst läge bei jedem Neustart eine gültige Zugangsberechtigung im Log.

## Nach jeder Änderung an der Routine

```bash
pnpm check:docs
pnpm db:bootstrap && pnpm db:preflight && pnpm db:migrate && pnpm db:provision && pnpm db:provision
pnpm test:db
```

Alle vier Verbindungen müssen dabei auf **dieselbe** Datenbank zeigen. `vitest.db.config.ts`
fällt für `OPS_DATABASE_URL` auf `goodworkshop` zurück: wer nur `DATABASE_URL` umbiegt, lässt
die Tests in die eine Datenbank schreiben und aus der anderen lesen und bekommt dutzende
Fehlschläge, die wie ein Rechtebruch aussehen und keiner sind.

```bash
export ADMIN_DATABASE_URL=postgres://postgres@127.0.0.1:5433/<db>
export MIGRATION_DATABASE_URL=postgres://gw_owner@127.0.0.1:5433/<db>
export DATABASE_URL=postgres://gw_app@127.0.0.1:5433/<db>
export OPS_DATABASE_URL=postgres://gw_ops@127.0.0.1:5433/<db>
```

Die Kette zweimal gegen eine **frische** Datenbank, denn die häufigste Regression ist die, die
erst beim zweiten Start auftritt: der PAT-Resolver, der `gw_owner` nicht mehr gehörte, ließ
jede Installation beim zweiten `up` scheitern — die erste lief.
