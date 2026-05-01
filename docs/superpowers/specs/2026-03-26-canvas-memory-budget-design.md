# Canvas Memory Budget — Design Spec

**Date**: 2026-03-26
**Problem**: SuperPlanningCanvas crashes due to memory exhaustion after extended AI chat sessions and during idle periods.
**Approach**: Memory Budget (Approach B) — cap accumulation, truncate context, idle-aware auto-save, windowed message rendering.

---

## Root Cause

Two compounding issues:

1. **Chat messages grow unbounded** — every AI turn adds 1-2MB to React state (context string + response + optional base64 image). After 20+ turns: 30-50MB in message arrays alone.
2. **Auto-save fires every 30s even when idle** — serializes ALL nodes (including bloated messages) into a 2-5MB JSON string. GC can't reclaim fast enough, browser OOMs within 2-3 minutes of inactivity.

---

## Fix 1: Message Cap & Trim

**Files**: `src/components/canvas/CanvasAIPanel.tsx`, `src/components/canvas/AIAssistantNode.tsx`

### CanvasAIPanel.tsx

- Add `MAX_MESSAGES = 50` constant.
- Every time a message is appended, trim from the front: `msgs.slice(-MAX_MESSAGES)`.
- The API call already slices to 20 messages for context (line 307) — backend unaffected.
- The `onMessagesChange` callback to parent (which persists to DB) also caps at 50.
- **In-memory state is the source of truth for display; DB keeps full history.** Messages trimmed from state are already persisted in DB. On reload, only the last 50 are loaded into state.
- **Base64 image handling**: Use a `blobUrlCacheRef = useRef(new Map<number, string>())` to convert `image_b64` to blob URLs at render time via a `useMemo`. The base64 string stays in the message object (already stripped for DB persistence by `stripImagesForPersistence`). On component unmount, revoke all blob URLs in the map. This avoids mutating message state while keeping ~1.3MB per image out of the DOM.

### AIAssistantNode.tsx

- `messages` and `activeMessages` state both capped at 50.
- localStorage writes already strip images (good) but also cap at 50: `stripImagesForPersistence(msgs).slice(-50)`.

---

## Fix 2: Context String Truncation

**Files**: `src/components/canvas/CanvasAIPanel.tsx`, `src/pages/SuperPlanningCanvas.tsx`

### CanvasAIPanel.tsx (contextSummary builder, lines 381-462)

- Add `MAX_CONTEXT_CHARS = 8000` constant.
- Budgeted sections get explicit char limits:
  - Text notes: 2000 chars
  - Transcriptions: 3000 chars (truncate each to `3000 / count`)
  - Video analyses: 1500 chars
  - Competitor profiles: 1500 chars (limit to top 5 posts per profile by outlier score)
- Unbudgeted sections (`connected_nodes`, `primary_topic`, `selected_hook`, `brand_guide`, `selected_cta`, `structures`, `research_facts`, `media_files`) are included as-is but covered by the final hard cap.
- Each budgeted section truncated with `section.slice(0, budget)` + `"...(truncated)"` suffix.
- Final `contextSummary` hard-capped at 8000 chars as safety net for all sections combined.
- Drops per-message payload from 1-2MB to ~8KB.

### SuperPlanningCanvas.tsx (canvasContext useMemo, lines 729-856)

- Same budgets applied at the source:
  - Competitor profiles limited to top 5 posts per profile.
  - Visual segments limited to first 20 per video.
- Smaller useMemo output means auto-save serializes less data too.

---

## Fix 3: Idle-Aware Auto-Save

**File**: `src/pages/SuperPlanningCanvas.tsx` (lines 694-700)

- Add `lastActivityRef = useRef(Date.now())` that updates on explicit user interactions only (mouse/keyboard within the canvas), NOT on programmatic `setNodes` calls (e.g., transcription finishing in background).
- **Both save paths get the idle check**:
  - The 30-second periodic save (lines 694-700): `if (Date.now() - lastActivityRef.current > 60_000) return`
  - The 2-second debounced save (lines 681-691): same idle guard applied
- When user returns (any interaction), immediately trigger one save if `isDirtyRef.current` is true.
- **Key fix**: `saveCanvas` already checks `isDirtyRef.current` but still serializes to compare JSON. Add early bail: if not dirty, don't serialize. Prevents 2-5MB temp string creation every 30s during idle.

---

## Fix 4: Message List Windowing (Infinite Scroll)

**File**: `src/components/canvas/CanvasAIPanel.tsx`

- Currently renders ALL messages in a scrollable div — every message is a DOM node even if off-screen.
- Replace with infinite-scroll windowing (like ChatGPT/Claude):
  - `visibleCount` state starts at `DEFAULT_WINDOW = 15`.
  - Render `messages.slice(-visibleCount)` — only the most recent N messages.
  - Attach an `IntersectionObserver` to a sentinel `<div>` at the top of the message list.
  - When user scrolls to the top and the sentinel becomes visible, increment `visibleCount` by 15 (load older messages).
  - Preserve scroll position after loading older messages: capture `scrollTop` and `scrollHeight` before update, restore offset after render via `useLayoutEffect`.
  - Show a small spinner at the top while loading (brief, since data is already in memory — just expanding the slice).
  - If `visibleCount >= messages.length`, hide the sentinel (no more messages to load).
- **Reset on new message**: When a new message is appended (user or assistant), reset `visibleCount` back to `DEFAULT_WINDOW` (15) and scroll to bottom. Prevents DOM bloat after scrolling up then continuing to chat.
- No external library needed. Keeps DOM light (~15-30 nodes) regardless of message count in state.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/components/canvas/CanvasAIPanel.tsx` | Message cap, base64→blob, context truncation, message windowing |
| `src/components/canvas/AIAssistantNode.tsx` | Message cap for state + localStorage |
| `src/pages/SuperPlanningCanvas.tsx` | Context budget in useMemo, idle-aware auto-save |

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Message state size (50 turns) | 50-200MB | ~5MB (capped at 50, no base64) |
| Context string per send | 1-2MB | ~8KB |
| Auto-save during idle | 2-5MB every 30s | 0 (paused) |
| DOM nodes for messages | All messages | Last 15 visible |
| Time to crash (idle) | 2-3 minutes | Should not crash |

---

## Testing

1. Open canvas with 10+ nodes, chat 30+ turns — page should stay responsive.
2. Leave page idle for 5+ minutes — no crash.
3. Generate 3+ DALL-E images — memory stays stable after images render.
4. Switch between chat sessions — no memory spike.
5. Reload page — all messages persisted correctly (capped at 50).
6. Infinite scroll: load 50 messages, scroll to top twice to load older batches, verify they appear. Then send a new message — verify window resets to 15 and scrolls to bottom.
7. Context truncation: connect 10+ competitor profiles with many posts, verify `contextSummary` stays under 8000 chars (check console log).
8. Idle resume: leave page idle 2+ min, then interact — verify one catch-up save fires immediately.
