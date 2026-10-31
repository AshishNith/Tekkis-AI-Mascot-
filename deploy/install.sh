#!/usr/bin/env bash
# Installs or updates the Tekkie server on an Ubuntu VPS, served over HTTPS by Caddy.
#
#   curl -fsSL https://raw.githubusercontent.com/AshishNith/Tekkis-AI-Mascot-/claude/ecstatic-wozniak-74b9as/deploy/install.sh | sudo bash
#
# Optional overrides: TEKKIE_DOMAIN (default: this server's hostname), GEMINI_API_KEY,
# TEKKIE_BRANCH. Re-run the same command to update to the latest code.
set -euo pipefail

REPO="https://github.com/AshishNith/Tekkis-AI-Mascot-.git"
BRANCH="${TEKKIE_BRANCH:-claude/ecstatic-wozniak-74b9as}"
DIR="/opt/tekkie"
DOMAIN="${TEKKIE_DOMAIN:-$(hostname -f)}"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (prefix the command with sudo)."
case "$DOMAIN" in *.*) ;; *) die "Could not work out this server's domain. Re-run with TEKKIE_DOMAIN=your.domain" ;; esac

say "Tekkie will be served at https://$DOMAIN"

# Never take over ports another website on this server is using.
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'tekkie.*caddy'; then
  busy="$(ss -ltnH '( sport = :80 or sport = :443 )' 2>/dev/null || true)"
  if [ -n "$busy" ]; then
    echo "$busy"
    die "Ports 80/443 are already used by another program on this server (shown above). Nothing was changed."
  fi
fi

say "Installing Docker and git (if needed)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2 git || apt-get install -y docker.io docker-compose-plugin git
fi
command -v git >/dev/null || apt-get install -y git
systemctl enable --now docker

say "Fetching the code ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" checkout -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

# .env keeps the Gemini key on this server only (it is never committed).
touch .env && chmod 600 .env
current_key="$(grep -E '^GEMINI_API_KEY=.+' .env | cut -d= -f2- || true)"
key="${GEMINI_API_KEY:-$current_key}"
if [ -z "$key" ]; then
  [ -r /dev/tty ] || die "Set GEMINI_API_KEY=... before the command (no terminal to ask in)."
  read -rsp "Paste your Gemini API key (input hidden): " key < /dev/tty
  echo
fi
[ -n "$key" ] || die "A Gemini API key is required."
set_env() { grep -v -E "^$1=" .env > .env.tmp || true; echo "$1=$2" >> .env.tmp; mv .env.tmp .env; chmod 600 .env; }
set_env GEMINI_API_KEY "$key"
set_env TEKKIE_DOMAIN "$DOMAIN"
grep -q '^GEMINI_LIVE_MODEL=' .env || set_env GEMINI_LIVE_MODEL gemini-3.8-live

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "Opening ports 80 and 443 in the firewall"
  ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
fi

say "Building and starting Tekkie (first run takes a few minutes)"
docker compose up -d --build --remove-orphans

say "Waiting for https://$DOMAIN to come up (getting the certificate)"
for _ in $(seq 1 40); do
  if health="$(curl -fsS --max-time 5 "https://$DOMAIN/api/health" 2>/dev/null)"; then
    echo "$health"
    say "Done! Tekkie is live at https://$DOMAIN"
    exit 0
  fi
  sleep 5
done
docker compose ps
docker compose logs --tail 40
die "Tekkie started but https://$DOMAIN is not answering yet. Check that the domain points to this server and ports 80/443 are open in Hostinger's firewall."
