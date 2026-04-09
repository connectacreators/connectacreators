-- Landing page conversion upgrade: hero image, font picker, FB Pixel, sticky CTA, trust stats
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS hero_image_url     text,
  ADD COLUMN IF NOT EXISTS font_family        text NOT NULL DEFAULT 'Inter, sans-serif',
  ADD COLUMN IF NOT EXISTS fb_pixel_id        text,
  ADD COLUMN IF NOT EXISTS show_sticky_cta    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trust_stat_1_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_1_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_label  text;
