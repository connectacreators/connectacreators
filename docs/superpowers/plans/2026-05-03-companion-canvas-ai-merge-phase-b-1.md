# Companion ↔ Canvas AI Merge — Phase B.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task. Steps use checkbox (`- [ ]`) for tracking.

**Goal:** Extract four reusable React components from `CanvasAIPanel.tsx` (2816 LOC) + `SessionSidebar.tsx` + `FullscreenAIView.tsx` into `src/components/assistant/`. Canvas continues using the extracted components. **Zero behavioral change visible to user**.

**Architecture:** Each extraction = create new component file + refactor source file to import/use it + manual regression test + commit. Window globals (`__canvasNodes`, `__canvasAutoMessage`, etc.) get parameterized as props. New components live in `src/components/assistant/` and are reused by Phase B.2's `CompanionDrawer` + redesigned `/ai`.

**Tech Stack:** React 18, TypeScript, Tailwind, ReactFlow (canvas only). Tests via Vitest if added (project has no Vitest setup currently — manual regression-test is primary signal).

**Spec:** [docs/superpowers/specs/2026-05-03-companion-canvas-ai-merge-design.md](../specs/2026-05-03-companion-canvas-ai-merge-design.md)

**Phase A status:** Shipped + deployed. Phase B.1 builds on top.

---

## File map

**Created:**
- `src/components/assistant/AssistantThreadList.tsx`
- `src/components/assistant/AssistantChat.tsx`
- `src/components/assistant/AssistantTextInput.tsx`
- `src/components/assistant/AssistantChipsBar.tsx`
- `src/components/assistant/AssistantContextPanel.tsx`
- `src/components/assistant/index.ts` (barrel re-export)

**Modified:**
- `src/components/canvas/CanvasAIPanel.tsx` — replaces inline chat/input rendering with shared components
- `src/components/canvas/FullscreenAIView.tsx` — replaces inline thread-list + context-panel with shared components
- `src/components/canvas/SessionSidebar.tsx` — becomes a thin wrapper around `<AssistantThreadList>` (or deleted if redundant)

**Branch:** `companion-merge-phase-b-1` (created off `main`).

---

## Important constraints (every task)

1. **WIP exists** in working tree. NEVER `git add -A`/`.`/`-u`/`commit -a`. Only `git add <exact-path>`.
2. **No production deploys** — these are React component changes, no Supabase commands needed.
3. **Manual regression test after each refactor task** — confirm canvas still works:
   - Open a canvas, switch chat sessions (CHATS sidebar)
   - Send a message, see streaming response
   - Generate a script, see script preview render
   - Switch format (Reel/Story/etc.) and language (EN/ES)
   - @ mention a node in the input
   - If any of these regress, do NOT commit — debug first.

---

## Task 1: Set up branch + scaffolding

**Files:**
- Create: `src/components/assistant/index.ts` (barrel)

- [ ] **Step 1: Create the new branch off main**

```bash
cd /Users/admin/Documents/connectacreators
git checkout main
git pull --ff-only
git checkout -b companion-merge-phase-b-1
```

- [ ] **Step 2: Create barrel file**

```ts
// src/components/assistant/index.ts
// Barrel re-exports for the shared assistant components.
// Components added incrementally during Phase B.1.
export {};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/assistant/index.ts
git commit -m "chore(assistant): scaffold src/components/assistant/ for Phase B.1

Empty barrel; populated incrementally as components are extracted from
CanvasAIPanel and FullscreenAIView."
```

---

## Task 2: Extract `<AssistantThreadList>` (EASY)

Extract the CHATS sidebar component. Source: `SessionSidebar.tsx` (cleaner Tailwind-based version) as the baseline; add date-grouping + edit state from `FullscreenAIView.tsx` lines 641-839.

**Files:**
- Create: `src/components/assistant/AssistantThreadList.tsx`
- Modify: `src/components/assistant/index.ts`
- Modify: `src/components/canvas/SessionSidebar.tsx` (becomes thin wrapper, OR replaced by direct AssistantThreadList usage in callers)

- [ ] **Step 1: Read source files** to understand the structure

```bash
cat src/components/canvas/SessionSidebar.tsx
```
And read FullscreenAIView.tsx lines 641-839 for the date-grouping + rename/delete UX.

