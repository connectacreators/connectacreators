-- Add notion_leads_database_id column to client_notion_mapping
-- This allows storing two separate Notion databases:
-- 1. notion_database_id: for video editing queue and reel metadata
-- 2. notion_leads_database_id: for workflow trigger data and leads

ALTER TABLE public.client_notion_mapping
ADD COLUMN notion_leads_database_id TEXT;

-- Add comment to clarify usage
COMMENT ON COLUMN public.client_notion_mapping.notion_database_id IS 'Notion database for video editing queue and reel metadata';
COMMENT ON COLUMN public.client_notion_mapping.notion_leads_database_id IS 'Notion database for workflow leads and trigger data (used by lead calendar, lead tracker, and workflows)';
