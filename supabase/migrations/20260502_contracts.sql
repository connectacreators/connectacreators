-- supabase/migrations/20260502_contracts.sql

-- Storage buckets (private — signed URLs only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('contracts', 'contracts', false, 10485760, array['application/pdf']),
  ('contract-templates', 'contract-templates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- contract_templates: reusable base PDFs (admin-managed, not client-specific)
create table if not exists contract_templates (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users not null,
  name        text not null,
  storage_path text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table contract_templates enable row level security;

-- contracts: one row per contract instance tied to a client
create table if not exists contracts (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid references clients not null,
  template_id           uuid references contract_templates,
  created_by            uuid references auth.users not null,
  title                 text not null,
  status                text not null default 'draft'
                          check (status in ('draft','awaiting_client','complete','voided')),
  original_storage_path text not null,
  current_storage_path  text,
  admin_signed_at       timestamptz,
  admin_signature_name  text,
  admin_signature_font  text,
  client_signed_at      timestamptz,
  client_signature_name text,
  client_signature_font text,
  send_method           text check (send_method in ('email','in_app')),
  client_email          text,
  send_message          text,
  signing_token         uuid unique,
  signing_token_expires_at timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
alter table contracts enable row level security;

-- RLS: contract_templates — admin full access only
create policy "admin_all_contract_templates" on contract_templates
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- RLS: contracts — admin full access
create policy "admin_all_contracts" on contracts
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- RLS: contracts — client can read their own in-app contracts
create policy "client_read_own_contracts" on contracts
  for select using (
    exists (
      select 1 from clients c
      where c.id = contracts.client_id
        and c.user_id = auth.uid()
        and contracts.send_method = 'in_app'
        and contracts.status in ('awaiting_client', 'complete')
    )
  );

-- Storage RLS: contracts bucket — admin upload/read
create policy "admin_manage_contracts_storage" on storage.objects
  for all using (
    bucket_id = 'contracts'
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Storage RLS: contract-templates bucket — admin upload/read
create policy "admin_manage_templates_storage" on storage.objects
  for all using (
    bucket_id = 'contract-templates'
    and exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );
