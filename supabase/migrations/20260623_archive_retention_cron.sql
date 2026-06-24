-- Daily job: archived video_edits older than 30 days move to Trash (soft delete).
-- Metrics are current-month only, so a 30-day-old archived row is already out of
-- the count window; this transition never changes displayed numbers.
SELECT cron.schedule(
  'archive_to_trash_30d',
  '17 4 * * *',  -- daily 04:17 UTC
  $$UPDATE video_edits
      SET deleted_at = now()
    WHERE archived_at IS NOT NULL
      AND archived_at < now() - interval '30 days'
      AND deleted_at IS NULL$$
);
