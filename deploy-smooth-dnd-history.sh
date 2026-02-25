#!/bin/bash

# Deploy smooth drag-and-drop and script history feature to VPS

VPS_HOST="72.62.200.145"
VPS_USER="root"
VPS_PASSWORD="Loqueveoloveo290802#"
VPS_PATH="/var/www/connectacreators"
LOCAL_PATH="/Users/admin/Desktop/connectacreators"

echo "🚀 Deploying smooth drag-and-drop and script history feature..."

# Create expect script for SCP uploads
expect << EOF
set timeout 30

# Upload migration file
spawn scp -r $LOCAL_PATH/supabase/migrations/20260224_script_versions.sql $VPS_USER@$VPS_HOST:$VPS_PATH/supabase/migrations/

expect "password:"
send "$VPS_PASSWORD\r"
expect eof

# Upload updated Scripts.tsx
spawn scp -r $LOCAL_PATH/src/pages/Scripts.tsx $VPS_USER@$VPS_HOST:$VPS_PATH/src/pages/

expect "password:"
send "$VPS_PASSWORD\r"
expect eof
EOF

echo "✅ Files uploaded to VPS"

# SSH into VPS and rebuild
expect << EOF
set timeout 120

spawn ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST

expect "password:"
send "$VPS_PASSWORD\r"

# Navigate to project directory
expect "#"
send "cd $VPS_PATH\r"

# Run build
expect "#"
send "npm run build\r"

# Wait for build to complete
expect "#"
send "systemctl reload nginx\r"

expect "#"
send "exit\r"

expect eof
EOF

echo "✅ Build completed and nginx reloaded!"
echo "🎉 Script history feature with smooth drag-and-drop is now live!"
