#!/usr/bin/env bash
# Daily PostgreSQL backup for AI School OS on cPanel (or any Linux host).
#
# Schedule it in cPanel → Cron Jobs (once a day), e.g.:
#   bash $HOME/ai-school-api/scripts/backup-db.sh
#
# What it does:
#   - dumps the database in DATABASE_URL with pg_dump (plain SQL, gzip),
#     into BACKUP_DIR (default ~/backups/db, outside public_html);
#   - keeps the last KEEP_DAILY daily dumps (default 7) and, every Sunday,
#     a weekly copy in BACKUP_DIR/weekly for KEEP_WEEKLY weeks (default 4);
#   - writes BACKUP_DIR/last-backup.json, which the API reads: /api/health
#     shows lastBackupAt, Platform → System health shows the backup, and the
#     API emails ALERT_EMAIL when a backup fails or none succeeds for 30 hours;
#   - prints nothing on success and an error on failure, so cPanel's cron
#     email (Cron Jobs → Cron Email) only writes when something is wrong.
#
# Where DATABASE_URL comes from (first found wins):
#   1. the environment;
#   2. BACKUP_ENV_FILE (default ~/.ai-school-backup.env), a file you create in
#      File Manager with one line DATABASE_URL=postgresql://... and
#      permissions 600. Never commit it; it holds the database password.
#
# Optional settings (environment or the same env file):
#   BACKUP_DIR, KEEP_DAILY, KEEP_WEEKLY, PG_BIN (folder holding pg_dump).
set -uo pipefail
umask 077

ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.ai-school-backup.env}"
if [ -f "$ENV_FILE" ]; then
  # Only KEY=VALUE lines for the settings this script uses; nothing is executed.
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      DATABASE_URL=*|BACKUP_DIR=*|KEEP_DAILY=*|KEEP_WEEKLY=*|PG_BIN=*)
        key="${line%%=*}"; val="${line#*=}"
        val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
        [ -z "${!key:-}" ] && export "$key=$val"
        ;;
    esac
  done < "$ENV_FILE"
fi

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/db}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
STATUS="$BACKUP_DIR/last-backup.json"
PG_DUMP="pg_dump"
[ -n "${PG_BIN:-}" ] && PG_DUMP="$PG_BIN/pg_dump"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
json_escape() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g' | cut -c1-300; }
previous_success() { [ -f "$STATUS" ] && sed -n 's/.*"lastSuccessAt":"\([^"]*\)".*/\1/p' "$STATUS" | head -1; }

fail() {
  local msg="$1" last
  last="$(previous_success)"
  mkdir -p "$BACKUP_DIR" 2>/dev/null
  printf '{"status":"failed","at":"%s","lastSuccessAt":%s,"message":"%s"}\n' \
    "$(now)" "$( [ -n "$last" ] && printf '"%s"' "$last" || printf 'null')" "$(json_escape "$msg")" > "$STATUS.tmp" && mv -f "$STATUS.tmp" "$STATUS"
  echo "AI School OS database backup FAILED: $msg" >&2
  exit 1
}

# One run at a time (a "once per minute" test job must not start a second dump).
LOCK="$BACKUP_DIR/.lock"
mkdir -p "$BACKUP_DIR" 2>/dev/null
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; fi
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set (put it in $ENV_FILE)"
command -v "$PG_DUMP" >/dev/null 2>&1 || fail "pg_dump was not found (set PG_BIN to the folder that holds it)"
mkdir -p "$BACKUP_DIR/weekly" || fail "cannot create $BACKUP_DIR"

# Prisma's ?schema=public (and similar) is not a libpq option: drop the query string's schema parameter.
DB_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

STAMP="$(date -u +%Y-%m-%d_%H%M)"
OUT="$BACKUP_DIR/aischool-$STAMP.sql.gz"
ERR="$BACKUP_DIR/.pg_dump.err"

# Plain SQL so it restores with psql or phpPgAdmin; no owners/grants, so it
# restores into a database with a different (cPanel-prefixed) user.
if ! "$PG_DUMP" --dbname="$DB_URL" --no-owner --no-privileges --format=plain 2>"$ERR" | gzip -6 > "$OUT.partial"; then
  rm -f "$OUT.partial"
  fail "pg_dump failed: $(head -c 300 "$ERR" 2>/dev/null)"
fi
# A complete dump ends with this line; anything else is truncated.
if ! gzip -dc "$OUT.partial" 2>/dev/null | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
  rm -f "$OUT.partial"
  fail "the dump is incomplete: $(head -c 300 "$ERR" 2>/dev/null)"
fi
mv -f "$OUT.partial" "$OUT" || fail "cannot write $OUT"
rm -f "$ERR"
SIZE="$(wc -c < "$OUT" | tr -d ' ')"

# Sunday: keep a weekly copy too.
if [ "$(date -u +%u)" = "7" ]; then cp -f "$OUT" "$BACKUP_DIR/weekly/" || fail "cannot copy the weekly backup"; fi

# Rotation: newest first, delete beyond the limits.
ls -1t "$BACKUP_DIR"/aischool-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_DAILY + 1))" | while IFS= read -r f; do rm -f "$f"; done
ls -1t "$BACKUP_DIR"/weekly/aischool-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while IFS= read -r f; do rm -f "$f"; done

AT="$(now)"
printf '{"status":"ok","at":"%s","lastSuccessAt":"%s","file":"%s","sizeBytes":%s,"message":null}\n' \
  "$AT" "$AT" "$(basename "$OUT")" "$SIZE" > "$STATUS.tmp" && mv -f "$STATUS.tmp" "$STATUS"
exit 0
