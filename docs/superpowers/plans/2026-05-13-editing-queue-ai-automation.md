# Editing Queue AI Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Robby AI parity with every UI operation in the editing queue (per-client + master), including deep-linking to a specific item + modal, fixing the "took me to a random page" bug.

**Architecture:** Both editing-queue pages start reading URL query params (`item_id`, `modal`, `status`, `sort`, etc.) on mount and routing them into existing component state. A shared resolver picks the right `video_edits` row from partial titles. Twelve new AI tools wrap the missing operations and emit `navigate` actions with structured URLs.

**Tech Stack:** React + React Router (`useSearchParams`), Supabase Deno edge functions, TypeScript.

**Spec:** [docs/superpowers/specs/2026-05-13-editing-queue-ai-automation-design.md](docs/superpowers/specs/2026-05-13-editing-queue-ai-automation-design.md)

**Verification model:** No automated tests this pass — every task ends with a manual smoke test in the browser or via a `?...` URL.

**Prerequisites:** Edge-function deploys reference `$SUPABASE_ACCESS_TOKEN`. Before running any deploy step, export the CLI token in your shell session — it lives in your local memory reference file (`reference_supabase_token.md`). Never paste the literal token into files committed to git; GitHub's push-protection will block the push.

```bash
export SUPABASE_ACCESS_TOKEN=<your-sbp-token>
```

---

## Task 1: URL params on `EditingQueue.tsx` (per-client view)

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

Open [src/pages/EditingQueue.tsx](src/pages/EditingQueue.tsx). Find line 2:

```tsx
import { useNavigate, useParams } from "react-router-dom";
```

Replace with:

```tsx
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Read params in the component**

Find the line `const navigate = useNavigate();` (around line 129). Add directly after it:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
```

- [ ] **Step 3: Add the URL → state effect**

Locate the existing `useEffect` that fetches items (look for `fetchEditingQueue` or the effect that calls `supabase.from("video_edits")`). Right after that effect closes (look for the next blank line after its `}, [clientId, user])`), add:

```tsx
// AI deep-link: read URL params on mount, apply to component state,
// then strip them from the URL so refresh doesn't re-open the modal.
// Runs once items have loaded so item_id can resolve to a row.
useEffect(() => {
  if (items.length === 0) return;

  const itemId = searchParams.get("item_id");
  const modal = searchParams.get("modal");
  const status = searchParams.get("status");
  const postStatus = searchParams.get("post_status");
  const assignee = searchParams.get("assignee");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort");
  const dir = searchParams.get("dir");

  let consumedAny = false;

  if (search) { setSearchQuery(search); consumedAny = true; }
  if (sort) { setSortCol(sort); consumedAny = true; }
  if (dir === "asc" || dir === "desc") { setSortDir(dir); consumedAny = true; }

  if (itemId) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      consumedAny = true;
      // Modal routing — match the modal param to the existing state setter.
      switch (modal) {
        case "revisions":
          setRevisionDialogItem(item);
          setRevisionText(item.revisions ?? "");
          break;
        case "review":
          setReviewItem(item);
          setReviewModalOpen(true);
          break;
        case "footage":
          setFootageViewerItem(item);
          break;
        case "caption":
          setCaptionEditItem(item);
          setCaptionEditValue(item.caption ?? "");
          break;
        case "deadline":
          setDeadlineOpenId(item.id);
          break;
        case "schedule":
          setScheduleItem(item);
          setScheduleDate(item.scheduledDate ?? "");
          break;
        case "delete":
          setDeleteConfirmItem(item);
          break;
        default:
          // No modal — just scroll to the row (handled by row ref below).
          break;
      }
    }
  }

  // Filter params — note these don't have setters in the current
  // EditingQueue; status/post_status/assignee filtering happens via
  // searchQuery + the user typing. For now, treat status/assignee as
  // search hints so the row is at least findable. Real filter dropdowns
  // can come later.
  if (status || postStatus || assignee) {
    const hint = [status, postStatus, assignee].filter(Boolean).join(" ");
    if (hint) {
      setSearchQuery((prev) => prev || hint);
      consumedAny = true;
    }
  }

  if (consumedAny) {
    setSearchParams({}, { replace: true });
  }
}, [items.length]);
```

- [ ] **Step 4: Manual smoke test**

