# Archive Workflow + Split Edited/Published Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Archive" state to `video_edits` (distinct from Trash) so finished videos can leave the editing queue without disappearing from strategy metrics, and split the strategy dashboard's single ambiguous video count into separate **Edited** and **Published** metrics.

**Architecture:** One new nullable column `video_edits.archived_at`. Archived = removed from the editing-queue list but still counted in metrics (because metrics only exclude `deleted_at`). A daily pg_cron job soft-deletes archived rows older than 30 days (sets `deleted_at`, i.e. moves to Trash). The two editing-queue pages (master + individual) gain an Archive action and an Archived view mirroring the existing Trash pattern. The strategy page gains a Published count.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres + pg_cron), Tailwind. Schema/cron changes applied to prod via Supabase MCP (NOT `db push`). CI runs `vite build` only — no typecheck — so every UI task verifies with `npx tsc --noEmit` by exit code before commit.

## Global Constraints

- Schema and cron changes go to prod via Supabase MCP (`apply_migration` / `execute_sql`); a matching migration file is also committed. Never bulk `db push`. Verify the column exists in prod before deploying code that reads it. (project: DB migration drift)
- App-surface code uses branding tokens (`hsl(var(--ink))`, `text-foreground`, etc.), never palette hex. A pre-commit hook blocks palette hex. (feedback: branding tokens)
- CI does not typecheck. Verify `npx tsc --noEmit` exits 0 before every commit. (project: CI has no typecheck)
- Shared editing-queue changes must land in BOTH `MasterEditingQueue.tsx` (master "All Clients") and `EditingQueue.tsx` (per-client). (reference: editing queue routes)
- This work happens in the worktree `/Users/admin/Documents/connectacreators-archive-workflow` on branch `feat/editing-archive-workflow` (off `main`). Do NOT use the stale `feat/video-editor-phase-1` checkout.
- Run `npx tsc --noEmit` and `git` commands from the worktree root.

**State semantics (the contract every task relies on):**

| State | `archived_at` | `deleted_at` | In queue list | In metrics |
|-------|---------------|--------------|---------------|------------|
| Active | NULL | NULL | yes | yes |
| Archived | set | NULL | no | yes |
| Trashed | (either) | set | no | no |

Trash takes priority: a row with `deleted_at` set is Trashed regardless of `archived_at`.

---

## Task 1: Add `archived_at` column + index

**Files:**
- Create: `supabase/migrations/20260623_video_edits_archived_at.sql`
- Apply to prod: via Supabase MCP `apply_migration`

**Interfaces:**
- Produces: `video_edits.archived_at timestamptz` (nullable). Consumed by all later tasks.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260623_video_edits_archived_at.sql`:

```sql
-- Archive state for video_edits, distinct from trash (deleted_at).
-- Archived rows leave the editing queue but still count in strategy metrics.
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_video_edits_archived_at
  ON video_edits (archived_at)
  WHERE archived_at IS NOT NULL;
```

- [ ] **Step 2: Apply to prod via MCP**

Use the Supabase MCP `apply_migration` tool with name `video_edits_archived_at` and the SQL above.

- [ ] **Step 3: Verify the column exists in prod**

Run via MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'video_edits' AND column_name = 'archived_at';
```

Expected: one row — `archived_at | timestamp with time zone | YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260623_video_edits_archived_at.sql
git commit -m "feat(editing): add video_edits.archived_at column for archive state"
```

---

## Task 2: 30-day archive→trash retention (pg_cron)

**Files:**
- Create: `supabase/migrations/20260623_archive_retention_cron.sql` (documents the job; applied via MCP)
- Apply to prod: via Supabase MCP `execute_sql`

**Interfaces:**
- Consumes: `video_edits.archived_at` (Task 1).
- Produces: a daily pg_cron job `archive_to_trash_30d` that sets `deleted_at = now()` on rows archived > 30 days ago.

- [ ] **Step 1: Verify the retention UPDATE logic against crafted rows (dry run)**

Run via MCP `execute_sql` — this SELECT mirrors the job's WHERE clause and must select only the "expired" row:

```sql
WITH sample(label, archived_at, deleted_at) AS (
  VALUES
    ('expired',     now() - interval '31 days', NULL::timestamptz),
    ('fresh',       now() - interval '10 days', NULL::timestamptz),
    ('active',      NULL::timestamptz,          NULL::timestamptz),
    ('already_trashed', now() - interval '31 days', now())
)
SELECT label FROM sample
WHERE archived_at IS NOT NULL
  AND archived_at < now() - interval '30 days'
  AND deleted_at IS NULL;
```

