# Editor Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable a fully functional Editor user type that admins can assign to specific clients, scoping their access to only those clients' editing queues (read/write) and content calendars (read-only), with a structured assignee dropdown replacing the free-text field.

**Architecture:** Reuse the existing `videographer_clients` join table for editor-to-client assignments. Add `assignee_user_id` UUID column to `video_edits` for structured assignment. Scope all editor data access via assigned client IDs fetched from `videographer_clients` at query time — no RLS changes needed for editing queue (it's public by design); new RLS policies added for `profiles` and `clients` tables.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres + RLS + Edge Functions), Deno (edge functions), shadcn/ui components

**Spec:** `docs/superpowers/specs/2026-03-18-editor-role-design.md`

---

## File Map

| File | Change Type | Purpose |
|------|------------|---------|
| `supabase/migrations/20260318_editor_role.sql` | Create | DB migration: assignee_user_id column + 2 RLS policies |
| `supabase/functions/update-editing-status/index.ts` | Modify | Accept + persist `assignee_user_id` |
| `src/pages/Videographers.tsx` | Modify | Add client assignment UI per team member |
| `src/pages/MasterEditingQueue.tsx` | Modify | Assignee dropdown (replaces free-text), fetch `assignee_user_id` |
| `src/pages/EditingQueue.tsx` | Modify | Same assignee dropdown change as MasterEditingQueue |
| `src/components/DashboardSidebar.tsx` | Modify | Add Content Calendar to editor nav |
| `src/pages/ContentCalendar.tsx` | Modify | Editor client picker + read-only mode + scoped fetch |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260318_editor_role.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260318_editor_role.sql

-- 1. Add assignee_user_id to video_edits
ALTER TABLE public.video_edits
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. RLS: allow team members (admin/videographer/editor) to read other team member profiles
--    Uses has_role() SECURITY DEFINER helper — safely bypasses user_roles RLS
CREATE POLICY "Team members can read team profiles"
  ON public.profiles FOR SELECT
  USING (
    (
      public.has_role(profiles.user_id, 'admin')
      OR public.has_role(profiles.user_id, 'videographer')
      OR public.has_role(profiles.user_id, 'editor')
    )
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'videographer')
      OR public.has_role(auth.uid(), 'editor')
    )
  );

-- 3. RLS: editors can read clients for their assigned clients (needed for client picker)
--    Videographers already have "Videographer can view assigned clients" policy
CREATE POLICY "Editor can view assigned clients"
  ON public.clients FOR SELECT
  USING (
    public.has_role(auth.uid(), 'editor')
    AND public.is_assigned_client(id)
  );
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Go to Supabase Dashboard → SQL Editor → run the migration file contents.

