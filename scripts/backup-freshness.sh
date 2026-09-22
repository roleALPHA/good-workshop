#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Prüft, ob überhaupt noch gesichert wird.
#
# Der Sicherungslauf sagt laut Bescheid, wenn das Auslagern scheitert. Ein
# Timer, der gar nicht mehr feuert, schweigt -- und ein Server, der steht,
# schweigt erst recht. Diesen Ausfall merkt man sonst an dem Tag, an dem man die
# Sicherung braucht.
#
# Deshalb gehört dieses Skript auf eine ANDERE Maschine als die gesicherte.
# Läuft es dort, verstummt mit dem Host auch die Überwachung, und dann prüft
# niemand mehr etwas.
#
#   scripts/backup-freshness.sh [stunden]
#
# Vorgabe: 26 Stunden, also ein täglicher Lauf plus zwei Stunden Luft für
# RandomizedDelaySec und einen langsamen Lauf. Exit-Status 1, wenn der jüngste
# Stand zu alt ist oder das Repository nicht antwortet -- damit ein Timer mit
# OnFailure= daran hängen kann.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONF="${GW_BACKUP_CONF:-/etc/ra-backup/nas.conf}"
MAX_HOURS="${1:-${GW_MAX_BACKUP_AGE_HOURS:-26}}"

[ -f "$CONF" ] || {
  echo "FEHLER: $CONF fehlt. Es kann nicht geprueft werden, ob gesichert wird." >&2
  exit 1
}
set -a
# shellcheck disable=SC1090
. "$CONF"
set +a
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
TAG="${GW_BACKUP_TAG:-goodworkshop}"

# `--latest 1` statt aller Snapshots: die Frage ist, wie alt der jüngste ist.
if ! snapshots="$(restic snapshots --tag "$TAG" --latest 1 --json 2>/dev/null)"; then
  echo "FEHLER: das Repository antwortet nicht." >&2
  exit 1
fi

newest="$(printf '%s' "$snapshots" | jq -r '.[0].time // empty')"
[ -n "$newest" ] || {
  echo "FEHLER: im Repository liegt kein Stand mit dem Tag $TAG." >&2
  exit 1
}

# GNU date und BSD date sind sich über nichts einig; jq rechnet überall gleich.
age_hours="$(printf '%s' "$snapshots" | jq -r '(now - (.[0].time | sub("\\.[0-9]+";"") | fromdate)) / 3600 | floor')"

if [ "$age_hours" -gt "$MAX_HOURS" ]; then
  echo "FEHLER: der juengste Stand ist $age_hours Stunden alt (erlaubt: $MAX_HOURS)." >&2
  echo "        Zuletzt gesichert: $newest" >&2
  exit 1
fi

echo "In Ordnung: juengster Stand $age_hours Stunden alt ($newest)."