Run the dev server (`npm run dev` if not already running) and visit a URL like:
```
http://localhost:5173/clients/<your-client-id>/editing-queue?item_id=<a-known-item-id>&modal=revisions
```

Expected: the revisions modal opens on the right item. URL clears to `/clients/<id>/editing-queue` after mount. Refresh leaves the modal closed.

Then try `?sort=deadline&dir=asc` — expected: list reorders by deadline ascending.

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat(editing-queue): accept URL params for deep links + view state"
```

---

## Task 2: URL params on `MasterEditingQueue.tsx` (admin view)

**Files:**
- Modify: `src/pages/MasterEditingQueue.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

Open [src/pages/MasterEditingQueue.tsx](src/pages/MasterEditingQueue.tsx). Find the React Router import line (around line 3):

```tsx
import { useNavigate } from "react-router-dom";
```

Replace with:

```tsx
import { useNavigate, useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Read params in the component**

Find the line `const navigate = useNavigate();`. Add directly after it:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
```

- [ ] **Step 3: Locate state setters used in this page**

Before writing the effect, grep for what state setters exist on this page. They may not match `EditingQueue` exactly:

```bash
grep -n "useState\|setState" src/pages/MasterEditingQueue.tsx | head -30
```

For each modal in the spec (`revisions`, `review`, `footage`, `caption`, `deadline`, `schedule`, `delete`), find the corresponding `set*` function. Skip any modal that doesn't exist on the master view (note it in a comment).

- [ ] **Step 4: Add the URL → state effect**

Add after the items-fetch effect. **Mirror Task 1's effect structure** — same params, same precedence, same URL clearing — but use the state setters that actually exist on this page. If the master view doesn't have, e.g., `footage` or `schedule` modals, the corresponding `case` branch is omitted (don't fail silently — log a console.warn).

Reference shape (adapt setter names to what exists):

```tsx
useEffect(() => {
  if (items.length === 0) return;

  const itemId = searchParams.get("item_id");
  const modal = searchParams.get("modal");
  const status = searchParams.get("status");
  const postStatus = searchParams.get("post_status");
  const assignee = searchParams.get("assignee");
  const search = searchParams.get("search");
  const sort = searchParams.get("sort");
  const dir = searchParams.get("dir");

  let consumedAny = false;

  if (search) { setSearchQuery(search); consumedAny = true; }
  if (sort) { setSortCol(sort); consumedAny = true; }
  if (dir === "asc" || dir === "desc") { setSortDir(dir); consumedAny = true; }

  if (itemId) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      consumedAny = true;
      switch (modal) {
        case "revisions":
          // …same as EditingQueue, using master view's setters
          break;
        // … one branch per modal that exists on this page
        default:
          break;
      }
    }
  }

  if (status || postStatus || assignee) {
    const hint = [status, postStatus, assignee].filter(Boolean).join(" ");
    if (hint) {
      setSearchQuery((prev) => prev || hint);
      consumedAny = true;
    }
  }

  if (consumedAny) {
    setSearchParams({}, { replace: true });
  }
}, [items.length]);
```

- [ ] **Step 5: Manual smoke test**

Visit `http://localhost:5173/editing-queue?item_id=<known-id>&modal=revisions`. Expected: the revisions modal opens. URL clears after mount.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MasterEditingQueue.tsx
git commit -m "feat(master-editing-queue): accept URL params for deep links + view state"
```

---

## Task 3: Shared resolver helper

**Files:**
- Create: `supabase/functions/companion-chat/_shared/editing-resolver.ts`

> Note: the spec used `supabase/functions/_shared/editing-resolver.ts` as the path, but the existing companion-chat function imports its helpers from `./tools/*` relative to the function dir. Keep the resolver inside `companion-chat/_shared/` so the deploy bundle picks it up automatically.

- [ ] **Step 1: Create the file**

```ts
// supabase/functions/companion-chat/_shared/editing-resolver.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type EditingResolveOk = {
  ok: true;
  item: {
    id: string;
    reel_title: string;
    client_id: string;
    status: string | null;
    assignee: string | null;
    revisions: string | null;
    caption: string | null;
    deadline: string | null;
    deleted_at: string | null;
  };
};

export type EditingResolveErr = {
  ok: false;
  reason: "no_match" | "ambiguous";
  /** Top candidates when ambiguous. Empty when no_match. */
  candidates: Array<{ id: string; reel_title: string; client_id: string }>;
};

