#!/usr/bin/env bash
# Usage: deploy/deploy.sh <git-sha> <version>
#
# Production deploy on the Systalink Cloud Server (#35, decisions of #168), run over SSH by
# .github/workflows/deploy.yml from ~/codesphere. The workflow has copied docker-compose.prod.yml
# and deploy/ for that commit, written the env files from the GitHub "production" environment
# and logged in to GHCR; this script does the rest:
#
#   1. pull the web and server images CI built for the commit (nothing is built on the server)
#   2. dump the database before any migration (skipped on the very first deploy)
#   3. start the stack: migrate runs before the server, `--wait` returns once every healthcheck
#      passes, so a failed migration or an unhealthy container fails the deploy
#
# A failed pull or dump changes nothing: the running containers keep serving. Rolling back is
# deploying an earlier commit again (schema changes are made backward compatible, #168).
#
# Environment: REGISTRY, e.g. ghcr.io/davexstudio-dev (where the images are).
set -euo pipefail

SHA="${1:?usage: deploy.sh <git-sha> <version>}"
VERSION="${2:?usage: deploy.sh <git-sha> <version>}"
REGISTRY="${REGISTRY:?Set REGISTRY, e.g. ghcr.io/davexstudio-dev}"

cd "$(dirname "$0")/.."

# Read by docker-compose.prod.yml: which images to run, and the build identity /api/v1/health reports.
export SERVER_IMAGE="${REGISTRY}/codesphere-server:${SHA}"
export WEB_IMAGE="${REGISTRY}/codesphere-web:${SHA}"
export APP_VERSION="$VERSION" GIT_SHA="$SHA"
COMPOSE=(docker compose -f docker-compose.prod.yml)

"${COMPOSE[@]}" pull --quiet

if [ -n "$("${COMPOSE[@]}" ps --status running --quiet postgres)" ]; then
	# A dump before every migration (#168). No heartbeat: that one is for the nightly backup.
	NO_HEARTBEAT=1 deploy/backup.sh
else
	echo "no running database: first deploy, nothing to back up"
fi

"${COMPOSE[@]}" up -d --no-build --wait --remove-orphans

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ${VERSION} ${SHA}" >> deploy/deployed.log
echo "deployed ${VERSION} (${SHA})"
