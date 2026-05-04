# Phase B Outline — Companion ↔ Canvas AI Merge

**Date:** 2026-05-03
**Spec:** [docs/superpowers/specs/2026-05-03-companion-canvas-ai-merge-design.md](../specs/2026-05-03-companion-canvas-ai-merge-design.md)
**Phase A status:** Shipped to production (5 migrations applied, 130 canvas chats backfilled, 87 companion messages archived, both edge functions dual-writing).

---

## Why split Phase B into three sub-phases

Phase B touches the largest file in the codebase (`CanvasAIPanel.tsx`, 2816 LOC) and rewrites the bubble drawer + `/ai` page. A single big-bang plan is too risky — a regression in canvas script generation would block deploy. Splitting into three sub-phases means each one ships independently and is revertable.

```
Phase B.1 — Extract shared components (no UI change visible to user)
       ↓ [shippable, no regression risk]
Phase B.2 — Build CompanionDrawer + refactor /ai
       ↓ [shippable, drawer is new, canvas unchanged]
Phase B.3 — Switch UI read paths to new tables
       ↓ [shippable, behind feature flag — full unification visible]
```

---

## Phase B.1 — Extract shared components

**Goal:** Take four pieces of `CanvasAIPanel.tsx` + `SessionSidebar.tsx` + `FullscreenAIView.tsx` and lift them into `src/components/assistant/` as reusable React components. Canvas continues using the extracted components — **zero behavioral change visible to user**.

**Scope:**
- Extract `<AssistantThreadList>` (CHATS sidebar) — **EASY**, baseline from `SessionSidebar.tsx`
- Extract `<AssistantChat>` (message list + streaming + script preview) — **MEDIUM**, lines 2093-2375 of CanvasAIPanel
- Extract `<AssistantInput>` split into `<AssistantTextInput>` + `<AssistantChipsBar>` — **HARD**, lines 2378-2816 of CanvasAIPanel
- Extract `<AssistantContextPanel>` (AI SEES) — **HARD**, lines 902-1130 of FullscreenAIView
- Refactor `CanvasAIPanel.tsx` to compose the extracted components instead of inlining
- Refactor `FullscreenAIView.tsx` to use the same extracted components
- Refactor `SessionSidebar.tsx` to be a thin wrapper around `<AssistantThreadList>` (or delete if redundant)

**Success criteria:**
- Canvas streaming script generation: no regression
- Multi-session sidebar (CHATS): no regression
- Format/language switching: no regression
- @ mentions in input: no regression
- Voice input: no regression
- All 4 components live in `src/components/assistant/` with their own tests

**No window globals.** Remove or parameterize `__canvasNodes`, `__canvasAutoMessage`, `__canvasSaveScript`, `__canvasAddResearchNode`, `__canvasAIDraftInput` — pass via props instead.

**Risk:** Component extraction is delicate — state management bugs, missed prop wiring, scroll/animation regressions. Mitigation: per-component commits, regression-test after each extraction.

**Deliverable:** Branch `companion-merge-phase-b-1`. ~10-12 tasks. Estimated 1-2 days.

---

## Phase B.2 — Build CompanionDrawer + refactor /ai

**Goal:** Use the extracted components to build the new bubble drawer and refactor the `/ai` page to the three-panel canvas-AI-style layout.

**Scope:**
- Add `useAssistantMode()` hook (URL → agency/client mode)
- Extend `CompanionContext` with `activeThreadId`, `setActiveThreadId`, `uiMode`, `setUiMode`
- Build `CompanionDrawer.tsx` (compact ~360px right drawer using `<AssistantChat>` + `<AssistantInput>`)
- Update `CompanionBubble.tsx` to open the new drawer (replace today's compact panel)
- Refactor `CommandCenter.tsx` (`/ai` page) to three-panel layout: `<AssistantThreadList>` + `<AssistantChat>` + `<AssistantContextPanel>` (empty state off-canvas)
- Add mode pill (Agency mode / Working on `<client>`) in drawer + page headers
- Drawer ⛶ button → navigates to `/ai`
- Tab-strip in drawer to expand/collapse threads/AI-sees panels

**Success criteria:**
- Bubble click → drawer opens with chat
- Drawer shows companion name from `companion_state`
- Mode pill flips correctly between agency / client based on URL
- ⛶ navigates to `/ai`
- `/ai` page shows three-panel layout
- Existing canvas chat surface untouched (still uses CanvasAIPanel)

**Drawer reads from new tables.** Drawer is a NEW UI surface, so it can read from `assistant_threads` from day 1 (no migration of existing UX). Canvas keeps reading from `canvas_ai_chats` for now.

**Risk:** Drawer state management (active thread, scroll position, switching between thread list and chat view). Mitigation: state lives in `CompanionContext`, drawer is purely presentational.

**Deliverable:** Branch `companion-merge-phase-b-2`. ~8-10 tasks. Estimated 1-2 days.

---

## Phase B.3 — Switch UI read paths to new tables

**Goal:** Migrate the canvas + `/ai` page to read from `assistant_threads`/`assistant_messages` instead of `canvas_ai_chats`/`companion_messages`. Both surfaces show the unified thread list. Behind a feature flag for safety.

**Scope:**
- Add feature flag `assistant_unified_reads` (env var or per-user flag in `companion_state`)
- Refactor canvas chat loading: `canvas_ai_chats.messages` → `assistant_messages` (filter by canvas thread_id)
- Refactor `/ai` page: `companion_messages` → `assistant_messages` (filter by drawer threads for active client)
- Update `CompanionDrawer` thread list to query `assistant_threads` for active client (already starts there if Phase B.2 did it)
- Reconciliation backfill for any non-streaming canvas chats that didn't dual-write in Phase A
- Settings → "What `<companion>` remembers" memory editor page
- Drop `companion_messages` table (after grace period)
- Document deprecated `canvas_ai_chats.messages` column (data still readable; can remove later)

**Success criteria:**
- Robby's drawer + canvas SessionSidebar show the SAME threads (filtered by canvas_id when on canvas)
- Memory facts saved by Robby appear in canvas AI's responses (and vice versa)
- Feature flag can be flipped per-user for cautious rollout
- One-week dual-write data captures any gaps; reconciliation backfill closes them

**Risk:** Switching read paths is the single highest-risk step in this whole project. Mitigation: feature flag defaulting OFF. Roll out to a test user, then 10%, then 100%. Keep dual-write for at least 2 weeks before removing old tables.

**Deliverable:** Branch `companion-merge-phase-b-3`. ~6-8 tasks. Estimated 1 day + cautious rollout window.

---

## What I'll do first

Write the **Phase B.1 detailed implementation plan** at `docs/superpowers/plans/2026-05-03-companion-canvas-ai-merge-phase-b-1.md` with bite-sized tasks (component-by-component extraction, regression tests, commits). Then execute it via subagent-driven development like Phase A.

After B.1 ships and validates, write Phase B.2's plan. After B.2, write B.3.

Each phase ends in a checkpoint where you run the app and confirm nothing regressed before we proceed.
