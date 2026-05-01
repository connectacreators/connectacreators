# Mobile AI Assistant — ChatGPT-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign MobileCanvasView.tsx to match ChatGPT's clean mobile app UI — hamburger sidebar, spacious chat, minimal input bar, "+" bottom sheet for all tools.

**Architecture:** Complete rewrite of the MobileCanvasView render output. Remove NodeDrawer, FABMenu, and the cramped toolbar. Replace with: ChatGPT-style header (hamburger + title + new chat), clean chat area using existing CanvasAIPanel for logic, a "+" bottom sheet menu, and a left-sliding chat history sidebar. All secondary tools (model, format, language, voice, image gen, research) move into the "+" sheet.

**Tech Stack:** React, TypeScript, Tailwind CSS (inline styles for custom colors), Lucide icons, existing CanvasAIPanel component, Supabase (canvas_ai_chats table)

---

## File Structure

- **Modify**: `src/components/canvas/MobileCanvasView.tsx` (1149 lines → complete rewrite of UI, keep business logic)
  - Remove: `NodeDrawer`, `FABMenu`, `NodeChip` sub-components (no longer needed in main view)
  - Keep: `NodeDetailSheet` (still used when "Send to AI" from sidebar context), `stripImagesForPersistence`, `getNodeLabel`, `NODE_TYPE_META`, types, constants, chat persistence logic
  - Add: `PlusSheet` sub-component (bottom sheet with ChatGPT-style menu)
  - Add: `ChatSidebar` sub-component (left-sliding chat history panel)
  - Modify: `MobileCanvasView` main component render — new header, clean chat area, new input bar, sheet/sidebar triggers

---

### Task 1: Strip Old UI Shell — Header, Drawer, FAB

Remove the old mobile-specific UI elements and replace with the new ChatGPT-style header. Keep all business logic (chat state, persistence, session management) intact.

**Files:**
- Modify: `src/components/canvas/MobileCanvasView.tsx`

- [ ] **Step 1: Remove unused sub-components and imports**

Delete the `NodeChip`, `NodeDrawer`, `FABMenu` components and the `DrawerState` type. Remove unused icon imports (`ChevronUp`, `ChevronDown`, `Eye`, `Send`). Remove `FAB_NODE_TYPES` constant. Keep `NodeDetailSheet` — it's still used for "Send to AI".

Remove these lines/sections:
- `type DrawerState = "collapsed" | "half" | "full";` (line 84)
- `const FAB_NODE_TYPES = [...]` (lines 124–131)
- The entire `NodeChip` component (lines 161–198)
- The entire `NodeDrawer` component and its `NodeDrawerProps` interface (lines 507–707)
- The entire `FABMenu` component (lines 709–765)

In the main component, remove these state variables:
- `const [drawerState, setDrawerState] = useState<DrawerState>("collapsed");` (line 796)
- `const [fabOpen, setFabOpen] = useState(false);` (line 802)
- The `drawerHeight` calculation (lines 829–834)

Remove unused icon imports from the import block. The final import from lucide-react should be:
```tsx
import {
  ArrowLeft,
  Plus,
  Menu,
  X,
  Camera,
  Image,
  Mic,
  Search,
  Globe,
  Zap,
  FileText,
  Film,
  Sparkles,
  Palette,
  Megaphone,
  StickyNote,
  Hash,
  ClipboardList,
  MessageSquare,
  Pencil,
  Trash2,
  Square,
  Video,
} from "lucide-react";
```

- [ ] **Step 2: Add new state variables for sidebar and "+" sheet**

In the main `MobileCanvasView` component, after the existing chat state declarations, add:

```tsx
// Sidebar & plus-sheet state
const [sidebarOpen, setSidebarOpen] = useState(false);
const [plusSheetOpen, setPlusSheetOpen] = useState(false);
```

- [ ] **Step 3: Replace the header JSX**

Replace the entire `{/* Top Bar */}` section (lines 1009–1051) with the new ChatGPT-style header:

