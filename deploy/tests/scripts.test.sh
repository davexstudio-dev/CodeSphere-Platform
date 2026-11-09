#!/usr/bin/env bash
# Local tests of deploy/monitor.sh and deploy/backup.sh (#41), with stubbed df, free, curl, docker
# and rclone: nothing leaves the machine, no secret is needed.
#   bash deploy/tests/scripts.test.sh
# Exit status 0 when every case passes. Needs bash, sed, awk and GNU find (Linux, or Git Bash).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0

ok()   { pass=$((pass + 1)); echo "ok   - $1"; }
nok()  { fail=$((fail + 1)); echo "FAIL - $1"; }
check() { # check <label> <command...>: passes when the command succeeds
  local label="$1"; shift
  if "$@"; then ok "$label"; else nok "$label"; fi
}
calls() { grep -c "^$1" "$CALLS_LOG" 2>/dev/null || true; }

# --- stubs, first on PATH ---------------------------------------------------------------------
STUBS="$WORK/stubs"; mkdir -p "$STUBS"
cat > "$STUBS/curl" <<'EOF'
#!/bin/sh
echo "curl $*" >> "$CALLS_LOG"
[ -n "${CURL_FAIL:-}" ] && exit 22
exit 0
EOF
cat > "$STUBS/df" <<'EOF'
#!/bin/sh
printf 'Use%%\n %s%%\n' "${FAKE_DISK:-50}"
EOF
cat > "$STUBS/free" <<'EOF'
#!/bin/sh
printf '              total        used        free      shared  buff/cache   available\nMem:           1000         500         100           0         400         %s\n' "${FAKE_AVAIL:-500}"
EOF
cat > "$STUBS/hostname" <<'EOF'
#!/bin/sh
echo test-vm
EOF
cat > "$STUBS/docker" <<'EOF'
#!/bin/sh
echo "docker $*" >> "$CALLS_LOG"
[ -n "${DOCKER_FAIL:-}" ] && exit 1
[ -n "${DUMP_EMPTY:-}" ] && exit 0
printf 'PGDMP-fake-dump'
EOF
cat > "$STUBS/rclone" <<'EOF'
#!/bin/sh
echo "rclone $*" >> "$CALLS_LOG"
[ -n "${RCLONE_FAIL:-}" ] && exit 1
exit 0
EOF
chmod +x "$STUBS"/*
export PATH="$STUBS:$PATH" CALLS_LOG="$WORK/calls.log"

# A fresh copy of the scripts in its own directory: they `cd` next to themselves.
fresh() {
  rm -rf "$WORK/tree"; mkdir -p "$WORK/tree/deploy"
  cp "$REPO/deploy/monitor.sh" "$REPO/deploy/backup.sh" "$WORK/tree/deploy/"
  : > "$CALLS_LOG"
  cd "$WORK/tree" || exit 1
}

# --- monitor.sh -------------------------------------------------------------------------------
monitor() { bash deploy/monitor.sh 2>"$WORK/stderr"; }

fresh; printf 'TELEGRAM_BOT_TOKEN=tok\nTELEGRAM_CHAT_ID=-100123\n' > deploy/.env.monitor
monitor; rc=$?
check "monitor: below both thresholds, silent and exit 0" test "$rc" = 0 -a "$(calls curl)" = 0

FAKE_DISK=85 monitor; rc=$?
check "monitor: disk over 80 % sends one Telegram alert" test "$rc" = 0 -a "$(calls curl)" = 1
check "monitor: the alert goes to the bot and chat of .env.monitor" grep -q 'api.telegram.org/bottok/sendMessage.*chat_id=-100123' "$CALLS_LOG"

: > "$CALLS_LOG"; FAKE_AVAIL=50 monitor; rc=$?   # 95 % used
check "monitor: memory over 90 % sends one alert" test "$rc" = 0 -a "$(calls curl)" = 1

: > "$CALLS_LOG"; FAKE_DISK=85 FAKE_AVAIL=50 monitor; rc=$?
check "monitor: disk and memory both over send two alerts" test "$rc" = 0 -a "$(calls curl)" = 2

: > "$CALLS_LOG"; DISK_MAX=1 monitor; rc=$?
check "monitor: low threshold (DISK_MAX=1) triggers the test alert" test "$rc" = 0 -a "$(calls curl)" = 1

: > "$CALLS_LOG"; FAKE_DISK=85 FAKE_AVAIL=50 CURL_FAIL=1 monitor; rc=$?
check "monitor: a failed alert does not skip the other check" test "$(calls curl)" = 2
check "monitor: a failed alert makes the exit status non-zero" test "$rc" != 0
check "monitor: a failed alert is reported on stderr" grep -q 'Telegram alert failed' "$WORK/stderr"

echo 'DISK_MAX=10' >> deploy/.env.monitor; : > "$CALLS_LOG"; monitor
check "monitor: DISK_MAX from .env.monitor is honoured (50 % >= 10)" test "$(calls curl)" = 1

fresh; printf 'TELEGRAM_BOT_TOKEN=tok\n' > deploy/.env.monitor
monitor; rc=$?
check "monitor: missing TELEGRAM_CHAT_ID fails" test "$rc" != 0
check "monitor: and names the missing variable" grep -q 'TELEGRAM_CHAT_ID' "$WORK/stderr"

fresh
monitor; rc=$?
check "monitor: missing .env.monitor fails (cron mails it)" test "$rc" != 0

# --- backup.sh --------------------------------------------------------------------------------
backup() { bash deploy/backup.sh >"$WORK/stdout" 2>"$WORK/stderr"; }
dumps() { find backups -name 'codesphere-*.dump' 2>/dev/null | wc -l | tr -d ' '; }
base_env() {
  fresh
  printf 'PUBLIC_HOST=example.org\nPOSTGRES_PASSWORD=pa ss$word&(x)\nBACKUP_HEARTBEAT_URL=https://hc-ping.com/uuid\nOFFSITE_REMOTE=r2-crypt:codesphere\n' > .env
}

base_env; backup; rc=$?
check "backup: nominal run exits 0 and writes one dump" test "$rc" = 0 -a "$(dumps)" = 1
check "backup: the dump is not left as .partial" test -z "$(find backups -name '*.partial')"
check "backup: the off-server copy runs with --immutable" grep -q 'rclone copy .* r2-crypt:codesphere --immutable' "$CALLS_LOG"
check "backup: the heartbeat is pinged after the copy" grep -q 'curl .*hc-ping.com/uuid' "$CALLS_LOG"
check "backup: a POSTGRES_PASSWORD with spaces and shell characters does not break it" test "$rc" = 0

base_env; NO_HEARTBEAT=1 backup
check "backup: NO_HEARTBEAT=1 skips the ping but still dumps" test "$(calls curl)" = 0 -a "$(dumps)" = 1

base_env; DUMP_EMPTY=1 backup; rc=$?
check "backup: an empty dump fails" test "$rc" != 0
check "backup: an empty dump leaves no file" test "$(dumps)" = 0 -a -z "$(find backups -name '*.partial')"
check "backup: an empty dump sends no heartbeat" test "$(calls curl)" = 0

base_env; DOCKER_FAIL=1 backup; rc=$?
check "backup: pg_dump failing fails, with no heartbeat and no file" test "$rc" != 0 -a "$(calls curl)" = 0 -a "$(dumps)" = 0

base_env; RCLONE_FAIL=1 backup; rc=$?
check "backup: a failed off-server copy fails and sends no heartbeat" test "$rc" != 0 -a "$(calls curl)" = 0
check "backup: a failed off-server copy keeps the local dump" test "$(dumps)" = 1

base_env; mkdir backups; touch -d '10 days ago' backups/codesphere-old.dump; touch backups/unrelated.txt; backup
check "backup: dumps older than 7 days are pruned" test ! -e backups/codesphere-old.dump
check "backup: other files are left alone" test -e backups/unrelated.txt

fresh; printf 'POSTGRES_PASSWORD=x\n' > .env; backup; rc=$?
check "backup: without off-server remote or heartbeat, still succeeds" test "$rc" = 0 -a "$(calls rclone)" = 0 -a "$(calls curl)" = 0

fresh; printf 'POSTGRES_PASSWORD=x\nKEEP_DAYS="2"\nBACKUP_DIR=out\n' > .env; backup
check "backup: BACKUP_DIR read from .env, quotes stripped" test "$(find out -name 'codesphere-*.dump' | wc -l | tr -d ' ')" = 1

cd "$REPO" || exit 1
echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
