# Canvas Memory Budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate memory crashes on SuperPlanningCanvas by capping message accumulation, truncating context strings, pausing auto-save during idle, and adding infinite-scroll message windowing.

**Architecture:** Four independent fixes applied to three files. Each fix targets a specific memory hotspot. No external libraries needed — all changes use built-in React APIs and IntersectionObserver.

**Tech Stack:** React, TypeScript, IntersectionObserver API, URL.createObjectURL/revokeObjectURL

**Spec:** `docs/superpowers/specs/2026-03-26-canvas-memory-budget-design.md`

---

### Task 1: Message Cap in CanvasAIPanel

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx:230-232` (state init)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:326-337` (generateScript appends)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:352-367` (sendMessage user msg + generate shortcut)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:485-541` (sendMessage AI/image/error responses)

- [ ] **Step 1: Add MAX_MESSAGES constant and capMessages helper**

At the top of `CanvasAIPanel.tsx`, after the `MODEL_LABEL` line (~line 91), add:

```typescript
const MAX_MESSAGES = 50;
/** Cap messages array to last MAX_MESSAGES entries */
const capMessages = (msgs: Message[]): Message[] =>
  msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
```

- [ ] **Step 2: Wrap every message append with capMessages**

There are 9 places where messages are appended via `[...messagesRef.current, newMsg]`. Each one needs to be wrapped with `capMessages(...)`. The pattern is always the same — find `const _varName = [...messagesRef.current, someMsg];` and change to `const _varName = capMessages([...messagesRef.current, someMsg]);`.

> **Note:** After the cap is reached, `messages.length` stays at 50 on each append. Older messages beyond 50 are permanently removed from both state and DB (the persist call overwrites with the capped array).

Locations (all in `sendMessage` and `generateScript` callbacks):

1. Line ~327: `const _withGen = capMessages([...messagesRef.current, _genMsg]);`
2. Line ~334: `const _withGenErr = capMessages([...messagesRef.current, _genErrMsg]);`
3. Line ~353: `const _genUpdated = capMessages([...messagesRef.current, _genUserMsg]);`
4. Line ~363: `const updated = capMessages([...messagesRef.current, userMsg]);`
5. Line ~486-488: `const _withErr = capMessages([...messagesRef.current, _errMsg]);`
6. Line ~499-501: `const _withImg = capMessages([...messagesRef.current, _imgMsg]);`
7. Line ~524-526: `const _withErr = capMessages([...messagesRef.current, _errMsg]);`
8. Line ~530-532: `const _withAI = capMessages([...messagesRef.current, _aiMsg]);`
9. Line ~538-540: `const _withCatch = capMessages([...messagesRef.current, _catchMsg]);`

- [ ] **Step 3: Verify the build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to CanvasAIPanel

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "fix(canvas): cap chat messages at 50 to prevent memory accumulation"
```

---

### Task 2: Message Cap in AIAssistantNode

**Files:**
- Modify: `src/components/canvas/AIAssistantNode.tsx:271-278` (handleMessagesChange)
- Modify: `src/components/canvas/AIAssistantNode.tsx:142` (setActiveMessages on load)

- [ ] **Step 1: Add MAX_MESSAGES constant**

At the top of `AIAssistantNode.tsx`, after the `EMPTY_CONTEXT` const (~line 66), add:

```typescript
const MAX_MESSAGES = 50;
```

- [ ] **Step 2: Cap messages in handleMessagesChange**

In `handleMessagesChange` (~line 271), cap both the state update and the localStorage write:

```typescript
const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
    console.log("[chat] handleMessagesChange called, activeChatId:", activeChatId, "msgs.length:", msgs.length);
    const capped = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;
    activeMessagesRef.current = capped;
    setActiveMessages(capped);
    if (activeChatId) {
      try { localStorage.setItem(`cc_chat_${activeChatId}`, JSON.stringify(stripImagesForPersistence(capped).slice(-MAX_MESSAGES))); } catch { /* ignore */ }
      persistMessages(activeChatId, capped);
    } else {
      console.warn("[chat] handleMessagesChange called but activeChatId is null — save skipped");
    }
  }, [activeChatId, persistMessages]);