```tsx
{/* Header — ChatGPT style */}
<div
  className="flex items-center justify-between px-4 flex-shrink-0"
  style={{
    height: 48,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#0f0f1e",
  }}
>
  {/* Hamburger */}
  <button
    onClick={() => setSidebarOpen(true)}
    className="flex items-center justify-center"
    style={{
      width: 32,
      height: 32,
      border: "1.5px solid #333",
      borderRadius: 8,
    }}
  >
    <Menu size={16} style={{ color: "#ccc" }} />
  </button>

  {/* Center title */}
  <span
    className="font-semibold"
    style={{ color: "#fff", fontSize: 14 }}
  >
    AI Assistant{" "}
    <span style={{ color: "#666", fontSize: 11 }}>▾</span>
  </span>

  {/* New chat */}
  <button
    onClick={onNewSession}
    className="flex items-center justify-center"
    style={{
      width: 32,
      height: 32,
      border: "1.5px solid rgba(34,211,238,0.25)",
      borderRadius: "50%",
    }}
  >
    <Plus size={16} style={{ color: "#22d3ee" }} />
  </button>
</div>
```

- [ ] **Step 4: Replace the chat area and remove drawer margin**

Replace the chat area section (lines 1053–1102). Remove the `marginBottom: drawerHeight` since the drawer is gone:

```tsx
{/* Chat Area — full height */}
<div className="flex-1 overflow-hidden">
  {chatsLoaded ? (
    <CanvasAIPanel
      key={activeChatId ?? "no-chat"}
      canvasContext={canvasContextRef?.current ?? EMPTY_CONTEXT}
      canvasContextRef={canvasContextRef}
      clientInfo={clientInfo}
      onGenerateScript={setGeneratedScript}
      authToken={authToken}
      format={format}
      language={language}
      aiModel={aiModel || "claude-haiku-4-5"}
      remixMode={!!remixVideo}
      remixContext={
        remixVideo
          ? {
              channel_username: remixVideo.channel_username || "",
              format: remixVideo.format || null,
              prompt_hint: remixVideo.caption || null,
            }
          : null
      }
      onFormatChange={onFormatChange}
      onLanguageChange={onLanguageChange}
      onModelChange={onModelChange}
      initialInput={refinementInput}
      onInitialInputConsumed={() => setRefinementInput(null)}
      initialMessages={activeMessages}
      onMessagesChange={handleMessagesChange}
      onSaveScript={onSaveScript}
      externalDroppedImage={null}
    />
  ) : (
    <div className="flex items-center justify-center h-full">
      <div className="text-xs" style={{ color: "#64748b" }}>
        Loading chat...
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 5: Remove old drawer, FAB, and FABMenu JSX**

Delete these sections from the main render return:
- `{/* Node Drawer */}` and the `<NodeDrawer ... />` element
- `{/* FAB */}` and the entire FAB `<button>` element
- `{/* FAB Menu */}` and the `<FABMenu ... />` element

Keep the `{/* Node Detail Sheet */}` `{selectedNode && <NodeDetailSheet .../>}` — it stays.

- [ ] **Step 5b: Add floating "+" trigger button**

Add a floating "+" button that sits at the bottom-left of the screen, positioned to the left of CanvasAIPanel's input area. This button opens the PlusSheet:

```tsx
{/* Floating "+" trigger for Plus Sheet */}
<button
  onClick={() => setPlusSheetOpen(true)}
  className="fixed z-40 flex items-center justify-center"
  style={{
    left: 20,
    bottom: 18,
    width: 28,
    height: 28,
    background: "none",
    border: "none",
    color: "#22d3ee",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
  }}
>
  +
