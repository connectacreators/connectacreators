# Canvas Session History — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Problem

1. **Canvas is wiped on script save.** Saving a script resets the canvas state, destroying the AI chat history and all node progress.
2. **No session history.** There is only one canvas slot per client (`UNIQUE(client_id, user_id)`), so there is no way to go back to a previous AI conversation or planning session.

---

## Scope

- `supabase/migrations/` — extend `canvas_states` table
- `src/pages/SuperPlanningCanvas.tsx` — session switcher sidebar + save script fix
- `src/components/canvas/CanvasToolbar.tsx` — minor layout adjustment for sidebar

No new edge functions. No changes to AI chat internals or node types.

---

## Design

### 1. Data Model

**Drop** the `UNIQUE(client_id, user_id)` constraint on `canvas_states`. Replace it with:

```sql
-- At most one active session per client+user
CREATE UNIQUE INDEX canvas_states_one_active
  ON canvas_states(client_id, user_id)
  WHERE is_active = true;
```

**Add two columns:**

```sql
ALTER TABLE canvas_states
  ADD COLUMN name TEXT NOT NULL DEFAULT 'New chat',
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
```

**Migration is safe for existing rows:** existing rows get `name = 'New chat'` and `is_active = true`. Since each existing row is already unique per client+user, the new partial unique index is satisfied automatically.

The `id` primary key becomes the session identifier. The `updated_at` column (already present) serves as last-modified timestamp for display.

---

### 2. Session Sidebar UI

A collapsible left sidebar sits alongside the React Flow canvas.

**Layout:**
- Sidebar width: 220px when open, 0px when collapsed
- Canvas area fills remaining width (`flex-1`)
- Collapse/expand toggle button (`«` / `»`) on the right edge of the sidebar
- Sidebar collapses by default on screens < 768px

**Sidebar contents (top to bottom):**
1. **"New chat" button** — full width, at the top. Creates a new session: inserts a new `canvas_states` row with blank `nodes/edges`, sets it `is_active = true`, sets all other sessions for this client+user to `is_active = false`. Canvas clears to blank.
2. **Session list** — scrollable. Each item shows:
   - Session name (truncated at ~22 chars with ellipsis)
   - Relative timestamp ("today", "2 days ago", "Mar 15")
   - Active session: highlighted background (primary/10 bg, primary text)
   - On hover: pencil (rename) icon + trash (delete) icon appear on the right
3. **Rename:** clicking the pencil opens an inline text input replacing the name. Enter or blur saves. Updates `canvas_states.name` for that row.
4. **Delete:** clicking trash shows a confirm dialog ("Delete this chat? This cannot be undone."). On confirm: deletes the row. If the deleted session was active, automatically activate the most recent other session. If no sessions remain, create a fresh blank one and activate it.

**Switching sessions:**
1. Set clicked session `is_active = true`
2. Set previous active session `is_active = false`
3. Load the clicked session's `nodes`, `edges`, `draw_paths` into canvas

Session list is sorted by `updated_at DESC` (most recently modified at top), matching ChatGPT's behavior.

---

### 3. Save Script Fix

The canvas reset that occurs on script save must be removed. Saving a script:
- Saves the script content to the scripts table (unchanged behavior)
- Shows a success toast (unchanged)
- Does **nothing** to `canvas_states` — no node clearing, no session reset, no canvas modification

The AI chat, nodes, and edges remain exactly as-is after a script is saved.

---

### 4. Session Auto-naming

New sessions are created with `name = 'New chat'`. The user can rename at any time via the inline pencil edit in the sidebar. There is no auto-generated name from AI content — keeping it simple.

---

## Data Flow

```
User opens canvas for a client
  → Load active session (WHERE client_id = X AND user_id = Y AND is_active = true)
  → If none: create a new session, insert as active

User clicks "New chat"
  → INSERT new canvas_states row (blank nodes/edges, is_active=true, name='New chat')
  → UPDATE previous active row SET is_active=false
  → Canvas clears

User clicks a past session in sidebar
  → UPDATE clicked row SET is_active=true
  → UPDATE previous active row SET is_active=false
  → Load nodes/edges from clicked row into canvas

User saves a script
  → Script saved to scripts table
  → Canvas state: untouched

User renames session
  → UPDATE canvas_states SET name=$1 WHERE id=$2

User deletes session
  → DELETE FROM canvas_states WHERE id=$1
  → If was active: activate most recent remaining, or insert fresh blank
```

---

## What Is Not Changed

- AI chat message format inside nodes — unchanged
- Node types, canvas toolbar controls — unchanged
- Auto-save logic (still saves every 800ms on change + 30s interval) — unchanged, now saves to the active session's row by `id` instead of by `client_id+user_id`
- RLS policies — still user-owns-their-rows (no change needed since filtering by `user_id` covers all sessions)
