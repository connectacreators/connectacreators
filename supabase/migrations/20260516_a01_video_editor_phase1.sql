-- 20260516_video_editor_phase1.sql
-- Video editor Phase 1: project state + render jobs

create table if not exists public.editor_projects (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  edl jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_edit_id)
);

create index if not exists editor_projects_video_edit_id_idx
  on public.editor_projects(video_edit_id);

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  editor_project_id uuid not null references public.editor_projects(id) on delete cascade,
  edl_snapshot jsonb not null,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  progress int not null default 0 check (progress between 0 and 100),
  error_message text,
  output_storage_path text,
  aspect_ratio text not null default '9:16'
    check (aspect_ratio in ('9:16','1:1','16:9','source')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists render_jobs_status_idx
  on public.render_jobs(status) where status in ('queued','running');
create index if not exists render_jobs_editor_project_id_idx
  on public.render_jobs(editor_project_id);

-- RLS: Phase 1 ships admin-only. Use the existing is_admin() function.
alter table public.editor_projects enable row level security;
alter table public.render_jobs enable row level security;

drop policy if exists editor_projects_admin_all on public.editor_projects;
create policy editor_projects_admin_all
  on public.editor_projects
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists render_jobs_admin_all on public.render_jobs;
create policy render_jobs_admin_all
  on public.render_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- updated_at trigger (reuses shared function)
drop trigger if exists editor_projects_updated_at on public.editor_projects;
create trigger editor_projects_updated_at
  before update on public.editor_projects
  for each row execute function public.update_updated_at_column();
