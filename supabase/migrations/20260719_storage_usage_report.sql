-- Real-time storage usage for the Usage page + upload guard.
-- storage.objects is the live source of truth (Supabase's dashboard number
-- lags up to an hour and freezes under an over-quota restriction). Both
-- functions are SECURITY DEFINER so they can read the storage schema; the
-- report is admin-only, the lightweight total is callable by any uploader.

-- Lightweight total (bytes) across every bucket. Used by the client-side
-- upload guard to block uploads before the org hits the 100 GB quota.
create or replace function public.get_storage_total_bytes()
returns bigint
language sql
security definer
set search_path = public, storage
as $$
  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
  from storage.objects
  where metadata ? 'size';
$$;

grant execute on function public.get_storage_total_bytes() to authenticated;

-- Full breakdown for the admin Storage dashboard: total vs quota, per bucket,
-- footage per client, footage by lifecycle state (active/archived/trashed),
-- reclaimable (archived+trashed) and the heaviest edits.
create or replace function public.get_storage_report()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_total       bigint;
  v_by_bucket   jsonb;
  v_by_client   jsonb;
  v_by_state    jsonb;
  v_top         jsonb;
  v_reclaimable bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select coalesce(sum((metadata->>'size')::bigint), 0) into v_total
  from storage.objects where metadata ? 'size';

  select coalesce(jsonb_agg(b order by b.bytes desc), '[]'::jsonb) into v_by_bucket
  from (
    select bucket_id as bucket,
           sum((metadata->>'size')::bigint) as bytes,
           count(*) as files
    from storage.objects where metadata ? 'size'
    group by bucket_id
  ) b;

  select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) into v_by_client
  from (
    select coalesce(c.name, '(unknown)') as client,
           sum(o.bytes) as bytes,
           count(*) as files
    from (
      select split_part(name, '/', 1) as cid,
             (metadata->>'size')::bigint as bytes
      from storage.objects
      where bucket_id = 'footage'
        and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        and metadata ? 'size'
    ) o
    left join clients c on c.id = o.cid::uuid
    group by c.name
  ) x;

  select jsonb_object_agg(s.state, s.bytes) into v_by_state
  from (
    select case when ve.deleted_at is not null then 'trashed'
                when ve.archived_at is not null then 'archived'
                else 'active' end as state,
           sum(f.b) as bytes
    from (
      select split_part(name, '/', 2)::uuid as ve,
             (metadata->>'size')::bigint as b
      from storage.objects
      where bucket_id = 'footage'
        and split_part(name, '/', 1) not in ('renders', 'broll', 'music')
        and split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
        and metadata ? 'size'
    ) f
    join video_edits ve on ve.id = f.ve
    group by 1
  ) s;

  v_reclaimable := coalesce((v_by_state->>'archived')::bigint, 0)
                 + coalesce((v_by_state->>'trashed')::bigint, 0);

  select coalesce(jsonb_agg(x order by x.bytes desc), '[]'::jsonb) into v_top
  from (
    select ve.reel_title as title,
           coalesce(c.name, '(unknown)') as client,
           ve.lifecycle_status as status,
           sum(f.b) as bytes
    from (
      select split_part(name, '/', 2)::uuid as ve,
             (metadata->>'size')::bigint as b
      from storage.objects
      where bucket_id = 'footage'
        and split_part(name, '/', 1) not in ('renders', 'broll', 'music')
        and split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
        and metadata ? 'size'
    ) f
    join video_edits ve on ve.id = f.ve
    left join clients c on c.id = ve.client_id
    group by ve.reel_title, c.name, ve.lifecycle_status
    order by sum(f.b) desc
    limit 15
  ) x;

  return jsonb_build_object(
    'total_bytes',       v_total,
    'limit_bytes',       107374182400,  -- 100 GiB Pro quota
    'reclaimable_bytes', v_reclaimable,
    'by_bucket',         v_by_bucket,
    'by_client',         v_by_client,
    'by_state',          coalesce(v_by_state, '{}'::jsonb),
    'top_edits',         v_top,
    'generated_at',      now()
  );
end;
$$;

grant execute on function public.get_storage_report() to authenticated;
