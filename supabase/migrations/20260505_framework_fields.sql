-- supabase/migrations/20260505_framework_fields.sql
alter table viral_videos
  add column if not exists is_featured_framework boolean not null default false,
  add column if not exists niche_tags text[] not null default '{}',
  add column if not exists framework_score float8 not null default 0;

-- Index so AI tool queries sorting by score are fast
create index if not exists idx_viral_videos_framework_score
  on viral_videos (framework_score desc)
  where framework_score > 0;

-- Index so featured videos float to top cheaply
create index if not exists idx_viral_videos_featured
  on viral_videos (is_featured_framework)
  where is_featured_framework = true;
