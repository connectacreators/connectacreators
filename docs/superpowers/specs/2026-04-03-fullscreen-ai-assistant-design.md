# Fullscreen AI Assistant — Design Spec

## Summary
A fullscreen overlay AI chat experience accessible from the canvas. ChatGPT-style with a conversation sidebar, full chat area, and a collapsible "AI sees" context panel. Triggered from the canvas toolbar — canvas stays mounted underneath, no state loss.

## Trigger
- New icon button added to `CanvasToolbar` (expand/chat icon, teal styling)
- Toggles `showFullscreenAI` boolean in `SuperPlanningCanvas`
- Renders `<FullscreenAIView>` as a fixed overlay (`position: fixed; inset: 0; z-index: 200`)
- "← Canvas" button collapses it (sets state to false)
- Canvas stays fully mounted — instant open/close, no reload

## Layout (three columns)

### Top bar (44px)
- Left: "← Canvas" button
- Center: client name (bold)
- Right: nothing (clean)

### Left — Conversation sidebar (200px)
- Header: "Chats" label + "+ New" button
- Scrollable list of past conversations for this client
- Grouped by date (Today, Yesterday, older by date)
- Active chat highlighted with teal background + border
- Each item: truncated title + relative date
- Conversation titles auto-generated from first user message (first 40 chars)
- Stored in `canvas_ai_chats` table with `node_id = "__fullscreen_ai__"`

### Center — Chat (flex-1)
- Reuses `CanvasAIPanel` directly (same component as the canvas node)
- Same capabilities: streaming, script generation, model picker, voice, research mode, image paste
- Messages area scrollable with custom cyan scrollbars (transparent track, 1px cyan border)
- Input area at bottom: model chips + Generate Script button + textarea + Mic/File buttons + send

### Right — "AI sees" panel (180px expanded, 32px collapsed)
- Header: "AI sees" label + node count + collapse arrow (‹)
- Collapsed state: 32px strip, vertical "AI sees" label, expand arrow (›)
- Toggle arrow lives in panel header only — no duplication in top bar
- Lists all canvas nodes the AI can see (excludes AI node itself, group nodes, annotations)
- Each node: colored dot (type color) + node name + type label
- Node type colors match canvas: video=#f97316, text=#a78bfa, research=#34d399, hook=#facc15, brand=#f472b6, cta=#fb923c, instagram/competitor=#818cf8, media=#22d3ee, onboarding=#22d3ee
- Footer: "Add nodes in canvas to give the AI more context"
- Smooth CSS transition on collapse (width: 0.25s ease)

## Scrollbars
All scrollable areas: `scrollbar-width: thin`, custom webkit scrollbars — transparent track, 1px solid `#22d3ee` border, transparent thumb background.

## Chat persistence
- Same `canvas_ai_chats` Supabase table used by canvas AI node
- `node_id = "__fullscreen_ai__"` to namespace fullscreen chats separately from canvas node chats
- Full session management: load on mount, persist on message change, localStorage fallback, auto-name from first message

## Files
- **Create**: `src/components/canvas/FullscreenAIView.tsx`
- **Modify**: `src/pages/SuperPlanningCanvas.tsx` — `showFullscreenAI` state + render overlay + pass props
- **Modify**: `src/components/canvas/CanvasToolbar.tsx` — add expand button + new prop type
