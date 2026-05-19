-- Migration: 20260518_refresh_stale_thumbnails_cron
-- Schedules periodic refresh of stale viral_videos.thumbnail_url rows.
-- Picks up Instagram/Facebook signed-CDN URLs (rotate hourly) and TikTok
-- URLs whose embedded x-expires has passed, re-resolves a fresh CDN URL,
-- self-hosts it on the VPS, and stores the stable connectacreators.com URL.
--
-- Cadence: every 2 minutes, limit=25 → ~750 rows/hour. Initial backfill of
-- ~1,000 rows clears in ~80 minutes; afterward the job is mostly a no-op.
--
-- To remove: SELECT cron.unschedule('refresh-stale-thumbnails-2min');

SELECT cron.schedule(
  'refresh-stale-thumbnails-2min',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/refresh-stale-thumbnails',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"limit":25}'::jsonb
    );
  $$
);
