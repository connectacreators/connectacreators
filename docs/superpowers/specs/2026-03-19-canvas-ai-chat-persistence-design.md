# Canvas AI Chat Persistence — Design Spec

**Date:** 2026-03-19
**Status:** Approved

---

## Problem

Every time a user leaves the Super Planning Canvas page and returns, their AI assistant chat history is gone. They are shown a blank chat instead of their previous conversation.

---

## Root Cause

The `canvas_ai_chats` Supabase table has **never been applied to production**. The migration file (`supabase/migrations/20260319_canvas_ai_chats.sql`) is untracked in git — it was created but never run. Because the table doesn't exist:

1. `AIAssistantNode`'s on-mount query returns null → no chats found
2. Auto-create fires and creates a new empty chat row every visit
3. Any saves fail silently (no row to PATCH)
4. Result: blank chat on every return

The frontend persistence code in `AIAssistantNode.tsx` is correct and complete (load on mount, debounced save, beacon save on unmount). It just has no table to work with.

**Secondary issue:** Before chats load from DB, `CanvasAIPanel` renders immediately with `key="no-chat"` and empty `initialMessages`, causing a visible flash of the empty "What are we doing today?" state — which users mistake for their chat being gone.

---

## Solution

### Fix 1 — Apply the migration (primary fix)

Run the SQL from `supabase/migrations/20260319_canvas_ai_chats.sql` in the Supabase Dashboard SQL Editor.

```sql
CREATE TABLE IF NOT EXISTS canvas_ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'New Chat',
  messages JSONB NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_ai_chats_user_client
  ON canvas_ai_chats(user_id, client_id, node_id);

ALTER TABLE canvas_ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_ai_chats_own" ON canvas_ai_chats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "canvas_ai_chats_admin" ON canvas_ai_chats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Fix 2 — Loading state in AIAssistantNode (secondary fix)

**File:** `src/components/canvas/AIAssistantNode.tsx`

**Current behavior:** CanvasAIPanel renders immediately with `key="no-chat"` and empty `initialMessages`. User sees empty chat. DB loads (~200–500ms later). If chats exist, `key` changes to real UUID and CanvasAIPanel remounts with real messages. But the flash of empty state looks like "chat gone."

**Fix:** Block CanvasAIPanel render with a spinner until `chatsLoaded && activeChatId !== null`. Once `activeChatId` is a real UUID, render CanvasAIPanel with the correct messages — no flash.

```tsx
// BEFORE (line ~328-356):
{generatedScript ? (
  <ScriptOutputPanel ... />
) : (
  <CanvasAIPanel
    key={activeChatId ?? "no-chat"}
    initialMessages={activeMessages}
    ...
  />
)}

// AFTER:
{generatedScript ? (
  <ScriptOutputPanel ... />
) : (!chatsLoaded || !activeChatId) ? (
  <div className="flex items-center justify-center flex-1">
    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
  </div>
) : (
  <CanvasAIPanel
    key={activeChatId}
    initialMessages={activeMessages}
    ...
  />
)}
```

Note: `Loader2` is already imported from lucide-react in `CanvasAIPanel.tsx` — add it to the `AIAssistantNode.tsx` import.

---

## Data Flow (after fix)

```
User visits canvas page
  → AIAssistantNode mounts
  → chatsLoaded = false → shows spinner
  → DB query: SELECT * FROM canvas_ai_chats WHERE user_id=X AND client_id=Y AND node_id='ai-assistant' ORDER BY updated_at DESC
  → If rows: setChats, setActiveChatId(rows[0].id), setActiveMessages(rows[0].messages)
  → If no rows: auto-create → setActiveChatId(newId), setActiveMessages([])
  → chatsLoaded = true → spinner disappears
  → CanvasAIPanel renders with key=<real-uuid> and initialMessages=<real-messages>

User sends message
  → CanvasAIPanel updates messages state
  → onMessagesChange → handleMessagesChange → saveMessages (debounced 500ms)
  → persistMessages → supabase.update canvas_ai_chats SET messages=... WHERE id=<chatId>

User navigates away
  → AIAssistantNode cleanup fires
  → beacon save: fetch PATCH /rest/v1/canvas_ai_chats?id=eq.<chatId> with keepalive:true
  → Messages persisted to DB

User returns
  → cycle repeats from top, messages loaded from DB ✓
```

---

## Files Modified

| File | Change |
|------|--------|
| Supabase Dashboard | Apply migration SQL (one-time) |
| `src/components/canvas/AIAssistantNode.tsx` | Add loading spinner, gate CanvasAIPanel on `chatsLoaded && activeChatId` |

No changes needed to `CanvasAIPanel.tsx`, edge functions, or DB schema beyond the migration.

---

## Verification

1. Apply SQL migration in Supabase Dashboard
2. Build and deploy to VPS
3. Navigate to a client's canvas page (e.g., Dr Calvin's Clinic `/scripts`)
4. Send a message to the AI assistant
5. Navigate away (go to Clients, then come back)
6. Verify: previous chat message appears, not a blank chat
7. Create a new chat via the sidebar "New Chat" button — verify it's empty
8. Switch between chats — verify each shows the correct history
9. Test as admin user AND as a regular subscriber user (RLS)
