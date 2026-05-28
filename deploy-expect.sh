#!/usr/bin/env bash
# Fast local deploy using expect (no sshpass required).
# Mirrors deploy.sh but works on machines without Homebrew/sshpass.
set -euo pipefail

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
REMOTE_DIR="/var/www/connectacreators"
CF_ZONE="ba43e8ef9bfec0c8169170a87bde8d68"
CF_EMAIL="robertogaunaj@gmail.com"
CF_KEY="cfk_azUrhlpbrDiGGLqXzdrk0Yw4ALBjGZkj5Ml8HteW390c6336"

if ! command -v expect >/dev/null 2>&1; then
  echo "ERROR: expect is required (usually preinstalled on macOS)" >&2
  exit 1
fi

echo "▶ 1/4  Packaging existing dist..."
if [ ! -d dist ]; then
  echo "ERROR: dist/ missing. Run 'npm run build' first." >&2
  exit 1
fi
cd dist
tar czf /tmp/connecta-deploy.tar.gz assets/ index.html landing.html vsl-poster.jpg
cd ..
SIZE=$(du -sh /tmp/connecta-deploy.tar.gz | cut -f1)
echo "       Package: $SIZE"

echo "▶ 2/4  Uploading to VPS..."
expect <<EOF
set timeout 600
log_user 1
spawn scp -o StrictHostKeyChecking=no /tmp/connecta-deploy.tar.gz $USER@$HOST:/tmp/connecta-deploy.tar.gz
expect {
  "password:" { send "$PASSWORD\r"; exp_continue }
  eof
}
EOF

echo "▶ 3/4  Extracting on VPS..."
expect <<EOF
set timeout 300
log_user 1
spawn ssh -o StrictHostKeyChecking=no $USER@$HOST "cd $REMOTE_DIR && tar xzf /tmp/connecta-deploy.tar.gz && rm /tmp/connecta-deploy.tar.gz && echo DEPLOY_OK"
expect {
  "password:" { send "$PASSWORD\r"; exp_continue }
  eof
}
EOF

echo "▶ 4/4  Purging Cloudflare cache..."
RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE/purge_cache" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}')
echo "       $RESULT"

echo "✓ Deploy finished."
