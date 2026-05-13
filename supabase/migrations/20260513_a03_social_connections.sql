-- 20260513_a03_social_connections.sql
-- Per-client OAuth connections for publishing to social platforms.
-- access_token_enc / refresh_token_enc store base64 strings of AES-GCM
-- ciphertext (see supabase/functions/_shared/encryption.ts). Only edge
-- functions with SCHEDULER_TOKEN_KEY can decrypt.

CREATE TABLE IF NOT EXISTS public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  account_label text NOT NULL,
  platform_account_id text NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reauth','revoked')),
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_error text,
  UNIQUE (client_id, platform, platform_account_id)
);

CREATE INDEX idx_social_connections_client ON public.social_connections (client_id, platform, status);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Follows the existing facebook_pages pattern: admins do everything,
-- clients can SELECT their own.
CREATE POLICY social_connections_admin ON public.social_connections
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY social_connections_client ON public.social_connections
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));
