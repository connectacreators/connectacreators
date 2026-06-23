-- Script atomic save — de-duplicate upserts by id (hotfix 2026-06-22)
-- Applied to prod via Supabase MCP (this file is for repo history).
-- Editor split/duplicate/paste could send two upsert rows with the same block id in one
-- save, which made INSERT ... ON CONFLICT (id) DO UPDATE raise "command cannot affect row a
-- second time" -> 500. This de-dupes p_upserts by id (keep LAST) inside the function so the
-- save never crashes. The client (Scripts.tsx handleBlocksChange) also reassigns duplicate
-- ids so both lines persist as separate rows; this is the server safety net.

create or replace function public.save_script_blocks_atomic(
  p_script_id uuid, p_expected_revision integer, p_upserts jsonb, p_delete_ids uuid[]
) returns table(new_revision integer, was_conflicted boolean)
language plpgsql as $$
declare v_current integer;
begin
  select s.revision into v_current from public.scripts s where s.id = p_script_id for update;
  if not found then raise exception 'script % not found', p_script_id; end if;

  if p_upserts is not null and jsonb_array_length(p_upserts) > 0 then
    insert into public.script_lines (id, script_id, line_number, line_type, section, text, rich_text, block_kind)
    select (d.e->>'id')::uuid, p_script_id, (d.e->>'line_number')::int, d.e->>'line_type',
           coalesce(d.e->>'section','body'), coalesce(d.e->>'text',''), d.e->>'rich_text', coalesce(d.e->>'block_kind','line')
    from (select distinct on (el->>'id') el as e
          from jsonb_array_elements(p_upserts) with ordinality as t(el, ord)
          order by el->>'id', ord desc) d
    on conflict (id) do update set
      line_number=excluded.line_number, line_type=excluded.line_type, section=excluded.section,
      text=excluded.text, rich_text=excluded.rich_text, block_kind=excluded.block_kind;
  end if;

  if p_delete_ids is not null and array_length(p_delete_ids,1) is not null then
    delete from public.script_lines where script_id=p_script_id and id=any(p_delete_ids);
  end if;

  update public.scripts set revision=v_current+1 where id=p_script_id;

  if (select coalesce(sum(length(text)),0) from public.script_lines
       where script_id=p_script_id and block_kind is distinct from 'heading') > 15000 then
    raise exception 'script body exceeds character limit';
  end if;

  return query select v_current+1, (v_current is distinct from p_expected_revision);
end; $$;

grant execute on function public.save_script_blocks_atomic(uuid, integer, jsonb, uuid[]) to authenticated;
