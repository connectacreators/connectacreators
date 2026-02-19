
-- Social accounts table
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube')),
  account_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, platform)
);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access social_accounts" ON public.social_accounts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Client can manage own social_accounts" ON public.social_accounts FOR ALL USING (is_own_client(client_id)) WITH CHECK (is_own_client(client_id));
CREATE POLICY "Videographer can view assigned social_accounts" ON public.social_accounts FOR SELECT USING (is_assigned_client(client_id));

-- Scheduled posts table
CREATE TABLE public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  video_url text,
  thumbnail_url text,
  caption text,
  platforms text[] NOT NULL DEFAULT '{}',
  scheduled_time timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  published_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access scheduled_posts" ON public.scheduled_posts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Client can manage own scheduled_posts" ON public.scheduled_posts FOR ALL USING (is_own_client(client_id)) WITH CHECK (is_own_client(client_id));
CREATE POLICY "Videographer can view assigned scheduled_posts" ON public.scheduled_posts FOR SELECT USING (is_assigned_client(client_id));
CREATE POLICY "Videographer can insert assigned scheduled_posts" ON public.scheduled_posts FOR INSERT WITH CHECK (is_assigned_client(client_id));
CREATE POLICY "Videographer can update assigned scheduled_posts" ON public.scheduled_posts FOR UPDATE USING (is_assigned_client(client_id));

-- Storage bucket for post videos
INSERT INTO storage.buckets (id, name, public) VALUES ('post-videos', 'post-videos', true);

CREATE POLICY "Authenticated users can upload post videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-videos');
CREATE POLICY "Anyone can view post videos" ON storage.objects FOR SELECT USING (bucket_id = 'post-videos');
CREATE POLICY "Users can update own post videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'post-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own post videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'post-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enable pg_cron and pg_net extensions for scheduled publishing
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
