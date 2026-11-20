#!/usr/bin/env bash
# Sets up the YOUPI PG payment gateway for AfterHours on a Linux PC or server (x64 or arm64)
# that stays on and uses systemd. Run as your normal user (it asks for sudo once):
#   bash setup-linux.sh yourbrand@okaxis [pay.wearafterhours.store]
# It is safe to run again; finished steps are skipped.
set -euo pipefail

UPI_ID="${1:-}"
HOSTNAME_PUBLIC="${2:-pay.wearafterhours.store}"
REPO="https://github.com/youpi-pg/YouPI-PG.git"
COMMIT="405327c" # The version AfterHours was tested against.
NODE_VERSION="24.22.3"
DIR="$HOME/youpi-pg"
TUNNEL="afterhours-pay"
DOMAIN="${HOSTNAME_PUBLIC#*.}"
PREFIX="${HOSTNAME_PUBLIC%%.*}"
API_HOST="$PREFIX-api.$DOMAIN"
GMAIL_HOST="$PREFIX-gmail.$DOMAIN"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin"
mkdir -p "$BIN"
export PATH="$HOME/.local/node24/bin:$BIN:$PATH"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
[[ -n "$UPI_ID" ]] || read -rp "Your UPI ID (for example yourbrand@okaxis): " UPI_ID
[[ "$UPI_ID" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$ ]] || { echo "That does not look like a UPI ID."; exit 1; }
case "$(uname -m)" in x86_64) NODE_ARCH=x64; CF_ARCH=amd64 ;; aarch64|arm64) NODE_ARCH=arm64; CF_ARCH=arm64 ;; *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;; esac

step "Checking Node.js 24.22.1+, Git and cloudflared"
node_ok() { command -v node >/dev/null && node -e "const [a,b,c]=process.versions.node.split('.').map(Number);process.exit(a>24||(a==24&&(b>22||(b==22&&c>=1)))?0:1)"; }
if ! node_ok; then
  tmp="$(mktemp -d)"
  file="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$file" -o "$tmp/$file"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | grep " $file\$" | (cd "$tmp" && sha256sum -c -)
  rm -rf "$HOME/.local/node24" && mkdir -p "$HOME/.local/node24"
  tar -xJf "$tmp/$file" -C "$HOME/.local/node24" --strip-components=1
  rm -rf "$tmp"
  hash -r # Forget the old node location so the new one is used.
  node_ok || { echo "Node $NODE_VERSION did not install correctly."; exit 1; }
fi
command -v git >/dev/null || sudo apt-get install -y git
if ! command -v cloudflared >/dev/null; then
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o "$BIN/cloudflared"
  chmod +x "$BIN/cloudflared"
fi
node -v; git --version; cloudflared --version

step "Downloading the gateway to $DIR"
[[ -d "$DIR/.git" ]] || git clone "$REPO" "$DIR"
cd "$DIR"
git fetch --quiet origin
git -c advice.detachedHead=false checkout --quiet "$COMMIT"
npm ci --no-audit --no-fund

step "Writing AfterHours settings into .env"
cp "$HERE/connect-afterhours.mjs" "$DIR/connect-afterhours.mjs"
node connect-afterhours.mjs env --upi "$UPI_ID" --host "$HOSTNAME_PUBLIC"

step "Creating the Cloudflare Tunnel for $HOSTNAME_PUBLIC"
CF_DIR="$HOME/.cloudflared"
if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  echo "Open the link below, sign in to Cloudflare and pick $DOMAIN."
  cloudflared tunnel login
fi
tunnel_id() { cloudflared tunnel list --name "$TUNNEL" --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s||'[]');process.stdout.write(t[0]?.id||'')})"; }
TUNNEL_ID="$(tunnel_id)"
[[ -n "$TUNNEL_ID" ]] || { cloudflared tunnel create "$TUNNEL"; TUNNEL_ID="$(tunnel_id)"; }
for h in "$HOSTNAME_PUBLIC" "$API_HOST" "$GMAIL_HOST"; do
  cloudflared tunnel route dns "$TUNNEL" "$h" || echo "  (DNS for $h may already exist; check it points to this tunnel in Cloudflare.)"
done
# Only the checkout portal, the API (for the Android observer) and Gmail sign-in are public.
# The admin panel (6001) and control center (8090) stay on this machine.
CONFIG="$CF_DIR/$TUNNEL.yml"
cat > "$CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CF_DIR/$TUNNEL_ID.json
ingress:
  - hostname: $HOSTNAME_PUBLIC
    service: http://localhost:7000
  - hostname: $API_HOST
    service: http://localhost:6100
  - hostname: $GMAIL_HOST
    service: http://localhost:6003
  - service: http_status:404
EOF

step "Starting the gateway and tunnel now and at every boot"
UNITS="$HOME/.config/systemd/user"
mkdir -p "$UNITS" "$DIR/logs"
cat > "$UNITS/afterhours-gateway.service" <<EOF
[Unit]
Description=AfterHours payment gateway (YOUPI PG)
After=network-online.target

[Service]
WorkingDirectory=$DIR
Environment=PATH=$HOME/.local/node24/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$(command -v npm) start
Restart=always
RestartSec=10
StandardOutput=append:$DIR/logs/gateway.log
StandardError=append:$DIR/logs/gateway.log

[Install]
WantedBy=default.target
EOF
cat > "$UNITS/afterhours-tunnel.service" <<EOF
[Unit]
Description=AfterHours payment tunnel (Cloudflare)
After=network-online.target afterhours-gateway.service

[Service]
ExecStart=$(command -v cloudflared) tunnel --config $CONFIG run $TUNNEL
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
sudo loginctl enable-linger "$(id -un)" # Keep the services running without a signed-in session.
systemctl --user daemon-reload
systemctl --user enable --now afterhours-gateway.service afterhours-tunnel.service

echo "Waiting for the gateway to come up..."
for _ in $(seq 1 90); do curl -fs http://localhost:7000/health >/dev/null && break; sleep 1; done
curl -fs http://localhost:7000/health >/dev/null || { echo "The gateway did not start. See $DIR/logs/gateway.log"; exit 1; }

step "Connecting the gateway to AfterHours"
node connect-afterhours.mjs connect --upi "$UPI_ID"

printf '\n\033[32mDone. Next:\033[0m\n'
echo "  1. Copy the four values above into Supabase > Edge Functions > Secrets, then delete $DIR/afterhours-secrets.txt"
echo "  2. Open http://localhost:6001 on this machine and pair the Android observer phone (or connect Gmail)."
echo "  3. Check https://$HOSTNAME_PUBLIC/health shows UP, then tick 'Detect UPI payments automatically' in the AfterHours owner panel."
