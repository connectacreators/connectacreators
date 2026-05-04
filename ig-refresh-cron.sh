#!/bin/bash
# Auto-refresh Instagram session cookies — runs via cron every 12 hours
# Crontab: 0 */12 * * * /var/www/ig-refresh-cron.sh >> /var/log/ig-refresh.log 2>&1

LOG_PREFIX="[ig-cron $(date '+%Y-%m-%d %H:%M')]"

echo "$LOG_PREFIX Starting cookie refresh..."

# Use API-based refresh (no browser needed, much more reliable)
echo "$LOG_PREFIX Refreshing via API..."
cd /var/www && timeout 60 node ig-login-api.js 2>&1
if [ $? -eq 0 ]; then
  echo "$LOG_PREFIX API refresh: SUCCESS"
else
  echo "$LOG_PREFIX API refresh: FAILED — sessions may need manual re-login"
fi

# Restart PM2 to clear stale account set
echo "$LOG_PREFIX Restarting ytdlp-server..."
pm2 restart ytdlp-server --silent 2>&1

echo "$LOG_PREFIX Done"
