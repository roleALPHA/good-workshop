#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Spielt die jüngste Sicherung zurück -- der Wiederherstellungstest, den die
# Auftragsverarbeitungsvereinbarung zusagt.
#
# `restic check` beantwortet, ob die Sicherung noch LESBAR ist. Das ist nicht
# dieselbe Frage wie: lässt sie sich zurückspielen. Ein Dump kann vollständig
# und unbeschädigt sein und trotzdem an einer Rolle scheitern, die es auf der
# neuen Maschine nicht gibt. Das merkt man entweder hier oder an dem Tag, an dem
# man die Sicherung braucht.
#
# Alles in Wegwerf-Containern, weil die Anwendung so läuft: ein Postgres, in den
# der Dump gelesen wird, und nichts davon fasst das Produktivsystem an.
#
# Was dieser Test beweist: der Dump lässt sich in eine leere Datenbank einlesen,
# die Rollen und Eigentümer darin stimmen, und die Tabellen, auf die es ankommt,
# haben hinterher Zeilen.
#
# Was er NICHT beweist: dass ein vollständiger Stack wieder hochkommt. Dazu
# gehören der Anwendungsschlüssel, die env-Dateien und die Verbindungen nach
# Odoo und Stripe. Ein Drill, der das einmal wirklich tut, beantwortet eine
# andere Frage -- diese hier ist die, die sich wöchentlich automatisch stellen
# lässt.
#
#   scripts/backup-verify.sh
#
# Erwartet dieselbe Konfiguration wie backup-offsite.sh.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONF="${GW_BACKUP_CONF:-/etc/ra-backup/nas.conf}"
PG_IMAGE="${GW_VERIFY_PG_IMAGE:-postgres:17-alpine}"
NAME="gw-restore-test-$$"

log() { echo "[$(date -Iseconds)] $*"; }

[ -f "$CONF" ] || {
  log "FEHLER: $CONF fehlt. Ohne Repository gibt es nichts zurueckzuspielen."
  exit 1
}
set -a
# shellcheck disable=SC1090
. "$CONF"
set +a
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
TAG="${GW_BACKUP_TAG:-goodworkshop}"

work="$(mktemp -d)"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

log "Jüngsten Stand holen"
restic restore --tag "$TAG" latest --target "$work" >/dev/null

archive="$(find "$work" -name 'goodworkshop-*.tar.gz' -print -quit)"
[ -n "$archive" ] || {
  log "FEHLER: im Snapshot liegt kein Archiv."
  exit 1
}
tar -C "$work" -xzf "$archive"

dump="$work/goodworkshop.sql.gz"
[ -s "$dump" ] || {
  log "FEHLER: im Archiv liegt kein Dump."
  exit 1
}
# Der Schlüssel gehört dazu. Fehlt er, käme die Datenbank mit leeren
# Mail-Zugangsdaten zurück -- und das fiele erst im Betrieb auf.
[ -s "$work/secret-key" ] || {
  log "FEHLER: im Archiv liegt kein Anwendungsschluessel."
  exit 1
}

log "Wegwerf-Postgres starten"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=goodworkshop \
  "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d goodworkshop >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres -d goodworkshop >/dev/null 2>&1 || {
  log "FEHLER: der Wegwerf-Postgres kam nicht hoch."
  exit 1
}

# Rollen zuerst, ohne Passwörter: der Dump enthält `owner to gw_owner` und die
# Grants, aber Rollen sind Sache des Clusters und stehen in keinem Dump. Genau
# das macht db-bootstrap.mjs bei einer echten Wiederherstellung auch.
log "Rollen anlegen"
for role in gw_owner gw_app gw_ops gw_auth gw_operator; do
  docker exec "$NAME" psql -U postgres -q -c \
    "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$role') then create role $role; end if; end \$\$" >/dev/null
done

log "Dump einlesen"
gzip -dc "$dump" | docker exec -i "$NAME" \
  psql -U postgres -d goodworkshop -q -v ON_ERROR_STOP=1 >/dev/null

log "Zaehlen, was zurueckgekommen ist"
for table in tenant workshop billing_account; do
  rows="$(docker exec "$NAME" psql -U postgres -d goodworkshop -tAc "select count(*) from $table")"
  log "  $table: $rows"
  [ "$rows" -ge 1 ] || {
    log "FEHLER: $table ist nach der Wiederherstellung leer."
    exit 1
  }
done

# Der Stand der Migrationen: eine Sicherung, deren Schema hinter dem Code
# zurückliegt, kommt zwar zurück, aber nicht in Betrieb.
applied="$(docker exec "$NAME" psql -U postgres -d goodworkshop -tAc \
  "select count(*) from drizzle.__drizzle_migrations")"
log "Wiederherstellung geprueft: $applied Migrationen im zurueckgespielten Stand."
