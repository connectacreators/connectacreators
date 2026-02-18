-- Add column for per-client Notion lead database ID
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notion_lead_database_id text;

-- Set the known database IDs
UPDATE public.clients SET notion_lead_database_id = '5c1f88c1-0938-41b3-bb84-64e70fd58eb7' WHERE id = '3b26679f-9ac1-437a-bb71-4d3107992d83'; -- Dr. Calvin
UPDATE public.clients SET notion_lead_database_id = '307d6442e09c80d1a79ac8180c610511' WHERE id = '4fe338f9-fc16-49c7-9072-990aef152b7c'; -- Saratoga