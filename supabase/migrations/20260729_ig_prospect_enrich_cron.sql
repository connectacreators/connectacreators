-- Drip-enrich sourced Instagram prospects (2026-07-29) — APPLIED TO PROD via
-- Management API (documentation copy; never `db push`).
--
-- Every minute, at most 10 profiles, paced ~5s apart inside the VPS route.
-- That ceiling (~120 profile calls/hour) is deliberate: the IG cookie pool is
-- the fragile resource and all six accounts 2FA-locked simultaneously on
-- 2026-07-27. Same net.http_post pattern as daily-content-opportunity-scan.

do $$
begin
  perform cron.unschedule('ig-prospect-enrich');
exception when others then null;
end$$;

select cron.schedule(
  'ig-prospect-enrich',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/ig-prospect-enrich',
      headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
