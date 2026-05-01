# AI Panel Claude-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CanvasAIPanel input area — context chips scroll horizontally above the rounded box; inside the box: full-width textarea → divider → `circle-+` · spacer · `Generate Script` (teal) · model name · mic/send.

**Architecture:** All changes are confined to `CanvasAIPanel.tsx` (bottom section restructure) and `SuperPlanningCanvas.tsx` + `FullscreenAIView.tsx` (input draft sync via `window.__canvasAIDraftInput`). The `circle-+` button opens an inline dropdown that houses image mode, research mode, and prompt presets. Generate Script moves from a full-width button row into the inner toolbar.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react, existing CanvasAIPanel props/state

---

## File Map

| File | Change |
|------|--------|
| `src/components/canvas/CanvasAIPanel.tsx` | Restructure lines ~2130–2538: remove standalone Generate Script button + old chips row; add scrollable context-chips-above-box + unified input box with Generate Script in inner toolbar |
| `src/pages/SuperPlanningCanvas.tsx` | Pass `initialDraftInput` to FullscreenAIView on open |
| `src/components/canvas/FullscreenAIView.tsx` | Accept and forward `initialDraftInput` to its CanvasAIPanel instance |

---

## Task 1: Restructure the bottom section of CanvasAIPanel

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` lines ~2130–2538

### Final layout (visual reference):
```
px-3 pt-2 pb-2 flex-shrink-0 wrapper
├── Research mode banner (unchanged, if active)
├── Pasted image preview (moved above chips)
├── CONTEXT CHIPS ROW — scrollable, above box, no Generate Script here
│   [chip1] [chip2] [chip3] [chip4]...
└── UNIFIED INPUT BOX — rounded container
    ├── textarea (full-width, no siblings in this row)
    ├── inner divider line
    └── inner toolbar row
        ├── circle-+ (opens dropdown: image mode, research, presets)
        ├── flex spacer
        ├── Generate Script (teal text-button, triggers generateScript())
        ├── separator |
        ├── Model name + chevron (opens existing portal dropdown)
        └── mic | send-circle | stop-square
