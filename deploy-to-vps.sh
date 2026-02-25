#!/usr/bin/env bash
# Deploy and rebuild ConnectaCreators app on VPS

set -e

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
REMOTE_DIR="/var/www/connectacreators"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying ConnectaCreators to VPS..."
echo "Host: $HOST"
echo "Remote dir: $REMOTE_DIR"

# Create expect script for deployment
cat > /tmp/deploy_expect.sh << 'EXPECT_EOF'
#!/usr/bin/expect

set timeout 600
set host "72.62.200.145"
set user "root"
set password "Loqueveoloveo290802#"
set remote_dir "/var/www/connectacreators"

puts "1️⃣ SSH into VPS..."
spawn ssh -o StrictHostKeyChecking=no $user@$host
expect "password:" { send "$password\r" }
expect "root@"

puts "2️⃣ Backup current build..."
send "cd $remote_dir && ls dist/ > /dev/null 2>&1 && cp -r dist dist.backup || true\r"
expect "root@"

puts "3️⃣ Check Node/npm versions..."
send "node --version && npm --version\r"
expect "root@"

puts "4️⃣ Install dependencies..."
send "npm install 2>&1 | grep -E '(added|up to date|error|Error)' | tail -5\r"
expect "root@"

puts "5️⃣ Build project..."
send "npm run build 2>&1 | tail -20\r"
expect "root@"

puts "6️⃣ Check build result..."
send "ls -lh dist/index.html && du -sh dist/\r"
expect "root@"

puts "✅ Deployment complete!"
send "exit\r"
expect eof
EXPECT_EOF

chmod +x /tmp/deploy_expect.sh

# Run the deployment
echo "Starting deployment process..."
/tmp/deploy_expect.sh

echo ""
echo "✅ Done! Your app should now be live at https://connectacreators.com"
