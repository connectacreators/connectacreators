-- Bump delta scrape cadence from every-2-days to daily.
-- Edge function now processes channels in parallel batches and time-boxes
-- itself to 120s, processing ~32 channels per run. With 50+ channels, daily
-- runs ensure every channel gets refreshed at least every 2 days.

SELECT cron.unschedule('delta-channel-scrape');

SELECT cron.schedule(
  'delta-channel-scrape',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/auto-scrape-channels',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{"mode":"delta"}'::jsonb
    );
  $$
);
