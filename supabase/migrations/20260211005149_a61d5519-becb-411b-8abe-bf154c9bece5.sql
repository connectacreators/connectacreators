
-- Add extra metadata columns to scripts
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS idea_ganadora text;
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS target text;
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS formato text;
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS google_drive_link text;