Expected: exactly one row — `expired`.

- [ ] **Step 2: Write the migration/doc file**

Create `supabase/migrations/20260623_archive_retention_cron.sql`:

```sql
-- Daily job: archived video_edits older than 30 days move to Trash (soft delete).
-- Metrics are current-month only, so a 30-day-old archived row is already out of
-- the count window; this transition never changes displayed numbers.
SELECT cron.schedule(
  'archive_to_trash_30d',
  '17 4 * * *',  -- daily 04:17 UTC
  $$UPDATE video_edits
      SET deleted_at = now()
    WHERE archived_at IS NOT NULL
      AND archived_at < now() - interval '30 days'
      AND deleted_at IS NULL$$
);
```

- [ ] **Step 3: Schedule the job in prod via MCP**

Run the `cron.schedule(...)` statement above via MCP `execute_sql`.

- [ ] **Step 4: Verify the job is registered**

Run via MCP `execute_sql`:

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'archive_to_trash_30d';
```

Expected: one row — `archive_to_trash_30d | 17 4 * * * | t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260623_archive_retention_cron.sql
git commit -m "feat(editing): pg_cron job to move archived video_edits to trash after 30 days"
```

---

## Task 3: Split Edited / Published metrics on the strategy dashboard

**Files:**
- Modify: `src/pages/ClientStrategy.tsx`

**Interfaces:**
- Consumes: `video_edits.archived_at` indirectly (archived rows keep `deleted_at` NULL, so they now count).
- Produces: `MonthCounts` gains `videos_published: number`. The Monthly Pace section and the Action Required card show four video/post metrics: Scripts, Edited, Published, Posts scheduled.

**Definitions (all scoped to current month):**
- **Edited** = `video_edits` where `status = "Done"` AND `deleted_at IS NULL` AND `created_at >= monthStart`. (Existing query — relabel only. Archived rows now count because they keep `deleted_at` NULL.)
- **Published** = `video_edits` where `post_status = "Published"` AND `deleted_at IS NULL` AND `created_at >= monthStart`. (New.)
- Published reuses `videos_edited_per_month` as its target (goal: publish what you edit) — no new `client_strategies` column.

- [ ] **Step 1: Add `videos_published` to the `MonthCounts` interface**

In `src/pages/ClientStrategy.tsx`, change the interface at lines 54-58:

```typescript
interface MonthCounts {
  scripts: number;
  videos_edited: number;
  videos_published: number;
  posts_scheduled: number;
}
```

- [ ] **Step 2: Initialize the new field in state**

At line 162, update the initial state:

```typescript
  const [counts, setCounts] = useState<MonthCounts>({ scripts: 0, videos_edited: 0, videos_published: 0, posts_scheduled: 0 });
```

- [ ] **Step 3: Add the Published query and set it in counts**

Replace the `Promise.all` block and `setCounts` call at lines 198-204 with:

```typescript
      const [{ count: scriptCount }, { count: videoCount }, { count: publishedCount }, { count: calCount }] = await Promise.all([
        supabase.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", iso),
        supabase.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
        supabase.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("post_status", "Published").is("deleted_at", null).gte("created_at", iso),
        supabase.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("schedule_date", iso.slice(0, 10)).is("deleted_at", null),
      ]);

      setCounts({ scripts: scriptCount || 0, videos_edited: videoCount || 0, videos_published: publishedCount || 0, posts_scheduled: calCount || 0 });
```

- [ ] **Step 4: Add Published to the Action Required breakdown list**

In the breakdown array at lines 414-418, insert a Published row after the "Videos edited" row (line 416):

```typescript
              { label: en ? "Videos edited" : "Videos editados", pct: Math.round(Math.min(100, (counts.videos_edited / Math.max(1, s.videos_edited_per_month)) * 100)) },
              { label: en ? "Published" : "Publicados", pct: Math.round(Math.min(100, (counts.videos_published / Math.max(1, s.videos_edited_per_month)) * 100)) },
```

- [ ] **Step 5: Add Published to the Monthly Pace grid and widen the grid**

Change the grid container at line 434 from three to a responsive four-up layout:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
```

Then in the metrics array at lines 435-438, insert the Published entry after the "Videos Edited" entry (line 437). Note Published has no inline target editor, so guard the `editing` input by field:

