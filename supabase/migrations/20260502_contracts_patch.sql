-- supabase/migrations/20260502_contracts_patch.sql
-- Patch for contracts migration: triggers, indexes, storage policy fixes

-- ── Indexes for performance ────────────────────────────────────────────────
create index if not exists idx_contracts_client_id
  on contracts (client_id);

create index if not exists idx_contracts_signing_token
  on contracts (signing_token)
  where signing_token is not null;

-- ── updated_at triggers ───────────────────────────────────────────────────
create trigger update_contract_templates_updated_at
  before update on contract_templates
  for each row execute function public.update_updated_at_column();

create trigger update_contracts_updated_at
  before update on contracts
  for each row execute function public.update_updated_at_column();

-- ── Storage policies: drop old ones, recreate with WITH CHECK ─────────────
drop policy if exists "admin_manage_contracts_storage" on storage.objects;
drop policy if exists "admin_manage_templates_storage" on storage.objects;

create policy "admin_manage_contracts_storage" on storage.objects
  for all
  using (
    bucket_id = 'contracts'
    and is_admin()
  )
  with check (
    bucket_id = 'contracts'
    and is_admin()
  );

create policy "admin_manage_templates_storage" on storage.objects
  for all
  using (
    bucket_id = 'contract-templates'
    and is_admin()
  )
  with check (
    bucket_id = 'contract-templates'
    and is_admin()
  );

-- ── Storage SELECT for clients ────────────────────────────────────────────
-- Allows clients to generate signed URLs for PDF preview/download of their
-- own in-app contracts (status awaiting_client or complete).
create policy "client_read_own_contracts_storage" on storage.objects
  for select using (
    bucket_id = 'contracts'
    and exists (
      select 1
      from contracts ct
      join clients c on c.id = ct.client_id
      where c.user_id = auth.uid()
        and (storage.foldername(name))[1] = ct.client_id::text
        and ct.status in ('awaiting_client', 'complete')
        and ct.send_method = 'in_app'
    )
  );
