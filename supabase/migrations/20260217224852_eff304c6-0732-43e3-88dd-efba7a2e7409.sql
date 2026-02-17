
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plan_type text,
  ADD COLUMN IF NOT EXISTS script_limit integer DEFAULT 75,
  ADD COLUMN IF NOT EXISTS scripts_used integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_tracker_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS facebook_integration_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';

CREATE POLICY "Client can update own plan"
  ON public.clients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