```

- [ ] **Step 1: Add `plusMenuOpen` state and click-outside handler**

Near the other state declarations in `src/components/canvas/CanvasAIPanel.tsx` (~line 1050), add:

```tsx
const [plusMenuOpen, setPlusMenuOpen] = useState(false);
const plusMenuRef = useRef<HTMLDivElement>(null);
```

Add a click-outside handler alongside the existing `showPresets` one (~line 1121):

```tsx
useEffect(() => {
  if (!plusMenuOpen) return;
  const handler = (e: MouseEvent) => {
    if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
      setPlusMenuOpen(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [plusMenuOpen]);
```

- [ ] **Step 2: Replace the old chips row + Generate Script button with context-chips-only row**

In `src/components/canvas/CanvasAIPanel.tsx`, find and replace lines ~2139–2177 (from the chips `<div>` through the closing `</button>` of the Generate Script full-width button):

**Find (remove all of this):**
```tsx
{/* Context-aware chips — float above Generate Script */}
<div className="flex flex-wrap gap-1 mb-2">
  {getDynamicChips(messages, getLatestContext()).map((chip) => (
    <button
      key={chip}
      onClick={() => sendMessage(chip)}
      disabled={loading || generating}
      className="px-2 py-1 rounded-lg text-[10px] text-muted-foreground/80 border border-border/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-40"
    >
      {chip}
    </button>
  ))}
</div>

<button
  onPointerDown={(e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("[GenerateScript] pointerDown! generating:", generating);
    if (!generating) {
      toast.info("Generating script...");
      generateScript();
    }
  }}
  onClick={(e) => {
    e.stopPropagation();
    console.log("[GenerateScript] onClick! generating:", generating);
    if (!generating) {
      toast.info("Generating script...");
      generateScript();
    }
  }}
  type="button"
  className="w-full flex items-center justify-center gap-2 text-sm mb-2 py-2.5 px-4 rounded-lg font-semibold tracking-wide cursor-pointer select-none"
  style={{ opacity: generating ? 0.5 : 1, position: "relative", zIndex: 100, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", color: "#22d3ee" }}
>
  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
  {generating ? "Generating..." : "Generate Script"}
</button>
```

**Replace with (context chips above box only, no Generate Script here):**
```tsx
{/* Pasted image preview — above chips */}
{pastedImage && (
  <div className="flex items-center gap-2 mb-2 px-1">
    <div className="relative flex-shrink-0">
      <img src={pastedImage.dataUrl} alt="Pasted" className="w-12 h-12 rounded-lg object-cover border border-border" />
      <button
        onClick={() => setPastedImage(null)}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
    <span className="text-[10px] text-muted-foreground">Image attached — AI will analyze it</span>
  </div>
)}

{/* CONTEXT CHIPS ROW — scrollable, above the input box */}
<div style={{ display:"flex", gap:5, overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" as any, marginBottom:6, paddingBottom:2, alignItems:"center" }}>
  {getDynamicChips(messages, getLatestContext()).map((chip) => (
    <button
      key={chip}
      onClick={() => sendMessage(chip)}
      disabled={loading || generating}
      style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.4)", borderRadius:8, padding:"4px 9px", fontSize:10, whiteSpace:"nowrap", flexShrink:0, cursor:"pointer", opacity: (loading || generating) ? 0.4 : 1 }}
    >
      {chip}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Replace the old input row with the unified input box**

Find the block `{/* Input row: model selector + image toggle + textarea + presets + send */}` (~line 2195) through the closing tag of its parent `</div>` (~line 2529). Also find the old pasted-image-preview block below line 2177 (it was between the Generate Script button and the input row) and remove it since we moved it above. Replace everything with:

```tsx
{/* UNIFIED INPUT BOX — Claude style */}
<div
  ref={presetsRef}
  className="relative rounded-xl border"
  style={{
    background: imageMode ? "rgba(168,85,247,0.05)" : "rgba(255,255,255,0.04)",
    borderColor: imageMode ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.1)",
  }}
>
  {/* @ mention dropdown portal — keep existing code exactly as-is */}
  {atMentionQuery !== null && (() => {
    const rawNodes = (window as any).__canvasNodes as any[] | undefined;
    const AI_NODE = "ai-assistant";
    const NODE_ICON_COMPONENTS: Record<string, React.ReactNode> = {
      videoNode:              <Film className="w-3.5 h-3.5" />,
      textNoteNode:           <FileText className="w-3.5 h-3.5" />,
      researchNoteNode:       <Search className="w-3.5 h-3.5" />,
      hookGeneratorNode:      <Zap className="w-3.5 h-3.5" />,
      brandGuideNode:         <Palette className="w-3.5 h-3.5" />,
      ctaBuilderNode:         <Megaphone className="w-3.5 h-3.5" />,
      competitorProfileNode:  <User className="w-3.5 h-3.5" />,
      instagramProfileNode:   <User className="w-3.5 h-3.5" />,
      mediaNode:              <Paperclip className="w-3.5 h-3.5" />,
      groupNode:              <Folder className="w-3.5 h-3.5" />,
      annotationNode:         <MapPin className="w-3.5 h-3.5" />,
    };
    const NODE_LABELS: Record<string, string> = {
      videoNode: "Video", textNoteNode: "Text Note", researchNoteNode: "Research",
      hookGeneratorNode: "Hook Generator", brandGuideNode: "Brand Guide", ctaBuilderNode: "CTA Builder",
      competitorProfileNode: "Competitor", instagramProfileNode: "Competitor", mediaNode: "Media",
      groupNode: "Group", annotationNode: "Annotation",
    };
    const allNodes = (rawNodes || [])
      .filter((n: any) => n.id !== AI_NODE && n.type !== "aiAssistantNode" && n.type !== "annotationNode")
      .map((n: any) => {
        const d = n.data || {};
        const typeLabel = NODE_LABELS[n.type] || n.type;
        const iconEl = NODE_ICON_COMPONENTS[n.type] || <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground/40 inline-block" />;
        let detail = "";
        if (n.type === "videoNode") detail = d.channel_username ? `@${d.channel_username}` : (d.url ? "linked" : "empty");
        else if (n.type === "textNoteNode" || n.type === "researchNoteNode") detail = (d.noteText || "").slice(0, 30);
        else if (n.type === "competitorProfileNode" || n.type === "instagramProfileNode") detail = d.profileUrl || "";
        else if (n.type === "brandGuideNode") detail = d.brandName || "";
        else if (n.type === "hookGeneratorNode") detail = d.topic || "";
        else if (n.type === "mediaNode") detail = d.fileName || "";
        return { id: n.id, typeLabel, iconEl, detail };
      })
      .filter((n: any) => n.typeLabel.toLowerCase().includes(atMentionQuery) || n.detail.toLowerCase().includes(atMentionQuery));
    if (allNodes.length === 0) return null;
    return createPortal(
      <div
        className="rounded-xl border border-border bg-card shadow-xl overflow-hidden"
        style={{
          position: "fixed",
          zIndex: 99999,
          width: 240,
          maxHeight: 200,
          overflowY: "auto",
          ...(textareaRef.current ? {
            left: textareaRef.current.getBoundingClientRect().left,
            bottom: window.innerHeight - textareaRef.current.getBoundingClientRect().top + 4,
          } : {}),
        }}
      >
        {allNodes.map((node: any) => (
          <button
            key={node.id}
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              const atIdx = input.lastIndexOf("@");
              const before = input.slice(0, atIdx);
              setInput(before + `@${node.typeLabel}${node.detail ? "(" + node.detail.slice(0, 20) + ")" : ""} `);
              setAtMentionQuery(null);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          >
            <span className="text-primary/70">{node.iconEl}</span>
            <span className="flex-1 truncate">
              <span className="font-medium text-xs">{node.typeLabel}</span>
              {node.detail && <span className="text-muted-foreground text-xs ml-1">— {node.detail}</span>}
            </span>
          </button>
        ))}
      </div>,
      document.body
    );
  })()}

  {/* Textarea — full width */}
  <div className="relative">
    {/@\S+/.test(input) && (
      <div
        aria-hidden
        className="absolute inset-0 px-3 pt-3 text-xs pointer-events-none overflow-hidden"
        style={{ fontFamily:"inherit", lineHeight:"1.5", whiteSpace:"pre-wrap", wordBreak:"break-word", zIndex:0 }}
      >
        {input.split(/(@\S+)/).map((part, i) =>
          part.startsWith("@") && part.length > 1
            ? <span key={i} style={{ background:"rgba(59,130,246,0.18)", color:"#60a5fa", borderRadius:3, padding:"0 1px" }}>{part}</span>
            : <span key={i} style={{ color:"transparent" }}>{part}</span>
        )}
      </div>
    )}
    <textarea
      ref={textareaRef}
      value={input}
      onChange={(e) => {
        const val = e.target.value;
        setInput(val);
        (window as any).__canvasAIDraftInput = val;
        adjustTextareaHeight();
        const atIdx = val.lastIndexOf("@");
        if (atIdx >= 0 && !val.slice(atIdx).includes(" ")) {
          setAtMentionQuery(val.slice(atIdx + 1).toLowerCase());
        } else {
          setAtMentionQuery(null);
        }
      }}
      onPaste={handlePaste}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setAtMentionQuery(null); return; }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
      }}
      placeholder={imageMode ? "Describe the image..." : "Ask anything about your script..."}
      data-tutorial-target="ai-chat-input"
      className="relative resize-none text-xs w-full px-3 pt-3 pb-2 outline-none focus:ring-0 focus:outline-none bg-transparent border-0"
      style={{
        color: /@\S+/.test(input) ? "transparent" : "#e0e0e0",
        caretColor: "#e0e0e0",
        minHeight: 44,
        maxHeight: 160,
        overflowY: "auto",
        zIndex: 1,
      }}
      rows={1}
      disabled={loading || generating}
    />
  </div>

  {/* Inner divider */}
  <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"0 10px" }} />

  {/* Inner toolbar */}
  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px" }}>

    {/* circle-+ — image mode, research, presets */}
    <div className="relative" ref={plusMenuRef}>
      <button
        type="button"
        onClick={() => setPlusMenuOpen(v => !v)}
        style={{ width:26, height:26, border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,0.5)", fontSize:18, fontWeight:300, lineHeight:1, background:"none", cursor:"pointer", flexShrink:0 }}
      >
        +
      </button>
      {plusMenuOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          style={{ zIndex:99999 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${imageMode ? "text-purple-400 bg-purple-500/10" : "text-muted-foreground hover:bg-muted/60"}`}
            onClick={() => { setImageMode(v => !v); setPlusMenuOpen(false); }}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="text-xs">Image generation{imageMode ? " (ON)" : ""}</span>
          </button>
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${isResearchMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/60"}`}
            onClick={() => { setIsResearchMode(v => !v); setPlusMenuOpen(false); }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
            <span className="text-xs">Deep research{isResearchMode ? " (ON · 100cr)" : ""}</span>
          </button>
          <div className="h-px bg-border mx-3" />
          <div className="px-3 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt Presets</p>
          </div>
          <div className="p-1.5 space-y-1 max-h-48 overflow-y-auto">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors group"
                onClick={() => { setInput(preset.prompt); (window as any).__canvasAIDraftInput = preset.prompt; setPlusMenuOpen(false); }}
              >
                <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{preset.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* spacer */}
    <div style={{ flex:1 }} />

    {/* Generate Script — teal text button in toolbar */}
    <button
      type="button"
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); if (!generating) { toast.info("Generating script..."); generateScript(); } }}
      onClick={(e) => { e.stopPropagation(); if (!generating) { toast.info("Generating script..."); generateScript(); } }}
      disabled={generating}
      style={{ display:"flex", alignItems:"center", gap:4, color: generating ? "rgba(34,211,238,0.4)" : "#22d3ee", fontSize:11, fontWeight:600, background:"none", border:"none", cursor: generating ? "default" : "pointer", whiteSpace:"nowrap", flexShrink:0 }}
    >
      {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
      {generating ? "Generating..." : "Generate Script"}
    </button>

    {/* separator */}
    <span style={{ width:1, height:14, background:"rgba(255,255,255,0.1)", display:"inline-block", flexShrink:0 }} />

    {/* Model selector */}
    <div className="relative" ref={modelDropdownRef}>
      <button
        ref={modelBtnRef}
        type="button"
        onClick={() => setModelDropdownOpen(v => !v)}
        style={{ display:"flex", alignItems:"center", gap:3, color:"rgba(255,255,255,0.35)", fontSize:11, background:"none", border:"none", cursor:"pointer", whiteSpace:"nowrap" }}
        title="Change AI model"
      >
        <span>{MODEL_LABEL[selectedModel] || "Haiku"}</span>
        <ChevronUp style={{ width:10, height:10, transform: modelDropdownOpen ? "" : "rotate(180deg)", color:"rgba(255,255,255,0.35)" }} />
      </button>
      {modelDropdownOpen && createPortal(
        <>
          <div style={{ position:"fixed", inset:0, zIndex:99998 }} onClick={() => setModelDropdownOpen(false)} />
          <div
            ref={modelPortalRef}
            className="w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            style={{
              position:"fixed",
              zIndex:99999,
              ...(modelBtnRef.current ? {
                left: modelBtnRef.current.getBoundingClientRect().left,
                top: modelBtnRef.current.getBoundingClientRect().top - 8,
                transform: "translateY(-100%)",
              } : {}),
            }}
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            {(["Anthropic", "OpenAI"] as const).map((provider) => (
              <div key={provider}>
                <div className="px-3 py-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{provider}</p>
                </div>
                {AI_MODELS.filter(m => m.provider === provider).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      selectedModel === m.key
                        ? "bg-primary/10 border-l-2 border-l-primary text-foreground"
                        : "text-muted-foreground hover:bg-muted/60"
                    }`}
                    onClick={() => { setSelectedModel(m.key); onModelChange(m.key); setModelDropdownOpen(false); }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                    <span className="text-xs font-medium">{m.label}</span>
                    {selectedModel === m.key && <Check className="w-3 h-3 ml-auto text-primary" />}
                    <span className={`text-[10px] ${selectedModel === m.key ? "" : "ml-auto"} opacity-50`}>{m.cost}</span>
                  </button>
                ))}
                {provider === "Anthropic" && <div className="h-px bg-border mx-3" />}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>

    {/* Stop / Send circle / Mic */}
    {(loading || generating) ? (
      <button
        type="button"
        onClick={() => {
          abortControllerRef.current?.abort();
          if (typewriterRef.current) { clearInterval(typewriterRef.current); typewriterRef.current = null; }
          setStreamingContent(null);
          setLoading(false);
          setGenerating(false);
        }}
        style={{ width:28, height:28, borderRadius:"50%", border:"1.5px solid rgba(239,68,68,0.4)", background:"rgba(239,68,68,0.1)", color:"#f87171", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}
        title="Stop generating"
      >
        <Square className="w-3.5 h-3.5 fill-current" />
      </button>
    ) : input.trim() ? (
      <button
        type="button"
        onClick={() => sendMessage(input)}
        style={{ width:28, height:28, borderRadius:"50%", background: imageMode ? "#a855f7" : "#22d3ee", border:"none", color:"#000", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}
        title="Send"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={toggleVoice}
        style={{ width:28, height:28, borderRadius:"50%", border:"none", background:"none", color: recognizing ? "#f87171" : "rgba(255,255,255,0.35)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}
        title={recognizing ? "Stop recording" : "Voice input"}
      >
        {recognizing ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      </button>
    )}
  </div>
</div>

{/* Image mode indicator */}
{imageMode && (
  <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 bg-purple-500/5 rounded-lg w-fit">
    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
    <span className="text-[10px] text-purple-400">Image mode · DALL-E 3 · ~150 cr</span>
  </div>
)}
```

- [ ] **Step 4: Remove unused imports**

In the import line at the top of `src/components/canvas/CanvasAIPanel.tsx`, remove `BookOpen`, `Layers`, `ChevronDown` if they only appeared in the old input row. Keep `ChevronUp` (still used for model dropdown).

Check first: `grep -n "BookOpen\|Layers\|ChevronDown" src/components/canvas/CanvasAIPanel.tsx`

Remove only if count is 1 (just the import line).

- [ ] **Step 5: Build and verify**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -8
```

Expected: `✓ built in X.XXs` with no TypeScript errors. If there are errors, fix them before proceeding.

- [ ] **Step 6: Deploy to VPS**

```bash
expect -c '
spawn scp -r dist/assets dist/index.html root@72.62.200.145:/var/www/connectacreators/
expect "password:"
send "Loqueveoloveo290802#\r"
expect -timeout 120 eof
' 2>&1 | tail -3
```

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Desktop/connectacreators && git add src/components/canvas/CanvasAIPanel.tsx && git commit -m "feat(ai-panel): Claude-style input — context chips above box, Generate Script + model + mic in inner toolbar"
```

---

## Task 2: Input draft sync between normal view and fullscreen

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` (add `initialDraftInput` prop to FullscreenAIView)
- Modify: `src/components/canvas/FullscreenAIView.tsx` (accept prop, forward to CanvasAIPanel)

Note: Task 1 already writes `(window as any).__canvasAIDraftInput = val` on every keystroke in the normal view's CanvasAIPanel.

- [ ] **Step 1: Pass initialDraftInput to FullscreenAIView**

In `src/pages/SuperPlanningCanvas.tsx`, find the FullscreenAIView render (~line 2039):

```tsx
{showFullscreenAI && (
  <FullscreenAIView
    selectedClient={selectedClient}
    activeSessionId={activeSessionId}
    nodes={nodes}
    authToken={authToken}
    format={format}
    language={language}
    aiModel={aiModel}
    canvasContextRef={canvasContextRef}
    onClose={() => setShowFullscreenAI(false)}
    onFormatChange={handleFormatChange}
    onLanguageChange={handleLanguageChange}
    onModelChange={handleModelChange}
    onSaveScript={stableSaveScript}
  />
)}
```

Replace with:

```tsx
{showFullscreenAI && (
  <FullscreenAIView
    selectedClient={selectedClient}
    activeSessionId={activeSessionId}
    nodes={nodes}
    authToken={authToken}
    format={format}
    language={language}
    aiModel={aiModel}
    canvasContextRef={canvasContextRef}
    initialDraftInput={(window as any).__canvasAIDraftInput || null}
    onClose={() => setShowFullscreenAI(false)}
    onFormatChange={handleFormatChange}
    onLanguageChange={handleLanguageChange}
    onModelChange={handleModelChange}
    onSaveScript={stableSaveScript}
  />
)}
```

- [ ] **Step 2: Add initialDraftInput to FullscreenAIViewProps**

In `src/components/canvas/FullscreenAIView.tsx`, find the `FullscreenAIViewProps` interface (~line 35) and add the new prop:

```tsx
export interface FullscreenAIViewProps {
  nodes: Node[];
  selectedClient: { id: string; name?: string; target?: string };
  activeSessionId?: string | null;
  authToken: string | null;
  format: string;
  language: "en" | "es";
  aiModel: string;
  canvasContextRef: React.RefObject<any>;
  initialDraftInput?: string | null;   // ← add this line
  onClose: () => void;
  onFormatChange: (f: string) => void;
  onLanguageChange: (l: "en" | "es") => void;
  onModelChange: (m: string) => void;
  onSaveScript: (script: any) => Promise<void>;
}
```

- [ ] **Step 3: Destructure and forward initialDraftInput in FullscreenAIView**

In the component body (~line 122), add `initialDraftInput` to the destructured props:

```tsx
const FullscreenAIView = memo(function FullscreenAIView({
  nodes,
  selectedClient,
  activeSessionId,
  authToken,
  format,
  language,
  aiModel,
  canvasContextRef,
  initialDraftInput,   // ← add this
  onClose,
  onFormatChange,
  onLanguageChange,
  onModelChange,
  onSaveScript,
}: FullscreenAIViewProps) {
```

Then find the `<CanvasAIPanel ...>` render inside FullscreenAIView and add `initialInput` and `onInitialInputConsumed`:

```tsx
<CanvasAIPanel
  key={activeChatId ?? "no-chat"}
  canvasContext={canvasContextRef?.current ?? {}}
  canvasContextRef={canvasContextRef}
  clientInfo={clientInfo}
  onGenerateScript={setGeneratedScript}
  authToken={authToken}
  format={format}
  language={language}
  aiModel={aiModel || "claude-haiku-4-5"}
  initialInput={initialDraftInput}
  onInitialInputConsumed={() => {}}
  initialMessages={activeMessages}
  onMessagesChange={handleMessagesChange}
  onSaveScript={onSaveScript}
  onFormatChange={onFormatChange}
  onLanguageChange={onLanguageChange}
  onModelChange={onModelChange}
  externalDroppedImage={null}
/>
```

- [ ] **Step 4: Build and deploy**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build 2>&1 | tail -8
```

Expected: `✓ built in X.XXs` with no TypeScript errors.

```bash
expect -c '
spawn scp -r dist/assets dist/index.html root@72.62.200.145:/var/www/connectacreators/
expect "password:"
send "Loqueveoloveo290802#\r"
expect -timeout 120 eof
' 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Desktop/connectacreators && git add src/pages/SuperPlanningCanvas.tsx src/components/canvas/FullscreenAIView.tsx && git commit -m "feat(ai-panel): sync draft input between normal and fullscreen views"
```

---

## Self-Review

**Spec coverage:**
- ✅ Context chips scroll horizontally above the input box — Task 1 Step 2
- ✅ Generate Script is a teal text-button inside the inner toolbar — Task 1 Step 3
- ✅ Input box: full-width textarea + inner divider + inner toolbar — Task 1 Step 3
- ✅ Inner toolbar: `circle-+` (image/research/presets) · spacer · Generate Script · separator · Model ▾ · mic/send — Task 1 Step 3
- ✅ Mic → teal send circle when typing; red stop when loading — Task 1 Step 3
- ✅ Draft input syncs normal→fullscreen via `window.__canvasAIDraftInput` — Task 2

**Placeholder scan:** No TBDs. All code blocks are complete and executable.

**Type consistency:** `initialDraftInput` added in interface, destructure, and forwarded as `initialInput` (matching existing CanvasAIPanel prop name). `plusMenuOpen`/`plusMenuRef` declared before use in Step 1 before Step 3 references them.
