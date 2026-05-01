# Canvas AI Panel — Wave 1 (ChatGPT-Feel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 pure-frontend upgrades to CanvasAIPanel that make it feel like ChatGPT — copy buttons, auto-grow input, stop generation, empty state, scroll-to-bottom, and dynamic chips.

**Architecture:** All changes in `src/components/canvas/CanvasAIPanel.tsx`. No backend changes. No new files. Each upgrade is additive — it adds state/logic/JSX without touching existing features.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react

---

### Task 1: Dynamic chips

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — replace static `QUICK_CHIPS` with computed `getDynamicChips()`

- [ ] Replace static `QUICK_CHIPS` array (line ~468) with a `getDynamicChips` function:

```ts
function getDynamicChips(messages: Message[], ctx: CanvasContext): string[] {
  const lastScript = [...messages].reverse().find(m => m.type === "script_preview");
  const ctxHasContent = hasContext(ctx);
  const hasVideo = ctx.transcriptions.filter(Boolean).length > 0;

  if (lastScript) {
    return ["Make a variation", "Translate to ES", "Does it reloop?", "Is story clear?", "Make it punchy"];
  }
  if (!ctxHasContent) {
    return ["Add a video reference", "Pick a hook style", "Suggest a format"];
  }
  if (hasVideo) {
    return ["What angle should we take?", "Suggest a hook", "Check my TAM", "Does it reloop?", "Is story clear?"];
  }
  return ["Suggest a hook", "Make it punchy", "Shorten it", "Check my TAM", "Does it reloop?", "Is story clear?"];
}
```

- [ ] In the chips render (line ~1389), replace `QUICK_CHIPS.filter(c => c !== "Generate Script").map(...)` with:

```tsx
{getDynamicChips(messages, canvasContext).map((chip) => (
  <button
    key={chip}
    onClick={() => sendMessage(chip)}
    disabled={loading || generating}
    className="px-2 py-1 rounded-lg text-[10px] text-primary border border-primary/25 bg-primary/5 hover:bg-primary/15 transition-colors disabled:opacity-40"
  >
    {chip}
  </button>
))}
```

- [ ] Delete the old `CHIP_PROMPTS` entries for chips that no longer exist in the static list (keep "Check my TAM", "Does it reloop?", "Is story clear?", add new ones):

```ts
const CHIP_PROMPTS: Record<string, string> = {
  "Check my TAM": "Look at my script topic and all connected context. Is the total addressable market large enough for this to go viral? Be specific — who exactly is the audience, how large is that group, and is the angle broad enough?",
  "Does it reloop?": "Does the current script have a rehook moment mid-way through — something that re-engages viewers who are about to scroll away? If yes, point it out. If not, suggest exactly where to add one and what it could say.",
  "Is story clear?": "Walk through the hook to body to CTA flow of the current script. Does it make logical sense to someone who knows nothing about this topic? Flag any gaps, confusing jumps, or assumed knowledge that needs to be explained.",
  "What angle should we take?": "Based on all connected nodes — what's the strongest angle for this script? Reference specific content from the connected video or notes. Give me a clear direction, not a list of options.",
  "Add a video reference": "I don't have any video references connected yet. What kind of video would be most useful to add to the canvas for this script?",
  "Make a variation": "Take the last generated script and create a variation — same angle, different hook and structure. Keep the core message but approach it from a different opening.",
  "Translate to ES": "Translate the last generated script to Spanish. Adapt it naturally — don't just translate word for word, make it feel native to Spanish-speaking audiences.",
  "Pick a hook style": "What hook style fits best for this content? Give me 3 different hook formats with a one-line example of each.",
  "Suggest a format": "Based on the connected context, what video format works best? Talking head, B-roll + voiceover, text-on-screen only, or mixed? Why?",
};
```

- [ ] Commit: `git commit -m "feat(canvas-ai): dynamic context-aware chips"`

---

### Task 2: Copy button on AI responses

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — add copy state + copy button to assistant messages

- [ ] Add `Copy, Check` to lucide-react imports (Check already imported, just add Copy)

