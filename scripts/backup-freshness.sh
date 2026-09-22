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
# Zwei Wege, dieselbe Frage:
#
#   Mit Repository-Passwort fragt restic selbst -- dann weiß die Prüfung auch,
#   dass der jüngste Stand ein gültiger Snapshot ist.
#
#   OHNE Passwort, und das ist der bessere Fall, schaut sie nur nach, wann
#   zuletzt ein Stand geschrieben wurde: `snapshots/` trägt je Stand eine Datei,
#   und deren Alter beantwortet "wird überhaupt noch gesichert" vollständig. Ob
#   das Repository in sich stimmt, beantwortet ohnehin `restic check` im
#   Sicherungslauf selbst. Eine Überwachung, die kein Geheimnis braucht, darf
#   auf einer Maschine laufen, die die Sicherungen nicht lesen können soll --
#   und das ist der ganze Grund, warum sie woanders läuft.
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
TAG="${GW_BACKUP_TAG:-goodworkshop}"

# Sekunden seit Epoche, damit beide Wege dasselbe vergleichen können.
newest_epoch=""

if [ -r "${RESTIC_PASSWORD_FILE:-/nicht/vorhanden}" ]; then
  export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
  # `--latest 1` statt aller Snapshots: die Frage ist, wie alt der jüngste ist.
  if ! snapshots="$(restic snapshots --tag "$TAG" --latest 1 --json 2>/dev/null)"; then
    echo "FEHLER: das Repository antwortet nicht." >&2
    exit 1
  fi
  # GNU date und BSD date sind sich über nichts einig; jq rechnet überall gleich.
  newest_epoch="$(printf '%s' "$snapshots" |
    jq -r '(.[0].time // empty) | sub("\\.[0-9]+";"") | fromdate')"
  [ -n "$newest_epoch" ] || {
    echo "FEHLER: im Repository liegt kein Stand mit dem Tag $TAG." >&2
    exit 1
  }
else
  case "${RESTIC_REPOSITORY:-}" in
  sftp:*) ;;
  *)
    echo "FEHLER: ohne Passwort laesst sich nur ein sftp:-Repository pruefen." >&2
    echo "        Hinterlege RESTIC_PASSWORD_FILE oder trage ein sftp:-Ziel ein." >&2
    exit 1
    ;;
  esac
  rest="${RESTIC_REPOSITORY#sftp:}"
  host="${rest%%:*}"
  path="${rest#*:}"

  # `stat -c %Y` statt `find -printf`: auf einer Synology ist find nicht GNU,
  # stat schon. Ein leeres Verzeichnis lässt das Glob stehen, stat scheitert
  # daran, und die Ausgabe bleibt leer -- genau der Fall unten.
  if ! newest_epoch="$(ssh -o BatchMode=yes "$host" \
    "stat -c %Y '$path'/snapshots/* 2>/dev/null | sort -n | tail -1")"; then
    echo "FEHLER: $host antwortet nicht." >&2
    exit 1
  fi
  [ -n "$newest_epoch" ] || {
    echo "FEHLER: in $path liegt kein einziger Stand." >&2
    exit 1
  }
fi

age_hours=$(((($(date +%s) - newest_epoch)) / 3600))
newest_human="$(date -d "@$newest_epoch" -Iseconds 2>/dev/null || date -r "$newest_epoch" -Iseconds)"

if [ "$age_hours" -gt "$MAX_HOURS" ]; then
  echo "FEHLER: der juengste Stand ist $age_hours Stunden alt (erlaubt: $MAX_HOURS)." >&2
  echo "        Zuletzt gesichert: $newest_human" >&2
  exit 1
fi

echo "In Ordnung: juengster Stand $age_hours Stunden alt ($newest_human)."
