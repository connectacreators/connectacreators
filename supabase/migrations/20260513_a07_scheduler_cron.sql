-- 20260513_a07_scheduler_cron.sql
-- Register a pg_cron job that pings the dispatcher edge function every minute.
-- The dispatcher itself checks app_settings.scheduler_enabled and no-ops when false,
-- so this cron is safe to keep registered even while the feature is gated off.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fire the dispatcher. URL + service key are loaded from per-database settings:
--   ALTER DATABASE postgres SET app.scheduler_dispatch_url = 'https://<project>.supabase.co/functions/v1/publish-scheduled-posts';
--   ALTER DATABASE postgres SET app.scheduler_service_key  = '<service-role-key>';
-- If either is missing, the function exits silently (safe default).

CREATE OR REPLACE FUNCTION public.fire_scheduler_dispatch() RETURNS void AS $$
DECLARE
  dispatch_url text := current_setting('app.scheduler_dispatch_url', true);
  service_key  text := current_setting('app.scheduler_service_key',  true);
BEGIN
  IF dispatch_url IS NULL OR service_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := dispatch_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'cron')
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule every minute. Idempotent — drops any prior registration first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-posts') THEN
    PERFORM cron.unschedule('process-scheduled-posts');
  END IF;
END $$;

SELECT cron.schedule('process-scheduled-posts', '* * * * *', $$SELECT public.fire_scheduler_dispatch();$$);