- [ ] Add state after existing state declarations:
```tsx
const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
```

- [ ] Find the assistant message render block (~line 1311) and wrap it with a group + copy button:

```tsx
// Replace:
<div className="flex gap-2 items-start">
  <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
  <div className="text-foreground min-w-0 flex-1">
    <MarkdownText text={msg.content} />
  </div>
</div>

// With:
<div className="flex gap-2 items-start group">
  <Bot className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
  <div className="text-foreground min-w-0 flex-1 relative pr-6">
    <MarkdownText text={msg.content} />
    <button
      onClick={() => {
        navigator.clipboard.writeText(msg.content);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
      }}
      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground"
      title="Copy response"
    >
      {copiedIdx === idx
        ? <Check className="w-3 h-3 text-green-400" />
        : <Copy className="w-3 h-3" />}
    </button>
  </div>
</div>
```

Note: `idx` is the index in the `visibleMessages` map — use the loop index variable that already exists in the messages `.map((msg, idx) => ...)` call.

- [ ] Commit: `git commit -m "feat(canvas-ai): copy button on AI responses"`

---

### Task 3: Auto-grow textarea

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — replace shadcn Textarea with native textarea + auto-height

- [ ] Add textarea ref near other refs:
```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] Add auto-grow handler (place near other useCallback/useEffect hooks):
```tsx
const adjustTextareaHeight = useCallback(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}, []);
```

- [ ] Replace the `<Textarea` component (~line 1491) with a native `<textarea`:
```tsx
<textarea
  ref={textareaRef}
  value={input}
  onChange={(e) => { setInput(e.target.value); adjustTextareaHeight(); }}
  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
  placeholder={imageMode ? "Describe the image..." : "Ask anything about your script..."}
  data-tutorial-target="ai-chat-input"
  className={`resize-none text-xs rounded-xl placeholder:text-white/50 flex-1 min-w-0 px-3 py-2 border bg-transparent outline-none focus:ring-0 ${
    imageMode
      ? "bg-purple-500/5 border-purple-500/20 focus:border-purple-500/40"
      : "bg-muted/30 border-border focus:border-primary/50"
  }`}
  style={{ color: "#e0e0e0", minHeight: 36, maxHeight: 160, overflowY: "auto", height: 36 }}
  rows={1}
  disabled={loading || generating}
