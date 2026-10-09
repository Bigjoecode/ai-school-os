#!/usr/bin/env bash
# Restores a backup made by backup-db.sh into an EMPTY PostgreSQL database.
#
#   bash restore-db.sh <backup.sql.gz> [target-database-url]
#
# The target is the second argument, or RESTORE_DATABASE_URL (environment or
# ~/.ai-school-backup.env). It never overwrites data: it stops if the target
# already has tables. The safe way to restore production is therefore:
#   1. cPanel → PostgreSQL Databases: create a new empty database and add the
#      app's user to it (all privileges);
#   2. restore into it with this script (from a one-off cPanel cron job, as
#      the host has no shell);
#   3. point the Node.js app's DATABASE_URL at the new database and restart.
# The old database stays untouched until you delete it, so step 3 can be undone.
set -uo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-$HOME/.ai-school-backup.env}"
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      RESTORE_DATABASE_URL=*|PG_BIN=*)
        key="${line%%=*}"; val="${line#*=}"
        val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
        [ -z "${!key:-}" ] && export "$key=$val"
        ;;
    esac
  done < "$ENV_FILE"
fi

FILE="${1:-}"
TARGET="${2:-${RESTORE_DATABASE_URL:-}}"
PSQL="psql"
[ -n "${PG_BIN:-}" ] && PSQL="$PG_BIN/psql"

die() { echo "Restore FAILED: $1" >&2; exit 1; }
[ -n "$FILE" ] && [ -f "$FILE" ] || die "give the backup file, e.g. restore-db.sh ~/backups/db/aischool-2026-01-31_0200.sql.gz"
[ -n "$TARGET" ] || die "give the target database URL (2nd argument or RESTORE_DATABASE_URL in $ENV_FILE)"
command -v "$PSQL" >/dev/null 2>&1 || die "psql was not found (set PG_BIN)"
TARGET="$(printf '%s' "$TARGET" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

# One restore at a time: a "once per minute" cron job must not start a second one while the first runs.
LOCK="${TMPDIR:-/tmp}/ai-school-restore.lock"
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +240 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; fi
mkdir "$LOCK" 2>/dev/null || { echo "$(date -u +%H:%M) another restore is still running"; exit 0; }
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

gzip -t "$FILE" 2>/dev/null || die "$FILE is not a valid .gz file"
gzip -dc "$FILE" | tail -n 5 | grep -q "PostgreSQL database dump complete" || die "$FILE is incomplete (no end-of-dump marker)"

TABLES="$("$PSQL" --dbname="$TARGET" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>&1)" || die "cannot connect to the target: $TABLES"
[ "$TABLES" = "0" ] || die "the target database is not empty ($TABLES tables). Create a new empty database and restore into that."

echo "Restoring $FILE ..."
# One transaction: either everything is restored or nothing is.
if ! gzip -dc "$FILE" | "$PSQL" --dbname="$TARGET" -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null; then
  die "psql stopped on an error (nothing was kept; see the message above)"
fi

"$PSQL" --dbname="$TARGET" -tAc "SELECT 'Restored: ' || (SELECT count(*) FROM tenants) || ' schools, ' || (SELECT count(*) FROM users) || ' users, newest migration ' || (SELECT max(migration_name) FROM _prisma_migrations)"
echo "Done. Point DATABASE_URL at this database and restart the Node.js app."
