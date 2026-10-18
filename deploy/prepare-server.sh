#!/usr/bin/env bash
# One-time preparation of the Systalink VM (Debian/Ubuntu), run as root:
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... codesphere-deploy" bash prepare-server.sh
# Installs Docker + Compose, creates the unprivileged `deploy` user, opens only 22/80/443.
set -euo pipefail

: "${DEPLOY_PUBKEY:?set DEPLOY_PUBKEY to the public key of the deployment key pair}"
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

apt-get update
apt-get install -y ca-certificates curl ufw
curl -fsSL https://get.docker.com | sh

id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null \
  || echo "$DEPLOY_PUBKEY" >>/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Host key fingerprint (DEPLOY_HOST_FINGERPRINT):"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
docker compose version
