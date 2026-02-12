
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

-- Seed client_notion_mapping with known clients
INSERT INTO public.client_notion_mapping (client_id, notion_database_id) VALUES
  ('3b26679f-9ac1-437a-bb71-4d3107992d83', '29ad6442-e09c-8111-b103-000b6066c231'),
  ('4fb472e8-aad4-4e4c-8938-4cfbb8619a69', '1f3d6442-e09c-8004-a317-000b6aa4ad7e'),
  ('4fe338f9-fc16-49c7-9072-990aef152b7c', '2e8d6442-e09c-8131-a2f1-000bf04916a4');