export type EditingResolveResult = EditingResolveOk | EditingResolveErr;

/**
 * Resolve a single video_edits row from a fuzzy title query.
 *
 * Strategy:
 *   1. Exact case-insensitive match on reel_title.
 *   2. Substring match (ilike '%query%').
 *   3. Tie-break: non-deleted before deleted, then updated_at DESC.
 *   4. If 3+ equally-good matches remain, return { ok:false, ambiguous, candidates:topN }.
 *
 * Scope:
 *   - clientId !== null: search restricted to that client's rows.
 *   - clientId === null: search across `accessibleClientIds` (master view).
 *     If accessibleClientIds is null (admin), no client filter is applied.
 *
 * Trash semantics: by default the resolver returns the best match REGARDLESS
 * of deleted_at status. Callers that need only-live or only-deleted rows
 * should pass { onlyLive: true } or { onlyDeleted: true }.
 */
export async function resolveEditingItem(
  adminClient: SupabaseClient,
  clientId: string | null,
  accessibleClientIds: string[] | null,
  query: string,
  opts: { onlyLive?: boolean; onlyDeleted?: boolean } = {},
): Promise<EditingResolveResult> {
  const q = (query ?? "").trim();
  if (!q) return { ok: false, reason: "no_match", candidates: [] };

  // 1. Exact case-insensitive match
  let exactSel = adminClient
    .from("video_edits")
    .select("id, reel_title, client_id, status, assignee, revisions, caption, deadline, deleted_at, updated_at")
    .ilike("reel_title", q);

  if (clientId) exactSel = exactSel.eq("client_id", clientId);
  else if (accessibleClientIds) exactSel = exactSel.in("client_id", accessibleClientIds);

  if (opts.onlyLive) exactSel = exactSel.is("deleted_at", null);
  if (opts.onlyDeleted) exactSel = exactSel.not("deleted_at", "is", null);

  const { data: exactRows } = await exactSel.order("updated_at", { ascending: false }).limit(2);

  if (exactRows && exactRows.length === 1) {
    return { ok: true, item: exactRows[0] as EditingResolveOk["item"] };
  }
  if (exactRows && exactRows.length > 1) {
    // Multiple exact matches — same title on different clients (only
    // possible in master mode). Tie-break by updated_at.
    return { ok: true, item: exactRows[0] as EditingResolveOk["item"] };
  }

  // 2. Substring match
  let subSel = adminClient
    .from("video_edits")
    .select("id, reel_title, client_id, status, assignee, revisions, caption, deadline, deleted_at, updated_at")
    .ilike("reel_title", `%${q}%`);

  if (clientId) subSel = subSel.eq("client_id", clientId);
  else if (accessibleClientIds) subSel = subSel.in("client_id", accessibleClientIds);

  if (opts.onlyLive) subSel = subSel.is("deleted_at", null);
  if (opts.onlyDeleted) subSel = subSel.not("deleted_at", "is", null);

  const { data: subRows } = await subSel
    .order("deleted_at", { ascending: true, nullsFirst: true }) // live first
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!subRows || subRows.length === 0) {
    return { ok: false, reason: "no_match", candidates: [] };
  }

  if (subRows.length === 1) {
    return { ok: true, item: subRows[0] as EditingResolveOk["item"] };
  }

  // 3+ matches → ambiguous. Return top 3 candidates so the caller can ask
  // the user to pick. We don't auto-pick because the cost of being wrong
  // (mutating the wrong row) is higher than asking.
  if (subRows.length >= 3) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: subRows.slice(0, 3).map((r) => ({
        id: r.id as string,
        reel_title: r.reel_title as string,
        client_id: r.client_id as string,
      })),
    };
  }

  // Exactly 2 matches — tie-break already applied via ORDER BY. Pick the
  // top one (live + most recent).
  return { ok: true, item: subRows[0] as EditingResolveOk["item"] };
}

/**
 * Helper: render an ambiguous-result error message for the tool result.
 */
