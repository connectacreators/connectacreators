-- =============================================================================
-- 2026-04-20: Public folder sharing — new table `script_folder_shares`
--
-- Each row grants public read (v1) access to a folder and all its descendants
-- via an opaque random token. Lookups go through the `get-shared-folder` edge
-- function which uses the service role, so this table's RLS only needs to
-- cover the owner-facing management surface (list/create/revoke own shares).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.script_folder_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id   uuid NOT NULL REFERENCES public.script_folders(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  permission  text NOT NULL DEFAULT 'viewer'
              CHECK (permission IN ('viewer', 'editor')),
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- Active tokens index: we filter by token + `revoked_at IS NULL` on every
-- public lookup. Partial unique index enforces one active share per token.
CREATE UNIQUE INDEX IF NOT EXISTS script_folder_shares_token_active_idx
  ON public.script_folder_shares (token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS script_folder_shares_folder_idx
  ON public.script_folder_shares (folder_id);

CREATE INDEX IF NOT EXISTS script_folder_shares_created_by_idx
  ON public.script_folder_shares (created_by);

ALTER TABLE public.script_folder_shares ENABLE ROW LEVEL SECURITY;

-- Admin: full access.
CREATE POLICY "Admin full access script_folder_shares"
  ON public.script_folder_shares FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Owner (creator) — can list, create, revoke own shares.
CREATE POLICY "Creator can view own shares"
  ON public.script_folder_shares FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Creator can create shares for accessible folders"
  ON public.script_folder_shares FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.script_folders f
      WHERE f.id = folder_id
      -- folder RLS already enforces "is this user allowed to see the folder";
      -- the nested SELECT will simply return zero rows if not.
    )
  );

CREATE POLICY "Creator can revoke own shares"
  ON public.script_folder_shares FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator can delete own shares"
  ON public.script_folder_shares FOR DELETE TO authenticated
  USING (created_by = auth.uid());
