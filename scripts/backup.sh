#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Zieht einen Dump der GoodWorkshop-Datenbank -- oder gar keinen.
#
# Der Grund für ein eigenes Skript statt einer Zeile in der Anleitung: die Zeile
#
#   docker compose exec -T db pg_dump goodworkshop | gzip > sicherung.sql.gz
#
# legt auch dann eine Datei an, wenn nichts gesichert wurde. Ohne `-u postgres`
# scheitert die Anmeldung am lokalen Socket (peer), pg_dump schreibt die
# Fehlermeldung nach stderr und lässt stdout leer -- gzip komprimiert das
# klaglos, der Exit-Status ist der von gzip, und im Verzeichnis liegt ein
# 20-Byte-Archiv mit dem richtigen Namen und dem heutigen Datum. Wer Sicherungen
# daran erkennt, dass die Datei da ist, hält sich für gesichert und ist es nicht.
#
# Deshalb: erst daneben schreiben, dann prüfen, und nur ein Dump, der bis zur
# Abschlusszeile von pg_dump durchgelaufen ist, bekommt den endgültigen Namen.
# Eine vorhandene ältere Sicherung bleibt bis dahin unberührt.
#
#   scripts/backup.sh [ziel.sql.gz]
#
# Aufzurufen aus dem Verzeichnis mit der compose.yaml.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEST="${1:-goodworkshop-$(date +%F).sql.gz}"
SERVICE="${GW_DB_SERVICE:-db}"
DB="${GW_DB_NAME:-goodworkshop}"

# pg_dump schließt jede vollständige Ausgabe damit ab. Fehlt die Zeile, ist der
# Dump unterwegs abgerissen -- ein volles Dateisystem, ein OOM-Kill, ein
# Container, der mitten im Lauf neu gestartet wurde.
MARKER='-- PostgreSQL database dump complete'

# Daneben, im selben Verzeichnis: ein `mv` innerhalb eines Dateisystems ist
# atomar, ein `mv` über eine Grenze hinweg kopiert und kann auf halbem Weg enden.
PART="$DEST.unvollstaendig"
trap 'rm -f "$PART"' EXIT

# `-u postgres`, weil im Container der lokale Socket nach dem Benutzernamen
# entscheidet. `-T` schaltet das Pseudo-Terminal ab, das sonst CR in den
# Datenstrom schreibt.
if ! docker compose exec -T -u postgres "$SERVICE" pg_dump "$DB" | gzip >"$PART"; then
  echo "FEHLER: pg_dump ist gescheitert. Es wurde keine Sicherung geschrieben." >&2
  exit 1
fi

if ! gzip -t "$PART" 2>/dev/null; then
  echo "FEHLER: Das Archiv ist unlesbar. Es wurde keine Sicherung geschrieben." >&2
  exit 1
fi

# In eine Variable statt durch `grep -q`: grep bricht beim ersten Treffer ab,
# das schickt der Gegenseite SIGPIPE, und mit `pipefail` gälte der erfolgreiche
# Fall als gescheitert.
ende="$(gzip -dc "$PART" | tail -c 400)"
case "$ende" in
*"$MARKER"*) ;;
*)
  echo "FEHLER: Der Dump endet nicht mit der Abschlusszeile von pg_dump." >&2
  echo "        Er ist unterwegs abgerissen. Es wurde keine Sicherung geschrieben." >&2
  exit 1
  ;;
esac

mv "$PART" "$DEST"
trap - EXIT
echo "Gesichert: $DEST ($(du -h "$DEST" | cut -f1))"
