# Canvas AI Panel — ChatGPT-Feel Upgrades

**Date:** 2026-03-30
**File:** `src/components/canvas/CanvasAIPanel.tsx` (1567 lines)
**Backend:** `supabase/functions/ai-assistant/index.ts`, `supabase/functions/ai-build-script/index.ts`

---

## Goal

Make the canvas AI panel feel as polished and responsive as ChatGPT — without changing the core architecture. 14 targeted upgrades, grouped into 3 implementation waves by complexity.

---

## What Already Exists (no action needed)

- **Animated typing indicator** — `ThinkingAnimation` component already has bouncing dots + rotating verb. ✅ Done.
- **Image paste (partial)** — `imageMode` toggle + image_b64 message type already exists. Screenshot paste extends this.

---

## Wave 1 — Pure Frontend (no backend changes)

### 1. Copy button on AI responses

Every `role === "assistant"` text message gets a copy icon button in the top-right corner.

- Clicking copies `msg.content` to clipboard via `navigator.clipboard.writeText()`
- Button shows a checkmark for 1.5s after copy, then resets
- Positioned `absolute top-1.5 right-1.5` inside the message wrapper
- Only visible on `assistant` text messages (not script previews, not user messages)
- Icon: `Copy` from lucide-react, 12×12

### 2. Auto-grow textarea

Replace the fixed `max-h-[100px]` textarea with a dynamic height that grows as the user types.

- On every `input` change, set `element.style.height = 'auto'` then `element.style.height = element.scrollHeight + 'px'`
- Cap at `max-height: 160px` with `overflow-y: auto` beyond that
- Reset height to `auto` after message is sent
- Uses a `useCallback` ref on the textarea element (not the shadcn `Textarea` component — switch to a plain `<textarea>` with the same styling classes)

### 3. Stop generation button

Show a "Stop" button while `loading || generating` is true. Clicking it aborts the in-flight request.

- Add `abortControllerRef = useRef<AbortController | null>(null)`
- Before each fetch in `sendMessage()` and `generateScript()`: `abortControllerRef.current = new AbortController()` and pass `signal: abortControllerRef.current.signal` to the fetch
- Stop button: replaces the Send button area with a centered "Stop generating" pill while loading
- On click: `abortControllerRef.current?.abort()`, set `loading = false`, `generating = false`
- Catch `AbortError` in the fetch handlers to avoid showing error toasts on intentional abort

### 4. Smart empty state

When `messages.length === 0` and not loading, show an empty state instead of a blank chat area.

- Centered layout with the Connecta AI icon, a brief headline ("What are we making today?"), and 3 starter chips
- Starter chips: "Generate a script", "Suggest a hook style", "Analyze my video" — clicking sends that message
- Empty state disappears the moment `messages.length > 0`
- Rendered inside the scrollable chat body div, conditionally

### 5. Scroll to bottom button

When the user scrolls up in the chat, a floating pill appears at the bottom of the chat body with a "↓" and a badge showing unread message count.

- Track whether user is at bottom with an `isAtBottom` state, updated via `onScroll` handler on the chat scroll container
- A message is "unread" if it arrived while `isAtBottom === false` — track with `unreadCount` ref
- Reset `unreadCount` to 0 when user scrolls to bottom or clicks the button
- Button: absolutely positioned at bottom-center of the chat scroll div, `z-10`, pill shape, clicks call `bottomRef.current?.scrollIntoView()`
- Only show when `!isAtBottom && messages.length > 0`

### 6. Dynamic chips

Replace the static `QUICK_CHIPS` array with a computed chip list that changes based on canvas state.

```ts
function getDynamicChips(messages: Message[], ctx: CanvasContext): string[] {
  const lastScript = [...messages].reverse().find(m => m.type === "script_preview");
  const hasVideo = ctx.transcriptions.filter(Boolean).length > 0;
  const hasNotes = ctx.text_notes.trim().length > 0;

  if (lastScript) {
    // Post-generation chips
    return ["Make a variation", "Translate to ES", "Does it reloop?", "Is story clear?", "Make it punchy"];
  }
  if (!hasContext(ctx)) {
    // Nothing connected yet
    return ["Add a video reference", "Pick a hook style", "Suggest a format"];
  }
  if (hasVideo && !hasNotes) {
    return ["What angle should we take?", "Suggest a hook", "Generate Script", "Check my TAM"];
  }
  // Default with context
  return ["Suggest a hook", "Make it punchy", "Shorten it", "Check my TAM", "Does it reloop?", "Is story clear?"];
}
```

- Computed via `useMemo` depending on `messages` and `canvasContextProp`
- Replaces the `QUICK_CHIPS.filter(c => c !== "Generate Script")` render

---

## Wave 2 — Frontend + Light Logic

### 7. Regenerate & edit messages

**Regenerate:** each `assistant` text message gets a "↻ Regenerate" button (alongside the copy button). Clicking it re-sends the last user message before that assistant message.

- Find the user message immediately before this assistant message by index
- Call `sendMessage(userMsg.content)` — this re-sends and appends a new assistant response
- The old assistant message is NOT removed (same behavior as ChatGPT — both responses stay)

**Edit user message:** each `user` message gets a pencil icon on hover. Clicking it:
1. Sets `input` to that message's content
2. Removes that message and all messages after it from the `messages` array
3. Focuses the textarea
- This effectively lets the user rewind and retry from any point

Both actions are implemented as small icon buttons that appear on message hover (`group-hover` pattern).

### 8. Script lines in styled blocks

Enhance `MarkdownText` to detect and render script content in a distinct styled block.

