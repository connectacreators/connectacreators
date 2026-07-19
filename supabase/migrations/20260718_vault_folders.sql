-- Vault folders (2026-07-18) — ALREADY APPLIED TO PROD via Management API.
-- Per-client folders for saved viral videos. Do NOT db push.
create table if not exists public.vault_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.saved_videos add column if not exists folder_id uuid references public.vault_folders(id) on delete set null;
create index if not exists idx_saved_videos_folder on public.saved_videos(folder_id);
create index if not exists idx_vault_folders_client on public.vault_folders(client_id);
alter table public.vault_folders enable row level security;
create policy vf_admin on public.vault_folders for all using (is_admin()) with check (is_admin());
create policy vf_client on public.vault_folders for all using (is_own_client(client_id)) with check (is_own_client(client_id));
create policy vf_videographer on public.vault_folders for select using (is_assigned_client(client_id));
