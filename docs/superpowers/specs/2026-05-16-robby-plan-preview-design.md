# Robby Plan-Preview & Multi-Target Reliability — Design

**Date:** 2026-05-16
**Status:** Approved (architecture-level)
**Scope:** Make `propose_plan` reliable on multi-target asks, preview affected rows before approval, navigate from /ai to the target page when a plan touches a specific list.

> Companion audit doc (Robby tool-coverage backlog) lives in a separate spec — not in this design.

---

## Problem

User asks Robby to act on multiple rows at once (e.g. "trash these videos: A, B, C" on the editing queue). Today:
1. The model returns an empty turn → the user sees the fallback `"Let me try again — could you rephrase that?"`.
2. The `highlight_items` action fires only *during* the bulk-tool execution (after approval), not when the plan card is shown.
3. When the user is on `/ai`, navigation to the target page is *suppressed* (`isOnAiSurface`) so they can't see what Robby is about to touch.

All three are bugs in an otherwise existing flow. Infrastructure (`propose_plan` tool, `plan_proposal` card, `highlight_items` listener, page subscribers in EditingQueue / MasterEditingQueue) is already wired end-to-end.

## Goal

A user asking "trash these 3 videos" from either the editing queue or `/ai` sees:
- the page (`/editing-queue` or `/clients/<id>/editing-queue`) navigated into if not already there;
- the 3 target rows pulsing with an aqua selection ring;
- a plan card with Approve / Cancel;
- on Approve: rows mutate, highlight clears, card collapses.

## Non-Goals

- No new tool, no new DB schema, no new route.
- No partial-approval / checkbox-per-target UI (YAGNI for now).
- No tool-coverage audit — that's a parallel spec.

---

## Architecture: 3 Levers

### Lever 1 — Reliability (backend)

The model bails because the prompt's "BANNED PHRASES" rules combined with strict title-matching make multi-target asks high-anxiety: the model would rather return empty than risk a banned text reply.

Two-part fix:

- **Prompt addition** (`supabase/functions/companion-chat/index.ts`): explicit worked-example block right after the existing "TRIGGER PATTERNS" rule. Shows "user: trash these 3 videos: A, B, C" → "you: call `propose_plan({ summary, steps, target_item_titles: [A, B, C] })` immediately, return empty text."

- **Server-side safety net** (`supabase/functions/companion-chat/index.ts` around the `reply` assignment at L1882): if turn-1 returns empty *and* the user message matches a multi-target intent regex (`/(trash|delete|mark|set|move|reschedule|publish|schedule)\b.*?(\b(these|all|every)\b|:)/i`), make one forced retry with `tool_choice: { type: "tool", name: "propose_plan" }`. If that also returns empty, replace the silent rephrase fallback with a more useful clarifying line: `"I want to make sure I get the right videos — can you list them by exact title (one per line)?"`.

### Lever 2 — Highlight visual (frontend)

Today's highlight is opacity pulse — barely readable on cream + ink rows. Replace with editorial sticker selection:
- 1px aqua ring (#8FD0D5) above the row
- 8% aqua tint background
- 1.6s pulse loop on the ring (opacity 0.6 → 1.0 → 0.6)
- Clears on `ai:data-changed` (already wired) and after 60s (already wired)

Changes: `src/pages/EditingQueue.tsx` row style for `previewIds` membership. Mirror in `src/pages/MasterEditingQueue.tsx`.

### Lever 3 — /ai → page handoff (backend)

`tools/plans.ts` resolves `target_item_titles` and emits `highlight_items` with a `scope` (e.g. `editing_queue`). When the user is on `/ai` (caller passes `current_path`), prepend a `navigate` action to the appropriate page *before* the `plan_proposal` / `highlight_items` actions.

Scope-to-route map (lives in `tools/plans.ts`):

```ts
const SCOPE_TO_ROUTE: Record<string, string> = {
  editing_queue: "/editing-queue",
  leads: "/leads",
  scripts: "/scripts",
  content_calendar: "/content-calendar",
};
```

When `current_path === "/ai"` and a route is resolvable, prepend `{ type: "navigate", path }`. Frontend processes actions in order so the page navigates first, then the highlight fires, then the plan card renders.

The drawer (CompanionBubble overlay) does NOT navigate — it just rides along on whatever page the user is on.

---

## Data Flow

```
user message (current_path=/ai)
  ↓
companion-chat
  ├─ turn 1: model → propose_plan tool call
  │           OR empty → forced retry (tool_choice=propose_plan)
  ↓
tools/plans.ts
  ├─ resolves target_item_titles → item_ids
  ├─ emits actions in order:
  │   [0] navigate (if on /ai and scope→route resolves)
  │   [1] highlight_items (scope + item_ids)
  │   [2] plan_proposal (plan_id, summary, steps)
  ↓
frontend (CompanionDrawer or CommandCenter)
  ├─ navigate → useNavigate(path)
  ├─ highlight_items → window.dispatchEvent("ai:highlight-items")
  └─ plan_proposal → append synthetic chat message with PlanCard
  ↓
page (EditingQueue subscribes)
  └─ previewIds = new Set(item_ids) → pulse rings on those rows
  ↓
user clicks Approve → confirm_plan → bulk_set_lifecycle_status → rows mutate
  └─ ai:data-changed clears previewIds → highlight removed
```

## Components Affected

- `supabase/functions/companion-chat/index.ts` — prompt addition, forced-retry block, clarifying-question fallback
- `supabase/functions/companion-chat/tools/plans.ts` — scope→route map, prepend navigate action
- `src/pages/EditingQueue.tsx` — replace opacity pulse with aqua-ring sticker
- `src/pages/MasterEditingQueue.tsx` — same row style change

## Error Handling

- Title-match misses → existing fuzzy match in `tools/plans.ts` stays; if 0 items match, plan still proposes but with `highlight_items: []` so no rows pulse.
- Navigate path unknown → skip the navigate action, render card on /ai with title list.
- Forced retry exhausts → clarifying question to user; don't pretend to plan.

## Testing

Manual:
1. From /ai: "mark scripts published, episode 1, episode 2, episode 3" → page navigates to editing queue, 3 rows pulse, plan card shows.
2. From editing queue: same ask → no navigation, 3 rows pulse, plan card.
3. Ambiguous ask (no list verb) → no forced retry, model handles normally.
4. Approve → rows mutate, highlight clears.
5. Cancel → highlight clears, no mutation.
