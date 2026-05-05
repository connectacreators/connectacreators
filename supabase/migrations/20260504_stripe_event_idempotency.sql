-- Idempotency table for Stripe webhook events.
-- Prevents duplicate credit grants when Stripe retries (S1 in credit audit).
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
  ON public.processed_stripe_events (processed_at);

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.processed_stripe_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
