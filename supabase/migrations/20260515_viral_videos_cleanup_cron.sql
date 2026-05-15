-- Migration: 20260515_viral_videos_cleanup_cron
-- Schedules the daily cleanup of expired viral-videos bucket files.
-- Runs at 04:00 UTC daily; removes MP4s whose video_file_expires_at has passed
-- and nulls the corresponding video_file_url + video_file_expires_at columns.
-- Transcript and framework_meta remain forever — only the file is deleted.
--
-- To remove the job: SELECT cron.unschedule('cleanup-expired-viral-videos-daily');

SELECT cron.schedule(
  'cleanup-expired-viral-videos-daily',
  '0 4 * * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/cleanup-expired-viral-videos',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
