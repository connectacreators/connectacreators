-- Add AI analysis storage to client_strategies
ALTER TABLE client_strategies
  ADD COLUMN IF NOT EXISTS audience_analysis jsonb,
  ADD COLUMN IF NOT EXISTS audience_analyzed_at timestamptz;
