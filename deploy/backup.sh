#!/bin/sh
# Dump the production PostgreSQL database to backups/ (custom format, restore with pg_restore).
#
# Run on the host from the repository root, e.g. every night from cron:
#   17 3 * * *  cd ~/codesphere && deploy/backup.sh >> backups/backup.log 2>&1
#
# Environment:
#   BACKUP_DIR       where dumps go                  (default: ./backups)
#   KEEP_DAYS        retention in days               (default: 7, spec « Supervision »)
#   OFFSITE_REMOTE   rclone destination for an off-server copy, e.g. `r2-crypt:codesphere`
#                    (an rclone `crypt` remote over R2, so the copy is encrypted). Unset: no copy.
#   BACKUP_HEARTBEAT_URL   healthchecks.io ping, sent only when the dump (and the off-server copy,
#                    if configured) succeeded: a missed night alerts the team. Unset: no ping.
#   NO_HEARTBEAT=1   skip that ping (the dump deploy/deploy.sh takes before a migration).
# They are read from .env next to docker-compose.prod.yml when it exists, so cron needs no setup.
#
# Restore into an empty database:
#   docker compose -f docker-compose.prod.yml exec -T postgres \
#     pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < backups/<file>.dump
set -eu

cd "$(dirname "$0")/.."

# The four settings are read from .env one by one, not by sourcing it: .env is written for
# docker compose, where a value is literal, whereas the shell would run or mangle a
# POSTGRES_PASSWORD containing a space, `$`, `&` or `(`. The environment wins over the file.
env_value() {
	[ -f .env ] || return 0
	sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"
KEEP_DAYS="${KEEP_DAYS:-$(env_value KEEP_DAYS)}"
OFFSITE_REMOTE="${OFFSITE_REMOTE:-$(env_value OFFSITE_REMOTE)}"
BACKUP_HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-$(env_value BACKUP_HEARTBEAT_URL)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
if [ "${NO_HEARTBEAT:-}" = 1 ]; then
	BACKUP_HEARTBEAT_URL=""
fi
COMPOSE="docker compose -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/codesphere-$stamp.dump"
partial="$target.partial"

# Written to a .partial file first: a failed dump never leaves a file that looks complete.
trap 'rm -f "$partial"' EXIT

# The container already holds POSTGRES_USER / POSTGRES_DB, so the password stays out of this script.
$COMPOSE exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$partial"

if [ ! -s "$partial" ]; then
	echo "backup failed: empty dump" >&2
	exit 1
fi

mv "$partial" "$target"
trap - EXIT
echo "backup written: $target"

# Off-server copy: a dump that only lives on the database host is lost with the host. A failed
# copy fails the script (the cron log shows it) but keeps the local dump.
if [ -n "$OFFSITE_REMOTE" ]; then
	if rclone copy "$target" "$OFFSITE_REMOTE" --immutable; then
		echo "offsite copy: $OFFSITE_REMOTE/$(basename "$target")"
	else
		echo "offsite copy FAILED: $OFFSITE_REMOTE" >&2
		exit 1
	fi
fi

# Heartbeat last: it only fires when everything above worked.
if [ -n "$BACKUP_HEARTBEAT_URL" ]; then
	curl -fsS -m 10 --retry 3 "$BACKUP_HEARTBEAT_URL" > /dev/null
fi

# Retention: delete dumps older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'codesphere-*.dump' -mtime +"$KEEP_DAYS" -print -delete