Verify success: no errors, `video_edits` table has `assignee_user_id` column, two new policies appear in Authentication → Policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260318_editor_role.sql
git commit -m "feat: add assignee_user_id column and editor RLS policies"
```

---

## Task 2: Update Edge Function — `update-editing-status`

**Files:**
- Modify: `supabase/functions/update-editing-status/index.ts`

- [ ] **Step 1: Add `assignee_user_id` to destructuring and validation**

In `supabase/functions/update-editing-status/index.ts`, locate line 42:
```typescript
const { id, status, assignee, revisions, post_status } = body;
```
Replace with:
```typescript
const { id, status, assignee, assignee_user_id, revisions, post_status } = body;
```

- [ ] **Step 2: Add `assignee_user_id` to the "at least one field" validation**

Locate line 51:
```typescript
if (status === undefined && assignee === undefined && revisions === undefined && post_status === undefined) {
```
Replace with:
```typescript
if (status === undefined && assignee === undefined && assignee_user_id === undefined && revisions === undefined && post_status === undefined) {
```

- [ ] **Step 3: Add `assignee_user_id` to update object builder**

Locate after `if (post_status !== undefined) update.post_status = post_status;` (around line 67), add:
```typescript
if (assignee_user_id !== undefined) update.assignee_user_id = assignee_user_id ?? null;
```

- [ ] **Step 4: Deploy the edge function**

```bash
npx supabase functions deploy update-editing-status
```

Expected output: `Deployed Function update-editing-status`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/update-editing-status/index.ts
git commit -m "feat: update-editing-status accepts assignee_user_id"
```

---

## Task 3: Team Members Page — Client Assignment UI

**Files:**
- Modify: `src/pages/Videographers.tsx`

- [ ] **Step 1: Add new state and types**

At the top of the `Videographers` component (after existing `useState` declarations), add:
```typescript
const [assignmentsMap, setAssignmentsMap] = useState<Record<string, { id: string; name: string }[]>>({});
const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
const [assignDialogMemberId, setAssignDialogMemberId] = useState<string | null>(null);
const [pendingClientIds, setPendingClientIds] = useState<Set<string>>(new Set());
const [savingAssignments, setSavingAssignments] = useState(false);
```

- [ ] **Step 2: Fetch all clients on mount**

After the `fetchMembers` `useCallback`, add a `fetchAllClients` call in a `useEffect`:
```typescript
useEffect(() => {
  if (!user || !isAdmin) return;
  supabase
    .from("clients")
    .select("id, name")
    .order("name")
    .then(({ data }) => { if (data) setAllClients(data); });
}, [user, isAdmin]);
```

- [ ] **Step 3: Load assignments alongside members in `fetchMembers`**

Inside `fetchMembers`, after the `setMembers(...)` call at line ~87 (inside the `if (roles && roles.length > 0)` block), add:
```typescript
// Load client assignments for all members
if (userIds.length > 0) {
  const { data: assignments } = await supabase
    .from("videographer_clients")
    .select("videographer_user_id, client_id, clients(id, name)")
    .in("videographer_user_id", userIds);

  const map: Record<string, { id: string; name: string }[]> = {};
  (assignments || []).forEach((a: any) => {
    if (!map[a.videographer_user_id]) map[a.videographer_user_id] = [];
    if (a.clients) map[a.videographer_user_id].push({ id: a.clients.id, name: a.clients.name });
  });
  setAssignmentsMap(map);
}
```

- [ ] **Step 4: Add save assignments handler**

Add this function inside the component, after `fetchMembers`:
```typescript
const handleSaveAssignments = async () => {
  if (!assignDialogMemberId) return;
  setSavingAssignments(true);
  try {
    // Delete all existing assignments for this member
    await supabase
      .from("videographer_clients")
      .delete()
      .eq("videographer_user_id", assignDialogMemberId);

    // Insert the new set
    if (pendingClientIds.size > 0) {
      const inserts = Array.from(pendingClientIds).map((clientId) => ({
        videographer_user_id: assignDialogMemberId,
        client_id: clientId,
      }));
      const { error } = await supabase.from("videographer_clients").insert(inserts);
      if (error) throw error;
    }

    // Update local state
    const newAssigned = allClients.filter((c) => pendingClientIds.has(c.id));
    setAssignmentsMap((prev) => ({ ...prev, [assignDialogMemberId]: newAssigned }));
    setAssignDialogMemberId(null);
    toast.success("Client assignments saved");
  } catch (e: any) {
    toast.error("Failed to save assignments");
  } finally {
    setSavingAssignments(false);
  }
};
```

- [ ] **Step 5: Add `UserPlus` to imports**

Find the lucide-react import line and add `UserPlus`:
```typescript
import { Loader2, Search, Video, Plus, Trash2, Clapperboard, Star, UserPlus } from "lucide-react";
```

- [ ] **Step 6: Add chips and assign button to each member row**

In the JSX where member cards/rows are rendered, find the member name display. Below the name, add client chips:
```tsx
{/* Assigned client chips */}
<div className="flex flex-wrap gap-1 mt-1">
  {(assignmentsMap[member.user_id] || []).slice(0, 3).map((c) => (
    <span key={c.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
      {c.name}
    </span>
  ))}
  {(assignmentsMap[member.user_id] || []).length > 3 && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
      +{(assignmentsMap[member.user_id] || []).length - 3} more
    </span>
  )}
</div>
```

Add the assign button next to the existing delete button for each member:
```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-foreground"
  onClick={() => {
    setAssignDialogMemberId(member.user_id);
    setPendingClientIds(new Set((assignmentsMap[member.user_id] || []).map((c) => c.id)));
  }}
  title="Assign clients"
>
  <UserPlus className="w-4 h-4" />
</Button>
```

- [ ] **Step 7: Add the assign clients dialog**

Add this dialog at the bottom of the component JSX (before the closing fragment):
```tsx
<Dialog open={!!assignDialogMemberId} onOpenChange={(open) => { if (!open) setAssignDialogMemberId(null); }}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>Assign Clients</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto py-2">
      {allClients.map((client) => (
        <label key={client.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded hover:bg-muted">
          <input
            type="checkbox"
            checked={pendingClientIds.has(client.id)}
            onChange={(e) => {
              setPendingClientIds((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(client.id);
                else next.delete(client.id);
                return next;
              });
            }}
            className="rounded"
          />
          {client.name}
        </label>
      ))}
      {allClients.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No clients found</p>
      )}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setAssignDialogMemberId(null)}>Cancel</Button>
      <Button onClick={handleSaveAssignments} disabled={savingAssignments}>
        {savingAssignments ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Save
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/Videographers.tsx
git commit -m "feat: add client assignment UI to team members page"
```

---

## Task 4: MasterEditingQueue — Assignee Dropdown

**Files:**
- Modify: `src/pages/MasterEditingQueue.tsx`

- [ ] **Step 1: Add `teamMembers` state and `assignee_user_id` to `EditingQueueItem`**

Add to the `EditingQueueItem` interface (after `assignee: string | null`):
```typescript
assignee_user_id: string | null;
```

> Note: The interface already has a legacy `assigneeId: string | null` field (used for Notion integration, now always `null`). Do NOT remove it — just add the new `assignee_user_id` (snake_case) alongside it. They are different fields.

Add state at top of component (after existing useState declarations):
```typescript
const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string }[]>([]);
```

- [ ] **Step 2: Fetch team members on mount**

Add a `useEffect` after existing effects:
```typescript
useEffect(() => {
  if (!user) return;
  supabase
    .from("profiles")
    .select("user_id, display_name")
    .then(({ data }) => {
      setTeamMembers((data || []).filter((p) => p.display_name));
    });
}, [user]);
```

Note: The new RLS policy "Team members can read team profiles" scopes this query to only team-role profiles for non-admins. Admins see all profiles (existing admin policy) — filter to non-null display_name client-side.

- [ ] **Step 3: Map `assignee_user_id` in the DB fetch**

In `fetchQueue`, locate the `.select(...)` query around line 193. Add `assignee_user_id` to the select:
```typescript
.select("id, reel_title, status, post_status, file_submission, script_url, assignee, assignee_user_id, revisions, created_at, footage, schedule_date, client_id, caption, upload_source, storage_path, storage_url, clients(name)")
```

In the `.map()` that builds `allItems`, add the new field:
```typescript
assignee_user_id: v.assignee_user_id || null,
```

- [ ] **Step 4: Update `handleAssigneeChange` to also write `assignee_user_id`**

Replace the existing `handleAssigneeChange` function (around line 289):
```typescript
const handleAssigneeChange = async (pageId: string, userId: string | null) => {
  setUpdatingAssignee(pageId);
  try {
    const member = teamMembers.find((m) => m.user_id === userId);
    const displayName = userId ? (member?.display_name ?? "") : "";
    const res = await supabase.functions.invoke("update-editing-status", {
      body: {
        id: pageId,
        assignee: displayName || null,
        assignee_user_id: userId || null,
      },
    });
    if (res.error) throw res.error;
    setItems((prev) =>
      prev.map((item) =>
        item.id === pageId
          ? { ...item, assignee: displayName || null, assignee_user_id: userId }
          : item
      )
    );
    setSelectedItem((prev) =>
      prev && prev.id === pageId
        ? { ...prev, assignee: displayName || null, assignee_user_id: userId }
        : prev
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

- [ ] **Step 5: Replace `renderAssigneeInput` with a Select dropdown**

Replace the entire `renderAssigneeInput` function (around line 432):
```typescript
const renderAssigneeInput = (item: EditingQueueItem) => {
  if (updatingAssignee === item.id) {
    return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  }
  // Fallback: if item has a legacy text assignee but no UUID yet, show a disabled placeholder
  const hasLegacyAssignee = !item.assignee_user_id && item.assignee;
  return (
    <Select
      value={item.assignee_user_id || ""}
      onValueChange={(val) => handleAssigneeChange(item.id, val || null)}
    >
      <SelectTrigger className="h-7 text-xs min-w-[120px] bg-transparent border-none shadow-none px-1">
        <SelectValue placeholder={hasLegacyAssignee ? item.assignee! : (language === "en" ? "Unassigned" : "Sin asignar")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{language === "en" ? "Unassigned" : "Sin asignar"}</SelectItem>
        {teamMembers.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>
            {m.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
```

- [ ] **Step 6: Verify `Select` is already imported**

Check top of file for: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
It should already be there (used for client filter). If not, add it.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MasterEditingQueue.tsx
git commit -m "feat: replace free-text assignee with team member dropdown in master queue"
```

---

## Task 5: EditingQueue (per-client) — Same Assignee Dropdown

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

- [ ] **Step 1: Add `assignee_user_id` to `EditingQueueItem` interface**

Find the `EditingQueueItem` interface. Add after `assignee: string | null`:
```typescript
assignee_user_id: string | null;
```

- [ ] **Step 2: Add `teamMembers` state**

Add after existing state declarations:
```typescript
const [teamMembers, setTeamMembers] = useState<{ user_id: string; display_name: string }[]>([]);
```

- [ ] **Step 3: Fetch team members on mount**

Add after existing `useEffect` hooks:
```typescript
useEffect(() => {
  if (!user) return;
  supabase
    .from("profiles")
    .select("user_id, display_name")
    .then(({ data }) => {
      setTeamMembers((data || []).filter((p) => p.display_name));
    });
}, [user]);
```

- [ ] **Step 4: Add `assignee_user_id` to DB fetch select and item map**

Find the `.select(...)` in `fetchQueue` (around line 160). Add `assignee_user_id`:
```typescript
.select("id, reel_title, status, file_submission, script_url, assignee, assignee_user_id, revisions, post_status, schedule_date, created_at, footage, caption, script_id, upload_source, storage_path, storage_url")
```

In the `.map()`, add:
```typescript
assignee_user_id: v.assignee_user_id || null,
```

- [ ] **Step 5: Update `handleAssigneeUpdate` to write both fields**

Replace the existing `handleAssigneeUpdate` function (around line 235):
```typescript
const handleAssigneeUpdate = async (pageId: string, userId: string | null) => {
  try {
    const member = teamMembers.find((m) => m.user_id === userId);
    const displayName = userId ? (member?.display_name ?? "") : "";
    const { error } = await supabase.from("video_edits").update({
      assignee: displayName || null,
      assignee_user_id: userId || null,
    }).eq("id", pageId);
    if (error) throw error;
    setItems((prev) => prev.map((i) =>
      i.id === pageId ? { ...i, assignee: displayName || null, assignee_user_id: userId } : i
    ));
    setSelectedItem((prev) =>
      prev && prev.id === pageId ? { ...prev, assignee: displayName || null, assignee_user_id: userId } : prev
    );
  } catch (e: any) {
    console.error("Error updating assignee:", e);
    toast.error(language === "en" ? "Failed to update assignee" : "Error al actualizar asignado");
  }
};
```

- [ ] **Step 6: Replace `renderAssigneeCell` with Select dropdown**

Find `renderAssigneeCell` (around line 394). Replace its implementation:
```typescript
const renderAssigneeCell = (item: EditingQueueItem) => {
  // Fallback: show legacy text assignee as placeholder if no UUID yet
  const hasLegacyAssignee = !item.assignee_user_id && item.assignee;
  return (
    <Select
      value={item.assignee_user_id || ""}
      onValueChange={(val) => handleAssigneeUpdate(item.id, val || null)}
    >
      <SelectTrigger className="h-7 text-xs min-w-[120px] bg-transparent border-none shadow-none px-1">
        <SelectValue placeholder={hasLegacyAssignee ? item.assignee! : (language === "en" ? "Unassigned" : "Sin asignar")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{language === "en" ? "Unassigned" : "Sin asignar"}</SelectItem>
        {teamMembers.map((m) => (
          <SelectItem key={m.user_id} value={m.user_id}>
            {m.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
```

- [ ] **Step 7: Add `Select` import (it is NOT present in `EditingQueue.tsx`)**

`EditingQueue.tsx` does not currently import Select components. Add this import:
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat: replace free-text assignee with team member dropdown in per-client queue"
```

---

## Task 6: DashboardSidebar — Add Content Calendar to Editor Nav

**Files:**
- Modify: `src/components/DashboardSidebar.tsx`

- [ ] **Step 1: Add Content Calendar to editor nav items**

Find the `isEditor` block (around line 148):
```typescript
if (isEditor) {
  return [
    { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
    { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
    { label: "Viral Today", icon: Flame, path: "/viral-today" },
    { label: "Trainings", icon: BookOpen, path: "/trainings" },
    { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
  ];
}
```

Replace with:
```typescript
if (isEditor) {
  return [
    { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
    { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
    { label: "Content Calendar", icon: Calendar, path: "/content-calendar" },
    { label: "Viral Today", icon: Flame, path: "/viral-today" },
    { label: "Trainings", icon: BookOpen, path: "/trainings" },
    { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
  ];
}
```

- [ ] **Step 2: Verify `Calendar` icon is imported**

Check the lucide-react import for `Calendar`. If missing, add it.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat: add content calendar to editor sidebar nav"
```

---

## Task 7: ContentCalendar — Editor Client Picker + Scoped Fetch + Read-Only Mode

**Files:**
- Modify: `src/pages/ContentCalendar.tsx`

- [ ] **Step 1: Destructure `isEditor` from `useAuth`**

Find line 133:
```typescript
const { user, loading, isAdmin } = useAuth();
```
Replace with:
```typescript
const { user, loading, isAdmin, isEditor } = useAuth();
```

- [ ] **Step 2: Add editor state**

After the existing `const [allClients, ...]` state declarations (around line 156), add:
```typescript
// Editor state
const [editorClients, setEditorClients] = useState<{ id: string; name: string }[]>([]);
const [editorSelectedClientId, setEditorSelectedClientId] = useState<string | null>(null);
```

- [ ] **Step 3: Fetch editor's assigned clients**

After the existing `useEffect` that fetches clients for admin filter (around line 219), add:
```typescript
// Fetch assigned clients for editor
useEffect(() => {
  if (!isEditor || !user) return;
  supabase
    .from("videographer_clients")
    .select("client_id, clients(id, name)")
    .eq("videographer_user_id", user.id)
    .then(({ data }) => {
      const clients = (data || [])
        .filter((a: any) => a.clients)
        .map((a: any) => ({ id: a.clients.id, name: a.clients.name }));
      setEditorClients(clients);
      if (clients.length > 0 && !editorSelectedClientId) {
        setEditorSelectedClientId(clients[0].id);
      }
    });
}, [isEditor, user]);
```

- [ ] **Step 4: Scope `fetchPosts` for editors**

In the `fetchPosts` callback (around line 229), find:
```typescript
if (clientId) query = query.eq("client_id", clientId);
```
Replace with:
```typescript
if (clientId) {
  query = query.eq("client_id", clientId);
} else if (isEditor) {
  const targetId = editorSelectedClientId;
  if (!targetId) {
    setPosts([]);
    setFetching(false);
    return;
  }
  query = query.eq("client_id", targetId);
}
```

- [ ] **Step 4b: Update `fetchPosts` `useCallback` dependency array (REQUIRED)**

Find the closing line of the `fetchPosts` `useCallback` at line 273:
```typescript
}, [clientId, user, isAdmin]);
```
Replace with:
```typescript
}, [clientId, user, isAdmin, isEditor, editorSelectedClientId]);
```

> This is required — without it, the stale closure will always see `editorSelectedClientId = null` and editors will never load posts when switching clients.

- [ ] **Step 5: Re-fetch when editor selects a different client**

The `useEffect` that calls `fetchPosts` is `useEffect(() => { fetchPosts(); }, [fetchPosts]);` — since `editorSelectedClientId` is now in the `fetchPosts` deps, this will automatically re-fetch when the selected client changes.

Also set client name when editor changes selection:
```typescript
useEffect(() => {
  if (!isEditor || !editorSelectedClientId) return;
  const client = editorClients.find((c) => c.id === editorSelectedClientId);
  if (client) setClientName(client.name);
}, [isEditor, editorSelectedClientId, editorClients]);
```

- [ ] **Step 6: Add editor client picker UI**

Find the page header section in the JSX (where `clientName` is shown or the back button is). Add the editor client picker before the calendar content:

```tsx
{/* Editor: client picker */}
{isEditor && !clientId && (
  <div className="mb-4 flex items-center gap-3">
    <Select
      value={editorSelectedClientId || ""}
      onValueChange={setEditorSelectedClientId}
    >
      <SelectTrigger className="w-[220px] h-9 text-sm">
        <SelectValue placeholder="Select client" />
      </SelectTrigger>
      <SelectContent>
        {editorClients.map((c) => (
          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}

{/* Editor: no assigned clients */}
{isEditor && editorClients.length === 0 && !fetching && (
  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
    <Calendar className="w-10 h-10 opacity-30" />
    <p className="text-sm">You have no assigned clients. Contact your admin.</p>
  </div>
)}
```

- [ ] **Step 7: Hide edit controls when `isEditor`**

Find each of the following and wrap in `{!isEditor && (...)}`:

1. The "Approve" button in the post detail modal/dialog
2. The "Needs Revision" button in the post detail modal/dialog
3. Any status change dropdown in the post detail

Search the JSX for `handleApprove` and `handleNeedsRevision` references — the buttons calling these should be hidden for editors. Example pattern:
```tsx
{!isEditor && (
  <Button onClick={handleApprove} ...>Approve</Button>
)}
{!isEditor && (
  <Button onClick={handleNeedsRevision} ...>Needs Revision</Button>
)}
```

- [ ] **Step 8: Verify `Select` and `Calendar` are imported**

Check imports. Add if missing:
- `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
- `Calendar` from lucide-react (should already be imported — it's used in the component)

- [ ] **Step 9: Commit**

```bash
git add src/pages/ContentCalendar.tsx
git commit -m "feat: add editor client picker and read-only mode to content calendar"
```

---

## Task 8: Build & Manual Verification

- [ ] **Step 1: Build the app**

```bash
npm run build
```
Expected: no TypeScript errors, clean build output.

- [ ] **Step 2: Fix any TypeScript errors**

Common issues to expect:
- `assignee_user_id` missing in type assertions — add to the relevant interface
- `isEditor` not exported from `useAuth` hook (check `src/hooks/useAuth.ts` — it should forward from AuthContext)

- [ ] **Step 3: Manual verification checklist**

Log in as admin and verify:
- [ ] Team Members page: "Assign Clients" button appears per member row
- [ ] Assign a client to an editor user — save — chips appear below member name
- [ ] Editing queue: Assignee column shows dropdown with team member names
- [ ] Selecting an assignee shows their name and persists on reload

Log in as editor and verify:
- [ ] Sidebar shows: Dashboard, Editing Queue, Content Calendar, Viral Today, Trainings, Settings
- [ ] Editing Queue shows only videos for assigned clients
- [ ] Assignee dropdown works (editor can reassign videos)
- [ ] Content Calendar loads with client picker pre-selected to first assigned client
- [ ] Approve/Needs Revision buttons are hidden on content calendar

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete editor role implementation"
```
