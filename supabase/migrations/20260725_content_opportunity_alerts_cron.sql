-- Schedules the scan-content-opportunities edge function daily. Unlike
-- scan_companion_alerts() (a plain SQL function for the other 5 alert
-- kinds), this one needs JS-side client->niche derivation (same regex
-- table ViralToday.tsx uses for "For You"), so it lives in an edge
-- function invoked via net.http_post — same pattern as
-- delta-channel-scrape / weekly-full-channel-scrape below it.
--
-- 9am UTC ≈ early morning US Eastern — lands before the workday starts,
-- a "tip of the day" cadence rather than anything urgent.

do $$
begin
  perform cron.unschedule('daily-content-opportunity-scan');
exception when others then null;
end$$;

select cron.schedule(
  'daily-content-opportunity-scan',
  '0 9 * * *',
  $$
    select net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/scan-content-opportunities',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