</button>
```

Place this in the main render, after the chat area div and before the NodeDetailSheet. Also add CSS to shift CanvasAIPanel's textarea right to make room for the "+" button:

Add to the `<style>` block (in Step 6):
```css
.mobile-canvas-root .relative.flex.items-end {
  padding-left: 32px !important;
}
```

This pushes the input container's left padding to create space for the floating "+" button.

- [ ] **Step 6: Update the mobile CSS overrides**

Replace the entire `<style>` block (lines 985–1007) with scrollbar styling:

```tsx
<style>{`
  .mobile-canvas-root ::-webkit-scrollbar {
    width: 6px;
  }
  .mobile-canvas-root ::-webkit-scrollbar-track {
    background: transparent;
    border: 1px solid #22d3ee;
    border-radius: 3px;
  }
  .mobile-canvas-root ::-webkit-scrollbar-thumb {
    background: transparent;
    border: 1px solid #22d3ee;
    border-radius: 3px;
  }
  .mobile-canvas-root {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }
  .mobile-canvas-root .border-t.border-border.flex-shrink-0 {
    display: none !important;
  }
  .mobile-canvas-root textarea {
    min-height: 32px !important;
    font-size: 14px !important;
  }
  .mobile-canvas-root .relative.flex.items-end {
    padding-left: 32px !important;
  }
`}</style>
```

The `.border-t.border-border.flex-shrink-0` hide rule removes CanvasAIPanel's built-in bottom toolbar (model picker, format, etc.) since we're moving those to the "+" sheet.

- [ ] **Step 7: Verify the app still compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (warnings are OK)

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/MobileCanvasView.tsx
git commit -m "refactor(mobile): strip old drawer/FAB, add ChatGPT-style header"
```

---

### Task 2: Add the "+" Bottom Sheet Menu

Create the `PlusSheet` sub-component inside `MobileCanvasView.tsx` — a ChatGPT-style bottom sheet triggered from the input area.

**Files:**
- Modify: `src/components/canvas/MobileCanvasView.tsx`

- [ ] **Step 1: Create the PlusSheet component**

Add this component above the main `MobileCanvasView` component (after `NodeDetailSheet`):

