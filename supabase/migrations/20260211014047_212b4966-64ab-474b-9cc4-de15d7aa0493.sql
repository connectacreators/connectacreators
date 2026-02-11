
-- Add section column to script_lines for Hook/Body/CTA grouping
ALTER TABLE public.script_lines ADD COLUMN section text NOT NULL DEFAULT 'body';