- [ ] **Step 2: Write `AssistantThreadList.tsx`**

The component should accept these props:

```ts
export interface ThreadListItem {
  id: string;
  name: string;
  origin?: 'drawer' | 'canvas';   // optional — used for the small tag
  updatedAt: string;
  messageCount?: number;
}

export interface AssistantThreadListProps {
  threads: ThreadListItem[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => Promise<void> | void;
  onRename?: (id: string, newName: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  /** Show date headers (Today/Earlier) — default true */
  groupByDate?: boolean;
  /** Visual variant: compact (drawer) or full (canvas/fullscreen) */
  variant?: 'compact' | 'full';
  className?: string;
}
```

Logic:
- If `groupByDate`, group threads into "Today", "Yesterday", "Earlier this week", "Earlier" using `relativeDate(updatedAt)` helper
- Render each item with: name, origin tag (if origin given), relative date
- Active thread: cyan left border + tinted background
- Hover: show rename/delete buttons (only if callbacks given)
- Inline rename input on edit
- Confirm-then-delete (two-click pattern)
- Empty state: "No chats yet — start a new one"

Pull the rename/delete UX patterns directly from FullscreenAIView lines 720-820. Use Tailwind for styling (no inline CSS).

- [ ] **Step 3: Update barrel**

```ts
// src/components/assistant/index.ts
export { AssistantThreadList } from "./AssistantThreadList.tsx";
export type { AssistantThreadListProps, ThreadListItem } from "./AssistantThreadList.tsx";
```

- [ ] **Step 4: Refactor `SessionSidebar.tsx` to use `<AssistantThreadList>`**

`SessionSidebar` becomes a thin canvas-side adapter that maps the canvas chat session shape to `ThreadListItem` and wires the callbacks. Don't delete it yet — its callers in canvas pass canvas-specific props. Delete is a follow-up if the file becomes a 5-line wrapper.

```tsx
// src/components/canvas/SessionSidebar.tsx
// Thin adapter that maps canvas chat sessions to AssistantThreadList.
import { AssistantThreadList } from "@/components/assistant";
import type { CanvasChatSession } from "...";  // existing type

interface Props {
  sessions: CanvasChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}

export default function SessionSidebar({ sessions, activeId, onSelect, onCreate, onDelete, onRename }: Props) {
  const threads = sessions.map(s => ({
    id: s.id,
    name: s.name,
    origin: 'canvas' as const,
    updatedAt: s.updated_at ?? s.created_at,
  }));
  return (
    <AssistantThreadList
      threads={threads}
      activeThreadId={activeId}
      onSelect={onSelect}
      onCreate={onCreate}
      onDelete={onDelete}
      onRename={onRename}
      groupByDate
      variant="full"
    />
  );
}
```

(Adapt to the actual prop names of the existing `SessionSidebar` callers.)

- [ ] **Step 5: Run dev server, regression-test the canvas**

```bash
npm run dev
```

In the browser:
1. Open any canvas
2. Open the CHATS sidebar (if collapsed, expand it)
3. Click between different chats — does the active one change correctly?
4. Click "+ New" — does a new chat get created?
5. Hover over a chat, click rename — does the input appear and accept text?
6. Hover over a chat, click delete — does the confirm dialog appear?

If anything regresses, do NOT commit — diagnose and fix first.

- [ ] **Step 6: Commit**

```bash
git add src/components/assistant/AssistantThreadList.tsx src/components/assistant/index.ts src/components/canvas/SessionSidebar.tsx
git commit -m "feat(assistant): extract AssistantThreadList from SessionSidebar + FullscreenAIView

Reusable thread list component with date grouping, rename/delete inline,
origin tags. SessionSidebar is now a thin canvas-side adapter that maps
CanvasChatSession to ThreadListItem. Foundation for the unified drawer
thread list in Phase B.2."
```

---

## Task 3: Extract `<AssistantChat>` (MEDIUM)

Source: `CanvasAIPanel.tsx` lines 2093-2375. The message list rendering, streaming bubble, and per-message logic.

**Files:**
- Create: `src/components/assistant/AssistantChat.tsx`
- Modify: `src/components/assistant/index.ts`
- Modify: `src/components/canvas/CanvasAIPanel.tsx`

