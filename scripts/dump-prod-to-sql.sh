#!/usr/bin/env bash
# Dump Railway production MySQL to a local .sql file using the DATABASE_URL
# from .env. No local mysqldump install needed — runs via docker image.
#
# Usage:
#   scripts/dump-prod-to-sql.sh [output-file]
#
# Default output: teamflow-prod-backup-<timestamp>.sql in the current dir.
# The password is passed via MYSQL_PWD env var to the docker container, so
# it never appears in `ps` or shell history.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "✗ .env not found in $(pwd)" >&2
  exit 1
fi

DB_URL=$(grep -m1 '^DATABASE_URL=' .env | sed "s/^DATABASE_URL=//; s/^[\"']//; s/[\"']$//")
if [[ -z "${DB_URL:-}" ]]; then
  echo "✗ DATABASE_URL missing from .env" >&2
  exit 1
fi

# Parse with node so we correctly handle URL-encoded passwords.
eval "$(DB_URL="$DB_URL" node -e '
  const u = new URL(process.env.DB_URL);
  const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  console.log("MYSQL_HOST=" + q(u.hostname));
  console.log("MYSQL_PORT=" + q(u.port || "3306"));
  console.log("MYSQL_USER=" + q(decodeURIComponent(u.username)));
  console.log("MYSQL_PASS=" + q(decodeURIComponent(u.password)));
  console.log("MYSQL_DB="   + q(u.pathname.slice(1)));
')"

OUT=${1:-teamflow-prod-backup-$(date +%Y%m%d-%H%M%S).sql}

echo "▶ Dumping database:"
echo "   host = $MYSQL_HOST:$MYSQL_PORT"
echo "   user = $MYSQL_USER"
echo "   db   = $MYSQL_DB"
echo "   out  = $OUT"
echo

docker run --rm -i \
  -e MYSQL_PWD="$MYSQL_PASS" \
  mysql:8 \
  mysqldump \
    --single-transaction \
    --no-tablespaces \
    --column-statistics=0 \
    --set-gtid-purged=OFF \
    --skip-lock-tables \
    --routines \
    --triggers \
    --events \
    -h "$MYSQL_HOST" \
    -P "$MYSQL_PORT" \
    -u "$MYSQL_USER" \
    "$MYSQL_DB" \
  > "$OUT"

echo "✓ Dump complete."
ls -lh "$OUT"
