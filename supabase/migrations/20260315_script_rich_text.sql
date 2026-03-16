-- Add rich_text column to script_lines for doc editor HTML storage
ALTER TABLE script_lines ADD COLUMN IF NOT EXISTS rich_text TEXT;
