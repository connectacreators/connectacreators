#!/usr/bin/env bash
# Deploy the render worker to the VPS. One-time setup must already be done
# per render-worker/README.md.
set -euo pipefail

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
REMOTE_DIR="/var/www/connectacreators-render-worker"

if ! command -v expect >/dev/null 2>&1; then
  echo "ERROR: expect is required (preinstalled on macOS)" >&2
  exit 1
fi

echo "▶ 1/2  Pulling, rebuilding, restarting service..."
expect <<EOF
set timeout 600
log_user 1
spawn ssh -o StrictHostKeyChecking=no $USER@$HOST
expect {
  "password:" { send "$PASSWORD\r" }
}
expect "#"
send "cd $REMOTE_DIR && git pull && cd render-worker && npm ci --omit=dev && npx tsc -p tsconfig.json && systemctl restart connecta-render-worker && systemctl --no-pager status connecta-render-worker | head -20 && exit\r"
expect eof
EOF

echo "▶ 2/2  Done."
