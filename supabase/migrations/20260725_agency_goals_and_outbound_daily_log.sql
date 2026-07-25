-- ALREADY APPLIED TO PROD via Management API; never `db push` (see project
-- memory: DB migration drift — schema is applied by hand, not CLI).
--
-- Two small settings/log tables for the /ai Command Deck's Agency Goals
-- panel: a single agency-wide revenue target + daily outbound quota
-- (agency_goals), and a per-tap daily log so "sent today" can be computed
-- (outbound_metrics only has monthly granularity).

CREATE TABLE IF NOT EXISTS public.agency_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revenue_goal_monthly numeric(12,2) NOT NULL DEFAULT 50000,
  outbound_daily_target integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.agency_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access agency_goals" ON public.agency_goals
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.outbound_daily_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_daily_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access outbound_daily_log" ON public.outbound_daily_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_outbound_daily_log_user_logged
  ON public.outbound_daily_log (user_id, logged_at);
