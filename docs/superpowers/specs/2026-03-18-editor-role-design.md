# Editor Role — Design Spec
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Introduce a fully functional `editor` user type that admins can create from the Team Members page. Editors are assigned to specific clients and can access only those clients' editing queues and content calendars (read-only). The assignee field in the editing queue is upgraded from free-text to a structured user reference.

---

## Goals

- Admin can create editor accounts from the Team Members page (already supported, no changes needed)
- Admin can assign editors (and videographers) to specific clients from the Team Members page
- Editors see a unified editing queue scoped to their assigned clients, with a per-client filter dropdown
- Editors see a read-only content calendar scoped to their assigned clients, with a client picker
- The `assignee` field in the editing queue becomes a dropdown of real team members, saving both display name and user UUID
- No other pages are accessible to editors

---

## Architecture

### Roles & Auth

- `editor` role already exists in `app_role` enum and `user_roles` table
- `isEditor` already computed in `AuthContext.tsx`
- No auth changes needed

### Client Assignment

- Reuse existing `videographer_clients` table for editor assignments (same structure: `videographer_user_id`, `client_id`)
- Existing `is_assigned_client()` RLS helper already works for editors (checks `videographer_clients` by `auth.uid()`)
- Existing RLS policy "Videographer can view own assignments" already covers editors via same table

### Data Flow — Editing Queue

- `MasterEditingQueue.tsx` `fetchQueue()` tries `client_notion_mapping` first
- `client_notion_mapping` has admin-only RLS (`USING (is_admin())`), so editors get zero rows and fall through to `videographer_clients` — this is safe and guaranteed by the DB policy
- Editors hit the videographer code path — no fetch logic changes needed
- `video_edits` gets new column `assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- When assigning, both `assignee` (display name string) and `assignee_user_id` (UUID) are written atomically
- The `update-editing-status` edge function must be updated to accept and pass through `assignee_user_id`

### Data Flow — Content Calendar

- `ContentCalendar.tsx` reads from `video_edits` (filtered by `schedule_date IS NOT NULL`), NOT the `content_calendar` table
- `video_edits` has an existing `USING (true)` public RLS policy — all authenticated users can read all rows
- **Known limitation:** editors can read all `video_edits` rows at the DB level. Frontend enforces client scoping by fetching only assigned client IDs and filtering the query with `.in("client_id", assignedClientIds)`. This is consistent with how videographers work today.
- Editor sees `/content-calendar` top-level route with a client picker — no write access

---

## Database Changes

### Migration: `20260318_editor_role.sql`

```sql
-- 1. Add assignee_user_id to video_edits
ALTER TABLE public.video_edits
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. RLS: allow team members to read other team member profiles (for assignee dropdown)
--    Uses has_role() SECURITY DEFINER helper to safely bypass user_roles RLS
CREATE POLICY "Team members can read team profiles"
  ON public.profiles FOR SELECT
  USING (
    -- The profile being read must belong to a team member role
    (
      public.has_role(profiles.user_id, 'admin')
      OR public.has_role(profiles.user_id, 'videographer')
      OR public.has_role(profiles.user_id, 'editor')
    )
    -- The reader must be a team member themselves
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'videographer')
      OR public.has_role(auth.uid(), 'editor')
    )
  );

-- 3. RLS: editors can read clients for assigned clients (needed for client picker)
--    Note: videographers already have "Videographer can view assigned clients" policy
CREATE POLICY "Editor can view assigned clients"
  ON public.clients FOR SELECT
  USING (
    public.has_role(auth.uid(), 'editor')
    AND public.is_assigned_client(id)
  );
```

> Note: `content_calendar` RLS is not needed — the calendar page reads from `video_edits`. `videographer_clients` RLS already allows editors to read their own assignments. `client_notion_mapping` is admin-only so editors safely fall through to `videographer_clients` in the queue fetch logic.

---

## Backend Changes

### `supabase/functions/update-editing-status/index.ts`

Add `assignee_user_id` to the accepted fields:

- Destructure `assignee_user_id` from `body` alongside existing fields
- Add it to the validation check (at least one field present)
- Add `if (assignee_user_id !== undefined) update.assignee_user_id = assignee_user_id;` in the update builder

---

## Frontend Changes

### 1. `src/pages/Videographers.tsx` — Client Assignment UI

**Fetch strategy:** In `fetchMembers()`, after loading the members array, run a single bulk query:
```typescript
const { data: assignments } = await supabase
  .from("videographer_clients")
  .select("videographer_user_id, client_id, clients(id, name)")
  .in("videographer_user_id", userIds);

// Build: assignmentsMap: Record<userId, { id: string; name: string }[]>
```

**UI changes:**
- Show assigned client names as small chips below each member's name in the list row (max 3, "+N more" if overflow)
- Add "Assign Clients" icon button (`UserPlus` icon) per row — opens a dialog showing all clients as checkboxes, pre-checked with current assignments
- On save: delete all existing `videographer_clients` rows for that `videographer_user_id`, then insert the newly checked set
- No changes to create/delete user flow

### 2. `src/pages/MasterEditingQueue.tsx` — Assignee Dropdown

**Team members fetch (run on mount):**

Query `profiles` directly using the new "Team members can read team profiles" policy — do NOT pre-query `user_roles` first, because `user_roles` RLS restricts non-admins to seeing only their own row:

```typescript
// The new profiles RLS policy uses has_role() SECURITY DEFINER to filter
// team member profiles without needing to read user_roles directly.
// Admins get all team profiles; videographers/editors get only admin+videographer+editor profiles.
const { data: profileRows } = await supabase
  .from("profiles")
  .select("user_id, display_name");
