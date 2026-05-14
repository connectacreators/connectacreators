-- Phase 1 of the status/post_status merge.
--
-- Adds a single `lifecycle_status` column on `video_edits` to replace the
-- two-field model. Backfills from existing rows. Leaves the old columns
-- intact for now so dual-writes continue to work and we can roll back.
--
-- See docs/superpowers/specs/2026-05-13-lifecycle-status-merge-design.md
-- for the full design + Phase 2 (drop old columns).

ALTER TABLE video_edits
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'Not started';

-- Backfill existing rows. Precedence top → bottom; first match wins.
-- post_status wins when it's Published or Scheduled (publishing is the
-- furthest-along state). Then the workflow status takes over.
UPDATE video_edits
SET lifecycle_status = CASE
  WHEN post_status = 'Published' THEN 'Published'
  WHEN post_status = 'Scheduled' THEN 'Scheduled'
  WHEN status ILIKE 'Needs Revision%' THEN 'Needs Revisions'
  WHEN status = 'Not started' THEN 'Not started'
  WHEN status IN ('In progress', 'In review', 'Done')
       AND (post_status IS NULL OR post_status = 'Unpublished')
    THEN 'In progress'
  ELSE 'Not started'
END
WHERE lifecycle_status = 'Not started'  -- only touch newly-added defaults
   OR lifecycle_status IS NULL;

-- Lock in the valid value set with a CHECK constraint so any new write
-- using an unknown value fails fast instead of silently storing junk.
ALTER TABLE video_edits
  DROP CONSTRAINT IF EXISTS video_edits_lifecycle_status_check;

ALTER TABLE video_edits
  ADD CONSTRAINT video_edits_lifecycle_status_check
  CHECK (lifecycle_status IN (
    'Not started',
    'In progress',
    'Needs Revisions',
    'Scheduled',
    'Published'
  ));

-- Index for filtering / sorting by lifecycle_status (replaces the implicit
-- pair index on status + post_status if any tools relied on that).
CREATE INDEX IF NOT EXISTS video_edits_lifecycle_status_idx
  ON video_edits (lifecycle_status);
