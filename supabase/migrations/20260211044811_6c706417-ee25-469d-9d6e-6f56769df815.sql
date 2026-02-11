
-- Step 1: Add 'videographer' to app_role enum and create base tables
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'videographer';

-- Add username column to profiles (unique, optional)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;

-- Create videographer_clients assignment table
CREATE TABLE IF NOT EXISTS public.videographer_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  videographer_user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(videographer_user_id, client_id)
);

ALTER TABLE public.videographer_clients ENABLE ROW LEVEL SECURITY;
