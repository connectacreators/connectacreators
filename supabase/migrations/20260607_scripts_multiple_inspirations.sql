-- Allow multiple inspiration URLs per script.
-- Adds inspiration_urls (text[]) and backfills from the existing single inspiration_url.
-- inspiration_url is kept and synced to inspiration_urls[1] for backward compatibility.

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS inspiration_urls text[] NOT NULL DEFAULT '{}';

UPDATE public.scripts
SET inspiration_urls = ARRAY[inspiration_url]
WHERE inspiration_url IS NOT NULL
  AND inspiration_url <> ''
  AND (inspiration_urls IS NULL OR inspiration_urls = '{}');
