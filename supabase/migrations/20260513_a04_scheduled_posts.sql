-- 20260513_a04_scheduled_posts.sql
-- Parent record per composer submission. One scheduled_post = one video + caption
-- destined for N platforms (the fanout lives in scheduled_post_targets).

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Soft reference to editing_queue.id (table is not in migrations history, so we
  -- store the id without a FK to keep this migration portable across environments).
  editing_queue_id uuid,
  video_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  mode text NOT NULL CHECK (mode IN ('draft','scheduled','autopost')),
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','publishing','published','partial','failed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_posts_client_status ON public.scheduled_posts (client_id, status);
CREATE INDEX idx_scheduled_posts_due ON public.scheduled_posts (scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_posts_admin ON public.scheduled_posts
  FOR ALL TO authenticated
  USING (is_admin());

CREATE POLICY scheduled_posts_client ON public.scheduled_posts
  FOR SELECT TO authenticated
  USING (is_own_client(client_id));

CREATE TRIGGER update_scheduled_posts_updated_at
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