```typescript
              { label: en ? "Videos Edited" : "Videos Editados", count: counts.videos_edited, target: s.videos_edited_per_month, field: "videos_edited_per_month" as keyof ClientStrategy },
              { label: en ? "Published" : "Publicados", count: counts.videos_published, target: s.videos_edited_per_month, field: null as keyof ClientStrategy | null },
              { label: en ? "Posts Scheduled" : "Posts Programados", count: counts.posts_scheduled, target: s.posts_per_month, field: "posts_per_month" as keyof ClientStrategy },
```

Update the inline-edit guard inside the `.map` (line 448) so the null-field Published row renders no editor:

```tsx
                  {editing && item.field && <div className="mt-1">{input(item.field, "number")}</div>}
```

(If the array's TypeScript element type complains about the mixed `field` type, type the array element inline as `{ label: string; count: number; target: number; field: keyof ClientStrategy | null }`.)

- [ ] **Step 6: Verify types**

Run from worktree root:

```bash
npx tsc --noEmit
```

Expected: exits 0 (no errors). If the `field` union causes errors, apply the inline element typing noted in Step 5.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "feat(strategy): split video metric into Edited and Published; archived edits now count"
```

---

## Task 4: Archive action + Archived view in the MASTER editing queue

**Files:**
- Modify: `src/pages/MasterEditingQueue.tsx`

**Interfaces:**
- Consumes: `video_edits.archived_at` (Task 1).
- Produces: archive (single + bulk), an Archived view, and restore-from-archive — all mirroring the existing Trash pattern. The main list query now also excludes archived rows.

This page already has a full Trash implementation (state `showTrash`/`trashedItems`/`fetchingTrash` at lines 250-253; handlers `handleDeleteItem` 684, `handleBulkDelete` 736, `fetchTrashedItems` 760, `handleRestoreItem` 799; toolbar Trash toggle ~1009; Trash view ~1069; bulk bar ~1431). Mirror it for Archive.

- [ ] **Step 1: Exclude archived rows from the main list query**

In `fetchQueue`, the main select at lines 297-299 ends with `.is("deleted_at", null)`. Add an archived filter immediately after it:

```typescript
        .is("deleted_at", null)
        .is("archived_at", null)
```

- [ ] **Step 2: Add Archive state next to the Trash state**

After the Trash state block (lines 250-253), add:

```typescript
  // Archive
  const [showArchive, setShowArchive] = useState(false);
  const [archivedItems, setArchivedItems] = useState<EditingQueueItem[]>([]);
  const [fetchingArchive, setFetchingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
```

- [ ] **Step 3: Add single + bulk archive handlers**

After `handleBulkDelete` (ends line 758), add:

```typescript
  const handleArchiveItem = async (item: EditingQueueItem) => {
    setArchiving(true);
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from("video_edits").update({ archived_at: now }).eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(language === "en" ? "Archived" : "Archivado");
    } catch (e: any) {
      console.error("Error archiving item:", e);
      toast.error(language === "en" ? "Failed to archive" : "Error al archivar");
    } finally {
      setArchiving(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setArchiving(true);
    const now = new Date().toISOString();
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("video_edits").update({ archived_at: now }).in("id", ids);
      if (error) throw error;
      const count = ids.length;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items archived` : `${count} elementos archivados`);
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to archive items" : "Error al archivar elementos");
    } finally {
      setArchiving(false);
    }
  };
```

Note: archive does NOT touch the linked script (unlike trash).

- [ ] **Step 4: Add fetch + restore handlers for the Archived view**

After `handleRestoreItem` (ends line 814), add:

```typescript
  const fetchArchivedItems = async () => {
    if (!user) return;
    setFetchingArchive(true);
    try {
      const { data, error } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, client_id, archived_at, created_at, script_id, clients(name)")
        .not("archived_at", "is", null)
        .is("deleted_at", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      setArchivedItems((data || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
        status: v.status || "Not started",
        statusColor: "",
        fileSubmissionUrl: null,
        footageUrl: null,
        scriptUrl: null,
        assignee: null,
        assignee_user_id: null,
        assigneeId: null,
        assigneePropName: null,
        revisions: null,
        revisionPropName: null,
        lastEdited: v.created_at,
        scheduledDate: null,
        clientId: v.client_id,
        clientName: v.clients?.name || v.client_id,
        script_id: v.script_id || null,
        source: 'db' as const,
        deleted_at: null,
        archived_at: v.archived_at,
      })));
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to fetch archive" : "Error al cargar el archivo");
    } finally {
      setFetchingArchive(false);
    }
  };

  const handleUnarchiveItem = async (itemId: string) => {
    try {
      const { error } = await supabase.from("video_edits").update({ archived_at: null }).eq("id", itemId);
      if (error) throw error;
      setArchivedItems(prev => prev.filter(i => i.id !== itemId));
      toast.success(language === "en" ? "Restored to queue" : "Restaurado a la cola");
      fetchQueue();
    } catch {
      toast.error(language === "en" ? "Failed to restore" : "Error al restaurar");
    }
  };
```

- [ ] **Step 5: Add `archived_at` to the `EditingQueueItem` type**

The interface field for `deleted_at` is at line 64. Add directly after it:

```typescript
  deleted_at?: string | null;
  archived_at?: string | null;
```

- [ ] **Step 6: Add an Archive toggle button next to the Trash toggle in the toolbar**

The Trash toggle button is at ~lines 1009-1023 (icon `Trash2`, label "Trash", `onClick` calls `fetchTrashedItems()` + `setShowTrash`). Add an Archive toggle button immediately before or after it, using the `Archive` icon from lucide-react (add `Archive` to the import at line 7). Pattern:

```tsx
              <button
                onClick={() => {
                  if (!showArchive) fetchArchivedItems();
                  setShowArchive(!showArchive);
                  setShowTrash(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showArchive
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                {language === "en" ? "Archive" : "Archivo"}
              </button>
```

Also make the existing Trash toggle clear the archive view: in the Trash toggle's `onClick` (line ~1012), add `setShowArchive(false);`.

(Match the exact className string of the adjacent Trash button if it differs from the snippet — copy its styling so the two buttons look identical.)

- [ ] **Step 7: Render the Archived view**

The Trash view is rendered under `{showTrash ? ( ... ) : ( ...main table... )}` starting ~line 1069. Convert to handle both: render the Archived block when `showArchive`, the Trash block when `showTrash`, else the main table. Mirror the Trash view markup (lines ~1069-1130) exactly, substituting:
- `archivedItems` for `trashedItems`, `fetchingArchive` for `fetchingTrash`
- banner text: `language === "en" ? "Archived items are moved to trash after 30 days" : "Los elementos archivados se mueven a la papelera después de 30 días"`
- empty text: `language === "en" ? "Archive is empty" : "El archivo está vacío"`
- the date shown: `item.archived_at`
- the restore button `onClick={() => handleUnarchiveItem(item.id)}`
- use the `Archive` icon instead of `Trash2` in the banner
- do NOT render a permanent-delete button in the Archived view (restore only)

Concretely, change the top-level conditional so it reads:

```tsx
          {showArchive ? (
            /* ...Archived view (mirror of Trash view, per substitutions above)... */
          ) : showTrash ? (
            /* ...existing Trash view unchanged... */
          ) : (
            /* ...existing main table unchanged... */
          )}
```

- [ ] **Step 8: Add an Archive item to the per-row action menu**

The per-row menu has a Delete entry (`Trash2` icon, ~line 1415). Add an Archive entry just above it in the same menu, mirroring the Delete item's markup:

```tsx
                                <Archive className="w-3.5 h-3.5 mr-2" /> {language === "en" ? "Archive" : "Archivar"}
```

wired to `onClick={() => handleArchiveItem(item)}`. Copy the surrounding menu-item element/classes from the Delete entry so it matches.

- [ ] **Step 9: Add a bulk Archive button to the selection action bar**

The selection bar (`{selectedIds.size > 0 && ...}`, ~line 1431) has a bulk delete button (~line 1449, `Trash2` icon, `handleBulkDelete`). Add a bulk Archive button beside it, mirroring its markup:

```tsx
            {archiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
            {language === "en" ? "Archive" : "Archivar"}
```

wired to `onClick={handleBulkArchive}` and `disabled={archiving}`. Copy the bulk-delete button's element/classes.

- [ ] **Step 10: Verify types**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 11: Manual smoke test**

Run `npm run dev` from the worktree, open the master editing queue (`/editing-queue`):
1. Archive a row (row menu → Archive) → it disappears from the list, toast "Archived".
2. Click the Archive toggle → the archived row appears in the Archived view.
3. Restore it → it returns to the main list.
4. Select multiple rows → bulk Archive → they leave the list and appear in Archive.
5. Confirm Trash still works independently (trashed rows go to Trash view, not Archive).

- [ ] **Step 12: Commit**

```bash
git add src/pages/MasterEditingQueue.tsx
git commit -m "feat(editing): archive action + archived view in master editing queue"
```

---

## Task 5: Archive action + Archived view in the INDIVIDUAL editing queue

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

**Interfaces:**
- Consumes: `video_edits.archived_at` (Task 1).
- Produces: same archive capabilities as Task 4, in the per-client queue.

NOTE: unlike the master, this page has NO existing Trash view — only trash actions (`handleDeleteItem` ~644, `handleBulkDelete` ~665) and the main list filter `.is("deleted_at", null)` at line 347. So the Archived view is built fresh here (modeled on Task 4). Keep the page's own component patterns/classes; copy markup from this file's existing toolbar/menu/selection-bar elements, not from the master, so styling matches locally.

- [ ] **Step 1: Exclude archived rows from the main list query**

After `.is("deleted_at", null)` (line 347), add:

```typescript
        .is("deleted_at", null)
        .is("archived_at", null)
```

- [ ] **Step 2: Add `archived_at` to this file's `EditingQueueItem` type**

Find the `deleted_at?: string | null;` field in this file's item interface and add after it:

```typescript
  archived_at?: string | null;
```

- [ ] **Step 3: Add Archive state**

Near the existing trash/selection state (`deleteConfirmItem` ~158, `selectedIds` ~200), add:

```typescript
  const [showArchive, setShowArchive] = useState(false);
  const [archivedItems, setArchivedItems] = useState<EditingQueueItem[]>([]);
  const [fetchingArchive, setFetchingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
```

- [ ] **Step 4: Add single + bulk archive handlers**

After `handleBulkDelete` (ends ~line 681), add. This page is scoped to one client via its `clientId`/route param — the archive update is by id, so no client filter is needed on the mutation, but `fetchArchivedItems` MUST filter by this page's client id. Use the same client-id variable the existing `fetchQueue` uses (inspect `fetchQueue` for the exact name, e.g. `clientId`):

```typescript
  const handleArchiveItem = async (item: EditingQueueItem) => {
    setArchiving(true);
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from("video_edits").update({ archived_at: now }).eq("id", item.id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(language === "en" ? "Archived" : "Archivado");
    } catch (e: any) {
      console.error("Error archiving item:", e);
      toast.error(language === "en" ? "Failed to archive" : "Error al archivar");
    } finally {
      setArchiving(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setArchiving(true);
    const now = new Date().toISOString();
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("video_edits").update({ archived_at: now }).in("id", ids);
      if (error) throw error;
      const count = ids.length;
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      toast.success(language === "en" ? `${count} items archived` : `${count} elementos archivados`);
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to archive items" : "Error al archivar elementos");
    } finally {
      setArchiving(false);
    }
  };
```

- [ ] **Step 5: Add fetch + unarchive handlers (scoped to this client)**

Add after the handlers from Step 4. Replace `CLIENT_ID_VAR` with the actual client-id variable used by `fetchQueue` in this file:

```typescript
  const fetchArchivedItems = async () => {
    setFetchingArchive(true);
    try {
      const { data, error } = await supabase
        .from("video_edits")
        .select("id, reel_title, status, client_id, archived_at, created_at, script_id")
        .eq("client_id", CLIENT_ID_VAR)
        .not("archived_at", "is", null)
        .is("deleted_at", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      setArchivedItems((data || []).map((v: any) => ({
        id: v.id,
        title: v.reel_title || "Untitled",
        status: v.status || "Not started",
        statusColor: "",
        fileSubmissionUrl: null,
        footageUrl: null,
        scriptUrl: null,
        assignee: null,
        assignee_user_id: null,
        assigneeId: null,
        assigneePropName: null,
        revisions: null,
        revisionPropName: null,
        lastEdited: v.created_at,
        scheduledDate: null,
        clientId: v.client_id,
        clientName: v.client_id,
        script_id: v.script_id || null,
        source: 'db' as const,
        deleted_at: null,
        archived_at: v.archived_at,
      })));
    } catch (e: any) {
      toast.error(language === "en" ? "Failed to fetch archive" : "Error al cargar el archivo");
    } finally {
      setFetchingArchive(false);
    }
  };

  const handleUnarchiveItem = async (itemId: string) => {
    try {
      const { error } = await supabase.from("video_edits").update({ archived_at: null }).eq("id", itemId);
      if (error) throw error;
      setArchivedItems(prev => prev.filter(i => i.id !== itemId));
      toast.success(language === "en" ? "Restored to queue" : "Restaurado a la cola");
      fetchQueue();
    } catch {
      toast.error(language === "en" ? "Failed to restore" : "Error al restaurar");
    }
  };
```

If the `EditingQueueItem` type in this file has fewer/more fields than the object above, match it exactly — drop fields it lacks, keep what it requires non-optional.

- [ ] **Step 6: Add an Archive toggle button to the toolbar**

This page has no Trash toggle to mirror, so add a standalone Archive toggle in the page header/toolbar area (near the existing header controls). Add `Archive` to the lucide-react import at line 7. Use a button consistent with this page's existing button classes:

```tsx
        <button
          onClick={() => { if (!showArchive) fetchArchivedItems(); setShowArchive(!showArchive); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showArchive ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {language === "en" ? "Archive" : "Archivo"}
        </button>
```

- [ ] **Step 7: Render the Archived view**

Wrap the main table render in a conditional. Where the page currently renders its list/table, change to:

```tsx
      {showArchive ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
            <Archive className="w-4 h-4" />
            {language === "en" ? "Archived items are moved to trash after 30 days" : "Los elementos archivados se mueven a la papelera después de 30 días"}
          </div>
          {fetchingArchive ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : archivedItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {language === "en" ? "Archive is empty" : "El archivo está vacío"}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {archivedItems.map((item) => {
                const archivedDate = item.archived_at ? new Date(item.archived_at) : new Date();
                return (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/5">
                    <span className="text-sm text-foreground flex-1 min-w-0 truncate">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground">{archivedDate.toLocaleDateString()}</span>
                    <button
                      onClick={() => handleUnarchiveItem(item.id)}
                      title={language === "en" ? "Restore" : "Restaurar"}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {language === "en" ? "Restore" : "Restaurar"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ...existing list/table render unchanged... */
      )}
```

Add `RotateCcw` to the lucide-react import at line 7 if not already present.

- [ ] **Step 8: Add an Archive item to the per-row action menu**

The row menu has a Delete entry (`Trash2`, ~line 1208). Add an Archive entry above it, copying the Delete entry's element/classes:

```tsx
                                      <Archive className="w-3.5 h-3.5 mr-2" /> {language === "en" ? "Archive" : "Archivar"}
```

wired to `onClick={() => handleArchiveItem(item)}`.

- [ ] **Step 9: Add a bulk Archive button to the selection bar**

The selection bar (`{selectedIds.size > 0 && ...}`, ~line 1227) has a bulk delete button (~line 1245, `Trash2`, `handleBulkDelete`). Add a bulk Archive button beside it, copying its element/classes:

```tsx
            {archiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
            {language === "en" ? "Archive" : "Archivar"}
```

wired to `onClick={handleBulkArchive}` and `disabled={archiving}`.

- [ ] **Step 10: Verify types**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 11: Manual smoke test**

Open a per-client editing queue (`/clients/:id/editing-queue`):
1. Archive a row → leaves the list, toast "Archived".
2. Archive toggle → archived row shows in the Archived view, scoped to this client only.
3. Restore → returns to the list.
4. Bulk archive → multiple rows leave and appear in Archive.
5. Trash still works independently.

- [ ] **Step 12: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat(editing): archive action + archived view in per-client editing queue"
```

---

## Final verification (after all tasks)

- [ ] `npx tsc --noEmit` exits 0 from the worktree root.
- [ ] In prod, confirm `video_edits.archived_at` exists and the `archive_to_trash_30d` cron job is active.
- [ ] On a real client's strategy page, the Monthly Pace shows four metrics and "Videos Edited" reflects archived-but-not-trashed edits (the original "1 vs many" bug is gone).
- [ ] Archive + Archived view + Restore all work in BOTH `/editing-queue` (master) and `/clients/:id/editing-queue` (individual).

## Notes / decisions baked in

- Published target reuses `videos_edited_per_month` (no new `client_strategies` column).
- Archive does not cascade to the linked script (Trash still does).
- 30-day expiry sends archived rows to Trash (soft delete), not permanent delete.
- Trash retention text in the master ("90 days") is unchanged and out of scope.