export function ambiguousMessage(query: string, candidates: EditingResolveErr["candidates"]): string {
  const lines = candidates.map((c, i) => `  ${i + 1}. ${c.reel_title}`).join("\n");
  return `Multiple items match "${query}". Did you mean:\n${lines}\n\nReply with the exact title to disambiguate.`;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd supabase/functions && deno check companion-chat/_shared/editing-resolver.ts
```

Expected: no type errors. (If `deno` isn't installed locally, skip — the deploy step in later tasks will catch errors.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/companion-chat/_shared/editing-resolver.ts
git commit -m "feat(ai-tools): shared resolver for video_edits items"
```

---

## Task 4: `open_editing_item` tool

**Files:**
- Modify: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Add import for the resolver**

At the top of [supabase/functions/companion-chat/tools/editing.ts](supabase/functions/companion-chat/tools/editing.ts), after the existing imports, add:

```ts
import { resolveEditingItem, ambiguousMessage } from "../_shared/editing-resolver.ts";
```

- [ ] **Step 2: Add the tool definition to `EDITING_TOOLS`**

Find the `EDITING_TOOLS: ToolDef[] = [` array (currently lines 5-107). Add the following object as the FIRST entry of the array (so it's listed first to the model):

```ts
  {
    name: "open_editing_item",
    description: "Open a specific editing-queue item in the user's browser, optionally opening a modal on it (revisions / review / footage / caption / deadline / schedule / delete). Use this when the user asks to 'show me X', 'open the revisions for Y', 'let me see the footage for Z', etc. Resolves the item by partial title. If client_name is omitted, navigates to the master editing queue.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name. Omit to navigate to the admin master view." },
        item_title: { type: "string", description: "Title or partial title of the editing item to open." },
        modal: { type: "string", description: "Optional modal to open on the item: revisions | review | footage | caption | deadline | schedule | delete" },
      },
      required: ["item_title"],
    },
  },
```

- [ ] **Step 3: Add the handler**

In the `handleEditingTool` function, BEFORE the existing `if (block.name === "update_editing_status")` block, add:

```ts
  if (block.name === "open_editing_item") {
    const { client_name, item_title, modal } = block.input as { client_name?: string; item_title: string; modal?: string };
    const validModals = ["revisions", "review", "footage", "caption", "deadline", "schedule", "delete"];
    if (modal && !validModals.includes(modal)) {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid modal "${modal}". Use one of: ${validModals.join(", ")}.` };
    }

    let targetClientId: string | null = null;
    let targetClientName: string | null = null;
    if (client_name) {
      const c = await resolveClient(ctx, client_name);
      if (!c) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      targetClientId = c.id;
      targetClientName = c.name ?? null;
    }

    const result = await resolveEditingItem(
      adminClient,
      targetClientId,
      ctx.accessibleClientIds,
      item_title,
    );
    if (!result.ok) {
      if (result.reason === "ambiguous") {
        return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, result.candidates) };
      }
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item found matching "${item_title}"${targetClientName ? ` for ${targetClientName}` : ""}.` };
    }

    // Build the navigation URL.
    const params = new URLSearchParams();
    params.set("item_id", result.item.id);
    if (modal) params.set("modal", modal);
    const basePath = targetClientId
      ? `/clients/${targetClientId}/editing-queue`
      : `/editing-queue`;
    const path = `${basePath}?${params.toString()}`;

    actions.push({ type: "navigate", path });
    const where = targetClientName ?? "master queue";
    const what = modal ? ` and opened the ${modal} view` : "";
    return { type: "tool_result", tool_use_id: block.id, content: `Opened "${result.item.reel_title}" in ${where}${what}.` };
  }
```

- [ ] **Step 4: Deploy the edge function**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: companion-chat`.

- [ ] **Step 5: Smoke test**

In the deployed app, open Robby and type: `Open the revisions for [any reel title you have]`.

Expected: the editing queue page opens with that item's revisions modal visible.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai-tools): open_editing_item — deep-link to specific item + modal"
```

---

## Task 5: `set_editing_queue_view` tool

**Files:**
- Modify: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Add the tool definition**

In `EDITING_TOOLS`, directly after the `open_editing_item` entry, add:

