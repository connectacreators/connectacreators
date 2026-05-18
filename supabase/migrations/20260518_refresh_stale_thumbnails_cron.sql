-- Migration: 20260518_refresh_stale_thumbnails_cron
-- Schedules periodic refresh of stale viral_videos.thumbnail_url rows.
-- Picks up Instagram/Facebook signed-CDN URLs (rotate hourly) and TikTok
-- URLs whose embedded x-expires has passed, re-resolves a fresh CDN URL,
-- self-hosts it on the VPS, and stores the stable connectacreators.com URL.
--
-- Cadence: every 5 minutes, limit=25 → ~300 rows/hour. Initial backfill of
-- ~1,238 rows clears in ~4 hours; afterward the job is mostly a no-op.
--
-- To remove: SELECT cron.unschedule('refresh-stale-thumbnails-5min');

SELECT cron.schedule(
  'refresh-stale-thumbnails-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/refresh-stale-thumbnails',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"limit":25}'::jsonb
    );
  $$
);
