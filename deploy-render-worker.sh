#!/usr/bin/env bash
# Deploy / update the render worker on the VPS.
#
# The VPS does NOT hold a git checkout of this repo (the web app ships via
# GitHub Actions). So we package the tracked render-worker source from
# origin/main as a tarball, upload it, then rebuild + restart on the box.
# `npm ci` MUST run on the VPS — ffmpeg-static installs a platform-specific
# binary, so a macOS-built node_modules would not run on Linux.
#
# One-time setup (env file at /etc/connecta-render-worker.env + the systemd
# unit) must already exist — see render-worker/README.md. This script only
# updates code and restarts.
set -euo pipefail

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
BASE="/var/www/connectacreators-render-worker"

if ! command -v expect >/dev/null 2>&1; then
  echo "ERROR: expect is required (preinstalled on macOS)" >&2
  exit 1
fi

echo "▶ 1/3  Packaging render-worker source from origin/main..."
git fetch origin main --quiet
git archive --format=tar.gz -o /tmp/rw-src.tgz origin/main render-worker

echo "▶ 2/3  Uploading to VPS..."
expect <<EOF
set timeout 120
spawn scp -o StrictHostKeyChecking=no /tmp/rw-src.tgz $USER@$HOST:/tmp/
expect { "password:" { send "$PASSWORD\r" } }
expect eof
EOF

echo "▶ 3/3  Extracting, building, restarting service..."
expect <<EOF
set timeout 420
log_user 1
spawn ssh -o StrictHostKeyChecking=no $USER@$HOST
expect { "password:" { send "$PASSWORD\r" } }
expect "#"
send "tar xzf /tmp/rw-src.tgz -C $BASE && cd $BASE/render-worker && npm ci && npx tsc -p tsconfig.json && test -f dist/index.js && systemctl restart connecta-render-worker && sleep 3 && systemctl --no-pager status connecta-render-worker | head -8 && rm -f /tmp/rw-src.tgz && exit\r"
expect eof
EOF

rm -f /tmp/rw-src.tgz
echo "▶ Done."
