#!/usr/bin/env bash
#
# Take a restorable snapshot of the database before deploying.
#
#   ./backend/backup-db.sh              # reads backend/.env, falls back to ./.env
#   ./backend/backup-db.sh /mnt/backups # write somewhere other than ./backups
#
# Restore with:
#   gunzip -c backups/olympiad_db-YYYYmmdd-HHMMSS.sql.gz | mysql -h HOST -u USER -p DBNAME
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT/backups}"

# Load DB_* from backend/.env first, then the repo-root .env (same order as the app).
for env_file in "$ROOT/backend/.env" "$ROOT/.env"; do
  if [ -f "$env_file" ]; then
    # shellcheck disable=SC1090
    set -a; . "$env_file"; set +a
  fi
done

: "${DB_NAME:?DB_NAME is not set — check your .env}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_USER="${DB_USER:-root}"
DB_PORT="${DB_PORT:-3306}"

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump not found. Install the MySQL/MariaDB client tools first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/${DB_NAME}-${STAMP}.sql.gz"

echo "Backing up ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  -> $OUT"

# --single-transaction keeps InnoDB tables consistent without locking writes.
# --routines/--triggers/--events so a restore reproduces the whole schema.
MYSQL_PWD="${DB_PASSWORD:-}" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip > "$OUT"

# mysqldump writes its own trailing marker; its absence means a truncated dump.
if ! gunzip -c "$OUT" | tail -5 | grep -q "Dump completed"; then
  echo "Backup looks truncated — NOT safe to deploy against. Removing $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

echo "Backup complete: $(du -h "$OUT" | cut -f1)"
echo
echo "Restore with:"
echo "  gunzip -c '$OUT' | mysql -h '$DB_HOST' -P '$DB_PORT' -u '$DB_USER' -p '$DB_NAME'"
