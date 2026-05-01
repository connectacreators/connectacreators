-- 1. Create storage bucket for canvas media
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('canvas-media', 'canvas-media', false, 524288000)  -- 500MB per file max
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their own folder
CREATE POLICY "Users upload own canvas media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own canvas media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own canvas media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admin can read all canvas media
CREATE POLICY "Admin reads all canvas media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'canvas-media' AND public.is_admin());

-- 2. Tracking table for per-session storage accounting
CREATE TABLE public.canvas_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.canvas_states(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,  -- ReactFlow node ID (matches the node on canvas)

  -- File metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'image' | 'video' | 'voice'
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Transcription results (nullable until user triggers)
  audio_transcription TEXT,
  visual_transcription JSONB,  -- Same format as VideoNode videoAnalysis
  transcription_status TEXT DEFAULT 'none',  -- 'none' | 'processing' | 'done' | 'error'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own canvas media"
  ON public.canvas_media FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin manages all canvas media"
  ON public.canvas_media FOR ALL
  USING (public.is_admin());

-- Index for fast session storage sum queries
CREATE INDEX idx_canvas_media_session ON public.canvas_media(session_id);
CREATE INDEX idx_canvas_media_user ON public.canvas_media(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_canvas_media_updated_at
  BEFORE UPDATE ON public.canvas_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
