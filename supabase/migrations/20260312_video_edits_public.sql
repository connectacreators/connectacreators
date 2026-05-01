-- Allow unauthenticated (anon) access to video_edits for public editing queue
-- This powers the shareable public edit queue view

ALTER TABLE video_edits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any, to avoid conflicts
DROP POLICY IF EXISTS "Public read access to video_edits" ON video_edits;
DROP POLICY IF EXISTS "Public update access to video_edits" ON video_edits;
DROP POLICY IF EXISTS "Allow all access to video_edits" ON video_edits;

-- Allow anyone (including unauthenticated anon) to read video_edits
CREATE POLICY "Public read access to video_edits"
  ON video_edits FOR SELECT
  USING (true);

-- Allow anyone to update video_edits (for public editing queue)
CREATE POLICY "Public update access to video_edits"
  ON video_edits FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to insert/delete (internal use)
CREATE POLICY "Authenticated insert video_edits"
  ON video_edits FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated delete video_edits"
  ON video_edits FOR DELETE
  TO authenticated
  USING (true);
