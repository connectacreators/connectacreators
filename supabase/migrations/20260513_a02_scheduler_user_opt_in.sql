-- 20260513_a02_scheduler_user_opt_in.sql
-- Per-user beta opt-in for the post scheduler.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduler_beta_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column add in case user_settings was created elsewhere later.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS scheduler_beta_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_owner ON public.user_settings;
CREATE POLICY user_settings_owner ON public.user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
