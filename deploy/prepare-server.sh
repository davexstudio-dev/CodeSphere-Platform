#!/usr/bin/env bash
# One-time preparation of the Systalink VM (Debian/Ubuntu), run as root:
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... codesphere-deploy" bash prepare-server.sh
# Installs Docker + Compose, creates two unprivileged-by-default users, locks SSH down and opens
# only 22/80/443:
#   - `deploy`: used by the Release workflow only (key = DEPLOY_PUBKEY), member of `docker`, no sudo.
#   - `admin` (ADMIN_USER): the humans' login, with sudo. It inherits root's current
#     authorized_keys (the key the provider gave the team), unless ADMIN_PUBKEY is set.
# SSH afterwards: root login off, password login off, only `admin` and `deploy` may connect.
# Run it from a root session and keep that session open: test `ssh admin@<ip>` from a second
# terminal before closing it. The sshd change is validated (`sshd -t`) before it is applied, and a
# reload does not drop the sessions already open.
set -euo pipefail

: "${DEPLOY_PUBKEY:?set DEPLOY_PUBKEY to the public key of the deployment key pair}"
ADMIN_USER="${ADMIN_USER:-admin}"
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

# The admin keys, read before anything changes: ADMIN_PUBKEY, else what root accepts today.
admin_keys="${ADMIN_PUBKEY:-}"
if [ -z "$admin_keys" ] && [ -s /root/.ssh/authorized_keys ]; then
  admin_keys="$(cat /root/.ssh/authorized_keys)"
fi
[ -n "$admin_keys" ] || { echo "no admin key: set ADMIN_PUBKEY (root has no authorized_keys)" >&2; exit 1; }

apt-get update
apt-get install -y ca-certificates curl ufw
curl -fsSL https://get.docker.com | sh

# install_key <user> <public key(s)>: appends the keys missing from authorized_keys.
install_key() {
  local user="$1" keys="$2" dir="/home/$1/.ssh" line
  install -d -m 700 -o "$user" -g "$user" "$dir"
  touch "$dir/authorized_keys"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    grep -qxF "$line" "$dir/authorized_keys" || echo "$line" >>"$dir/authorized_keys"
  done <<<"$keys"
  chown "$user:$user" "$dir/authorized_keys"
  chmod 600 "$dir/authorized_keys"
}

id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker deploy
install_key deploy "$DEPLOY_PUBKEY"

# The humans' login. No password: the key is the credential, so sudo does not ask for one.
id "$ADMIN_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash -G sudo,docker "$ADMIN_USER"
install_key "$ADMIN_USER" "$admin_keys"
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
visudo -cf "/etc/sudoers.d/90-$ADMIN_USER"

# SSH hardening. sshd keeps the FIRST value it reads and the main file includes sshd_config.d/ at
# the top, so a drop-in named 10-* beats both /etc/ssh/sshd_config and the provider's 50-*.
cat >/etc/ssh/sshd_config.d/10-codesphere-hardening.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers $ADMIN_USER deploy
MaxAuthTries 3
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

# Firewall: everything in is denied except SSH, HTTP and HTTPS. No `ufw limit` on SSH: it blocks an
# IP after 6 connections in 30 s, which a Release run can reach, and SSH is key-only anyway.
# Docker publishes its own ports around ufw, so docker-compose.prod.yml must publish nothing but
# Caddy's 80/443.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "Host key fingerprint (DEPLOY_HOST_FINGERPRINT):"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
echo "Effective sshd settings:"
sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|allowusers|pubkeyauthentication) '
ufw status verbose
docker compose version
echo "Now, from a second terminal: ssh $ADMIN_USER@<ip>, then close the root session."
