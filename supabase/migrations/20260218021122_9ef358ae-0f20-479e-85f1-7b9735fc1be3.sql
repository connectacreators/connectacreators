
-- Table for videographer tasks (managed by admins)
CREATE TABLE public.videographer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  videographer_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_completed boolean NOT NULL DEFAULT false,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.videographer_tasks ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access videographer_tasks"
  ON public.videographer_tasks FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Videographers can view their own tasks
CREATE POLICY "Videographer can view own tasks"
  ON public.videographer_tasks FOR SELECT
  USING (videographer_user_id = auth.uid());

-- Videographers can update their own tasks (e.g. mark as completed)
CREATE POLICY "Videographer can update own tasks"
  ON public.videographer_tasks FOR UPDATE
  USING (videographer_user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_videographer_tasks_updated_at
  BEFORE UPDATE ON public.videographer_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