```

- [ ] **Step 3: Cap messages on load from DB/localStorage**

In the chat load effect (~line 142), cap `restoredMsgs` before setting state:

Change:
```typescript
setActiveMessages(restoredMsgs);
```
To:
```typescript
setActiveMessages(restoredMsgs.length > MAX_MESSAGES ? restoredMsgs.slice(-MAX_MESSAGES) : restoredMsgs);
```

- [ ] **Step 3b: Cap messages in switchChat**

In `switchChat` (~line 244), cap the messages loaded from the chat object:

Change:
```typescript
setActiveMessages((chat.messages as any) || []);
```
To:
```typescript
const switched = (chat.messages as any) || [];
setActiveMessages(switched.length > MAX_MESSAGES ? switched.slice(-MAX_MESSAGES) : switched);
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/AIAssistantNode.tsx
git commit -m "fix(canvas): cap AI node messages at 50 in state and localStorage"
```

---

### Task 3: Context String Truncation

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx:381-462` (contextSummary builder in sendMessage)

- [ ] **Step 1: Add truncation constants and helper**

After the `capMessages` helper added in Task 1, add:

```typescript
const MAX_CONTEXT_CHARS = 8000;
const CONTEXT_BUDGETS = {
  text_notes: 2000,
  transcriptions: 3000,
  video_analyses: 1500,
  competitor_profiles: 1500,
} as const;

/** Truncate string to budget, appending ellipsis if trimmed */
const truncateSection = (text: string, budget: number): string =>
  text.length <= budget ? text : text.slice(0, budget) + "...(truncated)";
```

- [ ] **Step 2: Apply budgets to contextSummary builder**

Replace lines 381-462 (the `const contextSummary = [...]` block) with:

