
-- Step 1: Add 'user' to the app_role enum and add owner_user_id column
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS owner_user_id UUID;
