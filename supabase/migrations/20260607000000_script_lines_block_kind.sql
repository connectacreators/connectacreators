-- Script doc editor redesign — Phase 1 (data model).
-- Everything in a script is a block: 'heading' rows (renamable section headers)
-- and 'line' rows (content). Additive, low-risk: existing rows backfill to 'line'.
-- Backfill of heading rows is lazy (done in the editor), NOT in SQL.
ALTER TABLE public.script_lines
  ADD COLUMN IF NOT EXISTS block_kind text NOT NULL DEFAULT 'line';

-- rich_text already added in 20260315_script_rich_text.sql; no need to re-add.