```ts
  {
    name: "set_editing_queue_view",
    description: "Filter and sort the editing queue view in the user's browser. Use when the user asks 'show me only X status', 'sort by deadline', 'find everything assigned to Y', etc. If client_name is omitted, applies to the master view.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Client name. Omit for master view." },
        status: { type: "string", description: "Filter by item status: not-started | in-progress | in-review | done" },
        post_status: { type: "string", description: "Filter by post status: unpublished | scheduled | published" },
        assignee: { type: "string", description: "Filter by assignee name" },
        search: { type: "string", description: "Pre-fill the search box" },
        sort_by: { type: "string", description: "Column to sort by: title | status | assignee | deadline | revisions | post_status" },
        sort_dir: { type: "string", description: "Sort direction: asc | desc" },
      },
      required: [],
    },
  },
```

- [ ] **Step 2: Add the handler**

In `handleEditingTool`, after the `open_editing_item` block from Task 4, add:

```ts
  if (block.name === "set_editing_queue_view") {
    const { client_name, status, post_status, assignee, search, sort_by, sort_dir } = block.input as {
      client_name?: string;
      status?: string;
      post_status?: string;
      assignee?: string;
      search?: string;
      sort_by?: string;
      sort_dir?: string;
    };

    let targetClientId: string | null = null;
    if (client_name) {
      const c = await resolveClient(ctx, client_name);
      if (!c) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
      targetClientId = c.id;
    }

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (post_status) params.set("post_status", post_status);
    if (assignee) params.set("assignee", assignee);
    if (search) params.set("search", search);
    if (sort_by) params.set("sort", sort_by);
    if (sort_dir === "asc" || sort_dir === "desc") params.set("dir", sort_dir);

    if (Array.from(params.keys()).length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "No filter or sort provided — nothing to apply." };
    }

    const basePath = targetClientId
      ? `/clients/${targetClientId}/editing-queue`
      : `/editing-queue`;
    const path = `${basePath}?${params.toString()}`;
    actions.push({ type: "navigate", path });

    const parts: string[] = [];
    if (status) parts.push(`status=${status}`);
    if (post_status) parts.push(`post_status=${post_status}`);
    if (assignee) parts.push(`assignee=${assignee}`);
    if (search) parts.push(`search="${search}"`);
    if (sort_by) parts.push(`sort=${sort_by}${sort_dir ? ` ${sort_dir}` : ""}`);
    return { type: "tool_result", tool_use_id: block.id, content: `Applied: ${parts.join(", ")}.` };
  }
```

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

- [ ] **Step 4: Smoke test**

Tell Robby: `Sort the editing queue by deadline ascending`.

Expected: the queue reorders by deadline. URL params clear after mount.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai-tools): set_editing_queue_view — sort + filter from chat"
```

---

## Task 6: Single-item mutations — deadline + trash trio

**Files:**
- Modify: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Add the four tool definitions**

In `EDITING_TOOLS`, after `set_editing_queue_view`, add:

```ts
  {
    name: "set_deadline",
    description: "Set or clear a deadline on an editing queue item. Pass deadline=null to clear.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        deadline: { type: "string", description: "YYYY-MM-DD, or null to clear" },
      },
      required: ["client_name", "item_title", "deadline"],
    },
  },
  {
    name: "delete_editing_item",
    description: "Soft-delete an editing queue item (moves it to trash; can be restored).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "restore_editing_item",
    description: "Restore a soft-deleted editing queue item from the trash.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
  {
    name: "permanent_delete_editing_item",
    description: "Permanently delete an editing queue item. UNRECOVERABLE. Must be confirmed by user via propose_plan first, regardless of autonomy mode.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
      },
      required: ["client_name", "item_title"],
    },
  },
```

- [ ] **Step 2: Add the four handlers**

After the existing `add_revision_notes` handler block (around line 159 originally), insert:

```ts
  if (block.name === "set_deadline") {
    const { client_name, item_title, deadline } = block.input as { client_name: string; item_title: string; deadline: string | null };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    const newDeadline = deadline === null || deadline === "" ? null : deadline;
    await adminClient.from("video_edits").update({ deadline: newDeadline }).eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: newDeadline ? `Deadline for "${r.item.reel_title}" set to ${newDeadline}.` : `Deadline cleared for "${r.item.reel_title}".` };
  }

  if (block.name === "delete_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No live editing item matched "${item_title}" for ${client.name}.` };
    }
    await adminClient.from("video_edits").update({ deleted_at: new Date().toISOString() }).eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" moved to trash. Use restore_editing_item to bring it back.` };
  }

  if (block.name === "restore_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyDeleted: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No trashed editing item matched "${item_title}" for ${client.name}.` };
    }
    await adminClient.from("video_edits").update({ deleted_at: null }).eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" restored from trash.` };
  }

  if (block.name === "permanent_delete_editing_item") {
    const { client_name, item_title } = block.input as { client_name: string; item_title: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title);
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    await adminClient.from("video_edits").delete().eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" permanently deleted. This cannot be undone.` };
  }
