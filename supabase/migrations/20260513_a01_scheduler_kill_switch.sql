-- 20260513_a01_scheduler_kill_switch.sql
-- Single-row app_settings table for runtime feature gating.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),  -- single-row enforced
  scheduler_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, scheduler_enabled) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);