- [ ] **Step 1: Read CanvasAIPanel.tsx lines 2093-2375 carefully**

```bash
sed -n '2093,2375p' src/components/canvas/CanvasAIPanel.tsx
```

Identify the rendering of:
- Greeting (no-messages state)
- Message list with infinite-scroll sentinel
- Per-message types: text, image, script_preview, research, deck_questions
- Streaming bubble (live typewriter)
- Scroll-to-bottom button + unread count

- [ ] **Step 2: Write `AssistantChat.tsx`** with these props:

```ts
import type { Message, ScriptResult } from "@/lib/scriptShape"; // adapt

export interface AssistantChatProps {
  messages: Message[];
  /** Live streaming text (typewriter) — null when not streaming */
  streamingContent?: string | null;
  /** Streaming text from a remote source (for FullscreenAIView's broadcast) */
  remoteStreamingContent?: string | null;
  loading?: boolean;
  generating?: boolean;
  generatingImage?: boolean;
  /** Layout variant — affects spacing, max width */
  variant?: 'compact' | 'full';
  /** Optional: caller's "save script" handler (canvas wires its own) */
  onSaveScript?: (script: ScriptResult) => Promise<void>;
  /** Optional: caller's "save research to canvas" handler */
  onSaveResearchToCanvas?: (markdown: string) => void;
  /** Optional: regenerate-from-message handler */
  onRegenerateFromMessage?: (idx: number) => void;
  /** Optional: edit-user-message handler */
  onEditUserMessage?: (idx: number, newText: string) => void;
  /** Visible message count for windowing — null = render all */
  visibleCount?: number | null;
  onLoadMore?: () => void;
}
```

Internal state:
- `copiedIdx` for copy-to-clipboard feedback
- `scrollContainerRef`, `bottomRef`
- IntersectionObserver for infinite scroll (if `onLoadMore` provided)

Lift the per-message rendering into a `<MessageRow>` sub-component. Keep streaming-bubble as a separate sub-component.

**Window globals to remove:** `(window as any).__canvasSaveScript`, `(window as any).__canvasAddResearchNode`. Replace with `onSaveScript` and `onSaveResearchToCanvas` props.

- [ ] **Step 3: Update barrel**

```ts
export { AssistantChat } from "./AssistantChat.tsx";
export type { AssistantChatProps } from "./AssistantChat.tsx";
```

- [ ] **Step 4: Refactor `CanvasAIPanel.tsx`** to render `<AssistantChat>` instead of the inlined block

Replace lines 2093-2375 (or wherever the inline chat-area block lives in the current file) with:

```tsx
<AssistantChat
  messages={messages}
  streamingContent={streamingContent}
  remoteStreamingContent={remoteStreamingContent}
  loading={loading}
  generating={generating}
  generatingImage={generatingImage}
  variant={fullscreen ? 'full' : 'compact'}
  onSaveScript={onSaveScript ?? (window as any).__canvasSaveScript}
  onSaveResearchToCanvas={(window as any).__canvasAddResearchNode}
  onRegenerateFromMessage={handleRegenerateFromMessage}
  onEditUserMessage={handleEditUserMessage}
  visibleCount={visibleCount}
  onLoadMore={hasOlderMessages ? loadMore : undefined}
/>
```

(Adapt to local variable names.)

The window-global passthrough is intentional in this step — we're not breaking the contract yet. A later cleanup step can remove the passthrough once all callers pass props directly.

- [ ] **Step 5: Regression test**

In the canvas:
1. Open a chat with ≥10 messages — they all render
2. Send a new message — streaming bubble appears, typewriter animates, replaces with final message
3. Generate a script — script preview card renders, click "Save" — does it save to vault?
4. If a research result comes back (look up "research mode") — does the "Save to Canvas" button work?
5. Scroll up to load older messages — does infinite scroll work?
6. Click the regenerate button on an assistant message — does it regenerate?
7. Click edit on a user message — does the inline edit work?

- [ ] **Step 6: Commit**

