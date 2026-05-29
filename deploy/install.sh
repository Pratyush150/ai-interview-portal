#!/usr/bin/env bash
#
# Aperture AI Interview Portal — one-shot installer for Oracle Cloud Ubuntu.
#
# Idempotent: re-running it is safe. Skips work that's already done.
#
# Usage (on the Oracle VM, as the `ubuntu` user with sudo):
#
#     git clone https://github.com/Pratyush150/ai-interview-portal.git /opt/aperture/src
#     sudo bash /opt/aperture/src/deploy/install.sh
#
# What it does:
#   1. apt-installs Python 3.11, Node 20, nginx, ffmpeg, certbot, ufw
#   2. Creates an `aperture` system user with its own venv
#   3. Builds the Next.js static export
#   4. Generates a self-signed TLS cert for the instance's public IP
#   5. Installs the nginx vhost (reverse-proxies uvicorn, terminates TLS)
#   6. Installs the systemd unit and starts the service
#   7. Opens UFW for 22/80/443 (Oracle Security List must also allow these)
#
# After the script: visit https://<public-ip>/ — browsers will warn about
# the self-signed cert; click "Advanced → Proceed anyway" ONCE per device.

set -euo pipefail

# ── Paths and constants ──────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/opt/aperture/src}"
ETC_DIR="/etc/aperture"
DATA_DIR="/var/lib/aperture"
USER_NAME="aperture"
VENV_DIR="/opt/aperture/venv"
CERT_DIR="/etc/ssl/aperture"
SERVICE_NAME="aperture"
NGINX_SITE="aperture"

if [[ $EUID -ne 0 ]]; then
  echo "This installer must run as root (sudo bash $0)." >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Repository not found at $REPO_DIR. Clone it there first:" >&2
  echo "  git clone https://github.com/Pratyush150/ai-interview-portal.git $REPO_DIR" >&2
  exit 1
fi

echo "==> Detecting public IP"
PUBLIC_IP="$(curl -s --max-time 5 https://api.ipify.org || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -s --max-time 5 https://ifconfig.me || true)"
fi
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
fi
echo "    Public IP detected: $PUBLIC_IP"

# ── 1. System packages ──────────────────────────────────────────────────────
echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  python3.11 python3.11-venv python3.11-dev python3-pip \
  build-essential git curl ca-certificates gnupg \
  nginx ffmpeg ufw openssl

# Node 20 (NodeSource) — only needed at build time, but keeping it on the box
# means `git pull && npm run build` updates are one command.
if ! command -v node >/dev/null || [[ "$(node -v 2>/dev/null | grep -oE '^v[0-9]+' || true)" != "v20" ]]; then
  echo "==> Installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ── 2. System user + directories ────────────────────────────────────────────
if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  echo "==> Creating system user $USER_NAME"
  useradd --system --create-home --shell /usr/sbin/nologin "$USER_NAME"
fi

mkdir -p "$ETC_DIR" "$DATA_DIR" "$CERT_DIR" /opt/aperture
chown "$USER_NAME:$USER_NAME" "$DATA_DIR"
chmod 750 "$ETC_DIR" "$DATA_DIR"

# Repo: ensure the system user can read it.
chown -R "$USER_NAME:$USER_NAME" "$REPO_DIR"

# ── 3. Python venv + dependencies ───────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
  echo "==> Creating Python virtualenv at $VENV_DIR"
  python3.11 -m venv "$VENV_DIR"
fi
chown -R "$USER_NAME:$USER_NAME" /opt/aperture
echo "==> Installing Python dependencies (this takes ~2 min)"
sudo -u "$USER_NAME" "$VENV_DIR/bin/pip" install --quiet --upgrade pip
sudo -u "$USER_NAME" "$VENV_DIR/bin/pip" install --quiet -r "$REPO_DIR/requirements.txt"

# ── 4. .env file ────────────────────────────────────────────────────────────
# Only write the .env if it doesn't already exist. The operator pastes their
# secrets into /etc/aperture/.env *before* re-running this script when
# rotating keys, so this protects against accidental overwrites.
if [[ ! -f "$ETC_DIR/.env" ]]; then
  echo "==> Creating /etc/aperture/.env stub — EDIT IT before re-running"
  cat > "$ETC_DIR/.env" <<'EOF'
# Aperture AI Interview Portal — production environment
# All keys are loaded by backend/api.py on boot via python-dotenv.

GROQ_API_KEY=PASTE_GROQ_KEY_HERE
GROQ_MODEL=llama-3.3-70b-versatile

DEEPGRAM_API_KEY=PASTE_DEEPGRAM_KEY_HERE

# Optional — leave blank to use free Edge TTS as fallback.
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Public URL — used to build invite links sent to candidates.
BASE_URL=https://PUBLIC_IP_OR_DOMAIN_HERE

# SMTP — leave blank to skip email invites (recruiters share links manually).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SALES_NOTIFY_EMAIL=
EOF
  chmod 600 "$ETC_DIR/.env"
  chown root:"$USER_NAME" "$ETC_DIR/.env"
  echo ""
  echo "   ⚠ Stub .env created at $ETC_DIR/.env"
  echo "     Fill in your GROQ_API_KEY + DEEPGRAM_API_KEY + BASE_URL, then re-run this script."
  exit 0
