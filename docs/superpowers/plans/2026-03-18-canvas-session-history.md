# Canvas Session History Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session history to the Super Planning Canvas so users can maintain multiple AI chat sessions per client, and stop the canvas from being wiped when a script is saved.

**Architecture:** Add `name` and `is_active` columns to `canvas_states` (replacing the `UNIQUE(client_id, user_id)` constraint with a partial unique index), add a collapsible session sidebar to the canvas UI, and route all saves through the session `id` instead of the client+user composite key.

**Tech Stack:** Supabase (PostgreSQL + JS client), React, TypeScript, Tailwind CSS, shadcn/ui icons (lucide-react)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260318_canvas_session_history.sql` | **Create** | DB schema changes: columns, drop old constraint, new partial index |
| `src/components/canvas/SessionSidebar.tsx` | **Create** | Session list sidebar component (new chat, switch, rename, delete) |
| `src/pages/SuperPlanningCanvas.tsx` | **Modify** | Session refs, id-based saves, session-aware load, CRUD handlers, sidebar wire-up |
| `src/components/canvas/CanvasToolbar.tsx` | **Modify** | Accept `sidebarOffset` prop to push back button right of sidebar |

---

## Chunk 1: DB Migration + Save Script Fix

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260318_canvas_session_history.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Canvas session history: multi-session support per client+user
-- Safe for existing rows: they get name='New chat', is_active=true
-- The existing UNIQUE(client_id,user_id) rows satisfy the new partial index automatically.

-- 1. Add new columns (IF NOT EXISTS guards make re-runs safe)
-- NOTE: draw_paths is included here even though the spec's ALTER TABLE block omits it.
-- The code already queries and writes draw_paths (SuperPlanningCanvas.tsx lines 257, 270, 358, 384)
-- but the column was never added in a migration. This migration adds it safely.
ALTER TABLE canvas_states
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'New chat',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS draw_paths JSONB NOT NULL DEFAULT '[]';

-- 2. Drop the old full unique constraint (was added by original migration)
ALTER TABLE canvas_states
  DROP CONSTRAINT IF EXISTS canvas_states_client_id_user_id_key;

-- 3. Create partial unique index: at most one active session per client+user
--    This is the new enforcement mechanism.
CREATE UNIQUE INDEX IF NOT EXISTS canvas_states_one_active
  ON canvas_states(client_id, user_id)
  WHERE is_active = true;
```

- [ ] **Step 2: Run the migration in Supabase**

Open Supabase Dashboard → SQL Editor, paste the migration, run it.

Expected: no errors. Verify with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'canvas_states'
ORDER BY ordinal_position;
```
Expected columns: `id, client_id, user_id, nodes, edges, updated_at, name, is_active, draw_paths`

- [ ] **Step 3: Verify partial index**
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'canvas_states';
```
Expected: `canvas_states_one_active` index present with `WHERE is_active = true`.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260318_canvas_session_history.sql
git commit -m "feat: add canvas session history schema (name, is_active, partial unique index)"
```

---

### Task 2: Fix Canvas Reset on Script Save

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` (around line 193)

**Context:** `handleSaveScript` currently calls `onSaved(saved.scriptId)` which causes `Scripts.tsx` to navigate to `view="view-script"`, unmounting the canvas. The spec requires the canvas stays open after saving.

- [ ] **Step 1: Locate the handler**

In `SuperPlanningCanvas.tsx`, find `handleSaveScript` (line ~193). The current code after a successful save is:
```ts
toast.success("Script saved!");
draftIdRef.current = null;
setDraftScriptId(null);
onSaved(saved.scriptId);   // ← this navigates away
```

- [ ] **Step 2: Remove the navigation, keep canvas**

Replace the block inside `if (saved) { ... }` with:
```ts
if (saved) {
  toast.success("Script saved! Find it in the Scripts list.", { duration: 5000 });
  // Update draft ref to the newly-saved script ID so next edits update the same record
  draftIdRef.current = saved.scriptId;
  setDraftScriptId(saved.scriptId);
  // Do NOT call onSaved — canvas stays open, no navigation
}
```

Also update the `useCallback` dependency array at the end of `handleSaveScript`. Remove `onSaved` since it is no longer called:
```ts
// Before:
}, [selectedClient.id, directSave, onSaved]);
// After:
}, [selectedClient.id, directSave]);
```

- [ ] **Step 3: Remove (or comment) the now-unused `onSaved` prop**