Detect when AI response contains a labeled script line (hook/body/CTA content). Trigger: lines that start with `"Hook:"`, `"Body:"`, `"CTA:"`, or content wrapped in quotes that immediately follows a label. Also detect numbered hook lists ("1. \"...\", 2. \"...\"").

When a quoted script line is detected:
- Render it in a `div` with `background: rgba(34,211,238,0.06)`, `border-left: 3px solid #22d3ee`, rounded corners, monospace-ish font
- Include a small "⎘" copy button that copies just that line
- Keep the surrounding prose (explanation text) in normal style

This is a heuristic — if a line matches `/^[""].*[""]$|^(Hook|Body|CTA|Opening|Closing):/i` it gets the script block treatment.

### 9. Auto-title sessions

After the first assistant response in a new session (i.e., `messages.length === 1` after assistant reply), fire an async title request.

- Send a lightweight request to `ai-assistant` with `isCanvas: false`, model: `claude-haiku-4-5`, and a system prompt: `"Generate a 4-6 word title for this conversation. Reply with ONLY the title, no punctuation."`
- Include the first user message and assistant response as context
- On success, call `onMessagesChange` is not the right hook — instead expose a new prop `onSessionTitle?: (title: string) => void` that SuperPlanningCanvas wires up to update the session name in the sidebar
- Only fires once per session (guard with `hasTitledRef = useRef(false)`)
- Fires in background — no loading state shown to user

### 10. @ mention a node

When the user types `@` in the textarea, show a dropdown listing connected nodes by name.

- Listen for `@` in the `onChange` handler: detect when input contains `@` not followed by a space
- Extract the search term after `@` and filter `canvasContext.connected_nodes`
- Show a dropdown above the input (absolute positioned, `bottom: 100%`) listing matching nodes
- Each item shows the node type icon + name
- Selecting an item inserts `@{node-name}` into the input at cursor position and closes dropdown
- The `@mention` in the message is sent as-is — the system prompt already tells the AI to reference nodes; the mention helps the AI know which one to focus on
- Close dropdown on Escape or click outside

---

## Wave 3 — Requires Backend Work

### 11. Streaming responses

Make AI responses appear word-by-word instead of all at once.

**Frontend changes:**
- Add `streamingContent` state: `string | null` — when non-null, renders as the "in-progress" assistant message
- Replace `ThinkingAnimation` with the streaming text rendering (dots only shown before first token)
- After stream completes, push final message to `messages` array and clear `streamingContent`
- Use `fetch` with `response.body.getReader()` + `TextDecoder` to process SSE chunks

**Backend changes (ai-assistant/index.ts):**
- Add `stream: true` to Anthropic API call when request body includes `{ stream: true }`
- Use `anthropic.messages.stream()` instead of `anthropic.messages.create()`
- Return `new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })`
- Each chunk: `data: {"delta": "token"}\n\n`
- Final chunk: `data: {"done": true, "credits_used": N}\n\n`

**ai-build-script canvas-generate step** also gets streaming for script generation — same pattern.

### 12. Voice input

Use the browser's native `SpeechRecognition` API (no backend needed).

- Add a mic button to the left of the textarea (or repurpose existing image toggle area)
- On click: `new (window.SpeechRecognition || window.webkitSpeechRecognition)()`
- Set `recognition.continuous = false`, `recognition.interimResults = true`
- Show animated waveform while recording (CSS bars animation)
- `onresult`: update textarea with transcript (interim results shown in grey, final in white)
- `onend`: stop recording state
- Works in Chrome/Safari/Edge — show "not supported" tooltip on Firefox
- Language follows `scriptLang` prop (`en-US` or `es-ES`)

### 13. Paste a screenshot

Extend existing image-paste handling to work directly in the chat input without requiring image mode toggle.

**Current state:** `imageMode` must be manually enabled, then image is sent to DALL-E for generation — that's image *generation*, not image *input*.

**New behavior:**
- Listen for `paste` event on the textarea
- If clipboard contains an image file (`items[i].type.startsWith('image/')`): extract as `File`, convert to base64 data URL, show a thumbnail preview above the input with an `✕` remove button
- On send: include the image as a vision message to the AI (Claude supports `image` content blocks)
- In `ai-assistant/index.ts`: when message contains `image_b64`, add it as `{ type: "image", source: { type: "base64", media_type, data } }` content block
- This is separate from `imageMode` (DALL-E generation) — it's for *reading* an image, not generating one
- Show small "📎 image attached" indicator in the input area

---

## Implementation Order

| Wave | Upgrades | Complexity | Est. time |
|------|----------|------------|-----------|
| 1 | Copy button, Auto-grow, Stop button, Empty state, Scroll-to-bottom, Dynamic chips | Frontend only | 2–3h |
| 2 | Regen/edit, Script blocks, Auto-title, @ mention | Frontend + light logic | 3–4h |
| 3 | Streaming, Voice input, Screenshot paste | Backend + moderate frontend | 4–6h |

Build Wave 1 first — these are the highest-visibility changes with the least risk.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/components/canvas/CanvasAIPanel.tsx` | All 14 upgrades live here except backend streaming |
| `supabase/functions/ai-assistant/index.ts` | Streaming support, image content blocks |
| `supabase/functions/ai-build-script/index.ts` | Streaming for canvas-generate step |
| `src/pages/SuperPlanningCanvas.tsx` | Wire `onSessionTitle` prop to update session name in sidebar |

---

## What Does NOT Change

- The canvas context injection (already moved to first user message — working)
- The script preview card (`InlineScriptPreview`) — stays as-is
- The session history sidebar — only receives the new session title via prop callback
- The model selector, language toggle, format selector — untouched
- The `ai-build-script` canvas-edit step — untouched
