-- Script length cap (Phase 6) — server-side enforcement
-- Applied to prod via Supabase MCP on 2026-06-22 (this file is for repo history).
-- Re-defines save_script_blocks_atomic (Phase 5) to additionally roll back the whole save
-- if the persisted content-line body exceeds 15000 chars (paste-bomb / runaway guard;
-- protects the future CRDT projection that writes through this RPC).

create or replace function public.save_script_blocks_atomic(
  p_script_id uuid,
  p_expected_revision integer,
  p_upserts jsonb,
  p_delete_ids uuid[]
) returns table(new_revision integer, was_conflicted boolean)
language plpgsql
as $$
declare
  v_current integer;
begin
  select s.revision into v_current from public.scripts s where s.id = p_script_id for update;
  if not found then
    raise exception 'script % not found', p_script_id;
  end if;

  if p_upserts is not null and jsonb_array_length(p_upserts) > 0 then
    insert into public.script_lines (id, script_id, line_number, line_type, section, text, rich_text, block_kind)
    select (e->>'id')::uuid, p_script_id, (e->>'line_number')::int, e->>'line_type',
           coalesce(e->>'section','body'), coalesce(e->>'text',''), e->>'rich_text', coalesce(e->>'block_kind','line')
    from jsonb_array_elements(p_upserts) as e
    on conflict (id) do update set
      line_number = excluded.line_number,
      line_type  = excluded.line_type,
      section    = excluded.section,
      text       = excluded.text,
      rich_text  = excluded.rich_text,
      block_kind = excluded.block_kind;
  end if;

  if p_delete_ids is not null and array_length(p_delete_ids, 1) is not null then
    delete from public.script_lines where script_id = p_script_id and id = any(p_delete_ids);
  end if;

  update public.scripts set revision = v_current + 1 where id = p_script_id;

  -- Length cap (paste-bomb / runaway guard): roll back the whole save if the persisted
  -- content-line body exceeds the limit.
  if (select coalesce(sum(length(text)), 0)
        from public.script_lines
       where script_id = p_script_id and block_kind is distinct from 'heading') > 15000 then
    raise exception 'script body exceeds character limit';
  end if;

  return query select v_current + 1, (v_current is distinct from p_expected_revision);
end;
$$;

grant execute on function public.save_script_blocks_atomic(uuid, integer, jsonb, uuid[]) to authenticated;
