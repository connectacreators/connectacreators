-- Add editor and connecta_plus roles to app_role enum
-- editor: can only access assigned editing queues, no subscription needed
-- connecta_plus: admin-managed clients, subscription bypassed

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'connecta_plus';
