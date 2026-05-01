# Mobile AI Assistant — ChatGPT-Style Redesign

## Summary
Redesign `MobileCanvasView.tsx` so the mobile AI chat experience matches ChatGPT's mobile app: clean header, spacious chat area, suggestion chips, minimal input bar, and all secondary tools hidden behind a "+" bottom sheet. Uses the existing dark theme (#0f0f1e) with cyan (#22d3ee) accents.

## Scope
- **Modify**: `src/components/canvas/MobileCanvasView.tsx` — complete UI overhaul
- **No new files** — all changes within existing component
- **No backend changes** — pure frontend redesign
- `CanvasAIPanel` continues to be used internally for chat logic; the mobile view overrides the visual shell around it

## Layout (top → bottom)

### 1. Header Bar (48px)
ChatGPT-style three-element header:
- **Left**: Hamburger button (☰) — 32×32, border `1.5px solid #333`, rounded `8px`. Opens chat history sidebar.
- **Center**: "AI Assistant" label, white, 14px semibold. Down arrow (▾) in #666 — tapping opens model quick-switch (same models as "+" menu).
- **Right**: New chat button (+) — 32×32, border `1.5px solid #22d3ee40`, rounded full circle, cyan "+" icon. Creates new chat session.

### 2. Chat Area (flex-1)
Scrollable message area. Takes all remaining vertical space.

**Empty state** (when `messages.length === 0`):
- Vertically centered: subtle teal icon (✦) in 40×40 circle (`background: #22d3ee15; border: 1px solid #22d3ee40`), then "How can I help?" in #888 at 14px
- Below the center area, pinned above input: 2 horizontal suggestion chips in a scrollable row
  - Each chip: `background: #ffffff08; border: 1px solid #ffffff15; border-radius: 14px; padding: 12px 14px; min-width: 150px`
  - Bold white title (12px) + gray subtitle (10px)
  - Chips are context-aware (same `getDynamicChips()` logic from CanvasAIPanel)
  - Tapping a chip sends it as a user message

