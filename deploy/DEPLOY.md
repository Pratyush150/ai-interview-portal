# Deploy — Oracle Cloud (or any Ubuntu 22.04 VM)

One-shot install. Five copy-paste commands, ~15 minutes.

## Prerequisites

- Ubuntu 22.04 LTS instance on Oracle Cloud (8 GB RAM, 50 GB disk is fine).
- Oracle Cloud Security List allows ingress on **22, 80, 443** from `0.0.0.0/0` (or your IP for 22).
- SSH access as the `ubuntu` user.

## Step 1 — SSH in

```bash
ssh -i /path/to/your-key.pem ubuntu@<public-ip-of-instance>
```

If your SSH key is passphrase-protected, you'll be prompted for it.

> Verify the IP: in Oracle Cloud Console → Compute → Instances → your instance → **Primary VNIC → Public IPv4 Address**. Use that one.

## Step 2 — Clone the repo

```bash
sudo mkdir -p /opt/aperture
sudo chown $USER:$USER /opt/aperture
git clone https://github.com/Pratyush150/ai-interview-portal.git /opt/aperture/src
```

## Step 3 — First run of the installer

```bash
sudo bash /opt/aperture/src/deploy/install.sh
```

The first run will:
- apt-install Python 3.11, Node 20, nginx, ffmpeg, ufw, openssl
- Create the `aperture` system user + venv
- Write a `.env` stub at `/etc/aperture/.env`
- Stop, telling you to fill in your API keys.

## Step 4 — Fill in `.env`

```bash
sudo nano /etc/aperture/.env
```

Required:
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `BASE_URL` → `https://<public-ip-of-instance>`

Optional:
- `ELEVENLABS_API_KEY` (leave blank → free Edge TTS fallback)
- `SMTP_*` (leave blank → invite emails skipped, recruiters share links from `/links`)

Save (`Ctrl+O`, `Enter`, `Ctrl+X`).

## Step 5 — Re-run the installer

```bash
sudo bash /opt/aperture/src/deploy/install.sh
```

This time it'll:
- `pip install` the backend
- `npm ci && npm run build` the Next.js export
- Move `portal.db` to `/var/lib/aperture/portal.db` (symlinked so backend code is unchanged)
- Generate a self-signed cert for your public IP, valid 365 days
- Install + reload the nginx vhost
- Install + start the `aperture` systemd service (4 uvicorn workers on `127.0.0.1:8000`)
- Open UFW for 22/80/443 and force-apply matching iptables ACCEPT rules
- Smoke-test `/api/roles` over HTTPS

## Step 6 — Open the site

Browser → `https://<public-ip>/`

You'll get a "Your connection is not private" warning. **This is the self-signed cert — expected.** Click:

- Chrome / Edge: **Advanced → Proceed to <ip> (unsafe)**
- Firefox: **Advanced → Accept the Risk and Continue**
- Safari: **Show details → visit this website**

After accepting once, the browser remembers it for that device. **Camera and microphone permission will work** because the page now counts as "secure context".

## What runs where

| Component | Location | Port |
|---|---|---|
| nginx (TLS + static) | systemd `nginx` | 80, 443 |
| uvicorn (FastAPI) | systemd `aperture` | `127.0.0.1:8000` |
| SQLite DB | `/var/lib/aperture/portal.db` | — |
| Env file | `/etc/aperture/.env` (`chmod 600`) | — |
| TLS cert | `/etc/ssl/aperture/{fullchain,privkey}.pem` | — |
| Source | `/opt/aperture/src` | — |
| Python venv | `/opt/aperture/venv` | — |

## Day-2 operations

**Logs**:
```bash
sudo journalctl -u aperture -f             # tail
sudo journalctl -u aperture --since '1h'   # last hour
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**Restart after a code change**:
```bash
cd /opt/aperture/src
sudo -u aperture git pull
sudo bash deploy/install.sh         # rebuilds Next + reinstalls deps
sudo systemctl restart aperture
```

**Status**:
```bash
sudo systemctl status aperture
sudo systemctl status nginx
```

**DB backup** (manual for now):
```bash
sudo cp /var/lib/aperture/portal.db /var/lib/aperture/portal-$(date +%F).db
```

## Upgrading to a real domain + Let's Encrypt

When you buy a domain and point an A record at the instance:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d interview.yourdomain.com
sudo sed -i 's|BASE_URL=.*|BASE_URL=https://interview.yourdomain.com|' /etc/aperture/.env
sudo systemctl restart aperture
```

Certbot auto-installs a renewal timer; no further action needed.

## Troubleshooting

**Browser can't reach the IP** → Oracle Security List doesn't have 443 open. Fix it in the console.

**Site loads but `/api/roles` returns 502** → uvicorn isn't running. Check `sudo journalctl -u aperture -n 100`.

**Camera/mic still doesn't work** → you opened `http://` not `https://`. The HTTP listener 301s to HTTPS, so this shouldn't happen, but check the URL bar.

**`pip install` fails on `PyMuPDF`** → missing build tools. `sudo apt-get install -y build-essential`.

**Self-signed cert expired (1 year later)** → re-run `sudo bash deploy/install.sh`, it'll regenerate.