```

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

- [ ] **Step 4: Smoke test all four**

Pick a test client and a throwaway video_edits row.

- `Set the deadline for [reel] to 2026-05-20` → row updates, toast appears
- `Delete the [reel]` → row disappears from list
- `Restore [reel]` → row reappears
- (Don't actually run permanent_delete unless you've got a sacrificial row)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai-tools): set_deadline, delete/restore/permanent_delete editing items"
```

---

## Task 7: Single-item mutations — caption + rename

**Files:**
- Modify: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Add the two tool definitions**

In `EDITING_TOOLS`, after the trash tools from Task 6, add:

```ts
  {
    name: "set_caption",
    description: "Overwrite the caption on an editing queue item. Use when the user dictates a caption directly (does not call the AI to generate one — use generate_caption for that).",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string" },
        caption: { type: "string" },
      },
      required: ["client_name", "item_title", "caption"],
    },
  },
  {
    name: "rename_editing_item",
    description: "Rename the reel title on an editing queue item.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_title: { type: "string", description: "Current title or partial title." },
        new_title: { type: "string" },
      },
      required: ["client_name", "item_title", "new_title"],
    },
  },
```

- [ ] **Step 2: Add the handlers**

In `handleEditingTool`, after the trash handlers from Task 6, add:

```ts
  if (block.name === "set_caption") {
    const { client_name, item_title, caption } = block.input as { client_name: string; item_title: string; caption: string };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    await adminClient.from("video_edits").update({ caption }).eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    actions.push({ type: "refresh_data", scope: "calendar" });
    return { type: "tool_result", tool_use_id: block.id, content: `Caption updated for "${r.item.reel_title}".` };
  }

  if (block.name === "rename_editing_item") {
    const { client_name, item_title, new_title } = block.input as { client_name: string; item_title: string; new_title: string };
    const trimmed = new_title.trim();
    if (!trimmed) return { type: "tool_result", tool_use_id: block.id, content: "Refused: new_title must be non-empty." };
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };
    const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, item_title, { onlyLive: true });
    if (!r.ok) {
      if (r.reason === "ambiguous") return { type: "tool_result", tool_use_id: block.id, content: ambiguousMessage(item_title, r.candidates) };
      return { type: "tool_result", tool_use_id: block.id, content: `No editing item matched "${item_title}" for ${client.name}.` };
    }
    await adminClient.from("video_edits").update({ reel_title: trimmed }).eq("id", r.item.id);
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `"${r.item.reel_title}" renamed to "${trimmed}".` };
  }
```

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

- [ ] **Step 4: Smoke test**

- `Set the caption for [reel] to: "Today I broke my own rule…"` → caption updates
- `Rename [reel] to [new title]` → title updates in the list

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai-tools): set_caption + rename_editing_item"
```

---

## Task 8: Bulk mutations

**Files:**
- Modify: `supabase/functions/companion-chat/tools/editing.ts`

- [ ] **Step 1: Add the three tool definitions**

In `EDITING_TOOLS`, append:

```ts
  {
    name: "bulk_delete_editing_items",
    description: "Soft-delete multiple editing items in one call. Capped at 14 per call.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
      },
      required: ["client_name", "item_titles"],
    },
  },
  {
    name: "bulk_assign_editor",
    description: "Assign an editor to multiple items in one call. Capped at 14.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
        editor_name: { type: "string" },
      },
      required: ["client_name", "item_titles", "editor_name"],
    },
  },
  {
    name: "bulk_update_status",
    description: "Set status on multiple items in one call. Capped at 14. status: Not started | In progress | In review | Done.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        item_titles: { type: "array", items: { type: "string" } },
        status: { type: "string" },
      },
      required: ["client_name", "item_titles", "status"],
    },
  },
