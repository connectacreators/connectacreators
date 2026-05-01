# Canvas Unification — Remix + Powerful Canvas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-step AIScriptWizard remix flow with a chat-first Super Planning Canvas experience, and add 4 new purpose-built node types (Hook Generator, Brand Guide, CTA Builder, Viral Video Picker) to the canvas.

**Architecture:** Remix from Viral Today now routes to `SuperPlanningCanvas` with the viral video pre-loaded as a VideoNode. The AI chat panel detects remix mode and opens with a context-aware greeting. New node types follow the existing `ResearchNoteNode`/`TextNoteNode` patterns and feed into a richer `canvasContext` that is injected into the `ai-build-script` edge function's `canvas-generate` step.

**Tech Stack:** React 18, TypeScript, ReactFlow (`@xyflow/react`), Supabase (client + edge functions), Anthropic Claude (claude-sonnet-4-6 for generation), VPS deployment (SCP + `npm run build` + nginx).

**Note on testing:** This codebase has no automated test suite. Each task includes a TypeScript build check (`npm run build` on VPS) and a manual browser verification step as the equivalent of test pass/fail.

**Deployment method:** All frontend changes → SCP to `root@72.62.200.145:/var/www/connectacreators/src/...` → `npm run build` → `nginx -s reload`. Edge functions → SCP to `/var/www/connectacreators/supabase/functions/...` → `npx supabase functions deploy <name>`.

---

## Chunk 1: Phase 1 — Remix → Canvas Chat-First Flow

### File Map

| File | Action | What Changes |
|------|--------|-------------|
| `src/pages/Scripts.tsx` | Modify | Remix auto-open routes to canvas; pass `remixVideo` prop; fix `onCancel` to avoid infinite loop |
| `src/pages/SuperPlanningCanvas.tsx` | Modify | Add `remixVideo` prop; inject VideoNode on mount; pass `remixMode`/`remixContext` to AI node |
| `src/components/canvas/AIAssistantNode.tsx` | Modify | Add `remixMode`/`remixContext` to `AIAssistantData` interface; pass to `CanvasAIPanel` |
| `src/components/canvas/CanvasAIPanel.tsx` | Modify | Remix greeting as first chat message; suppress regular greeting in remix mode |
| `src/components/canvas/VideoNode.tsx` | Modify | Add `channel_username?` and `caption?` to `VideoData` interface |

---

### Task 1: Add `channel_username` and `caption` to VideoNode data interface

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx` (VideoData interface, ~line 22-34)

- [ ] **Step 1: Read the current VideoData interface**

  Open `src/components/canvas/VideoNode.tsx`. Find the `VideoData` interface (around line 22-34). It currently has fields like `url`, `transcription`, `structure`, `thumbnailUrl`, `videoFileUrl`, `selectedSections`, `stage`, plus callbacks.

- [ ] **Step 2: Add the two optional fields to VideoData**

  In the `VideoData` interface, add:
  ```typescript
  channel_username?: string;
  caption?: string;
  ```
  These are optional — existing VideoNodes created without them will have `undefined`, which is handled gracefully everywhere these fields are read.

- [ ] **Step 3: Build check**

  ```bash
  # On VPS via SSH expect script:
  cd /var/www/connectacreators && npm run build 2>&1 | grep -E "error|Error|✓"
  ```
  Expected: `✓ built in Xs` with no TypeScript errors.

- [ ] **Step 4: SCP and deploy**

  ```bash
  scp src/components/canvas/VideoNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/VideoNode.tsx
  # then run build on VPS
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/canvas/VideoNode.tsx
  git commit -m "feat(canvas): add channel_username and caption optional fields to VideoData"
  ```

---

### Task 2: Modify `Scripts.tsx` — route remix to canvas, fix cancel loop

**Files:**
- Modify: `src/pages/Scripts.tsx` (lines 507-512, lines 909-937)

- [ ] **Step 1: Read the current auto-open useEffect**

  Open `src/pages/Scripts.tsx`. Find lines ~507-512 — the useEffect that detects `remixVideo` and `selectedClient` together:
  ```typescript
  useEffect(() => {
    if (!remixVideo || !selectedClient) return;
    setAiMode(true);
    setView("new-script");
  }, [remixVideo, selectedClient]);
  ```

- [ ] **Step 2: Change the auto-open to route to canvas instead of wizard**

  Replace the body of that useEffect:
  ```typescript
  useEffect(() => {
    if (!remixVideo || !selectedClient) return;
    // Do NOT set aiMode — canvas doesn't use it
    setView("super-planning");
  }, [remixVideo, selectedClient]);
  ```

- [ ] **Step 3: Read the SuperPlanningCanvas render block**

  Find lines ~909-937 — the `{view === "super-planning" && selectedClient && ...}` block. It currently renders:
  ```tsx
  <SuperPlanningCanvas
    selectedClient={selectedClient}
    onSaved={async (scriptId) => { ... setView("view-script"); }}
    onCancel={() => setView("new-script")}
  />
  ```

- [ ] **Step 4: Add remixVideo prop; fix onCancel; fix onSaved**

  Update the render:
  ```tsx
  <SuperPlanningCanvas
    selectedClient={selectedClient}
    remixVideo={remixVideo ?? undefined}
    onSaved={async (scriptId) => {
      setRemixVideo(null);  // clear remix state before view change
      // ... existing onSaved logic: fetch lines, metadata, setView("view-script") ...
    }}
    onCancel={() => {
      setRemixVideo(null);       // clear remix state
      setView("client-detail");  // MUST NOT be "new-script" — that re-triggers the remix auto-open effect
    }}
  />
  ```
  **Critical:** `onCancel` must route to `"client-detail"`, never `"new-script"`. Routing to `"new-script"` while `remixVideo` is still set would re-trigger the auto-open useEffect, creating an infinite loop.

- [ ] **Step 5: Local TypeScript check**

  ```bash
  cd /Users/admin/Desktop/connectacreators && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: TypeScript error about `remixVideo` not existing on `SuperPlanningCanvas`'s Props — this is expected and will be resolved in Task 3.

- [ ] **Step 6: Commit (pre-build — will be built after Task 3)**

  ```bash
  git add src/pages/Scripts.tsx
  git commit -m "feat(remix): route remix flow to SuperPlanningCanvas instead of AIScriptWizard"
  ```

---

