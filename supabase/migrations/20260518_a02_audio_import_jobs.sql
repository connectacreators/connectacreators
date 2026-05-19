-- 20260518_a02_audio_import_jobs.sql
-- Background job queue for importing audio from external URLs (TikTok,
-- Instagram Reels, YouTube Shorts). The worker runs yt-dlp locally to
-- extract the audio track, uploads the resulting MP3 to footage/music/,
-- then frontend reads the output_storage_path and writes it into the
-- editor_projects.edl.music field.

create table if not exists public.audio_import_jobs (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  url text not null,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  progress int not null default 0 check (progress between 0 and 100),
  error_message text,
  output_storage_path text,
  duration_ms int,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists audio_import_jobs_status_idx
  on public.audio_import_jobs(status) where status in ('queued','running');
create index if not exists audio_import_jobs_video_edit_id_idx
  on public.audio_import_jobs(video_edit_id);

alter table public.audio_import_jobs enable row level security;

drop policy if exists audio_import_jobs_admin_all on public.audio_import_jobs;
create policy audio_import_jobs_admin_all
  on public.audio_import_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());