// Filter client-side to non-null display names; the RLS policy already scopes to team roles.

// teamMembers: { user_id: string; display_name: string }[]
```

**Assignee field changes:**
- Replace free-text `<input>` in `renderAssigneeInput()` with a `<Select>` dropdown
- Options: "Unassigned" (value `""`) + one option per team member (value = `user_id`, label = `display_name`)
- Current selected value: match `item.assignee_user_id` to a team member's `user_id`; fall back to `item.assignee` text if UUID not matched
- On select: call `update-editing-status` edge function with `{ id, assignee: displayName, assignee_user_id: userId || null }`
- Same change applied to per-client `EditingQueue.tsx`

### 3. `src/components/DashboardSidebar.tsx` — Editor Sidebar

Update existing `isEditor` branch (currently lines ~148–156) — add Content Calendar:

```typescript
if (isEditor) {
  return [
    { label: "Dashboard", icon: Home, path: "/dashboard" },
    { label: "Editing Queue", icon: Clapperboard, path: "/editing-queue" },
    { label: "Content Calendar", icon: Calendar, path: "/content-calendar" }, // add this line
    { label: "Viral Today", icon: Flame, path: "/viral-today" },
    { label: "Trainings", icon: BookOpen, path: "/trainings" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ];
}
```

### 4. `src/pages/ContentCalendar.tsx` — Editor Support

**Assigned client loading (new `isEditor` branch in data fetch):**
```typescript
if (isEditor) {
  const { data: assignments } = await supabase
    .from("videographer_clients")
    .select("client_id, clients(id, name)")
    .eq("videographer_user_id", user.id);
  // Build assignedClients list; default-select first one
  // Store selected client in state: selectedEditorClientId
}
```

**Fetch query when `isEditor`:** Add `.in("client_id", assignedClientIds)` filter to the `video_edits` query so only assigned clients' posts are loaded — do NOT rely on UI-only filtering.

**Client picker UI (when `isEditor`):**
- Show a client selector dropdown at the top of the page
- Default to first assigned client automatically on load
- Selecting a different client re-runs the fetch with the new `client_id` filter
- If editor has 0 assigned clients: show empty state — "You have no assigned clients. Contact your admin."

**Read-only mode:**
- When `isEditor === true`, hide: add post button, edit/status change controls, schedule controls, all mutation buttons
- Calendar grid, post details, and status badges remain visible

---

## Routes

- `/editing-queue` → `MasterEditingQueue` — handles editor scoping via `videographer_clients` fallthrough. No change needed.
- `/content-calendar` — check `App.tsx`. If only `/clients/:id/content-calendar` exists, add a top-level `/content-calendar` route. The page detects the missing `clientId` and shows the editor's client picker.
- `/clients/:id/content-calendar` — editors don't have a Clients nav item. If accessed directly by URL, the page loads that client's `video_edits` (public read). Acceptable — no sensitive data exposed.

---

## RLS Summary

| Table | Editor Access | Mechanism |
|-------|--------------|-----------|
| `video_edits` | SELECT, UPDATE all rows | Existing `USING (true)` — frontend query scoped to assigned client IDs |
| `videographer_clients` | SELECT own rows | Existing "Videographer can view own assignments" policy |
| `profiles` | SELECT team member profiles only | New policy using `has_role()` SECURITY DEFINER helper |
| `clients` | SELECT assigned clients | New policy (migration step 3) |
| `client_notion_mapping` | No access (admin-only RLS) | Existing policy — editors safely fall through to `videographer_clients` |
| `content_calendar` | No direct access needed | Calendar reads from `video_edits` |
| All other tables | No access | Default deny |

**Known limitation:** `video_edits` is fully public at the DB level. Scoping for editors is enforced at the frontend fetch level (`.in("client_id", assignedIds)`). This is consistent with existing videographer behavior. Tightening to row-level RLS would be a larger migration out of scope.

---

## Edge Cases

- **Editor with 0 assigned clients:** Editing queue shows empty state; content calendar shows "You have no assigned clients. Contact your admin."
- **Editor accessing `/clients/:id/content-calendar` directly via URL:** Page loads that client's data (public read on video_edits). Acceptable.
- **Assignee dropdown with team members fetch failure:** Falls back to showing current `assignee` text value as a disabled input; no crash.
- **`update-editing-status` called without `assignee_user_id`:** Field is optional — existing calls without it continue to work.

---

## Out of Scope

- Tightening `video_edits` RLS to row-level client scoping
- Editor write access to content calendar
- Per-video assignment notifications
- Editor-specific dashboard widgets
- Invite email flow (admin creates with password, same as videographers)
