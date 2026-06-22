# Collaborative Script Editing — Phase 5 (Atomic Save + Heartbeat Re-sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tighten correctness: (a) make each save atomic + serialized server-side (one transaction: upsert + delete + revision bump) via a Postgres function, closing the multi-statement interleaving window; (b) add a heartbeat re-sync so a dropped realtime ping can't leave a session stale.

**Architecture:** A SECURITY-INVOKER Postgres function `save_script_blocks_atomic(p_script_id, p_expected_revision, p_upserts jsonb, p_delete_ids uuid[])` does the write in one transaction under a `SELECT … FOR UPDATE` lock on the script row, returning `(new_revision, was_conflicted)`. `saveScriptBlocks` calls it instead of three separate statements (and snapshots only when it will actually write). A heartbeat effect in `Scripts.tsx` polls the script revision on an interval + on tab-visibility and triggers the existing deferral-aware merge when the DB is ahead.

**Tech Stack:** React + TS, Supabase (RPC + Realtime), Vitest. Builds on Phases 1-4. Spec: `docs/superpowers/specs/2026-06-20-collaborative-script-editing-design.md`.

## Global Constraints

- Editor lives on `origin/main`; work in a worktree off main.
- App-surface code uses `hsl(var(--...))` tokens, never raw palette hex.
- CI runs `vite build` only (no typecheck); verify `npx tsc --noEmit` exits 0; judge correctness by reading code.
- Supabase project id: `hxojqrilwhhrvloiwmfo`.
- The function `save_script_blocks_atomic` is ALREADY created in prod (via MCP) and tested (correct upsert/delete/renumber, revision bump, conflict flag; verified clients have UPDATE on their own scripts so SECURITY INVOKER works). This plan only records it in a migration file and wires the client + heartbeat.

---

## Task 1: Record the atomic-save migration in the repo

**Files:**
- Create: `supabase/migrations/20260621_script_atomic_save.sql`

**Interfaces:** none (repo history only; prod already has the function).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260621_script_atomic_save.sql` with EXACTLY:

```sql
-- Collaborative script editing — Phase 5: atomic save
-- Applied to prod via Supabase MCP on 2026-06-21 (this file is for repo history).
-- One-transaction save: upsert changed blocks + delete removed + bump revision, under a
-- FOR UPDATE lock on the script row. SECURITY INVOKER so RLS applies (clients can update
-- their own scripts/script_lines). Returns the new revision and whether the caller's
-- expected revision was stale.

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

  return query select v_current + 1, (v_current is distinct from p_expected_revision);
end;
$$;

grant execute on function public.save_script_blocks_atomic(uuid, integer, jsonb, uuid[]) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260621_script_atomic_save.sql
git commit -m "feat(scripts): record atomic save_script_blocks_atomic migration"
```

---

## Task 2: Route `saveScriptBlocks` through the atomic RPC

**Files:**
- Modify: `src/hooks/useScripts.ts` (`saveScriptBlocks`)

**Interfaces:**
- Unchanged signature/return: `saveScriptBlocks(scriptId, blocks, opts) => { blocks, revision, conflicted, wrote }`. Internally replaces the separate upsert + delete + revision-bump statements with one `supabase.rpc("save_script_blocks_atomic", ...)`, and skips the write (and the snapshot) entirely when nothing changed.

- [ ] **Step 1: Replace the write section**

In `saveScriptBlocks`, replace everything from `// Safety net: snapshot the pre-save state` down through the `return { blocks: await getScriptBlocks(scriptId), revision, conflicted, wrote };` line with:

