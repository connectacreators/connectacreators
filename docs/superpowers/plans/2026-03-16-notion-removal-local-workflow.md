# Notion Removal — Local Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Notion API calls from the app so scripts, editing status, and post approvals are stored and managed entirely in Supabase.

**Architecture:** Three sequential sub-projects — (1) strip Notion sync from the script-save path, (2) rewrite editing queue pages to read `video_edits` directly, (3) rewrite content calendar pages to read `video_edits` where `schedule_date IS NOT NULL`. Each sub-project is independently deployable.

**Tech Stack:** React 18, TypeScript, Vite, Supabase (Postgres + Edge Functions in Deno/TypeScript), Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-16-notion-removal-local-workflow.md`

---

## Chunk 1: Sub-project 1 — Script → video_edits Pipeline

### Files

- Modify: `src/hooks/useScripts.ts` — remove `syncToNotion` + `bulkSyncToNotion`
- Modify: `src/pages/Scripts.tsx` — remove "Sync to Notion" button
- Create: `supabase/migrations/20260316_video_edits_caption.sql` — add `caption` column

---

### Task 1: Add caption column migration

**Files:**
- Create: `supabase/migrations/20260316_video_edits_caption.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260316_video_edits_caption.sql
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS caption TEXT;
```

- [ ] **Step 2: Verify it can be applied**

Run: `npx supabase db push` (or apply via Supabase Dashboard SQL Editor)

Expected: no error, column now exists in `video_edits`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260316_video_edits_caption.sql
git commit -m "feat(db): add caption column to video_edits"
```

---

### Task 2: Remove syncToNotion from useScripts.ts

**Files:**
- Modify: `src/hooks/useScripts.ts`

The file currently has:
- `syncToNotion` helper function at lines 39–67
- `syncToNotion(...)` call at line 269 (inside `directSave`, after `video_edits` insert)
- `syncToNotion(...)` call at line 356 (inside `categorizeAndSave`)
- `syncToNotion(...)` call at line 497 (inside `updateScript`)
- `syncToNotion(...)` call at line 524 (inside `updateGoogleDriveLink`)
- `bulkSyncToNotion` function at lines 671–705
- `bulkSyncToNotion` in the return object at line 729

- [ ] **Step 1: Delete the syncToNotion helper function**

In `src/hooks/useScripts.ts`, delete lines 39–67:

```typescript
// DELETE this entire block — lines 39–67:
// Fire-and-forget Notion sync helper
const syncToNotion = async (params: { ... }) => { ... };
```

- [ ] **Step 2: Remove the four syncToNotion call sites**

Find and delete each of these call blocks:

**In `directSave` (~line 269):** Delete this block:
```typescript
syncToNotion({
  script_id: script.id,
  client_id: params.clientId,
  title: params.ideaGanadora,
  google_drive_link: params.googleDriveLink || null,
  action: "create",
});
```

**In `categorizeAndSave` (~line 356):** Delete this block:
```typescript
syncToNotion({
  script_id: script.id,
  client_id: clientId,
  title: result.idea_ganadora || title,
  google_drive_link: googleDriveLink || null,
  action: "create",
});
```

**In `updateScript` (~line 496–497):** Delete this line:
```typescript
if (currentScript) {
  syncToNotion({ script_id: scriptId, client_id: currentScript.client_id, title, google_drive_link: googleDriveLink || null, action: "update" });
}
```

**In `updateGoogleDriveLink` (~line 523–525):** Delete this line:
```typescript
if (currentScript) {
  syncToNotion({ script_id: scriptId, client_id: currentScript.client_id, title: currentScript.idea_ganadora || currentScript.title, google_drive_link: link || null, action: "update" });
}
```

- [ ] **Step 3: Remove bulkSyncToNotion function and export**

Delete the entire `bulkSyncToNotion` function (lines ~671–705):
```typescript
// DELETE this entire function:
const bulkSyncToNotion = async (clientId?: string) => {
  ...
};
```

In the return object, remove `bulkSyncToNotion,` from the list (line ~729).

- [ ] **Step 4: Verify the file builds with no TypeScript errors**

Run: `npm run build 2>&1 | head -30`

Expected: no errors referencing `syncToNotion` or `bulkSyncToNotion`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): remove syncToNotion and bulkSyncToNotion calls"
```

---

### Task 3: Remove "Sync to Notion" button from Scripts.tsx

**Files:**
- Modify: `src/pages/Scripts.tsx`

- [ ] **Step 1: Remove bulkSyncToNotion from the destructure**

In `src/pages/Scripts.tsx` at ~line 297, remove `bulkSyncToNotion,` from the `useScripts()` destructure:

```typescript
// BEFORE:
const {
  scripts, trashedScripts, loading: scriptsLoading, ...
  bulkSyncToNotion,   // ← delete this line
  updateReviewStatus,
} = useScripts();

