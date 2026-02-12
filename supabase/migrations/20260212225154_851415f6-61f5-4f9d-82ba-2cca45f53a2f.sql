
-- Add soft delete column to scripts
ALTER TABLE public.scripts ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient filtering of non-deleted scripts
CREATE INDEX idx_scripts_deleted_at ON public.scripts(deleted_at) WHERE deleted_at IS NULL;