fi

# Sanity check: required keys are non-empty.
. "$ETC_DIR/.env"
: "${GROQ_API_KEY:?GROQ_API_KEY missing in $ETC_DIR/.env}"
: "${DEEPGRAM_API_KEY:?DEEPGRAM_API_KEY missing in $ETC_DIR/.env}"

# ── 5. Build the Next.js static export ──────────────────────────────────────
echo "==> Building the Next.js static export (one-time, ~3 min)"
cd "$REPO_DIR/web"
sudo -u "$USER_NAME" bash -c "npm ci --no-audit --no-fund && npm run build"
cd "$REPO_DIR"

# ── 6. Data directory: move the SQLite file off the repo path ──────────────
# Production policy: portal.db lives in /var/lib/aperture so `git pull`
# never touches it. Backend reads it via the DATA_DIR env var (set on the
# systemd unit, see below).
if [[ -f "$REPO_DIR/data/portal.db" && ! -f "$DATA_DIR/portal.db" ]]; then
  echo "==> Migrating existing portal.db to $DATA_DIR"
  cp "$REPO_DIR/data/portal.db" "$DATA_DIR/portal.db"
  chown "$USER_NAME:$USER_NAME" "$DATA_DIR/portal.db"
  chmod 600 "$DATA_DIR/portal.db"
fi
# Symlink so the unchanged backend code keeps finding the DB at the path
# it expects (`data/portal.db` relative to repo root). Avoids touching the
# DB-locator code for this deploy.
if [[ ! -L "$REPO_DIR/data/portal.db" ]]; then
  rm -f "$REPO_DIR/data/portal.db"
  mkdir -p "$REPO_DIR/data"
  ln -sf "$DATA_DIR/portal.db" "$REPO_DIR/data/portal.db"
fi

# ── 7. Self-signed TLS cert for the public IP ──────────────────────────────
if [[ ! -f "$CERT_DIR/fullchain.pem" || ! -f "$CERT_DIR/privkey.pem" ]]; then
  echo "==> Generating self-signed cert for IP $PUBLIC_IP (1-year validity)"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -days 365 \
    -subj "/CN=$PUBLIC_IP" \
    -addext "subjectAltName=IP:$PUBLIC_IP" 2>/dev/null
  chmod 600 "$CERT_DIR/privkey.pem"
  chmod 644 "$CERT_DIR/fullchain.pem"
fi

# ── 8. nginx vhost ──────────────────────────────────────────────────────────
echo "==> Installing nginx vhost"
cp "$REPO_DIR/deploy/nginx.conf" /etc/nginx/sites-available/$NGINX_SITE
# Substitute the cert path + repo dir in case the template is generic.
sed -i "s|__CERT_DIR__|$CERT_DIR|g; s|__REPO_DIR__|$REPO_DIR|g" \
  /etc/nginx/sites-available/$NGINX_SITE
ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/$NGINX_SITE
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 9. systemd unit ─────────────────────────────────────────────────────────
echo "==> Installing systemd unit"
cp "$REPO_DIR/deploy/aperture.service" /etc/systemd/system/$SERVICE_NAME.service
sed -i "s|__VENV_DIR__|$VENV_DIR|g; s|__REPO_DIR__|$REPO_DIR|g; s|__USER__|$USER_NAME|g; s|__ENV_FILE__|$ETC_DIR/.env|g" \
  /etc/systemd/system/$SERVICE_NAME.service
systemctl daemon-reload
systemctl enable --now $SERVICE_NAME
systemctl restart $SERVICE_NAME  # in case we re-ran

# ── 10. UFW firewall (Oracle Security List must also allow these) ──────────
echo "==> Opening firewall (UFW)"
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Oracle Ubuntu images have aggressive iptables rules in addition to UFW.
# Add explicit ACCEPT rules so connections actually reach nginx.
iptables -C INPUT -p tcp --dport 80  -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80  -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save || true
fi

# ── 11. Smoke test ─────────────────────────────────────────────────────────
echo "==> Smoke test"
sleep 2
HEALTH=$(curl -k -s -o /dev/null -w "%{http_code}" "https://localhost/api/roles" || true)
if [[ "$HEALTH" != "200" ]]; then
  echo "    ⚠ Smoke test got HTTP $HEALTH (expected 200)"
  echo "    Inspect: journalctl -u $SERVICE_NAME -n 100"
else
  echo "    ✓ Backend responding on HTTPS"
fi

echo ""
echo "✓ Deploy complete"
echo ""
echo "  URL:           https://$PUBLIC_IP/"
echo "  Service:       systemctl status $SERVICE_NAME"
echo "  Logs:          journalctl -u $SERVICE_NAME -f"
echo "  Database:      $DATA_DIR/portal.db"
echo "  Env file:      $ETC_DIR/.env"
echo "  Cert:          $CERT_DIR/fullchain.pem"
echo ""
echo "  Browsers will warn 'Not Secure' (self-signed cert). Click"
echo "  'Advanced → Proceed' once per device — required for camera/mic"
echo "  permission to stick."
echo ""
echo "  When you have a domain: re-run with certbot:"
echo "    certbot --nginx -d interview.yourdomain.com"
