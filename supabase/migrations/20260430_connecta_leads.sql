create table if not exists connecta_leads (
  id           uuid primary key default gen_random_uuid(),
  niche        text,
  business_type text,
  city         text,
  state        text,
  revenue_range text,
  investment_ready text,
  name         text not null,
  phone        text not null,
  email        text not null,
  status       text not null default 'calificado',
  created_at   timestamptz not null default now()
);

alter table connecta_leads enable row level security;

create policy "anon_insert_connecta_leads"
  on connecta_leads for insert
  to anon
  with check (true);

create policy "auth_select_connecta_leads"
  on connecta_leads for select
  to authenticated
  using (true);
