#!/bin/bash
# Auto-refresh Instagram session cookies — connectabroski + gaunamedia
# Runs via cron every 6 hours
# Crontab: 0 */6 * * * /var/www/ig-refresh-cron.sh >> /var/log/ig-refresh.log 2>&1

LOG_PREFIX="[ig-cron $(date '+%Y-%m-%d %H:%M')]"
echo "$LOG_PREFIX Starting cookie refresh for connectabroski..."

# Step 1: Try API-based refresh (fast, no browser)
cd /var/www && timeout 60 node ig-login-api.js 2>&1
if [ $? -eq 0 ]; then
  echo "$LOG_PREFIX API refresh: SUCCESS"
  pm2 restart ytdlp-server --silent 2>&1
  echo "$LOG_PREFIX Done"
  exit 0
fi

echo "$LOG_PREFIX API refresh failed — trying Puppeteer..."

# Step 2: Puppeteer login (connectabroski)
cd /var/www && timeout 90 node ig-login.js 2>&1
if [ $? -eq 0 ]; then
  echo "$LOG_PREFIX Puppeteer login: SUCCESS"
  pm2 restart ytdlp-server --silent 2>&1
  echo "$LOG_PREFIX Done"
  exit 0
fi

echo "$LOG_PREFIX ALL METHODS FAILED — session needs manual intervention"
echo "$LOG_PREFIX Done"
exit 1