```typescript
      // Build context with per-section budgets to prevent memory bloat
      const rawTextNotes = cc.text_notes
        ? `CREATOR NOTES (treat as core research & instructions — USE this content when generating scripts):\n${cc.text_notes}`
        : null;

      const rawTranscriptions = cc.transcriptions.length > 0
        ? `VIDEO TRANSCRIPTION TEMPLATES (use as FORMAT reference — replicate structure, pacing, rhythm):\n${
            cc.transcriptions.map((t, i) => {
              const src = cc.video_sources?.[i];
              const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
              const perVideo = Math.floor(CONTEXT_BUDGETS.transcriptions / cc.transcriptions.length);
              return `[${label}]: ${typeof t === "string" ? t.slice(0, perVideo) : ""}`;
            }).join("\n\n")
          }`
        : null;

      const rawVideoAnalyses = (cc.video_analyses?.length ?? 0) > 0
        ? `VISUAL SCENES (actual frame-by-frame analysis of reference videos — use as visual template):\n${
            cc.video_analyses!.map((va, i) => {
              const lines = [`Video ${i + 1} (${va.detected_format || "unknown format"}):`];
              (va.visual_segments || []).slice(0, 20).forEach(seg => {
                const tos = seg.text_on_screen?.length ? ` | TEXT ON SCREEN: "${seg.text_on_screen.join(" / ")}"` : "";
                lines.push(`  [${seg.start}s–${seg.end}s] ${seg.description}${tos}`);
              });
              if (va.audio) {
                lines.push(`  Audio: music=${va.audio.has_music}, energy=${va.audio.energy}, speech=${va.audio.speech_density}`);
              }
              return lines.join("\n");
            }).join("\n\n")
          }`
        : null;

      const rawCompetitorProfiles = (cc.competitor_profiles?.length ?? 0) > 0
        ? `COMPETITOR ANALYSIS (for strategy comparison):\n${
            cc.competitor_profiles!.map(cp => {
              const topPosts = cp.top_posts
                .sort((a, b) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0))
                .slice(0, 5);
              const best = topPosts[0];
              return `@${cp.username}\n- Top hook patterns: ${cp.hook_patterns.join(", ") || "not yet analyzed"}\n- Top content themes: ${cp.content_themes.join(", ") || "not yet analyzed"}${best ? `\n- Best post (${best.outlier_score?.toFixed?.(1) ?? best.outlier_score}x outlier, ${best.views?.toLocaleString()} views): "${best.caption?.slice(0, 100)}"` : ""}`;
            }).join("\n\n")
          }`
        : null;

      const contextSummary = [
        (cc.connected_nodes?.length ?? 0) > 0
          ? `CONNECTED NODES (everything wired to you on the canvas right now):\n${cc.connected_nodes!.join("\n")}`
          : "CONNECTED NODES: none",
        cc.primary_topic ? `Topic: ${cc.primary_topic}` : null,
        rawTextNotes ? truncateSection(rawTextNotes, CONTEXT_BUDGETS.text_notes) : null,
        rawTranscriptions ? truncateSection(rawTranscriptions, CONTEXT_BUDGETS.transcriptions) : null,
        cc.structures.length > 0
          ? `VIDEO STRUCTURE TEMPLATES (ONLY use sections shown):\n${
              cc.structures.map((s, i) => {
                if (!s) return null;
                const src = cc.video_sources?.[i];
                const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
                const formatLine = s.format_notes
                  ? `[${label}] Format: ${s.detected_format} — ${s.format_notes}`
                  : `[${label}] Format: ${s.detected_format}`;
                return `${formatLine}\n${(s.sections || [])
                  .map((sec: any) => `  [${sec.section.toUpperCase()}] "${sec.actor_text}" | Visual: ${sec.visual_cue}`)
                  .join("\n")}`;
              }).filter(Boolean).join("\n\n")
            }`
          : null,
        cc.research_facts.length > 0
          ? `Research Facts:\n${cc.research_facts.map(f => `- ${f.fact} (impact ${f.impact_score})`).join("\n")}`
          : null,
        cc.selected_hook
          ? `⚠️ SELECTED HOOK (creator chose this — use it as the script opening, preserve its pattern):\n"${cc.selected_hook}" (${cc.selected_hook_category ?? "general"} style)`
          : null,
        cc.brand_guide
          ? `⚠️ BRAND CONSTRAINTS (HARD RULES — violating these makes script unusable):\n- Tone: ${cc.brand_guide.tone ?? "not set"}\n- Brand values: ${cc.brand_guide.brand_values ?? "none"}\n- Forbidden words/phrases: ${cc.brand_guide.forbidden_words ?? "none"}\n- Tagline (use if natural): "${cc.brand_guide.tagline ?? ""}"`
          : null,
        cc.selected_cta
          ? `⚠️ REQUIRED CTA (script MUST end with this exact call-to-action verbatim):\n"${cc.selected_cta}"`
          : null,
        rawCompetitorProfiles ? truncateSection(rawCompetitorProfiles, CONTEXT_BUDGETS.competitor_profiles) : null,
        rawVideoAnalyses ? truncateSection(rawVideoAnalyses, CONTEXT_BUDGETS.video_analyses) : null,
        (cc.media_files?.length ?? 0) > 0
          ? `UPLOADED MEDIA:\n${
              cc.media_files!.map(m => {
                const parts = [`- ${m.file_name} (${m.file_type})`];
                if (m.audio_transcription) parts.push(`  Audio transcript: ${m.audio_transcription}`);
                if (m.visual_transcription?.visual_segments?.length) {
                  parts.push(`  Visual breakdown: ${m.visual_transcription.visual_segments.map((s: any) => s.description).join(" → ")}`);
                }
                return parts.join("\n");
              }).join("\n")
            }`
          : null,
      ].filter(Boolean).join("\n\n");

      // Final hard cap as safety net
      const cappedContext = contextSummary.length > MAX_CONTEXT_CHARS
        ? contextSummary.slice(0, MAX_CONTEXT_CHARS) + "\n...(context truncated)"
        : contextSummary;
```

- [ ] **Step 3: Update the contextSummary usage**

Change line ~516 where `contextSummary` is used in the API call:

```typescript
client_info: { ...clientInfo, canvas_context: cappedContext },
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "fix(canvas): truncate context string to 8K chars with per-section budgets"
```

---

### Task 3b: Source-Level Context Budgets in SuperPlanningCanvas

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx:729-856` (canvasContext useMemo)

- [ ] **Step 1: Limit competitor profile top_posts to 5**

In the canvasContext useMemo, find where `top_posts` is assembled for competitor profiles (~line 834-841). Change:

```typescript
return { username: d.username || "unknown", top_posts: posts, hook_patterns: hookPatterns, content_themes: contentThemes };
```

To:

```typescript
const topPosts = posts
  .sort((a: any, b: any) => (b.outlier_score ?? 0) - (a.outlier_score ?? 0))
  .slice(0, 5);
return { username: d.username || "unknown", top_posts: topPosts, hook_patterns: hookPatterns, content_themes: contentThemes };
```

- [ ] **Step 2: Limit visual_segments to 20 per video**

In the canvasContext useMemo, find where `visual_segments` is passed (~line 818). Change:

```typescript
visual_segments: va.visual_segments || [],
```

To:

```typescript
visual_segments: (va.visual_segments || []).slice(0, 20),
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "perf(canvas): limit competitor posts to 5 and visual segments to 20 at source"
```

---

### Task 4: Idle-Aware Auto-Save

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx:610-700` (saveCanvas + auto-save intervals)