```bash
git add src/components/assistant/AssistantChat.tsx src/components/assistant/index.ts src/components/canvas/CanvasAIPanel.tsx
git commit -m "feat(assistant): extract AssistantChat from CanvasAIPanel

Message list with streaming bubble, script previews, infinite scroll.
Window globals __canvasSaveScript and __canvasAddResearchNode are now
passed as onSaveScript / onSaveResearchToCanvas props (canvas continues
to wire them via the existing globals — full deglobalization is a
follow-up cleanup)."
```

---

## Task 4: Split + extract `<AssistantTextInput>` and `<AssistantChipsBar>` (HARD)

Source: `CanvasAIPanel.tsx` lines 2378-2816. The hardest extraction — the input has many integrated features (@ mentions, voice, model selector, image mode, research mode, prompt presets).

Split into two components for manageability:
- `<AssistantTextInput>` — textarea, send/stop/mic buttons, attached-image preview, basic input concerns
- `<AssistantChipsBar>` — dynamic chips above the input
- The model selector + plus menu + image-mode toggle stay inside `<AssistantTextInput>` for now (don't over-decompose)

**Files:**
- Create: `src/components/assistant/AssistantTextInput.tsx`
- Create: `src/components/assistant/AssistantChipsBar.tsx`
- Modify: `src/components/assistant/index.ts`
- Modify: `src/components/canvas/CanvasAIPanel.tsx`

- [ ] **Step 1: Read CanvasAIPanel lines 2378-2816 carefully**

```bash
sed -n '2378,2816p' src/components/canvas/CanvasAIPanel.tsx
```

- [ ] **Step 2: Write `AssistantChipsBar.tsx`**

```ts
export interface AssistantChipsBarProps {
  /** Chip labels — caller computes them from current context */
  chips: string[];
  /** Click a chip → fill input with the chip's prompt */
  onChip: (label: string) => void;
}
```

Pure presentational. Tailwind. ~30 lines.

- [ ] **Step 3: Write `AssistantTextInput.tsx`**

Major props (manageable list — group by concern):

```ts
export interface AssistantTextInputProps {
  // Core text state
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  // Status
  loading?: boolean;
  generating?: boolean;
  recognizing?: boolean;
  // Attachments
  pastedImage?: string | null;
  onClearPastedImage?: () => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  // Modes
  imageMode?: boolean;
  onToggleImageMode?: () => void;
  isResearchMode?: boolean;
  onToggleResearchMode?: () => void;
  // Generate Script button
  onGenerateScript?: () => void;
  generateScriptDisabled?: boolean;
  // Model selector
  selectedModel?: string;
  models?: { key: string; label: string }[];
  onModelChange?: (key: string) => void;
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;
  // Voice
  onToggleVoice?: () => void;
  // @ mention
  mentionableNodes?: Array<{ id: string; type: string; label: string }>;
  // Prompt presets
  promptPresets?: Array<{ label: string; insert: string }>;
  // Layout
  variant?: 'compact' | 'full';
  placeholder?: string;
  /** Imperative ref to focus / get value */
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}
```

Internal state: `atMentionQuery`, `plusMenuOpen`, `modelDropdownOpen`, textarea auto-sizing.

**Window globals to remove:** `(window as any).__canvasNodes` and `(window as any).__canvasAutoMessage`. The canvas passes `mentionableNodes` as a prop; the auto-message hook stays in CanvasAIPanel and writes `value` directly.

- [ ] **Step 4: Update barrel**

```ts
export { AssistantTextInput } from "./AssistantTextInput.tsx";
export type { AssistantTextInputProps } from "./AssistantTextInput.tsx";
export { AssistantChipsBar } from "./AssistantChipsBar.tsx";
export type { AssistantChipsBarProps } from "./AssistantChipsBar.tsx";
```

- [ ] **Step 5: Refactor `CanvasAIPanel.tsx`** to render the new components

Replace lines 2378-2816 with:

```tsx
{chips.length > 0 && (
  <AssistantChipsBar chips={chips} onChip={(label) => setInput(label)} />
)}
<AssistantTextInput
  value={input}
  onChange={setInput}
  onSend={sendMessage}
  onStop={stopGeneration}
  loading={loading}
  generating={generating}
  recognizing={recognizing}
  pastedImage={pastedImage}
  onClearPastedImage={() => setPastedImage(null)}
  onPaste={handlePaste}
  imageMode={imageMode}
  onToggleImageMode={() => setImageMode(v => !v)}
  isResearchMode={isResearchMode}
  onToggleResearchMode={() => setIsResearchMode(v => !v)}
  onGenerateScript={generateScript}
  selectedModel={selectedModel}
  models={AI_MODELS}
  onModelChange={setSelectedModel}
  thinkingEnabled={thinkingEnabled}
  onToggleThinking={() => setThinkingEnabled(v => !v)}
  onToggleVoice={toggleVoice}
  mentionableNodes={canvasNodesForMention}  // map __canvasNodes
  promptPresets={PROMPT_PRESETS}
  variant={fullscreen ? 'full' : 'compact'}
  placeholder="Ask anything about your script..."
/>
```

The `canvasNodesForMention` map is a small helper:
```ts
const canvasNodesForMention = useMemo(() => {
  const nodes = (window as any).__canvasNodes ?? [];
  return nodes
    .filter((n: any) => !['aiAssistantNode', 'groupNode'].includes(n.type))
    .map((n: any) => ({ id: n.id, type: n.type, label: n.data?.label ?? n.id }));
}, [/* trigger when canvas nodes change */]);
```

The `getDynamicChips()` and `detectIdeationIntent()` helpers stay in CanvasAIPanel — pass the result of `getDynamicChips(messages, ctx)` as the `chips` prop.

- [ ] **Step 6: Regression test (heavy!)**

The input is the most user-touched part. Verify ALL of:
1. Type a message — sends correctly (Enter and Send button)
2. Press Esc while generating — stop works
3. Click chips — fills input
4. Click model selector — dropdown opens, switching model works
5. Toggle thinking — saves preference
6. Click + menu — image mode toggle, research toggle, prompt presets all work
7. Type `@` — node mention dropdown appears, filters as you type, click inserts mention
8. Paste an image (Cmd+V on copied image) — pasted image preview appears
9. Click mic — voice recording works
10. Click "Generate Script" — script generation kicks off
11. On `/clients/.../scripts?view=canvas` (fullscreen view) — UI uses full layout
12. On embedded canvas — UI uses compact layout

If ANY of the above regresses, do NOT commit — debug.

- [ ] **Step 7: Commit**

```bash
git add src/components/assistant/AssistantTextInput.tsx src/components/assistant/AssistantChipsBar.tsx src/components/assistant/index.ts src/components/canvas/CanvasAIPanel.tsx
git commit -m "feat(assistant): extract AssistantTextInput + AssistantChipsBar from CanvasAIPanel

Input, model selector, plus menu, @ mentions, voice, paste — all in one
component (~600 LOC). Chips bar is a separate small component. Canvas
passes its node list as mentionableNodes prop, no longer reaches for
window.__canvasNodes inside the input.

CanvasAIPanel keeps getDynamicChips / detectIdeationIntent — those are
canvas-context-driven and feed the chips prop."
```

---

## Task 5: Extract `<AssistantContextPanel>` (HARD)

Source: `FullscreenAIView.tsx` lines 902-1130. The "AI SEES" panel.

**Files:**
- Create: `src/components/assistant/AssistantContextPanel.tsx`
- Modify: `src/components/assistant/index.ts`
- Modify: `src/components/canvas/FullscreenAIView.tsx`

- [ ] **Step 1: Read FullscreenAIView lines 902-1130**

```bash
sed -n '902,1130p' src/components/canvas/FullscreenAIView.tsx
```

- [ ] **Step 2: Write `AssistantContextPanel.tsx`**

```ts
export interface ContextNode {
  id: string;
  type: string;
  label: string;
  /** Optional dot color override; otherwise mapped via typeColorMap */
  color?: string;
}

export interface AssistantContextPanelProps {
  nodes: ContextNode[];
  /** Color per node-type — caller passes the canvas's NODE_TYPE_COLOR map */
  typeColorMap?: Record<string, string>;
  /** Display label per node-type — caller passes NODE_TYPE_LABEL map */
  typeLabelMap?: Record<string, string>;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Custom empty-state message (off-canvas vs no-nodes-connected) */
  emptyMessage?: string;
  className?: string;
}
```

Pure presentational. Caller passes the type maps + nodes; component doesn't import from canvas at all.

- [ ] **Step 3: Update barrel**

- [ ] **Step 4: Refactor `FullscreenAIView.tsx`**

Replace the inlined right-panel rendering with:

```tsx
<AssistantContextPanel
  nodes={contextNodes.map(n => ({
    id: n.id,
    type: n.type,
    label: getDisplayLabel(n),
  }))}
  typeColorMap={NODE_TYPE_COLOR}
  typeLabelMap={NODE_TYPE_LABEL}
  collapsed={contextPanelCollapsed}
  onToggleCollapsed={() => setContextPanelCollapsed(v => !v)}
  emptyMessage="Add nodes in canvas to give the AI more context"
/>
```

- [ ] **Step 5: Regression test**

In a canvas with nodes connected to the AI assistant:
1. Open the fullscreen AI view (the one that shows the right panel)
2. AI SEES panel shows the connected nodes
3. Click collapse — panel shrinks to a strip; click expand — panel expands
4. Disconnect a node from the AI — panel updates

- [ ] **Step 6: Commit**

```bash
git add src/components/assistant/AssistantContextPanel.tsx src/components/assistant/index.ts src/components/canvas/FullscreenAIView.tsx
git commit -m "feat(assistant): extract AssistantContextPanel from FullscreenAIView

Pure presentational component for the AI SEES panel. Caller passes
nodes array + type→color/label maps. Empty state is configurable so
the same component works on /ai (off-canvas, empty) and on the
canvas (showing connected nodes)."
```

---

## Task 6: Refactor `FullscreenAIView` to use `<AssistantThreadList>` + `<AssistantChat>` + `<AssistantTextInput>`

`FullscreenAIView` already composes the three-panel layout (CHATS / chat / AI SEES). After Tasks 2-5 it can use the shared components for all three panels.

**Files:**
- Modify: `src/components/canvas/FullscreenAIView.tsx`

- [ ] **Step 1: Read current FullscreenAIView.tsx structure**

- [ ] **Step 2: Replace the inlined CHATS sidebar (lines 641-839)** with `<AssistantThreadList>` (analogous to how SessionSidebar wraps it now)

- [ ] **Step 3: Replace the inlined chat area** with `<AssistantChat>`

- [ ] **Step 4: Replace the inlined input** with `<AssistantTextInput>` + `<AssistantChipsBar>`

- [ ] **Step 5: AI SEES panel already done** in Task 5

- [ ] **Step 6: Regression test the fullscreen view**

Open `/clients/<id>/scripts?view=canvas` and verify:
- Three panels render correctly (CHATS / chat / AI SEES)
- All canvas behaviors preserved (streaming, multi-session, format/lang switch, @ mentions, voice)

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/FullscreenAIView.tsx
git commit -m "refactor(canvas): FullscreenAIView uses shared assistant components

CHATS sidebar, chat area, input, and AI SEES panel all now render via
the shared components in src/components/assistant. FullscreenAIView is
now thin glue: state management + canvas wiring + layout."
```

---

## Task 7: Sanity check — file sizes + diff

After tasks 2-6, the source files should have shrunk meaningfully.

- [ ] **Step 1: Measure**

```bash
wc -l src/components/canvas/CanvasAIPanel.tsx \
       src/components/canvas/FullscreenAIView.tsx \
       src/components/canvas/SessionSidebar.tsx \
       src/components/assistant/*.tsx
```

Expected: CanvasAIPanel.tsx down from 2816 to roughly ~1500. FullscreenAIView.tsx similarly reduced. New components total ~1500-2000 lines combined.

- [ ] **Step 2: Push branch + open PR (or stage for merge)**

```bash
git push -u origin companion-merge-phase-b-1
```

(If you want a PR, run `gh pr create --base main --head companion-merge-phase-b-1 ...`. Otherwise leave the branch for review.)

---

## Phase B.1 done

Canvas behavior identical, but the component layer is now reusable. Phase B.2 builds `CompanionDrawer.tsx` and refactors the `/ai` page using the shared components — that's the user-visible payoff.

**Note on tests:** This plan assumes manual regression testing. If the project gains a Vitest setup later, retroactively add tests for the extracted components.
