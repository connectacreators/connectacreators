-- Add format_detection JSONB column to viral_videos
-- Stores: { format, confidence, detection_stage, detected_at, wizard_config }
ALTER TABLE viral_videos
  ADD COLUMN IF NOT EXISTS format_detection JSONB DEFAULT NULL;

COMMENT ON COLUMN viral_videos.format_detection IS
  'Video format classification result. Format: { format: "TALKING_HEAD"|"VOICEOVER"|"TEXT_STORY", confidence: 0-1, detection_stage: "heuristic"|"vision", detected_at: ISO string, wizard_config: { suggested_format, prompt_hint, use_transcript_as_template } }';