**Active chat**:
- User messages: right-aligned, cyan bubble (`#22d3ee` bg, black text), rounded `18px 18px 4px 18px`
- AI messages: left-aligned, small ✦ avatar (24×24, `#22d3ee20` bg) + dark bubble (`#ffffff08` bg, white text), rounded `18px 18px 18px 4px`
- Script blocks: cyan left border for Hook, gray for Body, teal (#0d9488) for CTA — same rendering as existing `MarkdownText` in CanvasAIPanel
- Message actions on AI messages (shown below bubble): Copy, Redo, Save — small text buttons in #555
- Typing indicator: pulsing cyan dot + "Thinking..." text
- Streaming: typewriter effect with cursor (▋) — same as existing implementation

**Scrollbars**: All scrollable areas use custom scrollbars — `scrollbar-width: thin`, transparent fill, 1px solid `#22d3ee` outline border. WebKit: `::-webkit-scrollbar-track { background: transparent; border: 1px solid #22d3ee; }`, `::-webkit-scrollbar-thumb { background: transparent; border: 1px solid #22d3ee; }`.

### 3. Input Bar (fixed bottom)
Clean ChatGPT-style input bar:
- Container: `background: #ffffff08; border: 1px solid #ffffff15; border-radius: 24px; padding: 10px 14px; margin: 10px 16px 16px`
- **Left**: "+" button in cyan (#22d3ee), 18px bold — opens the bottom sheet menu
- **Center**: Auto-grow textarea, placeholder "Ask anything" in #555, text in white, 14px. Min height 20px, max 120px.
- **Right (no text)**: Mic icon (🎤) in #888
- **Right (has text)**: Send button — 30×30 cyan circle with black ▲ arrow
- When loading/streaming: send button becomes stop button (■ square icon)

### 4. "+" Bottom Sheet Menu
Triggered by tapping "+" in the input bar. Slides up from bottom with backdrop blur overlay.

**Structure**:
- Handle bar: 36×4px, #444, centered, rounded
- **Photo/Camera row**: Horizontal scroll — camera icon (📷) in 64×64 bordered box, then placeholder thumbnail slots. Tapping camera opens native file picker (`<input type="file" accept="image/*" capture="environment">`), tapping a thumbnail slot also opens file picker. Selected image attaches to chat as vision input (base64, same as existing `handlePaste` logic in CanvasAIPanel).
- **Divider**: 1px #ffffff10
- **Action items** (list rows, each 48px tall):
  - 🎬 **Generate script** — "Build from canvas context"
  - 🖼 **Create image** — "Visualize with DALL-E 3"
  - 🔍 **Deep research** — "Search the web for trends"
  - 🎤 **Voice input** — "Speak your message"
- **Divider**: 1px #ffffff10
- **Settings items** (list rows with current value on right in cyan):
  - ⚡ **AI Model** — shows current model (e.g., "Sonnet 4.5 ›")
  - 📝 **Script format** — shows current format (e.g., "Talking Head ›")
  - 🌐 **Language** — shows current lang (e.g., "EN ›")

Each setting item opens a sub-picker (another bottom sheet or inline expand) when tapped. Tapping outside or swiping down dismisses the sheet.

**Menu item styling**:
- Icon: 28×28 area, 18px emoji
- Title: white, 14px, font-weight 500
- Description: #666, 11px
- Value (settings): #22d3ee, 12px

### 5. Chat History Sidebar
Triggered by tapping hamburger (☰). Slides in from the left with backdrop overlay.

**Structure** (width: ~75vw, max 280px):
- Background: #12122a
- **Header**: "Chats" (15px semibold white) + ✕ close button (#888)
- **"+ New chat" button**: `background: #22d3ee15; border: 1px solid #22d3ee30; border-radius: 12px; color: #22d3ee; padding: 10px 12px`
- **Session list** (scrollable, grouped by date):
  - Date labels: #555, 9px, uppercase, letter-spacing 1px (Today, Yesterday, then dates)
  - Session items: 12px, #999 text, rounded 10px, nowrap ellipsis overflow
  - Active session: `background: #22d3ee15; border: 1px solid #22d3ee30; color: #22d3ee`
- **Footer** (pinned bottom): "← Back to canvas" link — #888, 12px, border-top 1px #ffffff10. Tapping navigates back to the canvas view.

Uses same `canvas_ai_chats` table with `node_id = "__mobile_ai__"` for persistence (already implemented).

## What Gets Removed from Mobile View
These elements currently visible on mobile are **removed** from the main view (moved into "+" menu or sidebar):
- Format dropdown (Talking Head / Voiceover / etc.) → "+" menu
- Language toggle (EN/ES) → "+" menu
- Model selector (Sonnet 4.5 dropdown) → "+" menu
- "Generate Script" button → "+" menu action item
- Icon toolbar row (image, file, mic, magnifier, etc.) → "+" menu
- Node count badge → removed (context is implicit)
- Node drawer (bottom swipe drawer) → removed from this view (nodes accessible via "+" menu "Generate script" which uses canvas context automatically)

## What Stays
- `CanvasAIPanel` component — reused for all chat logic, message state, AI calls, streaming, abort controller
- All existing functionality (copy, regenerate, edit, @mentions, paste screenshot, voice) — just accessed differently
- Chat persistence via `canvas_ai_chats` table
- `canvasContextRef` for node context aggregation

## Animations
- "+" bottom sheet: slide up 300ms ease-out, backdrop fade 200ms
- Sidebar: slide in from left 250ms ease-out, backdrop fade 200ms
- Suggestion chips: fade in 200ms on mount
- Message bubbles: fade + slide up 150ms on appear
- Typing indicator: pulsing dot animation (1s infinite)

## Mobile Detection
No change — existing `window.matchMedia("(max-width: 767px)")` in `SuperPlanningCanvas` already renders `<MobileCanvasView>` on small screens.
