-- Create script_versions table for tracking script history
CREATE TABLE public.script_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID REFERENCES public.scripts(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  raw_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX idx_script_versions_script_id ON public.script_versions(script_id);
CREATE INDEX idx_script_versions_created_at ON public.script_versions(created_at DESC);

-- Enable RLS
ALTER TABLE public.script_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to script_versions" ON public.script_versions FOR ALL USING (true) WITH CHECK (true);
