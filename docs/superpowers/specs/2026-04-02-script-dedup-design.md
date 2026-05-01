# Script Duplicate Prevention — Design Spec

## Goal

Prevent duplicate script titles within the same client. When a new script is saved with a title that already exists, auto-rename it to "Title (1)", "Title (2)", etc., and notify the user with a toast.

## Context

Every script in `scripts` has a corresponding `video_edits` row linked via `script_id`. Duplicate titles produce two identical rows in the Editing Queue with no way to distinguish them.

Updates (title renames, line edits) do NOT create duplicates — those use `UPDATE WHERE id = X`. The only gap is on **new script creation** via `useScripts.directSave()`.

`scriptService.createScript()` exists but is never called from the UI — all creation goes through `directSave()`.

## Dedup Logic

### `resolveUniqueTitle(clientId, baseTitle)` helper

Lives in `useScripts.ts`, exported for reuse.

1. Strip any existing `(N)` suffix from `baseTitle` to get the clean base
2. Query `scripts` WHERE `client_id = clientId` AND `deleted_at IS NULL` AND `title ILIKE 'baseTitle%'`
3. Collect all matching titles into a Set
4. If `baseTitle` is not in the Set → return `baseTitle` unchanged (no conflict)
5. Otherwise, find the lowest N ≥ 1 where `"baseTitle (N)"` is not in the Set → return that

```typescript
export async function resolveUniqueTitle(clientId: string, baseTitle: string): Promise<string> {
  const clean = baseTitle.replace(/\s*\(\d+\)$/, '').trim();
  const { data } = await supabase
    .from('scripts')
    .select('title')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .ilike('title', `${clean}%`);
  const existing = new Set((data || []).map((s: any) => s.title.trim()));
  if (!existing.has(clean)) return clean;
  let n = 1;
  while (existing.has(`${clean} (${n})`)) n++;
  return `${clean} (${n})`;
}
```

### Integration point in `directSave()`

Only applied when creating a new script (`!params.existingScriptId`):

```typescript
// Before the insert:
const resolvedTitle = await resolveUniqueTitle(params.clientId, params.ideaGanadora);
const renamed = resolvedTitle !== params.ideaGanadora.trim().replace(/\s*\(\d+\)$/, '').trim();
```

Then use `resolvedTitle` in the insert payload and in the `video_edits` upsert.

After successful save, if `renamed`:
```typescript
toast.info(`A script with this name already exists — saved as "${resolvedTitle}"`);
```

Otherwise the existing `toast.success("Script saved")` fires as normal.

## Scope

- **Uniqueness is per client** — two different clients can have scripts with the same name
- **Soft-deleted scripts are excluded** — `deleted_at IS NULL` in the query
- **Case-insensitive check** — uses `ILIKE` in query, but final stored title preserves original casing with the `(N)` suffix appended
- **Updates not affected** — `directSave` with `existingScriptId` skips the check entirely (it's an UPDATE, not INSERT)

## Files Modified

- `src/hooks/useScripts.ts`
  - Add exported `resolveUniqueTitle(clientId, baseTitle)` async function (above `useScripts` hook)
  - In `directSave()`, call it before the insert block and pass `resolvedTitle` to the insert and video_edits upsert
  - Show `toast.info` when renamed, keep existing `toast.success` when not renamed

## Not in scope

- DB-level unique constraint (app-level check is sufficient; a constraint would cause hard errors for the batch-generate edge function which creates scripts server-side)
- Dedup check on `video_edits.reel_title` for standalone video entries (those have no `script_id`, are created manually)
- Renaming titles that already exist as duplicates in the DB (retroactive cleanup)
