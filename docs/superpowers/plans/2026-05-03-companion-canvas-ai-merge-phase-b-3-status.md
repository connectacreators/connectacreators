# Phase B.3 Status — Companion ↔ Canvas AI Merge

**Date:** 2026-05-03
**Branch:** `companion-merge-phase-b-2` (rolled-up B.2 + B.3 work)
**Spec:** [2026-05-03-companion-canvas-ai-merge-design.md](../specs/2026-05-03-companion-canvas-ai-merge-design.md)
**Outline:** [2026-05-03-companion-canvas-ai-merge-phase-b-outline.md](2026-05-03-companion-canvas-ai-merge-phase-b-outline.md)

---

## What shipped

### Phase A (data foundation, applied to prod)
- `assistant_threads`, `assistant_messages`, `assistant_memories` tables
- Backfills: 130 canvas chats → threads, 87 companion messages → archive threads
- Edge-function dual-write in `companion-chat` and `ai-assistant` (streaming branch)

### Phase B.1 (extracted shared components)
6 commits, no behavior change visible to user:
- `AssistantThreadList`, `AssistantChat`, `AssistantTextInput`, `AssistantChipsBar`, `AssistantContextPanel`
- `CanvasAIPanel.tsx`: 2816 → 1820 lines
- `FullscreenAIView.tsx`: 1153 → 743 lines
- `SessionSidebar.tsx`: 163 → 90 lines (thin adapter)

### Phase B.2 (new UI surfaces, reads new tables)
- `useAssistantMode()` hook — URL → agency/client mode
- `CompanionDrawer.tsx` (447 LOC) — bubble drawer with tab strip (threads / chat / AI sees), reads `assistant_threads` + `assistant_messages`
- `CompanionBubble.tsx` simplified to open drawer (237 → 60 LOC)
- `CommandCenter.tsx` (`/ai` page) — three-panel layout (CHATS sidebar / chat / AI SEES) reading new tables; Tasks tab preserved

### Phase B.3 (cleanup + reconciliation)
- **Memory editor in Settings** (3c7573b): "What your assistant remembers" section grouping user-scope vs per-client memories with inline edit + two-step delete.
- **Reconciliation backfill** (`20260503_reconcile_canvas_streaming_gap.sql`): closed the streaming-only dual-write gap. Post-apply state: 130/130 canvas threads in sync, 1261 messages on both legacy and new tables, zero gaps.
- **Supabase types regen** (5773567): replaced stale `types.ts` (758 lines) with fresh schema (3169 lines), dropped all `(supabase as any)` casts in CompanionDrawer / CommandCenter / AssistantMemoryEditor. Net tsc error count: 741 → 170 (regen exposed pre-existing references to non-existent tables in unrelated files).

---

## Deliberately deferred

### Canvas chat read-path switch (`canvas_ai_chats.messages` → `assistant_messages`)
- **Why deferred:** The assistant_messages content shape (`{ type: 'text' | 'tool_use' | 'tool_result' | 'script_preview', ... }`) does not yet have lossless mappings for canvas-specific rich fields (`image_b64`, `script_data`, `meta`, `_imagePreview`). Switching the read path now would risk silent fidelity loss on image/script messages.
- **Impact for user:** Minimal — the drawer already shows the unified thread list (it reads `assistant_threads` and surfaces both drawer-origin and canvas-origin chats). Clicking a canvas-origin thread navigates to the canvas. The visual unification ("see the same chats from Robby and the super canvas") is in place.
- **Follow-up:** extend `MessageContent` discriminated union with `image` and `script_data` variants; update edge-function dual-writes to preserve them; then flip the canvas read path with confidence.

### Drop `companion_messages` legacy table
- **Why deferred:** Per the original Phase B.3 plan, keep dual-write running for ≥2 weeks, then drop. Tracked as cleanup; no code reads from it on the new branch.

### Non-streaming branch dual-write in `ai-assistant`
- **Why deferred:** Current dual-write fires only in the streaming branch. Non-streaming paths (rare, internal) don't hit `assistant_messages`. The reconciliation backfill closes the gap on demand and is idempotent (safe to re-run anytime).
- **Follow-up:** add the same `dualWriteCanvasTurn` call to the non-streaming branch in `ai-assistant/index.ts`, OR schedule the reconciliation as a nightly cron.

---

## Commit log on this branch (post-Phase A)

```
5773567 chore(types): regen Supabase types, drop `(supabase as any)` casts
d47563d feat(assistant): bring Phase A migrations + Phase B.3 reconcile onto B.2 branch
3c7573b feat(settings): add "What your assistant remembers" memory editor
301d0c9 refactor(/ai): three-panel layout using shared assistant components
6f985c8 feat(assistant): add CompanionDrawer + wire it into CompanionBubble
cb528c5 feat(assistant): add useAssistantMode hook
aa73e6a refactor(canvas): FullscreenAIView composes shared assistant components
2107685 feat(assistant): extract AssistantContextPanel from FullscreenAIView
3383392 feat(assistant): extract AssistantTextInput + AssistantChipsBar
7b5583a feat(assistant): extract AssistantChat from CanvasAIPanel
5e610a3 feat(assistant): extract AssistantThreadList
a91c88a chore(assistant): scaffold src/components/assistant/
```

---

## Validation checklist for the user

Before merging to main:

- [ ] **Bubble drawer** — click the floating Robby bubble. Drawer opens with the companion's name and the unified thread list (drawer + canvas chats).
- [ ] **Canvas-origin thread click** — clicking a canvas-origin chat in the drawer navigates to the canvas with that chat selected.
- [ ] **Mode pill** — drawer header shows "Agency mode" outside `/clients/:id/*`, and "Working on `<client>`" inside.
- [ ] **⛶ button** — drawer's expand button navigates to `/ai`.
- [ ] **`/ai` page** — three-panel layout: CHATS sidebar, chat area, AI SEES panel. Tasks tab still works.
- [ ] **Settings → Memory editor** — visible at `/settings`. If the assistant has saved facts, they appear grouped by user-scope vs per-client. Inline edit and two-step delete both work.
- [ ] **Canvas chat regression** — open the canvas AI panel, send messages, switch chats. Should behave identically to before (no read-path migration yet).
- [ ] **Streaming script generation** — canvas script generation still streams correctly (Phase B.1 did not regress this).

If anything fails, the safest revert is per-commit (each commit is independently revertable).
