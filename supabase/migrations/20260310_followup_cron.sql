-- Migration: 20260310_followup_cron
-- Sets up pg_cron to run the follow-up queue processor every 5 minutes.
-- Run this in the Supabase SQL Editor (requires pg_cron extension).
--
-- To verify pg_cron is enabled: SELECT * FROM cron.job;
-- To remove the job: SELECT cron.unschedule('process-followup-queue');

SELECT cron.schedule(
  'process-followup-queue',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/process-followup-queue',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
