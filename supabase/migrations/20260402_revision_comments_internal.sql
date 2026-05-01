ALTER TABLE revision_comments ADD COLUMN IF NOT EXISTS internal_only boolean NOT NULL DEFAULT false;