```

- [ ] **Step 2: Add the handlers**

After the rename handler from Task 7, insert:

```ts
  // Shared helper for bulk operations — resolves each title and runs `mutate`
  // for the resolved item id. Returns the per-item status string.
  async function runBulk(
    client_name: string,
    item_titles: unknown,
    mutate: (id: string) => Promise<{ error: unknown }>,
    actionVerb: string,
  ): Promise<ToolResult> {
    if (!Array.isArray(item_titles) || item_titles.length === 0) {
      return { type: "tool_result", tool_use_id: block.id, content: "Refused: item_titles must be a non-empty array." };
    }
    if (item_titles.length > 14) {
      return { type: "tool_result", tool_use_id: block.id, content: `Refused: cap is 14 per call (got ${item_titles.length}).` };
    }
    const client = await resolveClient(ctx, client_name);
    if (!client) return { type: "tool_result", tool_use_id: block.id, content: `No client found: "${client_name}"` };

    const lines: string[] = [];
    let touched = 0;
    for (const raw of item_titles) {
      const title = String(raw ?? "").trim();
      if (!title) { lines.push("SKIP: empty title"); continue; }
      const r = await resolveEditingItem(adminClient, client.id, ctx.accessibleClientIds, title);
      if (!r.ok) {
        if (r.reason === "ambiguous") lines.push(`AMBIGUOUS "${title}" — ${r.candidates.length} matches`);
        else lines.push(`MISS "${title}"`);
        continue;
      }
      const res = await mutate(r.item.id);
      if (res.error) lines.push(`FAIL "${r.item.reel_title}": ${(res.error as { message?: string }).message ?? "unknown"}`);
      else { touched += 1; lines.push(`OK "${r.item.reel_title}"`); }
    }
    actions.push({ type: "refresh_data", scope: "editing_queue" });
    return { type: "tool_result", tool_use_id: block.id, content: `${actionVerb} ${touched}/${item_titles.length} for ${client.name}:\n${lines.join("\n")}` };
  }

  if (block.name === "bulk_delete_editing_items") {
    const { client_name, item_titles } = block.input as { client_name: string; item_titles: string[] };
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      return { error };
    }, "Soft-deleted");
  }

  if (block.name === "bulk_assign_editor") {
    const { client_name, item_titles, editor_name } = block.input as { client_name: string; item_titles: string[]; editor_name: string };
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ assignee: editor_name }).eq("id", id);
      return { error };
    }, `Assigned to ${editor_name}:`);
  }

  if (block.name === "bulk_update_status") {
    const { client_name, item_titles, status } = block.input as { client_name: string; item_titles: string[]; status: string };
    const valid = ["Not started", "In progress", "In review", "Done"];
    if (!valid.includes(status)) {
      return { type: "tool_result", tool_use_id: block.id, content: `Invalid status "${status}". Use one of: ${valid.join(", ")}.` };
    }
    return runBulk(client_name, item_titles, async (id) => {
      const { error } = await adminClient.from("video_edits").update({ status }).eq("id", id);
      return { error };
    }, `Set status to "${status}":`);
  }
```

- [ ] **Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

- [ ] **Step 4: Smoke test**

- `Assign the next three videos to Daniel` → 3 items get assignee=Daniel, per-item OK/FAIL lines surface in chat
- `Mark all my pending videos as in review` → bulk status update, results report

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/companion-chat/tools/editing.ts
git commit -m "feat(ai-tools): bulk_delete + bulk_assign + bulk_update_status"
```

---

## Task 9: System prompt — tool inventory + permanent-delete plan rule

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Locate the system prompt's tool inventory**

In [supabase/functions/companion-chat/index.ts](supabase/functions/companion-chat/index.ts), find the system prompt section. The autonomy block at line 810 is one anchor. Look for a section that enumerates available tools (search for `editing` or `update_editing_status` in the file).

```bash
grep -n "update_editing_status\|editing tools\|EDITING TOOLS" supabase/functions/companion-chat/index.ts | head -10
```

- [ ] **Step 2: Add the new tools to the inventory**

Wherever the editing tools are listed in the system prompt, append the new ones. If there is no enumeration yet, the model auto-discovers from `TOOLS`, but a 2-3 line summary near the autonomy rules helps the model pick the right tool. Add a paragraph near the `AUTONOMY MODE` block (around line 810):

```ts
+ `

