-- Add columns to track scheduled plan downgrades
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_plan_type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_plan_effective_date timestamptz;
