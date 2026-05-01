-- P2 scale fix: missing indexes + is_own_client covers subscribers
-- Without scripts(client_id) index, every RLS policy check is a full table scan.

-- 1. Index used by is_own_client() RLS filter on scripts
CREATE INDEX IF NOT EXISTS idx_scripts_client_id
  ON public.scripts (client_id);

-- 2. Index used by script_lines RLS (joins scripts via script_id)
CREATE INDEX IF NOT EXISTS idx_script_lines_script_id
  ON public.script_lines (script_id);

-- 3. Index used by video_edits RLS/filter queries
CREATE INDEX IF NOT EXISTS idx_video_edits_client_id
  ON public.video_edits (client_id)
  WHERE deleted_at IS NULL;

-- 4. Composite index for clients table so is_own_client() lookup is an index-only scan
CREATE INDEX IF NOT EXISTS idx_clients_user_id_id
  ON public.clients (user_id, id);

-- 5. Update is_own_client to also cover subscriber_clients table.
--    Previously only checked clients.user_id = auth.uid(), which broke for
--    subscriber accounts where the client record is owned by a different user_id.
CREATE OR REPLACE FUNCTION public.is_own_client(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.subscriber_clients
    WHERE client_id = _client_id AND subscriber_user_id = auth.uid()
  )
$$;