// AFTER:
const {
  scripts, trashedScripts, loading: scriptsLoading, ...
  updateReviewStatus,
} = useScripts();
```

- [ ] **Step 2: Remove the Sync Notion button from the JSX**

At ~line 1389–1397, delete the entire button block:

```typescript
// DELETE this block:
{isAdmin && (
  <button
    onClick={() => bulkSyncToNotion(selectedClient?.id)}
    title="Sync Notion"
    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
  >
    <RotateCcw className="w-4 h-4" />
  </button>
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): remove Sync to Notion button"
```

---

### Manual test for Sub-project 1

- [ ] Open the app, go to Scripts page — confirm no "Sync Notion" button in the toolbar
- [ ] Create a new script via the AI wizard — confirm a `video_edits` row is created in Supabase Dashboard (no Notion errors in browser console)
- [ ] Update a script's Google Drive link — confirm `video_edits.footage` is updated, no Notion errors in console

---

## Chunk 2: Sub-project 2 — Editing Queue (Local Only)

### Files

- Modify: `src/pages/EditingQueue.tsx` — remove orphan blocks
- Modify: `src/pages/MasterEditingQueue.tsx` — remove Notion fetch + rewrite handlers
- Modify: `src/pages/PublicEditingQueue.tsx` — remove Notion else-branches + schedule-post
- Modify: `supabase/functions/update-editing-status/index.ts` — full rewrite to DB-only

---

### Task 4: Clean up EditingQueue.tsx

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

`EditingQueue.tsx` already queries `video_edits` directly and calls `supabase.from("video_edits").update(...)` for all edits. The only changes needed are removing the orphan-insert block, the `mappedScripts` fallback, and adding "Needs Revision" to the status options.

- [ ] **Step 1: Remove the orphan-insert block (lines ~158–181)**

In the `fetchQueue` function, find and delete this block — the parallel `scriptRes` fetch and everything through the `videoRes.data = refreshed` reassignment:

```typescript
// DELETE: from the Promise.all second element through the re-fetch block
// The scriptRes query:
supabase
  .from("scripts")
  .select("id, title, idea_ganadora, caption, review_status, google_drive_link, created_at")
  .eq("client_id", clientId)
  .is("deleted_at", null)
  .order("created_at", { ascending: false }),

// The orphan insert:
const linkedScriptIds = new Set((videoRes.data || []).map((v: any) => v.script_id).filter(Boolean));
const orphaned = (scriptRes.data || []).filter((s: any) => !linkedScriptIds.has(s.id));
if (orphaned.length > 0) {
  await Promise.all(
    orphaned.map((s: any) =>
      supabase.from("video_edits").insert({ ... })
    )
  );
  const { data: refreshed } = await supabase.from("video_edits").select(...);
  videoRes.data = refreshed;
}
```

After removing, the `fetchQueue` function should use a simple single query:

```typescript
const fetchQueue = async () => {
  if (!clientId || !user) return;
  setFetching(true);
  setError(null);
  try {
    const { data, error: videoErr } = await supabase
      .from("video_edits")
      .select("id, reel_title, status, file_submission, script_url, assignee, revisions, post_status, schedule_date, created_at, footage, caption, script_id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (videoErr) throw videoErr;

    const mappedVideos: EditingQueueItem[] = (data || []).map((v: any) => ({
      id: v.id,
      title: v.reel_title || "Untitled",
      status: v.status || "Not started",
      statusColor: "",
      fileSubmissionUrl: v.file_submission,
      footageUrl: v.footage || null,
      scriptUrl: v.script_url || null,
      assignee: v.assignee || null,
      assigneeId: null,
      assigneePropName: null,
      revisions: v.revisions || null,
      revisionPropName: null,
      postStatus: v.post_status || null,
      scheduledDate: v.schedule_date || null,
      lastEdited: v.created_at,
      caption: v.caption ?? null,
      source: 'db' as const,
      script_id: v.script_id || null,
    }));

    setItems(mappedVideos);
  } catch (e: any) {
    console.error("Error fetching editing queue:", e);
    setError(e.message || "Failed to fetch editing queue");
  } finally {
    setFetching(false);
  }
};
```

- [ ] **Step 2: Remove the mappedScripts block (lines ~204–227)**

Delete everything from `const mappedScripts: EditingQueueItem[]` through `setItems([...mappedVideos, ...mappedScripts])`. Replace with just `setItems(mappedVideos)` (already included in the rewrite above).

- [ ] **Step 3: Replace STATUS_OPTIONS with the correct casing**

`EditingQueue.tsx` line 46 currently has `"Needs revision"` (lowercase "r"). Replace the entire constant to use capital R and put "Needs Revision" before "Done":

```typescript
// BEFORE (line 46):
const STATUS_OPTIONS = ["Not started", "In progress", "Done", "Needs revision"];

// AFTER:
const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
```

This removes the lowercase duplicate and adds the capital-R version that matches `POST_STATUS_OPTIONS` and the DB values.

- [ ] **Step 4: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat(editing-queue): read video_edits directly, remove orphan sync"
```

---

### Task 5: Rewrite update-editing-status edge function

**Files:**
- Modify: `supabase/functions/update-editing-status/index.ts`

Do this before fixing `MasterEditingQueue.tsx` so callers can be updated together.

- [ ] **Step 1: Replace the entire file contents**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");

  // Allow both authenticated and anonymous (public queue) access
  if (authHeader?.startsWith("Bearer ")) {
    const userSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const body = await req.json();
    const { id, status, assignee, revisions, post_status } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === undefined && assignee === undefined && revisions === undefined && post_status === undefined) {
      return new Response(JSON.stringify({ error: "At least one field (status, assignee, revisions, post_status) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const update: Record<string, unknown> = {};
    if (status !== undefined) update.status = status;
    if (assignee !== undefined) update.assignee = assignee;
    if (revisions !== undefined) update.revisions = revisions;
    if (post_status !== undefined) update.post_status = post_status;

    const { error } = await serviceSupabase
      .from("video_edits")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-editing-status error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy the edge function**

Run: `npx supabase functions deploy update-editing-status`

Expected: `Deployed update-editing-status`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/update-editing-status/index.ts
git commit -m "feat(update-editing-status): rewrite to DB-only, remove Notion PATCH"
```

---

### Task 6: Rewrite MasterEditingQueue.tsx

**Files:**
- Modify: `src/pages/MasterEditingQueue.tsx`

- [ ] **Step 1: Replace fetchQueue to read video_edits directly**

The current `fetchQueue` function queries `client_notion_mapping`, then `fetch-editing-queue`, then merges with `video_edits` and `scripts`. Replace the entire function body (after the role-based `clientIds` determination, which is correct and stays) with a single `video_edits` query:

```typescript
const fetchQueue = async () => {
  if (!user) return;
  setFetching(true);
  setError(null);
  try {
    let clientIds: string[] = [];

    // Role-based client ID resolution (keep existing logic):
    const { data: mappings } = await supabase
      .from("client_notion_mapping")
      .select("client_id");

    if (mappings && mappings.length > 0) {
      clientIds = mappings.map((m) => m.client_id);
    } else {
      const { data: assignments } = await supabase
        .from("videographer_clients")
        .select("client_id")
        .eq("videographer_user_id", user.id);

      if (assignments && assignments.length > 0) {
        clientIds = assignments.map((a) => a.client_id);
      } else {
        const { data: ownedClients } = await supabase
          .from("clients")
          .select("id")
          .eq("owner_user_id", user.id);
        if (ownedClients && ownedClients.length > 0) {
          clientIds = ownedClients.map((c) => c.id);
        }
      }
    }

    if (clientIds.length === 0) {
      setItems([]);
      setFetching(false);
      return;
    }

    const { data: dbVideos, error: dbErr } = await supabase
      .from("video_edits")
      .select("id, reel_title, status, post_status, file_submission, script_url, assignee, revisions, created_at, footage, schedule_date, client_id, caption, clients(name)")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false });

    if (dbErr) throw dbErr;

    const allItems: EditingQueueItem[] = (dbVideos || []).map((v: any) => ({
      id: v.id,
      title: v.reel_title || "Untitled",
      status: v.status || "Not started",
      statusColor: "",
      fileSubmissionUrl: v.file_submission,
      footageUrl: v.footage || null,
      scriptUrl: v.script_url || null,
      assignee: v.assignee || null,
      assigneeId: null,
      assigneePropName: null,
      revisions: v.revisions || null,
      revisionPropName: null,
      lastEdited: v.created_at,
      scheduledDate: v.schedule_date || null,
      clientId: v.client_id,
      clientName: v.clients?.name || v.client_id,
      caption: v.caption ?? null,
      postStatus: v.post_status ?? null,
      source: 'db' as const,
    }));

    setItems(allItems);

    const clientMap = new Map<string, string>();
    allItems.forEach((item) => {
      if (!clientMap.has(item.clientId)) {
        clientMap.set(item.clientId, item.clientName);
      }
    });
    setClientOptions(
      Array.from(clientMap.entries()).map(([id, name]) => ({ id, name }))
    );
  } catch (e: any) {
    console.error("Error fetching master editing queue:", e);
    setError(e.message || "Failed to fetch editing queue");
  } finally {
    setFetching(false);
  }
};
```

- [ ] **Step 2: Remove notionUsers state and related state variables**

Delete these state declarations (lines ~94–96):
```typescript
const [notionUsers, setNotionUsers] = useState<NotionUser[]>([]);  // DELETE
const [assigneeProperty, setAssigneeProperty] = useState("Assignee");  // DELETE
const [revisionProperty, setRevisionProperty] = useState("Revisions");  // DELETE
```

Also delete the `NotionUser` interface if it is defined at the top of the file.

- [ ] **Step 3: Rewrite handleStatusChange to use update-editing-status**

```typescript
const handleStatusChange = async (pageId: string, newStatus: string) => {
  setUpdatingStatus(pageId);
  try {
    const res = await supabase.functions.invoke("update-editing-status", {
      body: { id: pageId, status: newStatus },
    });
    if (res.error) throw res.error;
    setItems((prev) =>
      prev.map((item) => (item.id === pageId ? { ...item, status: newStatus } : item))
    );
    setSelectedItem((prev) =>
      prev && prev.id === pageId ? { ...prev, status: newStatus } : prev
    );
    toast.success(language === "en" ? "Status updated" : "Estado actualizado");
  } catch (e: any) {
    console.error("Error updating status:", e);
    toast.error(language === "en" ? "Failed to update status" : "Error al actualizar estado");
  } finally {
    setUpdatingStatus(null);
  }
};
```

- [ ] **Step 4: Rewrite handleAssigneeChange signature and body**

Change from Notion-specific `(pageId, userId, userName, propName)` to free-text `(pageId, userName)`:

```typescript
const handleAssigneeChange = async (pageId: string, userName: string | null) => {
  setUpdatingAssignee(pageId);
  try {
    const res = await supabase.functions.invoke("update-editing-status", {
      body: { id: pageId, assignee: userName ?? "" },
    });
    if (res.error) throw res.error;
    setItems((prev) =>
      prev.map((item) => (item.id === pageId ? { ...item, assignee: userName } : item))
    );
    setSelectedItem((prev) =>
      prev && prev.id === pageId ? { ...prev, assignee: userName } : prev
    );
    toast.success(language === "en" ? "Assignee updated" : "Asignado actualizado");
  } catch (e: any) {
    console.error("Error updating assignee:", e);
    toast.error(language === "en" ? "Failed to update assignee" : "Error al actualizar asignado");
  } finally {
    setUpdatingAssignee(null);
  }
};
```

- [ ] **Step 5: Rewrite handleSaveRevision**

```typescript
const handleSaveRevision = async () => {
  if (!revisionDialogItem) return;
  setSavingRevision(true);
  try {
    const res = await supabase.functions.invoke("update-editing-status", {
      body: { id: revisionDialogItem.id, revisions: revisionText },
    });
    if (res.error) throw res.error;
    setItems((prev) =>
      prev.map((item) => (item.id === revisionDialogItem.id ? { ...item, revisions: revisionText } : item))
    );
    setSelectedItem((prev) =>
      prev && prev.id === revisionDialogItem.id ? { ...prev, revisions: revisionText } : prev
    );
    toast.success(language === "en" ? "Revisions saved" : "Revisiones guardadas");
    setRevisionDialogItem(null);
  } catch (e: any) {
    console.error("Error saving revisions:", e);
    toast.error(language === "en" ? "Failed to save revisions" : "Error al guardar revisiones");
  } finally {
    setSavingRevision(false);
  }
};
```

- [ ] **Step 6: Rewrite handleDeleteItem to use direct Supabase delete**

```typescript
const handleDeleteItem = async () => {
  if (!deleteConfirmItem) return;
  setDeleting(true);
  try {
    const { error } = await supabase
      .from("video_edits")
      .delete()
      .eq("id", deleteConfirmItem.id);
    if (error) throw error;
    setItems((prev) => prev.filter((item) => item.id !== deleteConfirmItem.id));
    toast.success(language === "en" ? "Item deleted" : "Elemento eliminado");
    setDeleteConfirmItem(null);
  } catch (e: any) {
    console.error("Error deleting item:", e);
    toast.error(language === "en" ? "Failed to delete" : "Error al eliminar");
  } finally {
    setDeleting(false);
  }
};
```

- [ ] **Step 7: Rewrite handleSchedulePost to use direct video_edits update**

```typescript
const handleSchedulePost = async () => {
  if (!scheduleItem || !scheduleDate) return;
  setScheduling(true);
  try {
    const { error } = await supabase
      .from("video_edits")
      .update({ schedule_date: scheduleDate })
      .eq("id", scheduleItem.id);
    if (error) throw error;
    toast.success(
      language === "en"
        ? `"${scheduleItem.title}" scheduled for ${scheduleDate}`
        : `"${scheduleItem.title}" programado para ${scheduleDate}`
    );
    setItems((prev) =>
      prev.map((item) => item.id === scheduleItem.id ? { ...item, scheduledDate: scheduleDate } : item)
    );
    setScheduleItem(null);
    setScheduleDate("");
  } catch (e: any) {
    console.error("Error scheduling post:", e);
    toast.error(language === "en" ? "Failed to schedule post" : "Error al programar post");
  } finally {
    setScheduling(false);
  }
};
```

- [ ] **Step 8: Rewrite handleBulkDelete — remove all source-based branches**

The current `handleBulkDelete` (lines ~431–452) has three source branches: `db` (deletes from `video_edits`), `script` (soft-deletes from `scripts`), and `notion` (calls `delete-editing-item`). After this migration, all items are `source: 'db'` so all three branches collapse into a single `video_edits` delete. Replace the entire function:

```typescript
const handleBulkDelete = async () => {
  if (selectedIds.size === 0) return;
  setBulkDeleting(true);
  try {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("video_edits").delete().in("id", ids);
    if (error) throw error;
    const count = ids.length;
    setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    toast.success(language === "en" ? `${count} items deleted` : `${count} elementos eliminados`);
  } catch (e: any) {
    toast.error(language === "en" ? "Failed to delete items" : "Error al eliminar elementos");
  } finally {
    setBulkDeleting(false);
  }
};
```

- [ ] **Step 9: Replace the assignee dropdown UI with a plain text input**

Find the assignee dropdown in the JSX (~lines 485–514) that renders `notionUsers.map(...)` options. Replace the entire `<DropdownMenu>` with a simple inline text input:

```tsx
<input
  type="text"
  defaultValue={item.assignee || ""}
  placeholder={language === "en" ? "Unassigned" : "Sin asignar"}
  className="text-xs bg-transparent border-none outline-none text-foreground w-full"
  onBlur={(e) => {
    const val = e.target.value.trim();
    if (val !== (item.assignee || "")) {
      handleAssigneeChange(item.id, val || null);
    }
  }}
/>
```

- [ ] **Step 10: Replace STATUS_OPTIONS with the correct casing**

`MasterEditingQueue.tsx` line 54 currently has `"Needs revision"` (lowercase "r"). Replace the entire constant:

```typescript
// BEFORE (line 54):
const STATUS_OPTIONS = ["Not started", "In progress", "Done", "Needs revision"];

// AFTER:
const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
```

- [ ] **Step 11: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors. Any remaining references to `notionUsers`, `assigneeProperty`, `revisionProperty`, `NotionUser` type, or `source === 'notion'` should be cleaned up.

- [ ] **Step 12: Commit**

```bash
git add src/pages/MasterEditingQueue.tsx
git commit -m "feat(master-editing-queue): read video_edits directly, remove Notion fetch and handlers"
```

---

### Task 7: Clean up PublicEditingQueue.tsx

**Files:**
- Modify: `src/pages/PublicEditingQueue.tsx`

`PublicEditingQueue.tsx` already has `source === "db"` branches that call Supabase directly. Remove the Notion `else` branches, replace `fetch-editing-queue` with a direct query, and replace `schedule-post` with a direct update.

- [ ] **Step 1: Replace fetchQueue to read video_edits directly**

The function currently fetches `fetch-editing-queue` and merges with `dbVideos`. Replace with just the `dbVideos` path:

```typescript
const fetchQueue = async () => {
  setLoading(true);
  setError(null);
  try {
    let clientIds: string[] = [];
    let clientNameMap = new Map<string, string>();

    if (isMaster) {
      const { data: clients } = await supabase.from("clients").select("id, name");
      clientIds = (clients ?? []).map((c: any) => c.id);
      (clients ?? []).forEach((c: any) => clientNameMap.set(c.id, c.name));
    } else {
      clientIds = [clientId!];
      const { data: c } = await supabase
        .from("clients").select("name").eq("id", clientId).maybeSingle();
      if (c?.name) setClientName(c.name);
    }

    if (clientIds.length === 0) { setItems([]); setLoading(false); return; }

    const { data: dbVideos, error: dbErr } = await supabase
      .from("video_edits")
      .select("id, reel_title, status, post_status, file_submission, script_url, assignee, revisions, footage, schedule_date, caption, client_id, clients(name)")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false });

    if (dbErr) throw dbErr;

    const allItems: QueueItem[] = (dbVideos || []).map((v: any) => ({
      id: v.id,
      title: v.reel_title || "Untitled",
      status: v.status || "Not started",
      postStatus: v.post_status ?? null,
      fileSubmissionUrl: v.file_submission || null,
      footageUrl: v.footage || null,
      scriptUrl: v.script_url || null,
      assignee: v.assignee || null,
      revisions: v.revisions || null,
      scheduledDate: v.schedule_date || null,
      caption: v.caption ?? null,
      clientId: v.client_id,
      clientName: v.clients?.name || clientNameMap.get(v.client_id) || clientName,
      source: "db" as const,
    }));

    setItems(allItems);
  } catch (e: any) {
    setError(e.message || "Failed to load editing queue");
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 2: Remove the source check from handleStatusChange**

```typescript
const handleStatusChange = async (item: QueueItem, newStatus: string) => {
  setUpdatingStatus(item.id);
  try {
    const { error } = await supabase.from("video_edits").update({ status: newStatus }).eq("id", item.id);
    if (error) throw error;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
    toast.success("Status updated");
  } catch {
    toast.error("Failed to update status");
  } finally {
    setUpdatingStatus(null);
  }
};
```

- [ ] **Step 3: Remove the source check from handlePostStatusChange**

```typescript
const handlePostStatusChange = async (item: QueueItem, newStatus: string) => {
  setUpdatingPostStatus(item.id);
  try {
    const { error } = await supabase.from("video_edits").update({ post_status: newStatus }).eq("id", item.id);
    if (error) throw error;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, postStatus: newStatus } : i)));
    toast.success("Post status updated");
  } catch {
    toast.error("Failed to update post status");
  } finally {
    setUpdatingPostStatus(null);
  }
};
```

- [ ] **Step 4: Remove the source check from handleSaveRevision**

```typescript
const handleSaveRevision = async () => {
  if (!revisionDialogItem) return;
  setSavingRevision(true);
  try {
    const { error } = await supabase
      .from("video_edits").update({ revisions: revisionText }).eq("id", revisionDialogItem.id);
    if (error) throw error;
    setItems((prev) =>
      prev.map((i) => (i.id === revisionDialogItem.id ? { ...i, revisions: revisionText } : i))
    );
    toast.success("Revisions saved");
    setRevisionDialogItem(null);
  } catch {
    toast.error("Failed to save revisions");
  } finally {
    setSavingRevision(false);
  }
};
```

- [ ] **Step 5: Replace handleSchedulePost with direct video_edits update**

```typescript
const handleSchedulePost = async () => {
  if (!scheduleItem || !scheduleDate) return;
  setScheduling(true);
  try {
    const { error } = await supabase
      .from("video_edits")
      .update({ schedule_date: scheduleDate })
      .eq("id", scheduleItem.id);
    if (error) throw error;
    setItems((prev) =>
      prev.map((i) => (i.id === scheduleItem.id ? { ...i, scheduledDate: scheduleDate } : i))
    );
    toast.success(`Scheduled for ${scheduleDate}`);
    setScheduleItem(null);
    setScheduleDate("");
  } catch {
    toast.error("Failed to schedule post");
  } finally {
    setScheduling(false);
  }
};
```

- [ ] **Step 6: Replace STATUS_OPTIONS with correct casing**

`PublicEditingQueue.tsx` line 38 currently has `"Needs revision"` (lowercase "r"). Replace the entire constant:

```typescript
// BEFORE (line 38):
const STATUS_OPTIONS = ["Not started", "In progress", "Done", "Needs revision"];

// AFTER:
const STATUS_OPTIONS = ["Not started", "In progress", "Needs Revision", "Done"];
```

- [ ] **Step 7: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/PublicEditingQueue.tsx
git commit -m "feat(public-editing-queue): read video_edits directly, remove Notion branches"
```

---

### Manual test for Sub-project 2

- [ ] Open Editing Queue for a client — confirm all scripts appear, no duplicates, no console errors
- [ ] Change a status — confirm it saves (check Supabase Dashboard `video_edits` table)
- [ ] Open Master Editing Queue — confirm it loads all clients' items, no Notion user dropdown
- [ ] Type in assignee field and blur — confirm it saves to `video_edits.assignee`
- [ ] Set a schedule date on a video — confirm `video_edits.schedule_date` is updated
- [ ] Delete an item — confirm it is removed from `video_edits`
- [ ] Open Public Editing Queue at `/public/editing-queue/<clientId>` — confirm it loads

---

## Chunk 3: Sub-project 3 — Content Calendar (Local Only)

### Files

- Modify: `src/pages/ContentCalendar.tsx` — replace content_calendar query with video_edits
- Modify: `src/pages/PublicContentCalendar.tsx` — same
- Modify: `supabase/functions/update-post-status/index.ts` — full rewrite to DB-only

---

### Task 8: Rewrite update-post-status edge function

**Files:**
- Modify: `supabase/functions/update-post-status/index.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing auth header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await userSupabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: `Unauthorized - ${userError?.message || "no user"}` }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    // Accept both old field names and new for backward compatibility during migration
    const id = body.id ?? body.calendar_entry_id;
    const status = body.status ?? body.new_status;
    const revision_notes = body.revision_notes;

    if (!id || !status) {
      return new Response(JSON.stringify({ error: "id and status are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const update: Record<string, unknown> = { post_status: status };
    if (revision_notes !== undefined) update.revisions = revision_notes;

    const { error } = await serviceSupabase
      .from("video_edits")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, newStatus: status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("update-post-status error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

Note: the function accepts both `id`/`status` (new field names) and `calendar_entry_id`/`new_status` (old field names) via `?? fallback`. This is a harmless defensive alias — both callers (`ContentCalendar.tsx` and `PublicContentCalendar.tsx`) are updated in Tasks 9–10 to send the new field names.

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy update-post-status`

Expected: `Deployed update-post-status`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/update-post-status/index.ts
git commit -m "feat(update-post-status): rewrite to DB-only, remove Notion PATCH"
```

---

### Task 9: Rewrite ContentCalendar.tsx

**Files:**
- Modify: `src/pages/ContentCalendar.tsx`

- [ ] **Step 1: Update the CalendarPost interface**

Find the `CalendarPost` interface (around line 22) and update it. Keep `client_id` as a required `string` — it is a non-null FK in `video_edits` and is accessed with `p.client_id!` in the component. Only `notion_page_id` becomes optional:

```typescript
interface CalendarPost {
  id: string;
  notion_page_id?: string | null;   // optional — always null after migration
  client_id: string;                // required — non-null FK
  title: string;
  scheduled_date: string;           // YYYY-MM-DD (truncated at mapping boundary)
  post_status: string;
  file_submission_url?: string | null;
  script_url?: string | null;
  revision_notes?: string | null;
  caption?: string | null;
  client_name?: string;
}
```

- [ ] **Step 2: Remove sync-calendar-status call**

In `fetchPosts` (~line 234–239), delete:

```typescript
// DELETE this block:
if (clientId) {
  await supabase.functions.invoke("sync-calendar-status", {
    body: { client_id: clientId },
  }).catch((e) => console.warn("Status sync failed:", e));
}
```

- [ ] **Step 3: Replace the content_calendar query with video_edits query**

Replace the query block (~lines 241–259) with:

```typescript
let query = supabase
  .from("video_edits")
  .select("id, reel_title, schedule_date, post_status, assignee, script_id, file_submission, caption, script_url, revisions, client_id")
  .not("schedule_date", "is", null)
  .order("schedule_date", { ascending: true });
if (clientId) query = query.eq("client_id", clientId);

const { data, error: fetchErr } = await query;
if (fetchErr) throw fetchErr;

// Map video_edits fields to CalendarPost, truncating TIMESTAMPTZ to YYYY-MM-DD
const mappedData: CalendarPost[] = (data || []).map((v: any) => ({
  id: v.id,
  notion_page_id: null,
  client_id: v.client_id,
  title: v.reel_title || "Untitled",
  scheduled_date: (v.schedule_date as string).slice(0, 10),
  post_status: v.post_status || "Unpublished",
  file_submission_url: v.file_submission,
  script_url: v.script_url,
  revision_notes: v.revisions ?? null,
  caption: v.caption,
}));

if (isAdmin && !clientId && mappedData.length > 0) {
  const uniqueIds = [...new Set(mappedData.map((p) => p.client_id))];
  const { data: clientsData } = await supabase
    .from("clients").select("id, name").in("id", uniqueIds);
  const clientMap = new Map<string, string>();
  (clientsData || []).forEach((c: any) => clientMap.set(c.id, c.name));
  setPosts(mappedData.map((p) => ({ ...p, client_name: clientMap.get(p.client_id!) || "" })));
} else {
  setPosts(mappedData);
}
```

- [ ] **Step 4: Update the handleApprove call to update-post-status**

Find `handleApprove` (~line 280). Replace the `update-post-status` invocation body AND the success toast:

```typescript
// BEFORE body:
body: { calendar_entry_id: selectedPost.id, notion_page_id: selectedPost.notion_page_id, new_status: "Approved" },

// AFTER body:
body: { id: selectedPost.id, status: "Approved" },
```

```typescript
// BEFORE toast (line 293):
toast.success(language === "en" ? "Post approved! Notion updated to Done." : "¡Post aprobado! Notion actualizado a Listo.");

// AFTER toast:
toast.success(language === "en" ? "Post approved!" : "¡Post aprobado!");
```

- [ ] **Step 5: Update the handleSubmitRevision call**

Find `handleSubmitRevision` (~line 312) and update the invocation:

```typescript
const res = await supabase.functions.invoke("update-post-status", {
  headers: authHeader ? { Authorization: authHeader } : {},
  body: {
    id: selectedPost.id,
    status: "Needs Revision",
    revision_notes: revisionNotes,
  },
});
```

- [ ] **Step 6: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/ContentCalendar.tsx
git commit -m "feat(content-calendar): read video_edits directly, remove Notion sync"
```

---

### Task 10: Rewrite PublicContentCalendar.tsx

**Files:**
- Modify: `src/pages/PublicContentCalendar.tsx`

- [ ] **Step 1: Update the CalendarPost interface**

```typescript
interface CalendarPost {
  id: string;
  notion_page_id?: string | null;
  client_id: string;
  title: string;
  scheduled_date: string;           // YYYY-MM-DD
  post_status: string;
  file_submission_url: string | null;
  script_url: string | null;
  revision_notes?: string | null;   // ADD
  caption?: string | null;          // ADD
}
```

- [ ] **Step 2: Replace the data fetch with a video_edits query**

Find the `useEffect` or `fetchPosts` function that queries `content_calendar`. Replace it with:

```typescript
const { data, error: fetchErr } = await supabase
  .from("video_edits")
  .select("id, reel_title, schedule_date, post_status, file_submission, script_url, revisions, caption, client_id")
  .eq("client_id", clientId)
  .not("schedule_date", "is", null)
  .order("schedule_date", { ascending: true });

if (fetchErr) throw fetchErr;

const mappedData: CalendarPost[] = (data || []).map((v: any) => ({
  id: v.id,
  notion_page_id: null,
  client_id: v.client_id,
  title: v.reel_title || "Untitled",
  scheduled_date: (v.schedule_date as string).slice(0, 10),
  post_status: v.post_status || "Unpublished",
  file_submission_url: v.file_submission,
  script_url: v.script_url,
  revision_notes: v.revisions ?? null,
  caption: v.caption ?? null,
}));

setPosts(mappedData);
```

- [ ] **Step 3: Remove sync-calendar-status call if present**

Check if `PublicContentCalendar.tsx` calls `sync-calendar-status`. If it does, delete that call.

- [ ] **Step 4: Update update-post-status call sites**

Find any `update-post-status` calls in this file. Update them to use the new field names:
- `calendar_entry_id` → `id`
- `new_status` → `status`
- Remove `notion_page_id`

- [ ] **Step 5: Add revision_notes display in the post detail modal**

`PublicContentCalendar.tsx` has no display for `revision_notes` in the modal (unlike `ContentCalendar.tsx` which shows it). After migration, the field will be populated from `video_edits.revisions`. Add a display block after the "Status message" section (~line 590). Insert before the closing `</div>` of `space-y-4`:

```tsx
{/* Revision notes — shown when set */}
{selectedPost.revision_notes && (
  <div className="pt-3 border-t border-border/40">
    <div className="text-xs text-muted-foreground mb-1 font-medium">Revision notes</div>
    <p className="text-sm text-foreground whitespace-pre-wrap">{selectedPost.revision_notes}</p>
  </div>
)}
```

- [ ] **Step 6: Build and verify**

Run: `npm run build 2>&1 | head -30`

Expected: no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/PublicContentCalendar.tsx
git commit -m "feat(public-content-calendar): read video_edits directly, remove Notion sync, show revision notes"
```

---

### Manual test for Sub-project 3

- [ ] Open Content Calendar for a client — confirm videos with `schedule_date` appear on the correct day
- [ ] Click a video, approve it — confirm `video_edits.post_status` changes to "Approved" (check Supabase Dashboard), no Notion error in console
- [ ] Click "Needs Revision", enter notes, submit — confirm `video_edits.post_status` = "Needs Revision" and `video_edits.revisions` = the notes text
- [ ] Set `schedule_date` on a video from the Editing Queue — confirm it immediately appears on the Content Calendar on the correct day
- [ ] Open Public Content Calendar at `/public/calendar/<clientId>` — confirm it loads scheduled videos

---

## Deploy all edge functions

After all tasks are complete, ensure both rewritten edge functions are deployed:

- [ ] `npx supabase functions deploy update-editing-status`
- [ ] `npx supabase functions deploy update-post-status`

---

## Final build check

- [ ] Run `npm run build`
- [ ] Confirm no TypeScript errors
- [ ] Confirm no remaining references to `syncToNotion`, `bulkSyncToNotion`, `fetch-editing-queue`, `sync-calendar-status` in the frontend source
