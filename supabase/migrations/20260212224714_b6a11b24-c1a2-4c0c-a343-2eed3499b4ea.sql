
-- Table 1: Maps clients to their Notion database IDs
CREATE TABLE public.client_notion_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  notion_database_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_notion_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access client_notion_mapping"
  ON public.client_notion_mapping FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Table 2: Maps scripts to their Notion page IDs
CREATE TABLE public.notion_script_sync (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  notion_page_id TEXT NOT NULL,
  notion_database_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(script_id)
);

ALTER TABLE public.notion_script_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access notion_script_sync"
  ON public.notion_script_sync FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

