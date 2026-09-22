#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Lagert die tägliche Sicherung aus -- verschlüsselt, an einen anderen Ort.
#
# scripts/backup.sh zieht einen prüfbaren Dump. Der liegt dann auf derselben
# Maschine wie die Datenbank, und eine Sicherung, die mit dem Server verloren
# geht, ist keine. Dieses Skript nimmt sie, packt zusammen, was zum Zurückkommen
# sonst noch nötig ist, und schiebt das Ganze in ein restic-Repository.
#
# restic statt rsync, aus drei Gründen:
#   - Das Archiv enthält den Anwendungsschlüssel im Klartext. Unverschlüsselt
#     auf ein Netzlaufwerk zu legen wäre leichtfertig; restic verschlüsselt vor
#     dem Übertragen.
#   - Es dedupliziert. Vierzehn tägliche Archive derselben Daten kosten kaum
#     mehr Platz als eines.
#   - `restic check` beantwortet, ob die Sicherung noch lesbar ist, ohne sie
#     zurückspielen zu müssen. Ob sie zurückSPIELBAR ist, beantwortet erst
#     scripts/backup-verify.sh -- das ist eine andere Frage, und die AVV sagt
#     sie zu.
#
# Der Anwendungsschlüssel liegt bewusst NICHT in der Datenbank, die er schützt:
# er entschlüsselt die Mail-Zugangsdaten, die in der Oberfläche hinterlegt sind.
# Ohne ihn käme die Datenbank mit leeren Zugangsdaten zurück. Direkt vom Volume
# gelesen statt aus dem Container, weil eine Sicherung nicht davon abhängen darf,
# dass die Anwendung gerade läuft.
#
# Konfiguration in /etc/ra-backup/nas.conf (oder $GW_BACKUP_CONF):
#
#   RESTIC_REPOSITORY=sftp:nas:/pfad/zum/repo
#   RESTIC_PASSWORD_FILE=/etc/ra-backup/restic.pass
#   GW_BACKUP_TAG=goodworkshop-cloud      # optional, Vorgabe: goodworkshop
#
# Fehlt die Datei, läuft der Dump trotzdem -- aber der Lauf endet mit einem
# Fehler. Stilles Überspringen wäre das Schlimmste: man hält sich für gesichert
# und ist es nicht.
#
#   scripts/backup-offsite.sh
#
# Aufzurufen aus dem Verzeichnis mit der compose.yaml.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${GW_BACKUP_CONF:-/etc/ra-backup/nas.conf}"
KEEP_DAILY="${GW_KEEP_DAILY:-14}"
KEEP_WEEKLY="${GW_KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${GW_KEEP_MONTHLY:-12}"

log() { echo "[$(date -Iseconds)] $*"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# ── Die Datenbank ────────────────────────────────────────────────────────────
# Über das Skript des Stacks statt über eine pg_dump-Zeile: es prüft, ob der
# Dump bis zu seiner Abschlusszeile durchgelaufen ist, und schreibt bei einem
# Fehler GAR KEINE Datei.
log "Datenbank"
"$here/backup.sh" "$work/goodworkshop.sql.gz" >/dev/null

# ── Der Anwendungsschlüssel ──────────────────────────────────────────────────
log "Anwendungsschlüssel"
volume="${GW_SECRET_VOLUME:-goodworkshop_secret_app}"
if mount="$(docker volume inspect "$volume" --format '{{.Mountpoint}}' 2>/dev/null)"; then
  cp "$mount/secret-key" "$work/secret-key"
  [ -s "$work/secret-key" ] || {
    log "FEHLER: leerer Anwendungsschluessel"
    exit 1
  }
else
  log "FEHLER: Volume $volume nicht gefunden. Ohne den Schluessel ist der Dump wertlos."
  exit 1
fi

# ── Die Konfiguration ────────────────────────────────────────────────────────
# Ohne sie kommt der Stack nicht wieder hoch, und sie steht in keinem Dump.
for file in compose.yaml .env Caddyfile; do
  [ -f "$file" ] && cp "$file" "$work/" || true
done

OUT="${GW_BACKUP_DIR:-/var/backups/goodworkshop}/goodworkshop-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$(dirname "$OUT")"
tar -C "$work" -czf "$OUT" .
chmod 600 "$OUT"
log "Geschrieben: $OUT ($(du -h "$OUT" | cut -f1))"

find "$(dirname "$OUT")" -maxdepth 1 -name 'goodworkshop-*.tar.gz' -mtime +"$KEEP_DAILY" -print -delete |
  while read -r f; do log "Abgeraeumt: $f"; done

# ── Auslagern ────────────────────────────────────────────────────────────────
# ERST NACHDEM die lokale Sicherung vollständig geschrieben ist. Scheitert das
# Auslagern, ist die lokale Kopie trotzdem da -- der Lauf endet aber mit einem
# Fehler, damit es auffällt.
if [ ! -f "$CONF" ]; then
  log "WARNUNG: $CONF fehlt -- es wird NICHT ausgelagert."
  log "WARNUNG: Diese Sicherung liegt nur lokal und uebersteht keinen Serververlust."
  exit 1
fi

log "Auslagern"
set -a
# shellcheck disable=SC1090
. "$CONF"
set +a
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
TAG="${GW_BACKUP_TAG:-goodworkshop}"

if ! restic snapshots >/dev/null 2>&1; then
  log "Repository noch nicht vorhanden -- wird angelegt"
  restic init
fi

restic backup --tag "$TAG" --host "$(hostname)" "$OUT"
restic forget --tag "$TAG" \
  --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --keep-monthly "$KEEP_MONTHLY" --prune
# Eine Stichprobe der Daten, nicht nur der Verwaltungsstrukturen.
restic check --read-data-subset=2%
log "Fertig."
