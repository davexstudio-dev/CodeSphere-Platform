#!/usr/bin/env bash
# Run every 15 minutes by cron. Alerts the team Telegram group when disk or memory crosses its threshold.
# Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in ~/codesphere/deploy/.env.monitor (chmod 600).
# DISK_MAX and MEM_MAX (percent) may be set there too. To test the alert path without filling the
# disk, run it once with a low threshold: `DISK_MAX=1 deploy/monitor.sh` must reach the Telegram group.
# A failed alert (Telegram unreachable, wrong token) is reported on stderr and in the exit status,
# so cron mails it, but it does not stop the other check.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env.monitor; set +a
: "${TELEGRAM_BOT_TOKEN:?missing in .env.monitor}" "${TELEGRAM_CHAT_ID:?missing in .env.monitor}"
DISK_MAX="${DISK_MAX:-80}"; MEM_MAX="${MEM_MAX:-90}"
failed=0

alert() {
  if ! curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode chat_id="$TELEGRAM_CHAT_ID" --data-urlencode text="⚠️ $(hostname): $1" > /dev/null; then
    echo "monitor: Telegram alert failed: $1" >&2
    failed=1
  fi
}

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
mem=$(free | awk '/^Mem:/ { printf "%d", ($2 - $7) * 100 / $2 }')
if [ -z "$disk" ] || [ -z "$mem" ]; then
  echo "monitor: could not read disk ('$disk') or memory ('$mem')" >&2
  exit 1
fi
if [ "$disk" -ge "$DISK_MAX" ]; then alert "disque à ${disk} % (seuil ${DISK_MAX} %)"; fi
if [ "$mem" -ge "$MEM_MAX" ]; then alert "mémoire à ${mem} % (seuil ${MEM_MAX} %)"; fi
exit "$failed"