```tsx
// ── PlusSheet (ChatGPT-style "+" menu) ──────────────────────────────────

interface PlusSheetProps {
  open: boolean;
  onClose: () => void;
  format: string;
  language: "en" | "es";
  aiModel: string;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onAttachImage: () => void;
  onVoiceInput: () => void;
  onGenerateScript: () => void;
  onImageMode: () => void;
  onResearch: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-opus-4": "Opus 4",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
};

const FORMAT_LABELS: Record<string, string> = {
  "talking_head": "Talking Head",
  "voiceover": "Voiceover",
  "text_on_screen": "Text on Screen",
  "mixed": "Mixed",
};

const PlusSheet = memo(({
  open,
  onClose,
  format,
  language,
  aiModel,
  onFormatChange,
  onLanguageChange,
  onModelChange,
  onAttachImage,
  onVoiceInput,
  onGenerateScript,
  onImageMode,
  onResearch,
}: PlusSheetProps) => {
  const [subPicker, setSubPicker] = useState<"model" | "format" | "language" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "13px 4px",
    cursor: "pointer",
    width: "100%",
    background: "none",
    border: "none",
    textAlign: "left" as const,
  };

  const renderSubPicker = () => {
    if (subPicker === "model") {
      return (
        <div style={{ padding: "8px 0" }}>
          {Object.entries(MODEL_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { onModelChange(key); setSubPicker(null); }}
              style={{
                ...menuItemStyle,
                background: aiModel === key ? "rgba(34,211,238,0.1)" : "none",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span style={{ color: aiModel === key ? "#22d3ee" : "#ccc", fontSize: 14 }}>{label}</span>
              {aiModel === key && <span style={{ marginLeft: "auto", color: "#22d3ee", fontSize: 14 }}>✓</span>}
            </button>
          ))}
          <button onClick={() => setSubPicker(null)} style={{ ...menuItemStyle, justifyContent: "center" }}>
            <span style={{ color: "#888", fontSize: 12 }}>← Back</span>
          </button>
        </div>
      );
    }
    if (subPicker === "format") {
      return (
        <div style={{ padding: "8px 0" }}>
          {Object.entries(FORMAT_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { onFormatChange(key); setSubPicker(null); }}
              style={{
                ...menuItemStyle,
                background: format === key ? "rgba(34,211,238,0.1)" : "none",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span style={{ color: format === key ? "#22d3ee" : "#ccc", fontSize: 14 }}>{label}</span>
              {format === key && <span style={{ marginLeft: "auto", color: "#22d3ee", fontSize: 14 }}>✓</span>}
            </button>
          ))}
          <button onClick={() => setSubPicker(null)} style={{ ...menuItemStyle, justifyContent: "center" }}>
            <span style={{ color: "#888", fontSize: 12 }}>← Back</span>
          </button>
        </div>
      );
    }
    if (subPicker === "language") {
      return (
        <div style={{ padding: "8px 0" }}>
          {([["en", "English"], ["es", "Español"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { onLanguageChange(key); setSubPicker(null); }}
              style={{
                ...menuItemStyle,
                background: language === key ? "rgba(34,211,238,0.1)" : "none",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span style={{ color: language === key ? "#22d3ee" : "#ccc", fontSize: 14 }}>{label}</span>
              {language === key && <span style={{ marginLeft: "auto", color: "#22d3ee", fontSize: 14 }}>✓</span>}
            </button>
          ))}
          <button onClick={() => setSubPicker(null)} style={{ ...menuItemStyle, justifyContent: "center" }}>
            <span style={{ color: "#888", fontSize: 12 }}>← Back</span>
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.5)", transition: "opacity 0.2s" }}
        onClick={() => { setSubPicker(null); onClose(); }}
      />
      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50"
        style={{
          background: "#1a1a2e",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: "75vh",
          overflowY: "auto",
          transition: "transform 0.3s ease-out",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div style={{ width: 36, height: 4, background: "#444", borderRadius: 2 }} />
        </div>

        <div style={{ padding: "0 16px 20px" }}>
          {subPicker ? (
            renderSubPicker()
          ) : (
            <>
              {/* Photo/Camera row */}
              <div className="flex gap-2 overflow-x-auto pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 64,
                    height: 64,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                >
                  <Camera size={22} style={{ color: "#888" }} />
                </button>
                {[1, 2, 3, 4].map((i) => (
                  <button
                    key={i}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 64,
                      height: 64,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12,
                    }}
                  >
                    <Image size={16} style={{ color: "#444" }} />
                  </button>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onAttachImage();
                      onClose();
                    }
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

              {/* Action items */}
              <button onClick={() => { onGenerateScript(); onClose(); }} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🎬</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Generate script</div>
                  <div style={{ color: "#666", fontSize: 11 }}>Build from canvas context</div>
                </div>
              </button>

              <button onClick={() => { onImageMode(); onClose(); }} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🖼</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Create image</div>
                  <div style={{ color: "#666", fontSize: 11 }}>Visualize with DALL-E 3</div>
                </div>
              </button>

              <button onClick={() => { onResearch(); onClose(); }} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🔍</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Deep research</div>
                  <div style={{ color: "#666", fontSize: 11 }}>Search the web for trends</div>
                </div>
              </button>

              <button onClick={() => { onVoiceInput(); onClose(); }} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🎤</span>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Voice input</div>
                  <div style={{ color: "#666", fontSize: 11 }}>Speak your message</div>
                </div>
              </button>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />

              {/* Settings items */}
              <button onClick={() => setSubPicker("model")} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>AI Model</div>
                </div>
                <span style={{ color: "#22d3ee", fontSize: 12 }}>{MODEL_LABELS[aiModel] || aiModel} ›</span>
              </button>

              <button onClick={() => setSubPicker("format")} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>📝</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Script format</div>
                </div>
                <span style={{ color: "#22d3ee", fontSize: 12 }}>{FORMAT_LABELS[format] || format} ›</span>
              </button>

              <button onClick={() => setSubPicker("language")} style={menuItemStyle}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>🌐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>Language</div>
                </div>
                <span style={{ color: "#22d3ee", fontSize: 12 }}>{language === "en" ? "EN" : "ES"} ›</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
});
PlusSheet.displayName = "PlusSheet";
```

- [ ] **Step 2: Wire PlusSheet into the main component render**

Add the `PlusSheet` component at the end of the main render return, just before the closing `</div>` and after the `NodeDetailSheet`:

```tsx
{/* Plus Sheet */}
<PlusSheet
  open={plusSheetOpen}
  onClose={() => setPlusSheetOpen(false)}
  format={format}
  language={language}
  aiModel={aiModel}
  onFormatChange={onFormatChange}
  onLanguageChange={onLanguageChange}
  onModelChange={onModelChange}
  onAttachImage={() => {
    // Trigger CanvasAIPanel's paste image flow via auto-message
    (window as any).__canvasAutoMessage = "[attach_image]";
  }}
  onVoiceInput={() => {
    (window as any).__canvasAutoMessage = "[voice_input]";
  }}
  onGenerateScript={() => {
    (window as any).__canvasAutoMessage = "Based on all connected context, generate a complete script now.";
  }}
  onImageMode={() => {
    (window as any).__canvasAutoMessage = "[image_mode]";
  }}
  onResearch={() => {
    (window as any).__canvasAutoMessage = "[research_mode]";
  }}
/>
```

Note: The `__canvasAutoMessage` approach works because CanvasAIPanel already checks for it. For Generate Script, we send the actual prompt text. For mode toggles (voice, image, research), these will need to be handled by checking for the special `[bracket]` messages in CanvasAIPanel — or alternatively, we can just trigger them as regular chat messages. The simplest approach: use real prompt text for Generate Script, and for Voice/Image/Research, just close the sheet and let the user use the dedicated features in the chat panel.

**Simplified alternative for action items** — change the callbacks to use direct chat prompts:

```tsx
onGenerateScript={() => {
  (window as any).__canvasAutoMessage = "Based on all connected context, generate a complete script now.";
}}
onImageMode={() => {
  (window as any).__canvasAutoMessage = "Generate an image: ";
}}
onResearch={() => {
  (window as any).__canvasAutoMessage = "Research: ";
}}
```

For Voice Input, trigger the browser SpeechRecognition API directly — we'll handle this in Task 4.

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/MobileCanvasView.tsx
git commit -m "feat(mobile): add ChatGPT-style '+' bottom sheet menu"
```

---

### Task 3: Add Chat History Sidebar

Create the `ChatSidebar` sub-component — a left-sliding panel showing chat sessions grouped by date.

**Files:**
- Modify: `src/components/canvas/MobileCanvasView.tsx`

- [ ] **Step 1: Create the ChatSidebar component**

Add this component above `PlusSheet`:

```tsx
// ── ChatSidebar (left-sliding chat history) ─────────────────────────────

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onBack: () => void;
}

function groupSessionsByDate(sessions: SessionItem[]): Record<string, SessionItem[]> {
  const groups: Record<string, SessionItem[]> = {};
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const s of sessions) {
    const d = s.created_at ? new Date(s.created_at) : now;
    const ds = d.toDateString();
    let label: string;
    if (ds === today) label = "Today";
    else if (ds === yesterday) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}