```ts
    const { upserts, deleteIds } = computeBlockDiff(withIds, opts.baseline ?? new Map(), opts.removedIds ?? []);
    const wrote = upserts.length > 0 || deleteIds.length > 0;

    // Nothing changed (e.g. a merge-driven re-render): don't snapshot, don't bump revision.
    if (!wrote) {
      return { blocks: await getScriptBlocks(scriptId), revision: await getScriptRevision(scriptId), conflicted: false, wrote: false };
    }

    // Safety net: snapshot the pre-save state (throttled) so any overwrite is recoverable.
    await saveVersionSnapshot(scriptId);

    // Atomic server-side save: upsert + delete + revision bump in one transaction under a
    // FOR UPDATE lock on the script row (serializes concurrent saves; no interleaving).
    const { data: rpcData, error: rpcErr } = await supabase.rpc("save_script_blocks_atomic", {
      p_script_id: scriptId,
      p_expected_revision: opts.expectedRevision ?? null,
      p_upserts: upserts.map((b) => ({
        id: b.id,
        line_number: b.line_number,
        line_type: b.line_type,
        section: b.section,
        text: b.text,
        rich_text: b.rich_text,
        block_kind: b.block_kind,
      })),
      p_delete_ids: deleteIds,
    });
    if (rpcErr) {
      console.error("saveScriptBlocks rpc error:", rpcErr);
      toast.error("Error saving script");
      throw new Error("Failed to save script blocks");
    }
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const revision = (row?.new_revision as number) ?? (await getScriptRevision(scriptId));
    const conflicted = !!row?.was_conflicted;

    return { blocks: await getScriptBlocks(scriptId), revision, conflicted, wrote: true };
```

(Leaves the function signature, the `normalizeBlocks`/empty-doc guard, and the `withIds` computation above untouched. Removes the old `supabase.from("script_lines").upsert(...)`, the `.delete(...)`, and the conditional revision-bump block.)

- [ ] **Step 2: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): route saveScriptBlocks through atomic RPC; skip no-op saves"
```

---

## Task 3: Heartbeat re-sync (interval + tab visibility)

**Files:**
- Modify: `src/pages/Scripts.tsx` (add one effect near the other realtime/sync effects)

**Interfaces:**
- Consumes: existing `viewingScriptId`, `revisionRef`, `handleRemoteSaved`, `supabase`.
- Produces: a heartbeat that, while a script is open, checks the DB revision every 25s and on tab re-visibility, and calls `handleRemoteSaved()` when the DB revision is ahead of `revisionRef.current` — catching dropped realtime pings.

- [ ] **Step 1: Add the heartbeat effect**

In `src/pages/Scripts.tsx`, add this effect right after the `useRealtimeScriptSync(...)` mount + the docBlocks/caption mirror effects (so `handleRemoteSaved` is in scope):

```ts
  // Heartbeat: realtime broadcast is best-effort; if a "saved" ping is dropped, this catches
  // up by polling the revision (cheap) and merging when the DB is ahead. Also re-syncs when
  // the tab regains focus.
  useEffect(() => {
    if (!viewingScriptId) return;
    const sid = viewingScriptId;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.from("scripts").select("revision").eq("id", sid).maybeSingle();
      if (cancelled) return;
      const dbRev = (data?.revision as number) ?? null;
      if (dbRev != null && revisionRef.current != null && dbRev > revisionRef.current) {
        handleRemoteSaved();
      }
    };
    const interval = setInterval(check, 25_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [viewingScriptId, handleRemoteSaved]);
```

- [ ] **Step 2: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): heartbeat re-sync (interval + visibility) for dropped pings"
```

---

## Task 4: Manual verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` — tsc 0; tests pass (minus the pre-existing reorder file).
- [ ] **Step 2:** Two-tab test: edit different lines in each → both persist; same line → last wins, no crash. Confirm saves still feel instant (the RPC is one round-trip, faster than the old three).
- [ ] **Step 3:** Heartbeat: in Tab B, block the realtime channel (e.g. go offline ~5s then online, or just edit in A and watch B) → within ~25s (or immediately on refocusing B) B catches up to A's change even if the live ping was missed.
- [ ] **Step 4:** DB spot-check: editing a script bumps `scripts.revision` once per save that writes; a no-op save does not bump it.

## Self-Review Notes

- Atomic + serialized: the FOR UPDATE lock + single transaction removes the multi-statement interleaving window; per-block upsert semantics (and thus the no-overwrite guarantee from Phases 1/3) are unchanged.
- No-op saves no longer snapshot or bump revision (cleaner; avoids revision churn that would flag false conflicts on peers).
- Heartbeat closes the dropped-ping staleness gap; it reuses the deferral-aware `handleRemoteSaved`, so it never clobbers unsaved local edits.
- The function is SECURITY INVOKER → RLS still enforces per-client access (verified clients have UPDATE on own scripts/script_lines).
- Out of scope: per-keystroke streaming + CRDT (#4 epic).