### Task 3: Add `remixVideo` prop to SuperPlanningCanvas + auto-inject VideoNode

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` (Props interface ~line 35, CanvasInner ~line 76, loadCanvas useEffect ~lines 193-230, canvasContext sync ~lines 330-351)

- [ ] **Step 1: Read the Props interface and CanvasInner signature**

  Open `src/pages/SuperPlanningCanvas.tsx`. Find:
  - The `Props` interface (~line 35-39): has `selectedClient`, `onSaved`, `onCancel`
  - The outer wrapper `SuperPlanningCanvas` (~line 68-73): uses `{...props}` spread
  - `CanvasInner` signature (~line 76): destructures 3 props

- [ ] **Step 2: Define RemixVideo type and add to Props**

  Add `RemixVideo` interface (use the same shape as `Scripts.tsx`'s remixVideo state type at line 355-359) and extend `Props`:
  ```typescript
  interface RemixVideo {
    id: string;
    url: string | null;
    thumbnail_url: string | null;
    caption: string | null;
    channel_username: string;
    platform: string;
    formatDetection?: {
      format: string;
      confidence: number;
      wizard_config: {
        suggested_format?: string;
        prompt_hint?: string;
        use_transcript_as_template?: boolean;
      };
    } | null;
  }

  interface Props {
    selectedClient: Client;
    onSaved: (scriptId: string) => void;
    onCancel: () => void;
    remixVideo?: RemixVideo;
  }
  ```

- [ ] **Step 3: Update CanvasInner destructured signature**

  Line 76: add `remixVideo` to destructuring:
  ```typescript
  function CanvasInner({ selectedClient, onSaved, onCancel, remixVideo }: Props) {
  ```

- [ ] **Step 4: Add remixInjectedRef**

  After the existing refs (around line 89-93), add:
  ```typescript
  const remixInjectedRef = useRef(false);
  ```

- [ ] **Step 5: Inject VideoNode after loadCanvas completes**

  Inside the `loadCanvas` async function (lines 193-230), after `setLoaded(true)`, add the remix injection block. It must be a **second** `setNodes` call (not a replacement), so existing saved canvas nodes are preserved:

  ```typescript
  // Remix injection — after canvas is loaded (existing or fresh)
  if (remixVideo?.url && !remixInjectedRef.current) {
    remixInjectedRef.current = true;  // set BEFORE any await to be race-safe
    const nodeId = `videoNode_remix_${Date.now()}`;
    const position = getInitialPosition(0);
    const remixNode: Node = {
      id: nodeId,
      type: "videoNode",
      position,
      width: 240,
      data: {
        url: remixVideo.url,
        autoTranscribe: true,
        channel_username: remixVideo.channel_username,
        caption: remixVideo.caption ?? undefined,
        authToken,
        clientId: selectedClient.id,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () =>
          setNodes(ns => ns.filter(n => n.id !== nodeId)),
      },
    };
    setNodes(prev => [...prev, remixNode]);
  }
  ```

- [ ] **Step 6: Add remixMode and remixContext to canvasContext sync useEffect**

  In the useEffect that syncs AI node data (lines 330-351), add two fields to the `data` object being spread:
  ```typescript
  remixMode: !!remixVideo,
  remixContext: remixVideo ? {
    channel_username: remixVideo.channel_username,
    format: remixVideo.formatDetection?.format ?? null,
    prompt_hint: remixVideo.formatDetection?.wizard_config?.prompt_hint ?? null,
  } : null,
  ```

- [ ] **Step 7: Build check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: TypeScript errors about `remixMode`/`remixContext` not being in `AIAssistantData` — expected, will be fixed in Task 4.

- [ ] **Step 8: Commit**

  ```bash
  git add src/pages/SuperPlanningCanvas.tsx
  git commit -m "feat(canvas): add remixVideo prop + auto-inject VideoNode on remix entry"
  ```

---

### Task 4: Thread remixMode/remixContext through AIAssistantNode

**Files:**
- Modify: `src/components/canvas/AIAssistantNode.tsx` (AIAssistantData interface ~line 7, CanvasAIPanel render ~line 70-81)

- [ ] **Step 1: Read AIAssistantNode**

  Open `src/components/canvas/AIAssistantNode.tsx`. Find the `AIAssistantData` interface (~line 7-19) and the `<CanvasAIPanel>` render block (~lines 70-81).

- [ ] **Step 2: Add remixMode and remixContext to AIAssistantData**

  ```typescript
  interface AIAssistantData {
    // ... existing fields (canvasContext, clientInfo, authToken, format, language, aiModel, etc.) ...
    remixMode?: boolean;
    remixContext?: {
      channel_username: string;
      format: string | null;
      prompt_hint: string | null;
    } | null;
    // ... existing callback fields (onFormatChange, onLanguageChange, etc.) ...
  }
  ```

- [ ] **Step 3: Pass remixMode and remixContext explicitly to CanvasAIPanel**

  In the `<CanvasAIPanel>` JSX (lines 70-81), add two explicit props:
  ```tsx
  <CanvasAIPanel
    canvasContext={d.canvasContext}
    clientInfo={d.clientInfo}
    onGenerateScript={d.onGenerateScript}
    authToken={d.authToken}
    format={d.format}
    language={d.language}
    aiModel={d.aiModel}
    onFormatChange={d.onFormatChange}
    onLanguageChange={d.onLanguageChange}
    onModelChange={d.onModelChange}
    remixMode={d.remixMode ?? false}
    remixContext={d.remixContext ?? null}
  />
  ```
  Must be explicit props — NOT a spread. `CanvasAIPanel` declares these in its Props interface.

- [ ] **Step 4: Build check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: TypeScript error about `remixMode`/`remixContext` not in `CanvasAIPanel` Props — expected, fixed in Task 5.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/canvas/AIAssistantNode.tsx
  git commit -m "feat(canvas): thread remixMode/remixContext from AIAssistantNode to CanvasAIPanel"
  ```

---

### Task 5: Add remix greeting to CanvasAIPanel

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx` (Props ~line 97, function signature ~line 124, greeting computation ~lines 128-130, greeting JSX ~lines 287-299)

- [ ] **Step 1: Read CanvasAIPanel's current Props and greeting**

  Open `src/components/canvas/CanvasAIPanel.tsx`. Note:
  - Props interface (line 97-108): existing props including `language: "en" | "es"` (prop renamed to `scriptLang` in destructuring)
  - Function signature (line 124): `export default function CanvasAIPanel({ ..., language: scriptLang, ... })`
  - Greeting string (lines 128-130): currently a plain `const greeting = ...`
  - Greeting render (lines 287-299): rendered as JSX when `messages.length === 0 && !loading && !generating`
  - Messages state (line 131): `const [messages, setMessages] = useState<Message[]>([]);`

- [ ] **Step 2: Add remixMode and remixContext to Props interface**

  In the Props interface (line 97-108):
  ```typescript
  interface Props {
    // ... existing ...
    remixMode?: boolean;
    remixContext?: {
      channel_username: string;
      format: string | null;
      prompt_hint: string | null;
    } | null;
  }
  ```

- [ ] **Step 3: Add remixMode/remixContext to function destructuring**

  Line 124 — add to destructuring with defaults:
  ```typescript
  export default function CanvasAIPanel({
    canvasContext, clientInfo, onGenerateScript, authToken,
    format, language: scriptLang, aiModel,
    onFormatChange, onLanguageChange, onModelChange,
    remixMode = false, remixContext = null,
  }: Props) {
  ```

- [ ] **Step 4: Replace greeting computation with useMemo**

  Replace the current `const greeting = ...` (lines 128-130) with a `useMemo`:
  ```typescript
  const greeting = useMemo(() => {
    if (remixMode && remixContext) {
      const hint = remixContext.prompt_hint ? ` It uses a "${remixContext.prompt_hint}" style.` : "";
      const client = clientInfo?.name ?? "your client";
      return language === "es"
        ? `Analicé el video de @${remixContext.channel_username}.${hint} ¿Sobre qué tema lo aplicamos para ${client}?`
        : `I've loaded @${remixContext.channel_username}'s video.${hint} What topic do you want to apply this to for ${client}?`;
    }
    return language === "es"
      ? `¿Qué hacemos hoy${displayName ? `, ${displayName}` : ""}?`
      : `What are we doing today${displayName ? `, ${displayName}` : ""}?`;
  }, [remixMode, remixContext, language, clientInfo, displayName]);
  ```
  Note: add `useMemo` to the import from `"react"` at line 1 if not already present.

- [ ] **Step 5: Add useEffect to push greeting as first assistant message in remix mode**

  After the existing `useEffect` for `bottomRef` (line 137), add:
  ```typescript
  useEffect(() => {
    if (remixMode && messages.length === 0) {
      setMessages([{ role: "assistant", content: greeting }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixMode]); // only fire once on mount
  ```

- [ ] **Step 6: Suppress regular greeting JSX in remix mode**

  At the greeting render block (lines 287-299), the condition is:
  ```tsx
  {messages.length === 0 && !loading && !generating && (
  ```
  Change to:
  ```tsx
  {messages.length === 0 && !loading && !generating && !remixMode && (
  ```
  This prevents the typewriter-style JSX greeting from flashing while the useEffect in Step 5 pushes the remix greeting into messages.

- [ ] **Step 7: Full build check**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no TypeScript errors.

  ```bash
  # If clean locally, SCP all Phase 1 files to VPS and build
  ```

- [ ] **Step 8: SCP Phase 1 files + build**

  ```bash
  scp src/components/canvas/VideoNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/VideoNode.tsx
  scp src/components/canvas/AIAssistantNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/AIAssistantNode.tsx
  scp src/components/canvas/CanvasAIPanel.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/CanvasAIPanel.tsx
  scp src/pages/Scripts.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/Scripts.tsx
  scp src/pages/SuperPlanningCanvas.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/SuperPlanningCanvas.tsx
  # Then on VPS:
  cd /var/www/connectacreators && npm run build 2>&1 | tail -8
  nginx -s reload
  ```
  Expected: `✓ built in Xs` with no errors.

- [ ] **Step 9: Browser verification — Phase 1**

  1. Open app → navigate to Viral Today → click any video → click "Remix Script with AI Wizard" → select a client
  2. Expected: lands on Super Planning Canvas (NOT the 5-step wizard)
  3. Expected: a VideoNode appears automatically with the video URL pre-filled; transcription starts
  4. Expected: AI chat shows a message like "I've loaded @[channel]'s video. What topic do you want to apply this to for [client]?"
  5. Type a topic in the chat → AI responds
  6. Click back → returns to client detail view (not stuck in a loop)

- [ ] **Step 10: Commit**

  ```bash
  git add src/components/canvas/CanvasAIPanel.tsx
  git commit -m "feat(canvas): add remix-mode greeting and suppress regular greeting in remix mode"
  ```

---

## Chunk 2: Phase 2 — Four New Canvas Node Types

### File Map

| File | Action | What It Does |
|------|--------|-------------|
| `src/components/canvas/HookGeneratorNode.tsx` | **Create** | Topic input → AI generates 5 hooks (one per category) → user picks one |
| `src/components/canvas/BrandGuideNode.tsx` | **Create** | Form: tone + values + forbidden words + tagline — no AI, pure data |
| `src/components/canvas/CTABuilderNode.tsx` | **Create** | Topic input → AI generates 3 CTAs → user picks one |
| `src/components/canvas/ViralVideoPickerModal.tsx` | **Create** | Modal: search viral_videos, click one → creates VideoNode |
| `src/components/canvas/CanvasToolbar.tsx` | Modify | Add 4 new buttons + viral picker trigger |
| `src/pages/SuperPlanningCanvas.tsx` | Modify | Register new nodeTypes, extend addNode, extend canvasContext, add viral picker state |
| `src/components/canvas/CanvasAIPanel.tsx` | Modify | Extend CanvasContext type, update hasContext, extend contextSummary |
| `supabase/functions/ai-build-script/index.ts` | Modify | Add generate-hooks + generate-ctas steps; inject hook/brand/cta into canvas-generate |

---

### Task 6: Create HookGeneratorNode

**Files:**
- Create: `src/components/canvas/HookGeneratorNode.tsx`
- Reference pattern: `src/components/canvas/ResearchNoteNode.tsx` (read this first)

- [ ] **Step 1: Read ResearchNoteNode as the pattern to follow**

  Open `src/components/canvas/ResearchNoteNode.tsx` (115 lines). Note:
  - Node uses `NodeProps` from `@xyflow/react`
  - Has a `Handle` for source connections
  - Has a header (icon + label + delete button)
  - Has an input + generate button
  - Calls `ai-build-script` edge function
  - Displays results as clickable items
  - Calls `d.onUpdate?.()` to persist data
  - Node data typed via local interface

- [ ] **Step 2: Create HookGeneratorNode.tsx**

  ```typescript
  import { useState } from "react";
  import { NodeProps, Handle, Position } from "@xyflow/react";
  import { Anchor, Loader2, X, Check } from "lucide-react";
  import { supabase } from "@/integrations/supabase/client";
  import { toast } from "sonner";

  interface HookGeneratorData {
    topic?: string;
    hooks?: Array<{ category: string; text: string }>;
    selectedHook?: string;
    selectedCategory?: string;
    onUpdate?: (updates: Partial<Omit<HookGeneratorData, "onUpdate" | "onDelete">>) => void;
    onDelete?: () => void;
    authToken?: string | null;
  }

  const CATEGORY_LABELS: Record<string, string> = {
    educational: "Educational",
    randomInspo: "Random/Unexpected",
    authorityInspo: "Authority",
    comparisonInspo: "Comparison",
    storytellingInspo: "Story",
  };

  export default function HookGeneratorNode({ data: d }: NodeProps) {
    const [topic, setTopic] = useState((d as HookGeneratorData).topic ?? "");
    const [loading, setLoading] = useState(false);
    const hooks = (d as HookGeneratorData).hooks ?? [];
    const selectedHook = (d as HookGeneratorData).selectedHook ?? null;

    const generate = async () => {
      if (!topic.trim()) { toast.error("Enter a topic first"); return; }
      setLoading(true);
      (d as HookGeneratorData).onUpdate?.({ topic });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = (d as HookGeneratorData).authToken || session?.access_token;
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ step: "generate-hooks", topic: topic.trim() }),
        });
        const json = await res.json();
        if (json.hooks) {
          (d as HookGeneratorData).onUpdate?.({ hooks: json.hooks, selectedHook: undefined, selectedCategory: undefined });
        } else {
          toast.error("Failed to generate hooks");
        }
      } catch { toast.error("Error generating hooks"); }
      finally { setLoading(false); }
    };

    const selectHook = (hook: { category: string; text: string }) => {
      (d as HookGeneratorData).onUpdate?.({ selectedHook: hook.text, selectedCategory: hook.category });
    };

    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm min-w-[300px] max-w-[360px] overflow-hidden">
        <Handle type="source" position={Position.Right} />
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <Anchor className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-foreground">Hook Generator</span>
          </div>
          <button onClick={() => (d as HookGeneratorData).onDelete?.()} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Input */}
        <div className="px-3 pt-3 pb-2 flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Topic (e.g. lower back pain)"
            className="flex-1 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
          </button>
        </div>
        {/* Hook results */}
        {hooks.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5">
            {hooks.map((hook, i) => (
              <button
                key={i}
                onClick={() => selectHook(hook)}
                className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                  selectedHook === hook.text
                    ? "bg-amber-500/20 border-amber-500/40 text-foreground"
                    : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {selectedHook === hook.text && <Check className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />}
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-amber-400/80 font-medium">
                      {CATEGORY_LABELS[hook.category] ?? hook.category}
                    </span>
                    <p className="leading-relaxed mt-0.5">{hook.text}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Local type check**

  ```bash
  npx tsc --noEmit 2>&1 | grep HookGenerator
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/canvas/HookGeneratorNode.tsx
  git commit -m "feat(canvas): add HookGeneratorNode component"
  ```

---

### Task 7: Create BrandGuideNode

**Files:**
- Create: `src/components/canvas/BrandGuideNode.tsx`
- Reference pattern: `src/components/canvas/TextNoteNode.tsx` (pure form, debounced onUpdate)

- [ ] **Step 1: Create BrandGuideNode.tsx**

  ```typescript
  import { useState, useEffect, useRef } from "react";
  import { NodeProps, Handle, Position } from "@xyflow/react";
  import { BookOpen, X } from "lucide-react";

  interface BrandGuideData {
    tone?: "Casual" | "Formal" | "Funny" | "Bold";
    brand_values?: string;
    forbidden_words?: string;
    tagline?: string;
    onUpdate?: (updates: Partial<Omit<BrandGuideData, "onUpdate" | "onDelete">>) => void;
    onDelete?: () => void;
  }

  export default function BrandGuideNode({ data: d }: NodeProps) {
    const bd = d as BrandGuideData;
    const [tone, setTone] = useState(bd.tone ?? "Casual");
    const [values, setValues] = useState(bd.brand_values ?? "");
    const [forbidden, setForbidden] = useState(bd.forbidden_words ?? "");
    const [tagline, setTagline] = useState(bd.tagline ?? "");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const update = (patch: Partial<Omit<BrandGuideData, "onUpdate" | "onDelete">>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => bd.onUpdate?.(patch), 400);
    };

    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm min-w-[280px] max-w-[340px] overflow-hidden">
        <Handle type="source" position={Position.Right} />
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-foreground">Brand Guide</span>
          </div>
          <button onClick={() => bd.onDelete?.()} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Form */}
        <div className="px-3 py-3 space-y-2.5">
          {/* Tone */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tone</label>
            <select
              value={tone}
              onChange={(e) => { setTone(e.target.value as any); update({ tone: e.target.value as any }); }}
              className="mt-1 w-full text-xs bg-transparent border border-border/50 rounded-lg px-2.5 py-1.5 text-muted-foreground focus:outline-none focus:border-primary/50 hover:bg-muted/40 transition-colors cursor-pointer"
            >
              {["Casual", "Formal", "Funny", "Bold"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Brand values */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Brand Values</label>
            <input
              value={values}
              onChange={(e) => { setValues(e.target.value); update({ brand_values: e.target.value }); }}
              placeholder="e.g. trustworthy, educational, human"
              className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          {/* Forbidden words */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Forbidden Words</label>
            <textarea
              value={forbidden}
              onChange={(e) => { setForbidden(e.target.value); update({ forbidden_words: e.target.value }); }}
              placeholder="e.g. synergy, leverage, utilize"
              rows={2}
              className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          {/* Tagline */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tagline</label>
            <input
              value={tagline}
              onChange={(e) => { setTagline(e.target.value); update({ tagline: e.target.value }); }}
              placeholder="e.g. Your spine, your life"
              className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/canvas/BrandGuideNode.tsx
  git commit -m "feat(canvas): add BrandGuideNode component"
  ```

---

### Task 8: Create CTABuilderNode

**Files:**
- Create: `src/components/canvas/CTABuilderNode.tsx`
- Same pattern as HookGeneratorNode but simpler: 3 pills, no categories.

- [ ] **Step 1: Create CTABuilderNode.tsx**

  ```typescript
  import { useState } from "react";
  import { NodeProps, Handle, Position } from "@xyflow/react";
  import { Target, Loader2, X, Check } from "lucide-react";
  import { supabase } from "@/integrations/supabase/client";
  import { toast } from "sonner";

  interface CTABuilderData {
    topic?: string;
    ctas?: string[];
    selectedCTA?: string;
    onUpdate?: (updates: Partial<Omit<CTABuilderData, "onUpdate" | "onDelete">>) => void;
    onDelete?: () => void;
    authToken?: string | null;
  }

  export default function CTABuilderNode({ data: d }: NodeProps) {
    const cd = d as CTABuilderData;
    const [topic, setTopic] = useState(cd.topic ?? "");
    const [loading, setLoading] = useState(false);
    const ctas = cd.ctas ?? [];
    const selectedCTA = cd.selectedCTA ?? null;

    const generate = async () => {
      if (!topic.trim()) { toast.error("Enter a topic first"); return; }
      setLoading(true);
      cd.onUpdate?.({ topic });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = cd.authToken || session?.access_token;
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ step: "generate-ctas", topic: topic.trim() }),
        });
        const json = await res.json();
        if (json.ctas) {
          cd.onUpdate?.({ ctas: json.ctas, selectedCTA: undefined });
        } else {
          toast.error("Failed to generate CTAs");
        }
      } catch { toast.error("Error generating CTAs"); }
      finally { setLoading(false); }
    };

    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm min-w-[300px] max-w-[360px] overflow-hidden">
        <Handle type="source" position={Position.Right} />
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-foreground">CTA Builder</span>
          </div>
          <button onClick={() => cd.onDelete?.()} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Input */}
        <div className="px-3 pt-3 pb-2 flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Topic or action"
            className="flex-1 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
          </button>
        </div>
        {/* CTA results */}
        {ctas.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5">
            {ctas.map((cta, i) => (
              <button
                key={i}
                onClick={() => cd.onUpdate?.({ selectedCTA: cta })}
                className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                  selectedCTA === cta
                    ? "bg-emerald-500/20 border-emerald-500/40 text-foreground"
                    : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {selectedCTA === cta && <Check className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />}
                  <span className="leading-relaxed">{cta}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/canvas/CTABuilderNode.tsx
  git commit -m "feat(canvas): add CTABuilderNode component"
  ```

---

### Task 9: Create ViralVideoPickerModal

**Files:**
- Create: `src/components/canvas/ViralVideoPickerModal.tsx`
- Reference pattern: `src/components/canvas/CanvasTutorial.tsx` (modal overlay pattern)

- [ ] **Step 1: Read CanvasTutorial.tsx for the modal pattern**

  Open `src/components/canvas/CanvasTutorial.tsx`. Note how it renders as a fixed overlay on the canvas and how the close button works.

- [ ] **Step 2: Create ViralVideoPickerModal.tsx**

  ```typescript
  import { useState, useEffect } from "react";
  import { Search, X, TrendingUp, Loader2 } from "lucide-react";
  import { supabase } from "@/integrations/supabase/client";

  interface ViralVideo {
    id: string;
    video_url: string | null;
    thumbnail_url: string | null;
    caption: string | null;
    channel_username: string;
    platform: string;
    outlier_score: number | null;
  }

  interface Props {
    onSelect: (videoUrl: string, channelUsername: string, caption: string | null) => void;
    onClose: () => void;
  }

  export default function ViralVideoPickerModal({ onSelect, onClose }: Props) {
    const [videos, setVideos] = useState<ViralVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
      const load = async () => {
        const { data } = await supabase
          .from("viral_videos")
          .select("id, video_url, thumbnail_url, caption, channel_username, platform, outlier_score")
          .order("outlier_score", { ascending: false })
          .limit(100);
        setVideos(data ?? []);
        setLoading(false);
      };
      load();
    }, []);

    const filtered = search.trim()
      ? videos.filter(v =>
          v.channel_username?.toLowerCase().includes(search.toLowerCase()) ||
          v.caption?.toLowerCase().includes(search.toLowerCase())
        )
      : videos;

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Browse Viral Videos</span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Search */}
          <div className="px-4 py-2 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by channel or caption..."
                className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">No videos found</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => v.video_url && onSelect(v.video_url, v.channel_username, v.caption)}
                    disabled={!v.video_url}
                    className="group relative rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all text-left disabled:opacity-50"
                  >
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-full aspect-[9/16] object-cover" />
                    ) : (
                      <div className="w-full aspect-[9/16] bg-muted flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                      <p className="text-white text-[10px] font-medium">@{v.channel_username}</p>
                      {v.outlier_score && v.outlier_score > 1 && (
                        <p className="text-orange-400 text-[10px]">{v.outlier_score.toFixed(1)}x</p>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-semibold bg-primary px-3 py-1 rounded-lg">Use This</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/canvas/ViralVideoPickerModal.tsx
  git commit -m "feat(canvas): add ViralVideoPickerModal component"
  ```

---

### Task 10: Register new nodes + extend canvasContext in SuperPlanningCanvas

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

- [ ] **Step 1: Add imports for the 3 new node components**

  At the top of `SuperPlanningCanvas.tsx`, after the existing canvas component imports:
  ```typescript
  import HookGeneratorNode from "@/components/canvas/HookGeneratorNode";
  import BrandGuideNode from "@/components/canvas/BrandGuideNode";
  import CTABuilderNode from "@/components/canvas/CTABuilderNode";
  import ViralVideoPickerModal from "@/components/canvas/ViralVideoPickerModal";
  ```

- [ ] **Step 2: Add new node types to nodeTypes object**

  Find `const nodeTypes = {` (line ~41). Add:
  ```typescript
  const nodeTypes = {
    videoNode: VideoNode,
    textNoteNode: TextNoteNode,
    researchNoteNode: ResearchNoteNode,
    aiAssistantNode: AIAssistantNode,
    hookGeneratorNode: HookGeneratorNode,
    brandGuideNode: BrandGuideNode,
    ctaBuilderNode: CTABuilderNode,
  };
  ```

- [ ] **Step 3: Extend addNode type union and initial widths**

  Find `const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode") =>` (line ~362). Extend:
  ```typescript
  const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode") => {
    const initialWidth = type === "videoNode" ? 240
      : type === "textNoteNode" ? 288
      : type === "researchNoteNode" ? 320
      : type === "hookGeneratorNode" ? 300
      : type === "brandGuideNode" ? 280
      : type === "ctaBuilderNode" ? 300
      : 288;
    // ... rest unchanged
  ```

- [ ] **Step 4: Extend canvasContext useMemo to include new node types**

  Find the `canvasContext` useMemo (lines 304-328). Replace the body:
  ```typescript
  const canvasContext = useMemo(() => {
    const connectedSrcIds = edges
      .filter(e => e.target === AI_NODE_ID || e.source === AI_NODE_ID)
      .map(e => e.target === AI_NODE_ID ? e.source : e.target);
    const contextNodes = connectedSrcIds.length > 0
      ? nodes.filter(n => connectedSrcIds.includes(n.id))
      : nodes.filter(n => n.id !== AI_NODE_ID);

    const videoNodes = contextNodes.filter(n => n.type === "videoNode");
    const textNoteNodes = contextNodes.filter(n => n.type === "textNoteNode");
    const researchNodes = contextNodes.filter(n => n.type === "researchNoteNode");
    const hookNodes = contextNodes.filter(n => n.type === "hookGeneratorNode");
    const brandNodes = contextNodes.filter(n => n.type === "brandGuideNode");
    const ctaNodes = contextNodes.filter(n => n.type === "ctaBuilderNode");

    // IMPORTANT: filter first, then map both arrays from the same set to keep indexes aligned
    const videoNodesWithTranscript = videoNodes.filter(n => !!(n.data as any).transcription);

    return {
      transcriptions: videoNodesWithTranscript.map(n => (n.data as any).transcription),
      structures: videoNodesWithTranscript.map(n => {
        const d = n.data as any;
        if (!d.structure) return null;
        const sel: string[] = d.selectedSections || ["hook", "body", "cta"];
        return { ...d.structure, sections: (d.structure.sections || []).filter((s: any) => sel.includes(s.section)) };
      }).filter(Boolean),
      video_sources: videoNodesWithTranscript.map(n => ({
        channel_username: (n.data as any).channel_username ?? null,
        url: (n.data as any).url ?? null,
      })),
      text_notes: textNoteNodes.map(n => (n.data as any).noteText || "").filter(Boolean).join("\n\n"),
      research_facts: researchNodes.flatMap(n => (n.data as any).facts || []),
      primary_topic: (researchNodes[0]?.data as any)?.topic || "",
      selected_hook: (hookNodes[0]?.data as any)?.selectedHook ?? null,
      selected_hook_category: (hookNodes[0]?.data as any)?.selectedCategory ?? null,
      brand_guide: brandNodes.length > 0 ? {
        tone: (brandNodes[0].data as any).tone ?? null,
        brand_values: (brandNodes[0].data as any).brand_values ?? null,
        forbidden_words: (brandNodes[0].data as any).forbidden_words ?? null,
        tagline: (brandNodes[0].data as any).tagline ?? null,
      } : null,
      selected_cta: (ctaNodes[0]?.data as any)?.selectedCTA ?? null,
    };
  }, [nodes, edges]);
  ```

- [ ] **Step 5: Add viral picker state and modal render**

  After the existing `useState` declarations (~line 84-87), add:
  ```typescript
  const [showViralPicker, setShowViralPicker] = useState(false);
  ```

  In the JSX return (after `<CanvasToolbar>` render), add:
  ```tsx
  {showViralPicker && (
    <ViralVideoPickerModal
      onSelect={(videoUrl, channelUsername, caption) => {
        setShowViralPicker(false);
        const nodeId = `videoNode_${Date.now()}`;
        const position = getInitialPosition(nodesRef.current.filter(n => n.id !== AI_NODE_ID).length);
        const newNode: Node = {
          id: nodeId,
          type: "videoNode",
          position,
          width: 240,
          data: {
            url: videoUrl,
            autoTranscribe: true,
            channel_username: channelUsername,
            caption: caption ?? undefined,
            authToken,
            clientId: selectedClient.id,
            onUpdate: (updates: any) =>
              setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
            onDelete: () =>
              setNodes(ns => ns.filter(n => n.id !== nodeId)),
          },
        };
        setNodes(prev => [...prev, newNode]);
      }}
      onClose={() => setShowViralPicker(false)}
    />
  )}
  ```

- [ ] **Step 6: Pass onOpenViralPicker to CanvasToolbar**

  Find the `<CanvasToolbar>` JSX call. Add:
  ```tsx
  onOpenViralPicker={() => setShowViralPicker(true)}
  ```

- [ ] **Step 7: Local type check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: errors about `CanvasToolbar` props and `CanvasContext` interface — those are fixed in Tasks 11 and 12.

- [ ] **Step 8: Commit**

  ```bash
  git add src/pages/SuperPlanningCanvas.tsx
  git commit -m "feat(canvas): register new node types and extend canvasContext with hook/brand/cta/video_sources"
  ```

---

### Task 11: Update CanvasToolbar with new node buttons

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx`

- [ ] **Step 1: Read current CanvasToolbar**

  Open `src/components/canvas/CanvasToolbar.tsx` (71 lines). Note the Props interface, the `onAddNode` type union, and the center pill of icon buttons.

- [ ] **Step 2: Extend Props interface**

  ```typescript
  interface Props {
    onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode") => void;
    onBack: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onShowTutorial: () => void;
    onOpenViralPicker: () => void;
  }
  ```

- [ ] **Step 3: Add new icon imports**

  Add to lucide-react imports: `Anchor, BookOpen, Target, TrendingUp`. Keep existing icons.

- [ ] **Step 4: Add new buttons to center pill**

  After the existing 3 node buttons (Video, Note, Research), add a thin divider then 4 new buttons:
  ```tsx
  {/* Divider */}
  <div className="w-px h-4 bg-border/60 mx-1" />

  {/* Hook Generator */}
  <button
    onClick={() => onAddNode("hookGeneratorNode")}
    title="Add Hook Generator"
    className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
  >
    <Anchor className="w-4 h-4" />
  </button>

  {/* Brand Guide */}
  <button
    onClick={() => onAddNode("brandGuideNode")}
    title="Add Brand Guide"
    className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
  >
    <BookOpen className="w-4 h-4" />
  </button>

  {/* CTA Builder */}
  <button
    onClick={() => onAddNode("ctaBuilderNode")}
    title="Add CTA Builder"
    className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
  >
    <Target className="w-4 h-4" />
  </button>

  {/* Browse Viral Videos */}
  <button
    onClick={() => onOpenViralPicker()}
    title="Browse Viral Videos"
    className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
  >
    <TrendingUp className="w-4 h-4" />
  </button>
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/canvas/CanvasToolbar.tsx
  git commit -m "feat(canvas): add Hook Generator, Brand Guide, CTA Builder, and Viral Picker toolbar buttons"
  ```

---

### Task 12: Extend CanvasContext type and contextSummary in CanvasAIPanel

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx`

- [ ] **Step 1: Extend CanvasContext interface**

  Find the `CanvasContext` interface (lines 81-87). Extend it:
  ```typescript
  export interface CanvasContext {
    transcriptions: string[];
    structures: any[];
    video_sources?: Array<{ channel_username: string | null; url: string | null }>;
    text_notes: string;
    research_facts: { fact: string; impact_score: number }[];
    primary_topic: string;
    selected_hook?: string | null;
    selected_hook_category?: string | null;
    brand_guide?: {
      tone: string | null;
      brand_values: string | null;
      forbidden_words: string | null;
      tagline: string | null;
    } | null;
    selected_cta?: string | null;
  }
  ```

- [ ] **Step 2: Extend hasContext function**

  Lines 120-122:
  ```typescript
  const hasContext = (ctx: CanvasContext) =>
    ctx.transcriptions.length > 0 || ctx.structures.length > 0 ||
    ctx.text_notes.trim().length > 0 || ctx.research_facts.length > 0 ||
    ctx.primary_topic.trim().length > 0 ||
    !!ctx.selected_hook || !!ctx.brand_guide || !!ctx.selected_cta;
  ```

- [ ] **Step 3: Update contextSummary to use @channel labels and include new context fields**

  In the `contextSummary` assembly (lines 201-213), update the transcription and structure sections to use `video_sources`, and add three new sections:

  **Transcription section** — change label from `[Video ${i+1}]` to `[from @channel_username]`:
  ```typescript
  canvasContext.transcriptions.length > 0
    ? `VIDEO TRANSCRIPTION TEMPLATES (use as FORMAT reference — replicate structure, pacing, rhythm):\n${
        canvasContext.transcriptions.map((t, i) => {
          const src = canvasContext.video_sources?.[i];
          const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
          return `[${label}]: ${t}`;
        }).join("\n\n")
      }`
    : null,
  ```

  **Structure section** — same label update:
  ```typescript
  canvasContext.structures.length > 0
    ? `VIDEO STRUCTURE TEMPLATES (ONLY use sections shown):\n${
        canvasContext.structures.map((s, i) => {
          const src = canvasContext.video_sources?.[i];
          const label = src?.channel_username ? `from @${src.channel_username}` : `Video ${i + 1}`;
          return `[${label}] Format: ${s.detected_format}\n${(s.sections || [])
            .map((sec: any) => `  [${sec.section.toUpperCase()}] "${sec.actor_text}" | Visual: ${sec.visual_cue}`)
            .join("\n")}`;
        }).join("\n\n")
      }`
    : null,
  ```

  **Add three new context sections** (after research_facts section):
  ```typescript
  canvasContext.selected_hook
    ? `⚠️ SELECTED HOOK (creator chose this — use it as the script opening, preserve its pattern):\n"${canvasContext.selected_hook}" (${canvasContext.selected_hook_category ?? "general"} style)`
    : null,
  canvasContext.brand_guide
    ? `⚠️ BRAND CONSTRAINTS (HARD RULES — violating these makes script unusable):\n- Tone: ${canvasContext.brand_guide.tone ?? "not set"}\n- Brand values: ${canvasContext.brand_guide.brand_values ?? "none"}\n- Forbidden words/phrases: ${canvasContext.brand_guide.forbidden_words ?? "none"}\n- Tagline (use if natural): "${canvasContext.brand_guide.tagline ?? ""}"`
    : null,
  canvasContext.selected_cta
    ? `⚠️ REQUIRED CTA (script MUST end with this exact call-to-action verbatim):\n"${canvasContext.selected_cta}"`
    : null,
  ```

- [ ] **Step 4: Local type check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/canvas/CanvasAIPanel.tsx
  git commit -m "feat(canvas): extend CanvasContext type with new fields and update contextSummary labels"
  ```

---

### Task 13: Add generate-hooks and generate-ctas steps to ai-build-script edge function

**Files:**
- Modify: `supabase/functions/ai-build-script/index.ts`

- [ ] **Step 1: Read the CREDIT_COSTS map and the canvas-generate step structure**

  Open `supabase/functions/ai-build-script/index.ts`. Find:
  - `CREDIT_COSTS` map (lines 43-56): existing step costs
  - The block just before `canvas-generate` (~line 1283): where to insert new steps
  - `canvas-generate` body destructuring (~lines 1287-1298): where to add new fields

- [ ] **Step 2: Add credits to CREDIT_COSTS**

  In the `CREDIT_COSTS` map (lines 43-56), add:
  ```typescript
  "generate-hooks": 3,
  "generate-ctas": 2,
  ```

- [ ] **Step 3: Add generate-hooks step handler**

  Before the `if (step === "canvas-generate")` block (~line 1285), add:
  ```typescript
  // ─── Step: generate-hooks ───
  if (step === "generate-hooks") {
    const { topic } = body;
    if (!topic?.trim()) return errorResponse("topic is required for generate-hooks");

    const hooksSystem = `You are a creative hook writer for short-form social media scripts.
Generate exactly 5 hook variations for the given topic — one per category.
Categories: educational, randomInspo (unexpected/weird angle), authorityInspo (expert credibility), comparisonInspo (before/after or vs), storytellingInspo (narrative opener).
Each hook must be a single sentence, max 15 words, punchy and attention-grabbing.
Return a JSON tool call only — no prose.`;

    const hooksUserPrompt = `Topic: "${topic}"\n\nGenerate one creative hook per category.`;

    const hooksTools = [{
      name: "return_hooks",
      description: "Return 5 hooks, one per category",
      input_schema: {
        type: "object",
        properties: {
          hooks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string", enum: ["educational", "randomInspo", "authorityInspo", "comparisonInspo", "storytellingInspo"] },
                text: { type: "string" },
              },
              required: ["category", "text"],
            },
            minItems: 5,
            maxItems: 5,
          },
        },
        required: ["hooks"],
      },
    }];

    const hooksResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: hooksSystem,
      messages: [{ role: "user", content: hooksUserPrompt }],
      tools: hooksTools,
      tool_choice: { type: "tool", name: "return_hooks" },
    });

    const hookToolUse = hooksResponse.content.find((b: any) => b.type === "tool_use");
    if (!hookToolUse || hookToolUse.type !== "tool_use") return errorResponse("Failed to generate hooks");
    const hooksResult = (hookToolUse as any).input as { hooks: Array<{ category: string; text: string }> };

    return new Response(JSON.stringify({ hooks: hooksResult.hooks }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  ```

- [ ] **Step 4: Add generate-ctas step handler**

  Right after the `generate-hooks` block:
  ```typescript
  // ─── Step: generate-ctas ───
  if (step === "generate-ctas") {
    const { topic } = body;
    if (!topic?.trim()) return errorResponse("topic is required for generate-ctas");

    const ctasSystem = `You are a CTA (call-to-action) writer for short-form social media scripts.
Generate exactly 3 distinct CTA options for the given topic.
Each CTA must be action-oriented, specific, under 15 words, and feel natural at the end of a video.
Return a JSON tool call only — no prose.`;

    const ctasUserPrompt = `Topic/action: "${topic}"\n\nGenerate 3 strong CTA options.`;

    const ctasTools = [{
      name: "return_ctas",
      description: "Return 3 CTA options",
      input_schema: {
        type: "object",
        properties: {
          ctas: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 3,
          },
        },
        required: ["ctas"],
      },
    }];

    const ctasResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: ctasSystem,
      messages: [{ role: "user", content: ctasUserPrompt }],
      tools: ctasTools,
      tool_choice: { type: "tool", name: "return_ctas" },
    });

    const ctaToolUse = ctasResponse.content.find((b: any) => b.type === "tool_use");
    if (!ctaToolUse || ctaToolUse.type !== "tool_use") return errorResponse("Failed to generate CTAs");
    const ctasResult = (ctaToolUse as any).input as { ctas: string[] };

    return new Response(JSON.stringify({ ctas: ctasResult.ctas }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  ```

- [ ] **Step 5: Extend canvas-generate body destructuring with new context fields**

  Find the canvas-generate body destructuring (~line 1287-1298). Add:
  ```typescript
  const {
    transcriptions, structures, text_notes, research_facts, primary_topic,
    format: canvasFormat, language: canvasLang, clientContext, conversationMessages,
    selected_hook, selected_hook_category, brand_guide, selected_cta,  // NEW
  } = body;
  ```

- [ ] **Step 6: Build hook, brand, and CTA prompt injection sections**

  After the existing `const notesSection = ...` line (around line 1328), add:
  ```typescript
  const hookSection = selected_hook
    ? `\n<required_hook>\n⚠️ MANDATORY OPENING: The script MUST start with this exact hook (adapt topic words only, preserve the sentence pattern):\n"${selected_hook}"\nHook style: ${selected_hook_category || "general"}\n</required_hook>`
    : "";

  const brandSection = brand_guide
    ? `\n<brand_constraints>\n⚠️ MANDATORY BRAND RULES — violating these will make the script unusable:\n- Tone: ${brand_guide.tone || "not specified"} — write in this tone throughout\n- Brand values to embody: ${brand_guide.brand_values || "none"}\n- FORBIDDEN words/phrases (NEVER use): ${(brand_guide.forbidden_words || "none").split("\n").join(", ")}\n- Tagline to incorporate if natural: "${brand_guide.tagline || ""}"\n</brand_constraints>`
    : "";

  const ctaSection = selected_cta
    ? `\n<required_cta>\n⚠️ MANDATORY ENDING: The script MUST end with this exact CTA as the final actor line:\n"${selected_cta}"\nDo NOT modify it. Use verbatim.\n</required_cta>`
    : "";
  ```

- [ ] **Step 7: Append new sections to canvasUserPrompt**

  Find the `canvasUserPrompt` string construction (~line 1366). Add the three new sections:
  ```typescript
  const canvasUserPrompt = `<task>...</task>
  <topic>${primary_topic || "Based on the provided context"}</topic>
  ${conversationSection}${structureSection}${transcriptSection}${notesSection}${hookSection}${brandSection}${ctaSection}${factsSection}${clientSection}`;
  ```
  (Add `${hookSection}${brandSection}${ctaSection}` after `${notesSection}` and before `${factsSection}`.)

- [ ] **Step 8: Deploy the edge function**

  ```bash
  # SCP to VPS
  scp supabase/functions/ai-build-script/index.ts root@72.62.200.145:/var/www/connectacreators/supabase/functions/ai-build-script/index.ts
  # Deploy on VPS via SSH:
  cd /var/www/connectacreators && npx supabase functions deploy ai-build-script
  ```
  Expected: `Deployed ai-build-script` success message.

- [ ] **Step 9: Commit**

  ```bash
  git add supabase/functions/ai-build-script/index.ts
  git commit -m "feat(edge): add generate-hooks and generate-ctas steps; inject hook/brand/cta into canvas-generate"
  ```

---

### Task 14: SCP all Phase 2 files, build, and verify

- [ ] **Step 1: SCP all new node files to VPS**

  ```bash
  scp src/components/canvas/HookGeneratorNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/components/canvas/BrandGuideNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/components/canvas/CTABuilderNode.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/components/canvas/ViralVideoPickerModal.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/components/canvas/CanvasToolbar.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/components/canvas/CanvasAIPanel.tsx root@72.62.200.145:/var/www/connectacreators/src/components/canvas/
  scp src/pages/SuperPlanningCanvas.tsx root@72.62.200.145:/var/www/connectacreators/src/pages/
  ```

- [ ] **Step 2: Build on VPS**

  ```bash
  # Via SSH on VPS:
  cd /var/www/connectacreators && npm run build 2>&1 | tail -8 && nginx -s reload
  ```
  Expected: `✓ built in Xs` with no errors.

- [ ] **Step 3: Browser verification — Phase 2**

  1. Open canvas toolbar → 4 new buttons visible (Anchor/Hook, BookOpen/Brand, Target/CTA, TrendingUp/Viral)
  2. Click Anchor → HookGeneratorNode appears; enter topic "lower back pain"; click Generate → 5 hooks appear with categories; click one → highlighted ✓
  3. Click BookOpen → BrandGuideNode appears; fill in Tone=Casual, values, forbidden words; canvas auto-save preserves values
  4. Click Target → CTABuilderNode; enter topic; click Generate → 3 CTA pills; click one → highlighted ✓
  5. Click TrendingUp → ViralVideoPickerModal opens; search works; click a video → VideoNode created
  6. Connect all new nodes to AI node; click Generate Script → script uses selected hook as opening; respects brand constraints; ends with selected CTA

---

## Chunk 3: Phase 3 — Better AI Chat

### File Map

| File | Action | What Changes |
|------|--------|-------------|
| `supabase/functions/ai-assistant/index.ts` | Modify | Add rewrite mode instructions to canvas system prompt |

---

### Task 15: Add rewrite mode to ai-assistant system prompt

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts` (buildCanvasSystemPrompt ~lines 142-174)

- [ ] **Step 1: Read buildCanvasSystemPrompt**

  Open `supabase/functions/ai-assistant/index.ts`. Find `function buildCanvasSystemPrompt` (~line 142). Read the existing rules list.

- [ ] **Step 2: Add rewrite mode and node reference instructions**

  At the end of the YOUR ROLE / RULES section (after the last existing rule bullet), add:
  ```
  - When the canvas context includes video sources with channel names (e.g., "from @drjohn"), reference them by name in your responses: "Based on @drjohn's video structure..."
  - REWRITE MODE: If the user sends a message where they paste a line of script text (in quotes) followed by words like "rewrite", "fix", "improve", or "change" — respond with ONLY two things: (1) the rewritten line, and (2) one sentence explaining what you changed. No preamble, no pleasantries, no "Here's the revised version:" prefix. Just the line and the explanation.
    Example user: 'Fix this: "When I woke up this morning"'
    Example response: "The second my alarm went off at 6am, I knew something was different." — Made it more specific and visual to pull viewers in immediately.
  ```

- [ ] **Step 3: Deploy ai-assistant edge function**

  ```bash
  scp supabase/functions/ai-assistant/index.ts root@72.62.200.145:/var/www/connectacreators/supabase/functions/ai-assistant/index.ts
  # On VPS:
  cd /var/www/connectacreators && npx supabase functions deploy ai-assistant
  ```
  Expected: `Deployed ai-assistant` success message.

- [ ] **Step 4: Browser verification — Phase 3**

  1. Add a VideoNode from any video that has a `channel_username` set
  2. Connect it to the AI node
  3. Open AI chat → type "What hook style does this video use?"
  4. Expected: AI mentions `@channel_username` by name, not just "Video 1"
  5. Type: `Fix this: "Today I want to talk about back pain"`
  6. Expected: AI responds with ONLY a rewritten line + one explanation sentence. No intro text.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/functions/ai-assistant/index.ts
  git commit -m "feat(ai): add rewrite mode and node reference instructions to canvas AI system prompt"
  ```

---

## Final Deployment Checklist

- [ ] Phase 1: All 5 frontend files deployed and build passes; remix → canvas flow verified in browser
- [ ] Phase 2: All 4 new node files + 3 modified frontend files deployed; edge function deployed; all node types verified in browser
- [ ] Phase 3: ai-assistant edge function deployed; rewrite mode verified in browser
- [ ] All 15 tasks committed to git with descriptive messages
