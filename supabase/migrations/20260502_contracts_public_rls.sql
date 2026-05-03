-- Allow unauthenticated users to read a contract row by its valid signing_token
-- (email-link signing — no login required)
create policy "public_read_contract_by_token" on contracts
  for select using (
    signing_token is not null
    and signing_token_expires_at > now()
    and status = 'awaiting_client'
    and send_method = 'email'
  );

-- Allow unauthenticated users to generate signed URLs for the PDF
-- for contracts they can access by token
create policy "public_read_contracts_storage" on storage.objects
  for select using (
    bucket_id = 'contracts'
    and exists (
      select 1 from contracts ct
      where ct.current_storage_path = name
        and ct.signing_token is not null
        and ct.signing_token_expires_at > now()
        and ct.status = 'awaiting_client'
        and ct.send_method = 'email'
    )
  );