/>
```

- [ ] After `sendMessage` clears the input (`setInput("")`), reset height:
```tsx
setInput("");
if (textareaRef.current) textareaRef.current.style.height = "36px";
```

- [ ] Remove the `import { Textarea } from "@/components/ui/textarea"` import if no longer used elsewhere in the file (check first with grep)

- [ ] Commit: `git commit -m "feat(canvas-ai): auto-grow textarea"`

---

### Task 4: Stop generation button

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — add AbortController + stop button

- [ ] Add `Square` to lucide-react imports (stop icon)

- [ ] Add abort ref near other refs:
```tsx
const abortControllerRef = useRef<AbortController | null>(null);
```

- [ ] In `sendMessage()`, before each `fetch(...)` call to ai-assistant and ai-build-script, add:
```tsx
const abortController = new AbortController();
abortControllerRef.current = abortController;
// then pass to fetch:
fetch(url, { method: "POST", headers, body, signal: abortController.signal })
```

- [ ] In `generateScript()`, same pattern:
```tsx
const abortController = new AbortController();
abortControllerRef.current = abortController;
```

- [ ] In catch blocks for both functions, ignore AbortError:
```tsx
} catch (err: any) {
  if (err?.name === "AbortError") return; // user stopped generation
  // ... existing error handling
}
```

- [ ] Replace the Send button (~line 1521) with a conditional that shows Stop when loading:
```tsx
{(loading || generating) ? (
  <button
    type="button"
    onClick={() => {
      abortControllerRef.current?.abort();
      setLoading(false);
      setGenerating(false);
    }}
    className="h-9 w-9 p-0 flex-shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors"
    title="Stop generating"
  >
    <Square className="w-3.5 h-3.5 fill-current" />
  </button>
) : (
  <Button
    size="sm"
    variant={imageMode ? "default" : "cta"}
    className={`h-9 w-9 p-0 flex-shrink-0 rounded-xl ${imageMode ? "bg-purple-500 hover:bg-purple-600 text-white" : ""}`}
    onClick={() => sendMessage(input)}
    disabled={!input.trim() || loading || generating}
  >
    <Send className="w-3.5 h-3.5" />
  </Button>
)}
```

- [ ] Commit: `git commit -m "feat(canvas-ai): stop generation button with AbortController"`

---

### Task 5: Smart empty state

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — show helpful UI when chat is empty

- [ ] Find the chat scroll body div where messages are rendered. Find where `visibleMessages.map(...)` starts. Add the empty state before the map:

```tsx
{messages.length === 0 && !loading && !generating && (
  <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
    <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
      <Wand2 className="w-5 h-5 text-primary" />
    </div>
    <p className="text-sm font-semibold text-foreground mb-1">
      {scriptLang === "es" ? "¿Qué hacemos hoy?" : "What are we making today?"}
    </p>
    <p className="text-xs text-muted-foreground mb-4 max-w-[200px] leading-relaxed">
      {scriptLang === "es"
        ? "Conecta nodos para dar contexto o empieza con una de estas:"
        : "Connect nodes to give me context, or start with one of these:"}
    </p>
    <div className="flex flex-wrap gap-1.5 justify-center">
      {["Generate a script", "Suggest a hook style", "Analyze my video"].map((s) => (
        <button
          key={s}
          onClick={() => sendMessage(s)}
          className="px-3 py-1.5 rounded-xl text-[11px] border border-primary/25 bg-primary/5 text-primary hover:bg-primary/15 transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] Commit: `git commit -m "feat(canvas-ai): smart empty state with starter prompts"`

---

### Task 6: Scroll to bottom button

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` — track scroll position + show jump button

- [ ] Add `ChevronDown` to lucide-react imports (already has `ChevronUp`, add Down variant)

- [ ] Add scroll state near other state:
```tsx
const [showScrollBtn, setShowScrollBtn] = useState(false);
const [unreadCount, setUnreadCount] = useState(0);
```

- [ ] Add scroll handler on the scroll container div (the div with `ref={scrollContainerRef}`). Add `onScroll`:
```tsx
onScroll={(e) => {
  const el = e.currentTarget;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  setShowScrollBtn(!atBottom);
  if (atBottom) setUnreadCount(0);
}}
```

- [ ] Track new messages while not at bottom — add to the existing `useEffect` that watches `messages`:
```tsx
// In the existing useEffect that watches messages (line ~738):
useEffect(() => {
  const lastMsg = messages[messages.length - 1];
  const lastContent = lastMsg ? `${lastMsg.role}:${lastMsg.content.slice(0, 50)}` : "";
  if (lastContent && lastContent !== prevLastMsgRef.current) {
    if (!showScrollBtn) {
      // At bottom — auto scroll
      setVisibleCount(DEFAULT_WINDOW);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (lastMsg?.role === "assistant") {
      // Not at bottom — increment badge
      setUnreadCount(prev => prev + 1);
    }
  }
  prevLastMsgRef.current = lastContent;
}, [messages, showScrollBtn]);
```

- [ ] Make the scroll container `relative` and add the button inside it (just before `<div ref={bottomRef} />`):
```tsx
{showScrollBtn && (
  <div className="sticky bottom-2 flex justify-center pointer-events-none">
    <button
      onClick={() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        setShowScrollBtn(false);
        setUnreadCount(0);
      }}
      className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronDown className="w-3 h-3" />
      {unreadCount > 0 ? `${unreadCount} new` : "Latest"}
    </button>
  </div>
)}
```

- [ ] Commit: `git commit -m "feat(canvas-ai): scroll-to-bottom button with unread count"`

---

### Final: Build & deploy

- [ ] Run `npm run build` — verify 0 errors
- [ ] Deploy to VPS + reload nginx
- [ ] Commit: `git commit -m "feat(canvas-ai): wave 1 complete — chatgpt-feel upgrades"`
