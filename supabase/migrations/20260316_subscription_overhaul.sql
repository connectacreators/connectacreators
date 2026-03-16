-- Stores trial end date for UI countdown; populated by stripe-webhook on subscription.created
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
