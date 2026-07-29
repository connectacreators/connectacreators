-- ALREADY APPLIED TO PROD via Management API; never `db push` (see project
-- memory: DB migration drift — schema is applied by hand, not CLI).
--
-- Gives outbound_daily_log day-level granularity for the WHOLE funnel, not
-- just an untyped tap count. Before this, the table recorded only
-- (user_id, platform, logged_at) — one row per tap on the Command Deck
-- gauge — while the real numbers were logged on /outbound into
-- outbound_metrics, which is monthly-only. The two never met, so the
-- gauge read 0 no matter how many DMs actually went out.
--
-- Now every stepper change on /outbound also writes a signed delta row
-- here, so "sent today" / "engaged today" are derivable while
-- outbound_metrics stays the monthly rollup the /outbound UI reads.

ALTER TABLE public.outbound_daily_log
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'initiated';

-- Signed: a stepper can go down (correcting an over-count), and those
-- corrections must subtract from the day's total rather than be dropped.
ALTER TABLE public.outbound_daily_log
  ADD COLUMN IF NOT EXISTS delta integer NOT NULL DEFAULT 1;

-- Pre-existing rows came from the gauge's "+1 <platform>" buttons, which
-- only ever meant "one DM sent".
UPDATE public.outbound_daily_log SET stage = 'initiated' WHERE stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_daily_log_user_stage_logged
  ON public.outbound_daily_log (user_id, stage, logged_at);
