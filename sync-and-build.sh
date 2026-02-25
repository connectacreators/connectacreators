#!/usr/bin/env bash
# Sync source files to VPS and rebuild

set -e

HOST="72.62.200.145"
USER="root"
LOCAL_DIR="/Users/admin/Desktop/connectacreators"
REMOTE_DIR="/var/www/connectacreators"

echo "📁 Syncing source files to VPS..."
echo "From: $LOCAL_DIR"
echo "To: $HOST:$REMOTE_DIR"
echo ""

# Create expect script for file sync
cat > /tmp/sync_expect.sh << 'EXPECT_EOF'
#!/usr/bin/expect

set timeout 900
set host "72.62.200.145"
set user "root"
set password "Loqueveoloveo290802#"

# Copy src folder
puts "📤 Syncing source files..."
spawn scp -r -o StrictHostKeyChecking=no /Users/admin/Desktop/connectacreators/src $user@$host:/var/www/connectacreators/
expect {
  "password:" { send "$password\r"; exp_continue }
  "100%" { exp_continue }
  "file" { exp_continue }
  eof { }
}

puts "📤 Syncing config files..."
spawn scp -o StrictHostKeyChecking=no /Users/admin/Desktop/connectacreators/{package.json,package-lock.json,tsconfig.json,tsconfig.app.json,tsconfig.node.json,vite.config.ts,tailwind.config.ts,postcss.config.js,index.html,.env} $user@$host:/var/www/connectacreators/
expect {
  "password:" { send "$password\r"; exp_continue }
  eof { }
}

puts "🔨 Building on VPS..."
spawn ssh -o StrictHostKeyChecking=no $user@$host
expect "password:" { send "$password\r" }
expect "root@"

send "cd /var/www/connectacreators\r"
expect "root@"

send "npm install\r"
set timeout 300
expect "up to date" { }
expect "root@"

puts "⏳ Running build (this may take 1-2 minutes)..."
send "npm run build 2>&1 | tail -30\r"
expect "root@"

send "echo 'Build status:' && ls -lh dist/index.html && du -sh dist/\r"
expect "root@"

puts "✅ Done!"
send "exit\r"
expect eof
EXPECT_EOF

chmod +x /tmp/sync_expect.sh

# Make sure expect is available
if ! command -v expect &> /dev/null; then
  echo "❌ Error: 'expect' not found. Please install it with: brew install expect"
  exit 1
fi

# Run the sync and build
echo "Starting sync and build..."
/tmp/sync_expect.sh

echo ""
echo "✅ Complete! Your app should now be live at https://connectacreators.com"
echo ""
echo "If you see any errors above, check that:"
echo "  1. SSH key access is working"
echo "  2. Node.js and npm are installed on the VPS"
echo "  3. The /var/www/connectacreators directory exists and is writable"
