#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Spielt die jüngste Sicherung zurück -- der Wiederherstellungstest, den die
# Auftragsverarbeitungsvereinbarung zusagt.
#
# `restic check` beantwortet, ob die Sicherung noch LESBAR ist. Das ist nicht
# dieselbe Frage wie: lässt sie sich zurückspielen. Ein Dump kann vollständig
# und unbeschädigt sein und trotzdem an einer Erweiterung scheitern, die es auf
# der neuen Maschine nicht gibt, oder an einer Migration, die seither dazukam.
# Das merkt man entweder hier oder an dem Tag, an dem man die Sicherung braucht.
#
# Was dieser Test beweist: der Dump lässt sich in eine leere Datenbank einlesen,
# die Migrationen laufen darauf durch, und die Tabellen, auf die es ankommt,
# haben hinterher Zeilen.
#
# Was er NICHT beweist: dass ein vollständiger Stack wieder hochkommt. Dazu
# gehören der Anwendungsschlüssel, die env-Dateien und die Verbindungen nach
# Odoo und Stripe. Ein Drill, der das einmal wirklich tut, beantwortet eine
# andere Frage -- und diese hier ist die, die sich wöchentlich automatisch
# stellen lässt.
#
#   scripts/backup-verify.sh
#
# Erwartet dieselbe Konfiguration wie backup-offsite.sh und einen erreichbaren
# Postgres, in dem eine Wegwerf-Datenbank angelegt werden darf ($GW_VERIFY_URL).
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${GW_BACKUP_CONF:-/etc/ra-backup/nas.conf}"
ADMIN_URL="${GW_VERIFY_URL:-postgres://postgres@127.0.0.1:5432/postgres}"
DB="gw_restore_test_$(date +%s)"

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
  rm -rf "$work"
  psql "$ADMIN_URL" -q -c "drop database if exists $DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Jüngsten Stand holen"
restic restore --tag "$TAG" latest --target "$work"

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

log "In eine Wegwerf-Datenbank einlesen: $DB"
psql "$ADMIN_URL" -q -c "create database $DB"
target="${ADMIN_URL%/*}/$DB"
gzip -dc "$dump" | psql "$target" -q -v ON_ERROR_STOP=1 >/dev/null

log "Zeilen zaehlen"
rows="$(psql "$target" -tAc "select count(*) from tenant")"
[ "$rows" -ge 1 ] || {
  log "FEHLER: die zurueckgespielte Datenbank hat keinen einzigen Tenant."
  exit 1
}

# Die Migrationen gegen den zurückgespielten Stand: ein Dump von gestern muss
# sich mit dem Code von heute wieder in Betrieb nehmen lassen.
log "Migrationen gegen den zurueckgespielten Stand"
ADMIN_DATABASE_URL="$target" MIGRATION_DATABASE_URL="$target" \
  node "$here/migrate.mjs" >/dev/null

log "Wiederherstellung geprueft: $rows Tenants, Migrationen sauber."
