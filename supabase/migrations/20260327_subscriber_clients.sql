-- supabase/migrations/20260327_subscriber_clients.sql

-- 1. Create subscriber_clients junction table
CREATE TABLE IF NOT EXISTS subscriber_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscriber_user_id, client_id)
);

-- Only one primary per subscriber (partial unique index)
CREATE UNIQUE INDEX subscriber_clients_one_primary
  ON subscriber_clients (subscriber_user_id)
  WHERE is_primary = true;

CREATE INDEX subscriber_clients_user_idx ON subscriber_clients (subscriber_user_id);
CREATE INDEX subscriber_clients_client_idx ON subscriber_clients (client_id);

-- 2. Add client_limit to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS client_limit INTEGER NOT NULL DEFAULT 1;

-- 3. Helper functions

-- Check if current user owns a client via subscriber_clients
CREATE OR REPLACE FUNCTION is_subscriber_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE subscriber_user_id = auth.uid()
    AND client_id = _client_id
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- Get the primary client_id for the current user
CREATE OR REPLACE FUNCTION get_primary_client_id() RETURNS UUID AS $$
  SELECT client_id FROM subscriber_clients
  WHERE subscriber_user_id = auth.uid()
  AND is_primary = true
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if a client is someone's primary (used in DELETE protection)
CREATE OR REPLACE FUNCTION is_primary_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE client_id = _client_id
    AND is_primary = true
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. RLS on subscriber_clients
ALTER TABLE subscriber_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_subscriber_clients" ON subscriber_clients
  FOR ALL USING (public.is_admin());

CREATE POLICY "subscriber_select_own" ON subscriber_clients
  FOR SELECT USING (subscriber_user_id = auth.uid());

CREATE POLICY "subscriber_insert_own" ON subscriber_clients
  FOR INSERT WITH CHECK (subscriber_user_id = auth.uid());

CREATE POLICY "subscriber_delete_own_non_primary" ON subscriber_clients
  FOR DELETE USING (subscriber_user_id = auth.uid() AND NOT is_primary);

-- 5. Update clients table RLS — add subscriber_clients access

-- Add subscriber SELECT access to clients
CREATE POLICY "subscriber_select_clients" ON clients
  FOR SELECT USING (public.is_subscriber_client(id));

-- Add subscriber UPDATE access to clients
CREATE POLICY "subscriber_update_clients" ON clients
  FOR UPDATE USING (public.is_subscriber_client(id));

-- Add subscriber INSERT access to clients (for creating new clients)
CREATE POLICY "subscriber_insert_clients" ON clients
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR auth.uid() IS NOT NULL
  );

-- Add subscriber DELETE for non-primary clients only
CREATE POLICY "subscriber_delete_non_primary_clients" ON clients
  FOR DELETE USING (public.is_subscriber_client(id) AND NOT public.is_primary_client(id));

-- 6. Update scripts table RLS — add subscriber access
CREATE POLICY "subscriber_select_scripts" ON scripts
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_scripts" ON scripts
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_scripts" ON scripts
  FOR UPDATE USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_delete_scripts" ON scripts
  FOR DELETE USING (public.is_subscriber_client(client_id));

-- 7. Update video_edits table RLS — add subscriber access
CREATE POLICY "subscriber_select_video_edits" ON video_edits
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_video_edits" ON video_edits
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_video_edits" ON video_edits
  FOR UPDATE USING (public.is_subscriber_client(client_id));

-- 8. Update leads table RLS — add subscriber access
CREATE POLICY "subscriber_select_leads" ON leads
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_leads" ON leads
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_leads" ON leads
  FOR UPDATE USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_delete_leads" ON leads
  FOR DELETE USING (public.is_subscriber_client(client_id));

-- 9. Backfill existing subscribers into junction table
-- Every existing client with user_id becomes a primary entry
INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
SELECT user_id, id, true FROM clients
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill extra clients created via owner_user_id (Clients.tsx)
INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
SELECT owner_user_id, id, false FROM clients
WHERE owner_user_id IS NOT NULL
AND (user_id IS NULL OR owner_user_id != user_id)
ON CONFLICT DO NOTHING;

-- 10. Set client_limit based on plan
UPDATE subscriptions SET client_limit = CASE
  WHEN plan_type = 'starter' THEN 5
  WHEN plan_type = 'growth' THEN 10
  WHEN plan_type = 'enterprise' THEN 20
  ELSE 1
END;