- [ ] **Step 1: Add lastActivityRef and IDLE_TIMEOUT constant**

Find the line `const isDirtyRef = useRef(false);` (~line 611) and add after it:

```typescript
const IDLE_TIMEOUT = 60_000; // 60 seconds
const lastActivityRef = useRef(Date.now());
```

- [ ] **Step 2: Add activity tracking effect**

After the `useEffect` that marks dirty on `[nodes, edges, drawPaths, loaded]` (~line 676-679), add a new effect:

```typescript
  // ─── Track user activity for idle-aware saves (throttled to 1Hz) ───
  useEffect(() => {
    let lastFired = 0;
    const markActive = () => {
      const now = Date.now();
      if (now - lastFired < 1000) return; // throttle: max once per second
      lastFired = now;
      const wasIdle = now - lastActivityRef.current > IDLE_TIMEOUT;
      lastActivityRef.current = now;
      // If returning from idle, trigger a catch-up save
      if (wasIdle && isDirtyRef.current) saveCanvas();
    };
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
    };
  }, [saveCanvas]);
```

- [ ] **Step 3: Add idle guard to saveCanvas**

In `saveCanvas` (~line 614), add an early bail right after the existing guards:

Change:
```typescript
if (nodesRef.current.length === 0) return;
const serializedNodes = serializeNodes(nodesRef.current);
```
To:
```typescript
if (nodesRef.current.length === 0) return;
// Skip serialization if not dirty (prevents 2-5MB temp string during idle)
if (!force && !isDirtyRef.current) return;
const serializedNodes = serializeNodes(nodesRef.current);
```

- [ ] **Step 4: Add idle guard to the 2s debounced auto-save**

In the debounced auto-save effect (~line 681-691), add the idle check:

Change:
```typescript
saveTimerRef.current = setTimeout(() => saveCanvas(), 2000);
```
To:
```typescript
saveTimerRef.current = setTimeout(() => {
  if (Date.now() - lastActivityRef.current < IDLE_TIMEOUT) saveCanvas();
}, 2000);
```

- [ ] **Step 5: Add idle guard to the 30s periodic auto-save**

In the periodic save (~line 694-700), add the idle check:

Change:
```typescript
const interval = setInterval(() => {
  if (isDirtyRef.current) saveCanvas();
}, 30_000);
```
To:
```typescript
const interval = setInterval(() => {
  if (isDirtyRef.current && Date.now() - lastActivityRef.current < IDLE_TIMEOUT) saveCanvas();
}, 30_000);
```

- [ ] **Step 6: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "fix(canvas): pause auto-save during idle to prevent memory buildup"
```

---

### Task 5: Infinite-Scroll Message Windowing

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx:230-241` (state + refs)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:582-670` (message rendering JSX)

- [ ] **Step 1: Add windowing state and refs**

After the existing `bottomRef` line (~line 239), add:

```typescript
const DEFAULT_WINDOW = 15;
const [visibleCount, setVisibleCount] = useState(DEFAULT_WINDOW);
const sentinelRef = useRef<HTMLDivElement>(null);
const scrollContainerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Reset visibleCount on new message**

Replace the existing scroll-to-bottom effect (~line 241):

```typescript
useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
```

With:

```typescript
// Track last message content to detect new messages (length alone fails after cap — stays at 50)
const prevLastMsgRef = useRef<string>("");
useEffect(() => {
  const lastMsg = messages[messages.length - 1];
  const lastContent = lastMsg ? `${lastMsg.role}:${lastMsg.content.slice(0, 50)}` : "";
  if (lastContent && lastContent !== prevLastMsgRef.current) {
    setVisibleCount(DEFAULT_WINDOW);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }
  prevLastMsgRef.current = lastContent;
}, [messages]);
```

- [ ] **Step 3: Add IntersectionObserver for infinite scroll**

After the new scroll effect, add:

```typescript
// Infinite scroll — load older messages when sentinel becomes visible
useEffect(() => {
  const sentinel = sentinelRef.current;
  const container = scrollContainerRef.current;
  if (!sentinel || !container) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        // Save scroll position before expanding
        const prevHeight = container.scrollHeight;
        const prevTop = container.scrollTop;
        setVisibleCount(prev => {
          const next = Math.min(prev + 15, messages.length);
          // Restore scroll position after React re-renders
          requestAnimationFrame(() => {
            const newHeight = container.scrollHeight;
            container.scrollTop = prevTop + (newHeight - prevHeight);
          });
          return next;
        });
      }
    },
    { root: container, threshold: 0.1 }
  );

  observer.observe(sentinel);
  return () => observer.disconnect();
}, [messages.length]);
```

- [ ] **Step 4: Compute visible messages slice**

Before the `return (` statement (~line 553), add:

```typescript
const visibleMessages = messages.slice(-visibleCount);
const hasOlderMessages = visibleCount < messages.length;
```

- [ ] **Step 5: Update the messages container JSX**

Replace the messages scroll container div (~line 583):

```html
<div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0 nodrag nowheel" style={{ userSelect: "text", cursor: "auto" }}>
```

With:

```html
<div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0 nodrag nowheel" style={{ userSelect: "text", cursor: "auto" }}>
```

- [ ] **Step 6: Add sentinel div and loading indicator**

Right after the opening of the scroll container (after the `{messages.length === 0 && ...}` greeting block, ~line 598), add:

```tsx
{/* Infinite scroll sentinel — triggers loading older messages */}
{hasOlderMessages && (
  <div ref={sentinelRef} className="flex justify-center py-2">
    <Loader2 className="w-3.5 h-3.5 text-muted-foreground/40 animate-spin" />
  </div>
)}
```

- [ ] **Step 7: Replace messages.map with visibleMessages.map**

Change line ~599:

```tsx
{messages.map((msg, i) => (
```

To:

```tsx
{visibleMessages.map((msg, i) => (
```

- [ ] **Step 8: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 9: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "feat(canvas): add infinite-scroll message windowing for memory efficiency"
```

---

### Task 6: Base64 Image Blob URL Cache

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx:1` (imports)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:230-240` (add blob cache ref)
- Modify: `src/components/canvas/CanvasAIPanel.tsx:602-618` (image rendering)

- [ ] **Step 1: Add blob URL cache ref and cleanup**

After the `scrollContainerRef` added in Task 5, add:

```typescript
// Cache base64 → blob URLs to avoid keeping large strings in DOM
const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
useEffect(() => {
  return () => {
    // Revoke all blob URLs on unmount
    blobUrlCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    blobUrlCacheRef.current.clear();
  };
}, []);
```

- [ ] **Step 2: Add helper to get or create blob URL**

After the cache ref, add:

```typescript
const getBlobUrl = useCallback((base64: string): string => {
  // Use length + head + tail as collision-resistant cache key
  const cacheKey = `${base64.length}:${base64.slice(0, 64)}:${base64.slice(-64)}`;
  const cached = blobUrlCacheRef.current.get(cacheKey);
  if (cached) return cached;
  const byteChars = atob(base64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  blobUrlCacheRef.current.set(cacheKey, url);
  return url;
}, []);
```

- [ ] **Step 3: Update image rendering to use blob URLs**

Replace the image `src` attribute (~line 607):

```tsx
src={`data:image/png;base64,${msg.image_b64}`}
```

With:

```tsx
src={getBlobUrl(msg.image_b64!)}
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "perf(canvas): cache base64 images as blob URLs to reduce DOM memory"
```

---

### Task 7: Build, Deploy, and Verify

**Files:**
- All three modified files

- [ ] **Step 1: Run full build**

Run on VPS:
```bash
cd /var/www/connectacreators && npm run build
```
Expected: Build succeeds with no errors

- [ ] **Step 2: Reload nginx**

```bash
nginx -s reload
```

- [ ] **Step 3: Manual smoke test**

1. Open a canvas with nodes, chat 5+ turns — verify messages appear correctly
2. Scroll up in chat — verify older messages load smoothly (infinite scroll)
3. Send a new message after scrolling up — verify it resets to bottom
4. Leave page idle for 3+ minutes — verify no crash
5. Check browser console for `contextSummary length:` log — verify it's under 8000

- [ ] **Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "fix(canvas): memory budget — cap messages, truncate context, idle-save, infinite scroll

- Cap chat messages at 50 in state and localStorage
- Truncate context string to 8K chars with per-section budgets
- Pause auto-save after 60s idle, resume on interaction
- Infinite-scroll message windowing (render last 15, load more on scroll up)
- Cache base64 images as blob URLs to reduce DOM memory pressure"
```
