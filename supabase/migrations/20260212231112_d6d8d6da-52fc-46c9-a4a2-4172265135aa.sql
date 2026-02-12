ALTER TABLE public.client_notion_mapping 
ADD COLUMN title_property TEXT NOT NULL DEFAULT 'Reel title',
ADD COLUMN script_property TEXT DEFAULT 'Script',
ADD COLUMN footage_property TEXT DEFAULT 'Footage';