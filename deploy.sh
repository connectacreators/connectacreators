#!/usr/bin/env bash
# Fast local deploy: build locally → upload built assets → purge Cloudflare cache
# Usage: ./deploy.sh
# Takes ~3-5 min (vs 30-90 min when building on VPS)
set -euo pipefail

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
REMOTE_DIR="/var/www/connectacreators"
CF_ZONE="ba43e8ef9bfec0c8169170a87bde8d68"
CF_EMAIL="robertogaunaj@gmail.com"
CF_KEY="cfk_azUrhlpbrDiGGLqXzdrk0Yw4ALBjGZkj5Ml8HteW390c6336"

# Ensure sshpass is available (needed for non-interactive password auth)
if ! command -v sshpass &>/dev/null; then
  echo "Installing sshpass (one-time)..."
  brew install hudochenkov/sshpass/sshpass
fi

echo "▶ 1/4  Building locally..."
npm run build

echo "▶ 2/4  Packaging dist..."
cd dist
tar czf /tmp/connecta-deploy.tar.gz assets/ index.html landing.html
cd ..
SIZE=$(du -sh /tmp/connecta-deploy.tar.gz | cut -f1)
echo "       Package: $SIZE"

echo "▶ 3/4  Uploading to VPS..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no \
  /tmp/connecta-deploy.tar.gz "$USER@$HOST:/tmp/connecta-deploy.tar.gz"

echo "       Extracting on VPS..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$HOST" \
  "cd $REMOTE_DIR && tar xzf /tmp/connecta-deploy.tar.gz && rm /tmp/connecta-deploy.tar.gz"

echo "▶ 4/4  Purging Cloudflare cache..."
RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/purge_cache" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')
echo "       $RESULT"

rm -f /tmp/connecta-deploy.tar.gz

echo ""
echo "✅  Live at https://connectacreators.com"
echo "    Hard-refresh (Cmd+Shift+R) to see changes"
