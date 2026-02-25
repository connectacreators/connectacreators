-- Add onboarding_data JSONB column to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS onboarding_data JSONB;

-- Index for existence checks (optional, for faster queries)
CREATE INDEX IF NOT EXISTS idx_clients_onboarding_data
  ON public.clients USING GIN (onboarding_data)
  WHERE onboarding_data IS NOT NULL;