const ChatSidebar = memo(({
  open,
  onClose,
  sessions,
  activeSessionId,
  onNewSession,
  onSwitchSession,
  onBack,
}: ChatSidebarProps) => {
  const grouped = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{
          background: open ? "rgba(0,0,0,0.5)" : "transparent",
          pointerEvents: open ? "auto" : "none",
          transition: "background 0.2s",
        }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 bottom-0 left-0 z-50 flex flex-col"
        style={{
          width: "75vw",
          maxWidth: 280,
          background: "#12122a",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 flex-shrink-0"
          style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>Chats</span>
          <button onClick={onClose}>
            <X size={18} style={{ color: "#888" }} />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <button
            onClick={() => { onNewSession(); onClose(); }}
            className="w-full flex items-center gap-2 rounded-xl"
            style={{
              padding: "10px 12px",
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.2)",
              color: "#22d3ee",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Plus size={14} /> New chat
          </button>
        </div>

        {/* Session list */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {Object.entries(grouped).map(([dateLabel, dateSessions]) => (
            <div key={dateLabel} className="mb-3">
              <div
                style={{
                  color: "#555",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                {dateLabel}
              </div>
              {dateSessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => { onSwitchSession(s.id); onClose(); }}
                    className="w-full text-left truncate mb-1"
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      fontSize: 12,
                      color: isActive ? "#22d3ee" : "#999",
                      background: isActive ? "rgba(34,211,238,0.1)" : "transparent",
                      border: isActive ? "1px solid rgba(34,211,238,0.2)" : "1px solid transparent",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "block",
                    }}
                  >
                    {s.name || "Untitled"}
                  </button>
                );
              })}
            </div>
          ))}
          {sessions.length === 0 && (
            <p style={{ color: "#555", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "24px 0" }}>
              No chats yet
            </p>
          )}
        </div>

        {/* Footer — back to canvas */}
        <div
          className="flex-shrink-0 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => { onBack(); onClose(); }}
            className="flex items-center gap-2"
            style={{ color: "#888", fontSize: 12 }}
          >
            <ArrowLeft size={14} /> Back to canvas
          </button>
        </div>
      </div>
    </>
  );
});
ChatSidebar.displayName = "ChatSidebar";
```

- [ ] **Step 2: Wire ChatSidebar into the main render**

Add the `ChatSidebar` just before `PlusSheet` in the main render:

```tsx
{/* Chat History Sidebar */}
<ChatSidebar
  open={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  sessions={sessions}
  activeSessionId={activeSessionId}
  onNewSession={onNewSession}
  onSwitchSession={onSwitchSession}
  onBack={onBack}
/>
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/MobileCanvasView.tsx
git commit -m "feat(mobile): add left-sliding chat history sidebar"
```

---

### Task 4: Clean Up Unused Code and Final Polish

Remove any remaining dead code, fix unused variable warnings, and ensure the component root background matches the design spec.

**Files:**
- Modify: `src/components/canvas/MobileCanvasView.tsx`

- [ ] **Step 1: Remove unused handler functions**

In the main component, remove these handlers that referenced the old drawer:

```tsx
// REMOVE — handleNodeTap (referenced drawer)
const handleNodeTap = useCallback((node: Node) => {
  setSelectedNode(node);
  setDrawerState("collapsed");
}, []);

// REMOVE — handleCloseDetail (referenced drawer)
const handleCloseDetail = useCallback(() => {
  setSelectedNode(null);
  setDrawerState("half");
}, []);
```

Replace with simplified versions:

```tsx
const handleNodeTap = useCallback((node: Node) => {
  setSelectedNode(node);
}, []);

const handleCloseDetail = useCallback(() => {
  setSelectedNode(null);
}, []);
```

- [ ] **Step 2: Update root container background**

Change the root `<div>` background from `#131417` to `#0f0f1e` to match the spec's dark theme:

```tsx
<div
  className="fixed inset-0 flex flex-col mobile-canvas-root"
  style={{ background: "#0f0f1e", zIndex: 100 }}
>
```

- [ ] **Step 3: Remove contentNodes if unused**

If `contentNodes` is no longer used in the render (it was only used by NodeDrawer), remove:

```tsx
const contentNodes = useMemo(
  () => nodes.filter(n => n.type !== "aiAssistantNode" && n.type !== "groupNode" && n.type !== "annotationNode" && n.id !== "__mobile_ai__"),
  [nodes]
);
```

Check if `NodeDetailSheet` still needs it — it uses `selectedNode` directly, not `contentNodes`. So it's safe to remove.

- [ ] **Step 4: Remove unused imports**

After all the above changes, verify there are no unused imports. Remove any icon imports that are no longer referenced anywhere in the file. Specifically check: `ChevronUp`, `ChevronDown`, `Eye`, `Send` should have been removed in Task 1. Also remove `Video` if no longer used (check if `NodeDetailSheet` still renders it via `NODE_TYPE_META`).

`NODE_TYPE_META` still uses `Video`, `StickyNote`, `Search`, `Sparkles`, `Palette`, `Megaphone`, `Globe`, `Image`, `ClipboardList`, `Hash` — so keep all of those. `FileText` is used as a fallback in `NodeDetailSheet`. Keep it.

- [ ] **Step 5: Full TypeScript check**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Build check**

Run: `cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/MobileCanvasView.tsx
git commit -m "chore(mobile): clean up dead code, finalize ChatGPT-style mobile AI view"
```

---

## Summary

| Task | Description | Commits |
|------|-------------|---------|
| 1 | Strip old UI (drawer, FAB, header) → new ChatGPT header | 1 |
| 2 | Add "+" bottom sheet menu with actions + settings | 1 |
| 3 | Add left-sliding chat history sidebar | 1 |
| 4 | Clean up dead code, polish, verify build | 1 |

**Total: 4 tasks, 4 commits, single file modified.**