The `onSaved` prop is declared on the `Props` interface (line ~61) but is no longer called anywhere in `CanvasInner`. Remove it from the `Props` interface and from the destructured parameter in `CanvasInner`:

```ts
// Before:
interface Props {
  selectedClient: Client;
  onSaved: (scriptId: string) => void;
  onCancel: () => void;
  remixVideo?: RemixVideo;
}
// After:
interface Props {
  selectedClient: Client;
  onCancel: () => void;
  remixVideo?: RemixVideo;
}
```

Also update the `CanvasInner` function signature:
```ts
// Before:
function CanvasInner({ selectedClient, onSaved, onCancel, remixVideo }: Props) {
// After:
function CanvasInner({ selectedClient, onCancel, remixVideo }: Props) {
```

Note: `SuperPlanningCanvas.tsx` also passes through props from the outer wrapper. The outer `Props` interface and `SuperPlanningCanvas` default export simply spread props, so those will also need updating. Search for all usages with `grep -n "onSaved" src/pages/SuperPlanningCanvas.tsx` and remove each occurrence.

- [ ] **Step 4: TypeScript check**
```bash
cd /var/www/connectacreators && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors relating to `handleSaveScript` or `onSaved`.

- [ ] **Step 5: Manual verification**

Open canvas for any client, type a message in the AI chat, generate a script, save it. Verify:
- Toast appears saying "Script saved! Find it in the Scripts list."
- Canvas stays open — AI chat history and all nodes remain intact
- No navigation away from canvas

- [ ] **Step 6: Commit**
```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "fix: canvas no longer navigates away when script is saved"
```

---

## Chunk 2: Session Infrastructure (Refs + Save Paths + Load)

### Task 3: Add Session Refs and Update Both Save Paths

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

**Context:** Both `saveCanvas` and `beaconSave` currently upsert using `onConflict: "client_id,user_id"`. After the migration drops that unique constraint, this will fail or create duplicate rows. Both must switch to `onConflict: "id"` using the session UUID. A `isSwitchingSessionRef` guard prevents stale saves during session switches.

- [ ] **Step 1: Add new refs after the existing refs block (around line 135–141)**

After `const remixInjectedRef = useRef(false);`, add:
```ts
const activeSessionIdRef = useRef<string | null>(null);
const isSwitchingSessionRef = useRef(false);
```

- [ ] **Step 2: Update `saveCanvas` — add guard + switch to id-based upsert**

Find `saveCanvas` (line ~345). Replace the entire function body with:
```ts
const saveCanvas = useCallback(async (force = false) => {
  if (isSwitchingSessionRef.current) return;          // session switch in progress
  if (!userIdRef.current) return;
  if (!activeSessionIdRef.current) return;             // not yet loaded
  if (nodesRef.current.length === 0) return;
  const serializedNodes = serializeNodes(nodesRef.current);
  const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
  if (!force && snapshot === lastSavedJsonRef.current) return;
  pendingSaveRef.current = true;
  setSaveStatus("saving");
  try {
    await supabase.from("canvas_states").upsert({
      id: activeSessionIdRef.current,
      client_id: clientIdRef.current,
      user_id: userIdRef.current,
      nodes: serializedNodes,
      edges: edgesRef.current,
      draw_paths: drawPathsRef.current,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    lastSavedJsonRef.current = snapshot;
    pendingSaveRef.current = false;
    isDirtyRef.current = false;
    setSaveStatus("saved");
  } catch (e) {
    console.error("[Canvas] Save failed:", e);
    setSaveStatus("error");
  }
}, []);
```

- [ ] **Step 3: Update `beaconSave` — add guard + switch to id-based URL**

Find `beaconSave` (line ~372). Replace the function body with:
```ts
const beaconSave = useCallback(() => {
  if (isSwitchingSessionRef.current) return;
  if (!userIdRef.current || !activeSessionIdRef.current) return;
  if (nodesRef.current.length === 0) return;
  const serializedNodes = serializeNodes(nodesRef.current);
  const snapshot = JSON.stringify({ n: serializedNodes, e: edgesRef.current, d: drawPathsRef.current });
  if (snapshot === lastSavedJsonRef.current) return;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/canvas_states?on_conflict=id`;
  const body = JSON.stringify({
    id: activeSessionIdRef.current,
    client_id: clientIdRef.current,
    user_id: userIdRef.current,
    nodes: serializedNodes,
    edges: edgesRef.current,
    draw_paths: drawPathsRef.current,
    updated_at: new Date().toISOString(),
  });
  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  try {
    fetch(url, { method: "POST", headers, body, keepalive: true });
  } catch {
    // last resort — nothing more we can do
  }
}, []);
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 5: Commit**
```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat: route canvas saves through session id, add switching guard"
```

---

### Task 4: Session-Aware Canvas Load

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

**Context:** The current `loadCanvas` effect queries a single row by `client_id + user_id`. It must now: (1) load all sessions sorted by `updated_at DESC`, (2) find the `is_active = true` session, (3) store its `id` in `activeSessionIdRef`, (4) create a fresh blank session if none exists. It also populates the sessions sidebar list.

- [ ] **Step 1: Add sessions state near the top of `CanvasInner`**

After `const [draftScriptId, setDraftScriptId] = useState<string | null>(null);`, add:
```ts
// NOTE: SessionItem is defined here temporarily. Task 6 (Step 1) will remove this local
// definition and import the exported type from SessionSidebar.tsx instead.
interface SessionItem {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}
const [sessions, setSessions] = useState<SessionItem[]>([]);
const [sidebarCollapsed, setSidebarCollapsed] = useState(typeof window !== "undefined" && window.innerWidth < 768);
// activeSessionId React state mirrors activeSessionIdRef so the sidebar re-renders on switch
const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
```

- [ ] **Step 2: Add `loadSessions` helper**

Add after the refs block, before `handleFormatChange`. This must be defined BEFORE the `loadCanvas` effect so that `loadCanvas` can call it:
```ts
const loadSessions = useCallback(async () => {
  if (!userIdRef.current) return;
  const { data } = await supabase
    .from("canvas_states")
    .select("id, name, is_active, updated_at")
    .eq("client_id", selectedClient.id)
    .eq("user_id", userIdRef.current)
    .order("updated_at", { ascending: false });
  if (data) setSessions(data as SessionItem[]);
}, [selectedClient.id]);
```

- [ ] **Step 3: Replace `loadCanvas` body inside the effect**

Find the `loadCanvas` async function inside the `useEffect` (line ~247). Replace its body with:
```ts
const loadCanvas = async () => {
  const userId = userIdRef.current;
  if (!userId) {
    setNodes([makeAiNode()]);
    setLoaded(true);
    return;
  }
  try {
    // Fetch all sessions for this client+user, newest first
    const { data: allSessions } = await supabase
      .from("canvas_states")
      .select("id, name, is_active, updated_at, nodes, edges, draw_paths")
      .eq("client_id", selectedClient.id)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    // Only consider explicitly active sessions. If none is active, create a new blank one.
    // Do NOT silently fall back to allSessions[0] — that would leave is_active=false on the row,
    // causing saveCanvas to write to a session the DB doesn't recognise as active.
    const active = allSessions?.find(s => s.is_active) ?? null;

    if (active) {
      // Store session id for all future saves
      activeSessionIdRef.current = active.id;
      setActiveSessionId(active.id);

      if (Array.isArray(active.nodes) && active.nodes.length > 0) {
        const restoredNodes = attachCallbacks(active.nodes as Node[]);
        if (!restoredNodes.some(n => n.id === AI_NODE_ID)) restoredNodes.push(makeAiNode());
        setNodes(restoredNodes);
        setEdges((active.edges as Edge[]) || []);
        if (Array.isArray(active.draw_paths)) setDrawPaths(active.draw_paths as DrawPath[]);
      } else {
        setNodes([makeAiNode()]);
      }
    } else {
      // No active session — create a fresh blank one (is_active: true required by partial unique index)
      const { data: newSession } = await supabase
        .from("canvas_states")
        .insert({
          client_id: selectedClient.id,
          user_id: userId,
          nodes: [],
          edges: [],
          draw_paths: [],
          name: "New chat",
          is_active: true,
        })
        .select("id")
        .single();
      if (newSession) {
        activeSessionIdRef.current = newSession.id;
        setActiveSessionId(newSession.id);
      }
      setNodes([makeAiNode()]);
    }

    // Single source of truth for the sessions sidebar list — avoids duplicate setSessions logic
    await loadSessions();
  } catch {
    setNodes([makeAiNode()]);
  }
  setLoaded(true);

  // Remix injection (unchanged logic)
  if (remixVideo?.url && !remixInjectedRef.current) {
    remixInjectedRef.current = true;
    const nodeId = `videoNode_remix_${Date.now()}`;
    const position = getInitialPosition(0);
    const remixNode: Node = {
      id: nodeId,
      type: "videoNode",
      position,
      width: 240,
      data: {
        url: remixVideo.url,
        autoTranscribe: true,
        channel_username: remixVideo.channel_username,
        caption: remixVideo.caption ?? undefined,
        authToken,
        clientId: selectedClient.id,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () =>
          setNodes(ns => ns.filter(n => n.id !== nodeId)),
      },
    };
    setNodes(prev => [...prev, remixNode]);
  }
};
```

- [ ] **Step 5: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 6: Manual smoke test**

Open canvas for a client. Open browser devtools → Network tab. Verify:
- Canvas loads without error
- The `canvas_states` GET query uses `is_active=eq.true` filtering (or fetches all and finds active)
- `activeSessionIdRef` is populated (add `console.log` temporarily)
- Canvas renders AI node correctly

- [ ] **Step 7: Commit**
```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat: session-aware canvas load with multi-session support"
```

---

## Chunk 3: Sidebar Component + Wire-Up + Toolbar Offset

### Task 5: Build SessionSidebar Component

**Files:**
- Create: `src/components/canvas/SessionSidebar.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";

export interface SessionItem {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}

interface Props {
  sessions: SessionItem[];
  activeSessionId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onSwitch: (session: SessionItem) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onSwitch,
  onRename,
  onDelete,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleRenameSave = (id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  return (
    // Outer wrapper: no overflow-hidden → toggle button stays visible when sidebar is collapsed
    <div className="relative flex-shrink-0 flex">

      {/* Collapsible panel — overflow:hidden clips the content but NOT the toggle */}
      <div
        className="flex flex-col border-r border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-200 overflow-hidden"
        style={{ width: collapsed ? 0 : 220 }}
      >
        {/* Inner content — minWidth prevents layout reflow during width animation */}
        <div className="flex flex-col h-full p-2 gap-1" style={{ minWidth: 220 }}>

          {/* New chat button — mt-10 clears space for the toggle button at top-12 */}
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted/50 transition-colors border border-border/50 mt-10"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            New chat
          </button>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto mt-1 space-y-0.5">
            {sessions.map(session => {
              const isActive = session.id === activeSessionId;
              const isRenaming = renamingId === session.id;
              const isConfirming = confirmDeleteId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group relative flex items-start px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                  onClick={!isRenaming && !isConfirming ? () => onSwitch(session) : undefined}
                >
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="flex-1 text-sm bg-transparent border-b border-primary outline-none py-0.5 w-full"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenameSave(session.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => handleRenameSave(session.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : isConfirming ? (
                    <div className="flex-1 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                      <span className="text-[11px] text-red-400 font-medium">Delete this chat?</span>
                      <div className="flex gap-1">
                        <button
                          className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          onClick={() => { onDelete(session.id); setConfirmDeleteId(null); }}
                        >
                          Delete
                        </button>
                        <button
                          className="text-[10px] px-2 py-0.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate leading-snug">{session.name}</div>
                        <div className="text-[10px] text-muted-foreground/60 leading-snug">
                          {relativeTime(session.updated_at)}
                        </div>
                      </div>
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1 flex-shrink-0">
                        <button
                          className="p-1 rounded hover:bg-muted/50 transition-colors"
                          title="Rename"
                          onClick={e => {
                            e.stopPropagation();
                            setRenamingId(session.id);
                            setRenameValue(session.name);
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Delete"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteId(session.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>   {/* end session list */}

        </div>   {/* end inner content */}
      </div>   {/* end collapsible panel */}

      {/* Toggle button — sibling of collapsible panel, never clipped */}
      <button
        className="absolute -right-3 top-12 z-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md"
        onClick={onToggleCollapsed}
        title={collapsed ? "Open sessions" : "Close sessions"}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

    </div>   {/* end outer wrapper */}
  );
}
```

- [ ] **Step 2: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors in `SessionSidebar.tsx`.

- [ ] **Step 3: Commit**
```bash
git add src/components/canvas/SessionSidebar.tsx
git commit -m "feat: add SessionSidebar component with new-chat, rename, delete"
```

---

### Task 6: Wire Sidebar into SuperPlanningCanvas

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

- [ ] **Step 1: Import SessionSidebar**

At the top of `SuperPlanningCanvas.tsx`, add the import after the existing canvas imports:
```ts
import SessionSidebar, { type SessionItem } from "@/components/canvas/SessionSidebar";
```

Also ensure `SessionItem` type is defined locally or imported — use the exported `SessionItem` from the component file. Remove the local `SessionItem` interface if added in Task 4 and use the import instead.

- [ ] **Step 2: Add session CRUD handlers (after `loadSessions`, before `handleFormatChange`)**

```ts
/** Create a brand new blank session, deactivate the current one */
const newChat = useCallback(async () => {
  if (!userIdRef.current) return;
  isSwitchingSessionRef.current = true;
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  try {
    // Deactivate previous session first (required by partial unique index)
    const prevId = activeSessionIdRef.current;
    if (prevId) {
      await supabase.from("canvas_states").update({ is_active: false }).eq("id", prevId);
    }

    // Insert new blank session
    const { data: newSession } = await supabase
      .from("canvas_states")
      .insert({
        client_id: selectedClient.id,
        user_id: userIdRef.current,
        nodes: [],
        edges: [],
        draw_paths: [],
        name: "New chat",
        is_active: true,
      })
      .select("id")
      .single();

    if (newSession) {
      activeSessionIdRef.current = newSession.id;
      setActiveSessionId(newSession.id);
      lastSavedJsonRef.current = "";
      setNodes([makeAiNode()]);
      setEdges([]);
      setDrawPaths([]);
      await loadSessions();
    }
  } finally {
    // Always unblock saves, even if an error occurred
    isSwitchingSessionRef.current = false;
  }
}, [selectedClient.id, loadSessions]);

/** Switch to an existing session */
const switchSession = useCallback(async (session: SessionItem) => {
  if (session.id === activeSessionIdRef.current) return;
  isSwitchingSessionRef.current = true;
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  try {
    // Deactivate previous first, then activate new (partial index constraint)
    const prevId = activeSessionIdRef.current;
    if (prevId) {
      await supabase.from("canvas_states").update({ is_active: false }).eq("id", prevId);
    }
    await supabase.from("canvas_states").update({ is_active: true }).eq("id", session.id);

    // Load canvas data BEFORE updating the active session ref.
    // This ensures that if the fetch fails, saveCanvas still writes to the previous session
    // (via the old ref value) rather than corrupting the new session with stale node data.
    const { data } = await supabase
      .from("canvas_states")
      .select("nodes, edges, draw_paths")
      .eq("id", session.id)
      .single();

    // Only commit the session switch after we have confirmed the data loaded
    activeSessionIdRef.current = session.id;
    setActiveSessionId(session.id);

    if (data) {
      const restoredNodes = attachCallbacks((data.nodes as Node[]) || []);
      if (!restoredNodes.some(n => n.id === AI_NODE_ID)) restoredNodes.push(makeAiNode());
      lastSavedJsonRef.current = "";
      setNodes(restoredNodes);
      setEdges((data.edges as Edge[]) || []);
      setDrawPaths(Array.isArray((data as any).draw_paths) ? (data as any).draw_paths : []);
    }

    await loadSessions();
  } finally {
    // Always unblock saves, even if an error occurred
    isSwitchingSessionRef.current = false;
  }
}, [loadSessions, attachCallbacks]);

/** Rename a session inline */
const renameSession = useCallback(async (id: string, name: string) => {
  await supabase.from("canvas_states").update({ name }).eq("id", id);
  setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
}, []);

/** Delete a session; if it was active, switch to the next most recent or create fresh.
 *  Queries DB for remaining sessions rather than closing over React state to avoid staleness. */
const deleteSession = useCallback(async (id: string) => {
  const wasActive = id === activeSessionIdRef.current;
  await supabase.from("canvas_states").delete().eq("id", id);

  if (wasActive) {
    // Fetch fresh remaining sessions from DB — do not rely on stale React state closure
    const { data: remaining } = await supabase
      .from("canvas_states")
      .select("id, name, is_active, updated_at")
      .eq("client_id", clientIdRef.current)
      .eq("user_id", userIdRef.current!)
      .order("updated_at", { ascending: false });
    const list = remaining || [];
    if (list.length > 0) {
      await switchSession(list[0] as SessionItem);
    } else {
      await newChat();
    }
  } else {
    setSessions(prev => prev.filter(s => s.id !== id));
  }
}, [switchSession, newChat]);
```

- [ ] **Step 3: Render the sidebar in JSX**

Find the return statement of `CanvasInner`. The outermost `<div>` is:
```tsx
<div className="flex h-full overflow-hidden" style={{ ... }}>
  <div className="flex-1 relative min-w-0" style={{ ... }}>
    ...
  </div>
  <CanvasTutorial ... />
</div>
```

Change the outermost `<div>` to include the sidebar before the canvas `<div>`.

**Important:** Pass `activeSessionId` (the React state added in Task 4, Step 1) — NOT `activeSessionIdRef.current` — so the sidebar re-renders when the active session changes.

```tsx
<div className="flex h-full overflow-hidden" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
  {/* Session Sidebar */}
  <SessionSidebar
    sessions={sessions}
    activeSessionId={activeSessionId}          {/* React state, NOT activeSessionIdRef.current */}
    collapsed={sidebarCollapsed}
    onToggleCollapsed={() => setSidebarCollapsed(c => !c)}
    onNewChat={newChat}
    onSwitch={switchSession}
    onRename={renameSession}
    onDelete={deleteSession}
  />

  {/* Canvas area */}
  <div className="flex-1 relative min-w-0" style={{ background: theme === "light" ? "hsl(220 5% 96%)" : "#06090c" }}>
    <CanvasToolbar
      ...
      sidebarOffset={sidebarCollapsed ? 0 : 220}
    />
    ...
  </div>

  <CanvasTutorial open={showTutorial} onClose={() => setShowTutorial(false)} />
</div>
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Manual verification**

Open canvas. Verify:
1. Sidebar is visible on the left (220px wide)
2. "New chat" button creates a blank canvas — previous nodes gone, AI node present
3. The previous session appears in the list
4. Clicking the previous session restores its nodes and edges
5. Rename works: click pencil → type new name → Enter → name updates in list
6. Delete with confirm: click trash → confirm buttons appear → click Delete → session removed
7. Sidebar collapse button works

- [ ] **Step 6: Commit**
```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat: wire session sidebar into canvas with new-chat, switch, rename, delete"
```

---

### Task 7: CanvasToolbar Sidebar Offset

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx`

**Context:** The back button uses `absolute left-3`. When the sidebar is 220px wide, this must shift right to avoid overlapping the sidebar edge.

- [ ] **Step 1: Add `sidebarOffset` to Props interface**

Find the `Props` interface in `CanvasToolbar.tsx` (line ~4). Add:
```ts
sidebarOffset?: number;
```

- [ ] **Step 2: Use `sidebarOffset` in the back button div**

Find:
```tsx
<div className="absolute left-3 pointer-events-auto flex items-center gap-2">
```

Replace with:
```tsx
<div
  className="absolute pointer-events-auto flex items-center gap-2 transition-all duration-200"
  style={{ left: (sidebarOffset ?? 0) + 12 }}
>
```

- [ ] **Step 3: Update the function signature to accept the new prop**

```tsx
export default function CanvasToolbar({
  onAddNode, onBack, onZoomIn, onZoomOut, onShowTutorial, onOpenViralPicker,
  drawingMode, onToggleDrawing, onClearDrawing, drawColor, onDrawColorChange,
  saveStatus, sidebarOffset,
}: Props) {
```

- [ ] **Step 4: TypeScript check**
```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Manual verification**

Open canvas with sidebar visible. Verify back button is at the right edge of the sidebar (not overlapping). Toggle sidebar collapse — verify back button animates left to `left: 12px`.

- [ ] **Step 6: Commit**
```bash
git add src/components/canvas/CanvasToolbar.tsx
git commit -m "feat: offset toolbar back button when session sidebar is open"
```

---

### Task 8: Build and Deploy

- [ ] **Step 1: Build on VPS**
```bash
ssh root@72.62.200.145 "cd /var/www/connectacreators && npm run build 2>&1 | tail -20"
```
Expected: build succeeds, no TypeScript errors in output.

- [ ] **Step 2: Reload nginx**
```bash
ssh root@72.62.200.145 "nginx -s reload"
```

- [ ] **Step 3: Full end-to-end verification**

On production, open canvas for a real client:
1. Existing canvas state loads correctly (old single session migrated)
2. New chat creates a fresh session visible in sidebar
3. Switching sessions restores node layout and AI chat history
4. Saving a script stays on canvas — no navigation
5. Sidebar collapse/expand works on mobile
6. Rename and delete work
7. On tab close/reload, canvas state is preserved (beacon save still works)

- [ ] **Step 4: Final commit if any small fixes**
```bash
git add -A
git commit -m "fix: post-deploy cleanup for canvas session history"
```
