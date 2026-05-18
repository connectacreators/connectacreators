-- 20260518_a01_video_editor_phase2.sql
-- Video editor Phase 2: transcripts, silence detection, transcribe job queue

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  -- words: array of { text, start_ms, end_ms, confidence }
  words jsonb not null,
  provider text not null check (provider in ('openai','deepgram')),
  created_at timestamptz not null default now(),
  unique (video_edit_id)
);

create index if not exists transcripts_video_edit_id_idx
  on public.transcripts(video_edit_id);

create table if not exists public.silence_segments (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  start_ms int not null,
  end_ms int not null,
  min_duration_ms int not null default 400,
  noise_db int not null default -30,
  created_at timestamptz not null default now(),
  check (end_ms > start_ms)
);

create index if not exists silence_segments_video_edit_id_idx
  on public.silence_segments(video_edit_id);

create table if not exists public.transcribe_jobs (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  progress int not null default 0 check (progress between 0 and 100),
  error_message text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists transcribe_jobs_status_idx
  on public.transcribe_jobs(status) where status in ('queued','running');
create index if not exists transcribe_jobs_video_edit_id_idx
  on public.transcribe_jobs(video_edit_id);

-- RLS: admin-only, matching Phase 1.
alter table public.transcripts enable row level security;
alter table public.silence_segments enable row level security;
alter table public.transcribe_jobs enable row level security;

drop policy if exists transcripts_admin_all on public.transcripts;
create policy transcripts_admin_all
  on public.transcripts
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists silence_segments_admin_all on public.silence_segments;
create policy silence_segments_admin_all
  on public.silence_segments
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists transcribe_jobs_admin_all on public.transcribe_jobs;
create policy transcribe_jobs_admin_all
  on public.transcribe_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());
