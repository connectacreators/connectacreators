-- supabase/migrations/20260515_saved_videos.sql
--
-- Vault repurpose: replace the "extracted hook/body/CTA template" concept
-- (vault_templates) with a saved-videos library that points at viral_videos
-- rows. One row per (client, viral_video) bookmark.

CREATE TABLE IF NOT EXISTS public.saved_videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  viral_video_id  UUID NOT NULL REFERENCES public.viral_videos(id) ON DELETE CASCADE,
  saved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT,
  UNIQUE (client_id, viral_video_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_videos_client_recent
  ON public.saved_videos (client_id, saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_videos_video
  ON public.saved_videos (viral_video_id);

ALTER TABLE public.saved_videos ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admin full access saved_videos" ON public.saved_videos;
CREATE POLICY "Admin full access saved_videos"
  ON public.saved_videos FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Client can manage own saves
DROP POLICY IF EXISTS "Client can manage own saved_videos" ON public.saved_videos;
CREATE POLICY "Client can manage own saved_videos"
  ON public.saved_videos FOR ALL
  USING (is_own_client(client_id))
  WITH CHECK (is_own_client(client_id));

-- Videographer: view assigned-client saves
DROP POLICY IF EXISTS "Videographer can view assigned saved_videos" ON public.saved_videos;
CREATE POLICY "Videographer can view assigned saved_videos"
  ON public.saved_videos FOR SELECT
  USING (is_assigned_client(client_id));

-- Videographer: insert for assigned clients
DROP POLICY IF EXISTS "Videographer can insert assigned saved_videos" ON public.saved_videos;
CREATE POLICY "Videographer can insert assigned saved_videos"
  ON public.saved_videos FOR INSERT
  WITH CHECK (is_assigned_client(client_id));

-- Videographer: delete for assigned clients
DROP POLICY IF EXISTS "Videographer can delete assigned saved_videos" ON public.saved_videos;
CREATE POLICY "Videographer can delete assigned saved_videos"
  ON public.saved_videos FOR DELETE
  USING (is_assigned_client(client_id));
