-- supabase/migrations/20260525_a01_client_strategies_pipeline.sql
--
-- Adds the per-client production pipeline columns to client_strategies.
-- All fields are nullable; admin fills them in as they're known.
-- Dashboard reads these to surface "Onboarding call tomorrow", "Script due Fri",
-- etc. when within the next 7 days.

ALTER TABLE public.client_strategies
  ADD COLUMN IF NOT EXISTS onboarding_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS script_due_at      timestamptz,
  ADD COLUMN IF NOT EXISTS editing_due_at     timestamptz,
  ADD COLUMN IF NOT EXISTS next_filming_at    timestamptz,
  ADD COLUMN IF NOT EXISTS boosting_at        timestamptz,
  ADD COLUMN IF NOT EXISTS posting_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_notes     text;

-- Composite index to speed up dashboard query: pick any client_strategies row
-- where any pipeline date falls within the next N days.
CREATE INDEX IF NOT EXISTS client_strategies_pipeline_dates_idx
  ON public.client_strategies (client_id)
  WHERE
    onboarding_call_at IS NOT NULL
    OR script_due_at IS NOT NULL
    OR editing_due_at IS NOT NULL
    OR next_filming_at IS NOT NULL
    OR boosting_at IS NOT NULL
    OR posting_at IS NOT NULL;

COMMENT ON COLUMN public.client_strategies.onboarding_call_at IS 'Next onboarding call scheduled for this client (admin-managed).';
COMMENT ON COLUMN public.client_strategies.script_due_at      IS 'Next script writing due date.';
COMMENT ON COLUMN public.client_strategies.editing_due_at     IS 'Next editing pass due date.';
COMMENT ON COLUMN public.client_strategies.next_filming_at    IS 'Next filming session date/time.';
COMMENT ON COLUMN public.client_strategies.boosting_at        IS 'Next ads-boosting kickoff date (paired with ads_budget).';
COMMENT ON COLUMN public.client_strategies.posting_at         IS 'Next planned posting date for the in-flight content.';
COMMENT ON COLUMN public.client_strategies.pipeline_notes     IS 'Free-text notes on current cycle status, blockers, context.';
