-- 20260513_a05_scheduled_post_targets.sql
-- Per-platform fanout for a scheduled_post. The unit of publish + retry.

CREATE TABLE IF NOT EXISTS public.scheduled_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id uuid NOT NULL REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  social_connection_id uuid NOT NULL REFERENCES public.social_connections(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','failed')),
  platform_post_id text,
  platform_post_url text,
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheduled_post_id, platform)
);

-- Partial index: dispatcher only ever scans pending rows.
CREATE INDEX idx_targets_dispatch
  ON public.scheduled_post_targets (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_targets_by_post ON public.scheduled_post_targets (scheduled_post_id);

ALTER TABLE public.scheduled_post_targets ENABLE ROW LEVEL SECURITY;

-- RLS via parent post — admins do everything, clients SELECT their own.
CREATE POLICY targets_admin ON public.scheduled_post_targets
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY targets_client ON public.scheduled_post_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scheduled_posts sp
      WHERE sp.id = scheduled_post_targets.scheduled_post_id
        AND is_own_client(sp.client_id)
    )
  );

CREATE TRIGGER update_scheduled_post_targets_updated_at
  BEFORE UPDATE ON public.scheduled_post_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
