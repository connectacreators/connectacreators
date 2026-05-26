-- 20260525_b02_branding_logos_bucket.sql
-- Public-read storage bucket for connecta_plus users' uploaded sidebar logos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding-logos',
  'branding-logos',
  true,
  1048576, -- 1 MB
  array['image/png','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read
drop policy if exists branding_logos_public_read on storage.objects;
create policy branding_logos_public_read on storage.objects
  for select using (bucket_id = 'branding-logos');

-- Authenticated user can upload to their own folder
-- Path convention: {user_id}/logo-{timestamp}.{ext}
drop policy if exists branding_logos_user_insert on storage.objects;
create policy branding_logos_user_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated user can update their own folder
drop policy if exists branding_logos_user_update on storage.objects;
create policy branding_logos_user_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists branding_logos_user_delete on storage.objects;
create policy branding_logos_user_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
