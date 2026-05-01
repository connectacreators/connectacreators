-- Replace daily full scrape with:
--   delta scrape every 2 days (3 posts/channel, keeps thumbnails fresh within 3-day expiry)
--   full scrape every Sunday (100 posts/channel, refreshes all stats + outlier scores)

SELECT cron.unschedule('daily-channel-video-update');

-- Delta scrape every 2 days at 6am UTC
SELECT cron.schedule(
  'delta-channel-scrape',
  '0 6 */2 * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/auto-scrape-channels',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{"mode":"delta"}'::jsonb
    );
  $$
);

-- Full scrape every Sunday at 7am UTC
SELECT cron.schedule(
  'weekly-full-channel-scrape',
  '0 7 * * 0',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/auto-scrape-channels',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{"mode":"full"}'::jsonb
    );
  $$
);