EDITING-QUEUE TOOLS — when the user mentions a specific video / reel / edit:
- open_editing_item: when they want to SEE an item or its modal (revisions, footage, review, caption, deadline, schedule, delete). DEFAULT to this over plain navigation.
- set_editing_queue_view: for sort/filter/search across the queue
- set_deadline: explicit deadline changes
- delete_editing_item / restore_editing_item: soft delete / restore
- permanent_delete_editing_item: HARD delete — ALWAYS call propose_plan first regardless of autonomy mode
- set_caption / rename_editing_item: explicit text changes
- bulk_delete_editing_items / bulk_assign_editor / bulk_update_status: capped at 14 per call`
```

(Wrap it into the template string at the right spot. Don't blow up the existing string layout.)

- [ ] **Step 3: Strengthen the permanent-delete rule**

Find the section at line 807 starting with `18c. PREVIEW BIG ACTIONS:`. Add the following to its list of destructive actions:

```
permanent_delete_editing_item (ALWAYS requires plan, even in Auto mode)
```

- [ ] **Step 4: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" /tmp/supabase functions deploy companion-chat --project-ref hxojqrilwhhrvloiwmfo --no-verify-jwt
```

- [ ] **Step 5: Smoke test**

In Auto mode, tell Robby: `Permanently delete the [reel]`. Expected: Robby proposes a plan and waits for "yes" before executing, NOT just running the delete.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(ai-prompt): editing-queue tool inventory + permanent-delete plan rule"
```

---

## Task 10: Final smoke-test sweep + push everything

**Files:** None (verification only).

- [ ] **Step 1: Push all commits to main**

```bash
git push origin main
```

Expected: the front-end picks up Tasks 1, 2's URL param changes via auto-deploy. Edge function changes from Tasks 3-9 are already live.

- [ ] **Step 2: Wait ~7 minutes for the front-end deploy**

Watch GitHub Actions if you want to be precise, or just give it 7-8 min.

- [ ] **Step 3: Run every happy path from the spec**

Open Robby in production. Run these prompts and check each one:

1. `Open the revisions for the latest [client] video` → revisions modal opens on the right item, URL clears.
2. `Sort the editing queue by deadline` → list reorders ascending.
3. `Mark all my pending videos as in review` → bulk update fires; chat surfaces per-item results.
4. `Delete the [reel]` → row disappears (soft delete).
5. `Restore [reel]` → row reappears.
6. `Filter by Daniel as assignee` → search hint applied to queue.
7. (Master view) `Open the [reel] from any client` → master queue opens with right item.

Tick each prompt off in a scratch list.

- [ ] **Step 4: If anything fails**

For each failure:
- Open the Supabase functions dashboard logs for `companion-chat`
- Filter for the tool name that should have fired
- Inspect the input the model sent and the result returned
- Either: fix the tool, fix the system prompt to coach better tool selection, or loosen/tighten the resolver

Open a follow-up commit. Don't bundle multiple fixes into one commit — keep the bisect-friendly history this plan established.

---

## Self-review checklist

- [ ] Every task ends with a commit
- [ ] Every edge-function task ends with a deploy command
- [ ] Every smoke test references a concrete prompt the user can paste
- [ ] No "similar to Task N" — every step has its own code block
- [ ] The resolver's behavior matches the spec at every call site (onlyLive vs onlyDeleted vs default)
- [ ] Bulk tools cap at 14 — matches existing `bulk_reschedule_posts` precedent
- [ ] Permanent delete is wired to require plan flow even in Auto mode

Coverage gaps to flag if any surface during execution:
- The shared `runBulk` helper in Task 8 closes over `block` and `ctx` from the outer `handleEditingTool` — this works because it's declared inside that function. If a future refactor extracts handlers to separate files, that closure breaks. Note in a comment when adding.
- Task 2 explicitly defers some modal branches if the master view doesn't have them. Confirm by `grep`ing the master file before writing the effect.

---

## Out of scope (do NOT do in this plan)

- Calendar / scripts / leads automation (separate plans)
- Adding new modals to the editing queue UI (only wiring URL params to existing modals)
- Permission / role checks beyond RLS (already enforced)
- Automated test scaffold (deferred — see spec)
- Voice-input changes (already works)
- Visual redesign of the editing queue (out of scope)
