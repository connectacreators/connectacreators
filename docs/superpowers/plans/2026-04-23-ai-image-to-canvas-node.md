# AI-Generated Images Spawn Canvas Nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the canvas AI Assistant generates an image, spawn a real `MediaNode` to the right of the AI node (3-col grid, cascading down), connected by an edge, while the chat thread collapses to a single "Image generated successfully" line.

**Architecture:** Three new callbacks on `CanvasAIPanel` (`onGeneratingImage`, `onImageGenerated`, `onImageGenerationFailed`) relayed through `AIAssistantNode`'s `data` prop to `SuperPlanningCanvas`. The parent owns placement (grid math on an `imageOutputCount` counter stored in the AI node's data), placeholder-node management, and storage upload via the existing `canvasMediaService.uploadMedia`. `MediaNode` gains a lightweight "generating" render branch.

**Tech Stack:** React 18, TypeScript, @xyflow/react (React Flow), Supabase (storage + Postgres), Vite. No automated test infrastructure in this codebase — verification is manual in the running dev server.

**Spec:** [docs/superpowers/specs/2026-04-23-ai-image-to-canvas-node-design.md](docs/superpowers/specs/2026-04-23-ai-image-to-canvas-node-design.md)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/canvasGrid.ts` | Create | Pure function `computeImageSlot(baseNode, index)` returning `{x, y}` for the 3-col output grid. |
| `src/components/canvas/MediaNode.tsx` | Modify | Add `generating?: boolean` data flag; render a compact "generating" card when true. |
| `src/components/canvas/CanvasAIPanel.tsx` | Modify | Replace image-message append with three callbacks + collapse chat to success line. |
| `src/components/canvas/AIAssistantNode.tsx` | Modify | Relay new callbacks from `data` prop into `CanvasAIPanel`. |
| `src/pages/SuperPlanningCanvas.tsx` | Modify | `imageOutputCount` on AI node data; `spawnImagePlaceholder` / `finalizeImageNode` / `removeImagePlaceholder` helpers; wire into `makeAiNode()`. |

---

## Task 1: Grid-slot math helper

**Files:**
- Create: `src/lib/canvasGrid.ts`

- [ ] **Step 1: Create the helper file**

Write `src/lib/canvasGrid.ts`:

```typescript
/**
 * Position a generated-image MediaNode to the right of a source node in a
 * 3-column grid, cascading down as index grows.
 *
 * Index 0..2 → row 0, cols 0..2
 * Index 3..5 → row 1, cols 0..2
 * etc.
 */
export interface GridSourceNode {
  position: { x: number; y: number };
  width?: number | null;
}

export interface GridSlot { x: number; y: number }

export const IMAGE_GRID_COLS = 3;
export const IMAGE_GRID_GAP = 24;
export const IMAGE_GRID_NODE_W = 280;
export const IMAGE_GRID_NODE_H = 200;
export const IMAGE_GRID_OFFSET_X = 80;
const DEFAULT_SOURCE_WIDTH = 360;

export function computeImageSlot(
  source: GridSourceNode,
  index: number,
): GridSlot {
  const col = index % IMAGE_GRID_COLS;
  const row = Math.floor(index / IMAGE_GRID_COLS);
  const sourceW = source.width ?? DEFAULT_SOURCE_WIDTH;
  return {
    x:
      source.position.x +
      sourceW +
      IMAGE_GRID_OFFSET_X +
      col * (IMAGE_GRID_NODE_W + IMAGE_GRID_GAP),
    y: source.position.y + row * (IMAGE_GRID_NODE_H + IMAGE_GRID_GAP),
  };
}
```

- [ ] **Step 2: Manual verify in a Node REPL** (no test harness in this repo)

Run:

```bash
node --input-type=module -e "
import('./src/lib/canvasGrid.ts').catch(()=>{
  // tsc not available inline; eval the logic instead
});
const node = { position: { x: 100, y: 50 }, width: 680 };
const cols = 3, gap = 24, nodeW = 280, offX = 80;
function slot(i){ const col=i%cols, row=Math.floor(i/cols); return { x: node.position.x + node.width + offX + col*(nodeW+gap), y: node.position.y + row*(200+gap) }; }
console.log('i=0', slot(0));  // {x: 860, y: 50}
console.log('i=1', slot(1));  // {x: 1164, y: 50}
console.log('i=2', slot(2));  // {x: 1468, y: 50}
console.log('i=3', slot(3));  // {x: 860, y: 274}
console.log('i=5', slot(5));  // {x: 1468, y: 274}
"
```

Expected output matches the comments above. If not, fix the math in `canvasGrid.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvasGrid.ts
git commit -m "feat(canvas): add computeImageSlot helper for AI image output grid"
```

---

## Task 2: MediaNode — "generating" render branch

**Files:**
- Modify: `src/components/canvas/MediaNode.tsx`

- [ ] **Step 1: Locate the state block**

Open [src/components/canvas/MediaNode.tsx](src/components/canvas/MediaNode.tsx). Find the state computation around line 393-402:

```tsx
  // ─── Determine current state ───
  const isUploaded = !!d.mediaId;
  const isEmpty = !isUploaded && !uploading;
  const fileType = d.fileType;
```

- [ ] **Step 2: Add `generating` to the state computation**

Replace the block above with:

```tsx
  // ─── Determine current state ───
  const isGenerating = !!(d as any).generating;
  const isUploaded = !!d.mediaId;
  const isEmpty = !isUploaded && !uploading && !isGenerating;
  const fileType = d.fileType;
```

- [ ] **Step 3: Add the `generating` render branch**

Find the render block starting at around line 408 `return (`. Immediately after the opening `<div className="overflow-hidden rounded-2xl">` and BEFORE the `{/* ═══════════ STATE 1: Empty — Drop zone ═══════════ */}` comment, insert a new state branch:

```tsx
      {/* ═══════════ STATE 0: Generating (AI image) ═══════════ */}
      {isGenerating && (
        <div
          className="flex flex-col items-center justify-center gap-2 py-10 px-4 bg-[rgba(8,145,178,0.06)] border-b border-[rgba(8,145,178,0.15)]"
          style={{ minHeight: 160 }}
        >
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <span className="text-xs text-muted-foreground/70">
            Generating image…
          </span>
        </div>
      )}
```

`Loader2` is already imported at the top of the file — no new imports needed.

- [ ] **Step 4: Update the data type**

Find the props/data type definition. Grep to locate it:

```bash
```

Use the Grep tool with pattern `interface.*MediaNodeData|type MediaNodeData|NodeProps<` in `src/components/canvas/MediaNode.tsx`.

Add `generating?: boolean;` to the `data` interface alongside `fileType`, `mediaId`, `storagePath`, etc. (If the file uses an inline `NodeProps<any>`, skip — `(d as any).generating` already works.)

- [ ] **Step 5: Manual verification**

Start the dev server (if not already running):

```bash
npm run dev
```

Open the canvas page. Open browser devtools console and inject a temporary test node:

```js
window.__canvasNodes = [
  ...window.__canvasNodes,
  { id: 'test-gen', type: 'mediaNode', position: { x: 100, y: 100 }, width: 280, data: { generating: true, fileType: 'image' } }
];
```

Expected: Because `__canvasNodes` is a mirror not a setter, this alone won't render. Instead, create a temporary test directly: open React Devtools, find any existing mediaNode, add `generating: true` to its `data` prop — confirm the node switches to a spinner card. Revert when done.

Alternative verification: just proceed with Task 6 end-to-end; the generating branch is exercised there.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/MediaNode.tsx
git commit -m "feat(canvas): add generating render branch to MediaNode"
```

---

## Task 3: CanvasAIPanel — callback-driven image path

**Files:**
- Modify: `src/components/canvas/CanvasAIPanel.tsx`

- [ ] **Step 1: Add new props to the `Props` interface**

In [CanvasAIPanel.tsx](src/components/canvas/CanvasAIPanel.tsx), find the `Props` interface (near line 520). Add these three optional callbacks alongside `externalDroppedImage`:

```tsx
  /** Called immediately when image generation starts — parent spawns a skeleton MediaNode. Returns the placeholder node id. */
  onGeneratingImage?: () => string | null;
  /** Called on successful image generation — parent uploads + finalizes the MediaNode. */
  onImageGenerated?: (placeholderId: string, imageBase64: string) => void;
  /** Called when image generation fails or is aborted — parent removes the placeholder. */
  onImageGenerationFailed?: (placeholderId: string) => void;
```

- [ ] **Step 2: Destructure the new props**

Find the function signature around line 683 `export default function CanvasAIPanel({`. Add the three new props to the destructuring list:

```tsx
externalDroppedImage, fullscreen = false,
onGeneratingImage, onImageGenerated, onImageGenerationFailed
```

- [ ] **Step 3: Replace the image-generation path**

Find the block at [lines 1730-1772](src/components/canvas/CanvasAIPanel.tsx#L1730-L1772). Replace the entire `if (imageMode) { … }` branch with:

```tsx
      if (imageMode) {
        // ─── Image generation path ───
        setGeneratingImage(true);
        const placeholderId = onGeneratingImage?.() ?? null;
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              messages: apiMessages,
              mode: "image",
            }),
            signal: abortController.signal,
          });
          const data = await res.json();
          if (data.error || !data.image_b64) {
            if (placeholderId) onImageGenerationFailed?.(placeholderId);
            const _errMsg = { role: "assistant" as const, content: `⚠️ ${data.error || "Image generation failed"}` };
            const _withErr = capMessages([...messagesRef.current, _errMsg]);
            messagesRef.current = _withErr;
            setMessages(_withErr);
            onMessagesChangeRef.current?.(_withErr);
          } else {
            if (placeholderId) onImageGenerated?.(placeholderId, data.image_b64);
            const _okMsg: Message = {
              role: "assistant",
              content: "Image generated successfully",
              credits_used: data.credits_used,
            };
            const _withOk = capMessages([...messagesRef.current, _okMsg]);
            messagesRef.current = _withOk;
            setMessages(_withOk);
            onMessagesChangeRef.current?.(_withOk);
          }
        } catch (e: any) {
          if (placeholderId) onImageGenerationFailed?.(placeholderId);
          if (e?.name !== "AbortError") {
            const _errMsg = { role: "assistant" as const, content: `⚠️ ${e?.message || "Image generation failed"}` };
            const _withErr = capMessages([...messagesRef.current, _errMsg]);
            messagesRef.current = _withErr;
            setMessages(_withErr);
            onMessagesChangeRef.current?.(_withErr);
          }
        } finally {
          setGeneratingImage(false);
        }
        setImageMode(false);
      } else {
```

Key changes from the old version:
- Placeholder id captured BEFORE the fetch so we can clean up on cancel.
- Success path no longer constructs a `type: "image"` message with `image_b64` / `_blobUrl` / `revised_prompt` — it appends a plain text line.
- Failure path calls `onImageGenerationFailed` and still shows error in chat.
- `catch` block handles abort + network errors (previous version lacked a catch).

- [ ] **Step 4: Verify the render branch for historical `type === "image"` still exists**

Grep in `CanvasAIPanel.tsx` for `type === "image"` or `m.type === 'image'`. The rendering that shows `<img src={m._blobUrl}>` in the chat MUST remain untouched — historical chat threads persisted before this change still carry those messages and need to render. Do not delete those branches.

- [ ] **Step 5: Manual verification (chat-only path, before parent is wired)**

Temporarily without the parent callbacks wired, test in the running dev server:
1. Open a client canvas, click the image button to toggle `imageMode`.
2. Type a prompt, send.
3. Expected: chat shows "Image generated successfully" (NO thumbnail). No crash. No node on canvas yet — callbacks are no-ops until Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/CanvasAIPanel.tsx
git commit -m "feat(canvas-ai): replace inline image bubble with parent callbacks"
```

---

## Task 4: AIAssistantNode — relay callbacks

**Files:**
- Modify: `src/components/canvas/AIAssistantNode.tsx`

- [ ] **Step 1: Add the callbacks to the data interface**

In [AIAssistantNode.tsx](src/components/canvas/AIAssistantNode.tsx), find the data type definition (search for `interface.*Data` or the `NodeProps` destructure). Add:

```tsx
  onGeneratingImage?: () => string | null;
  onImageGenerated?: (placeholderId: string, imageBase64: string) => void;
  onImageGenerationFailed?: (placeholderId: string) => void;
```

- [ ] **Step 2: Pass callbacks into CanvasAIPanel**

Find where `<CanvasAIPanel` is rendered (around [line 575](src/components/canvas/AIAssistantNode.tsx#L575)). Add three new props to its JSX:

```tsx
              externalDroppedImage={droppedAIImage}
              onGeneratingImage={d.onGeneratingImage}
              onImageGenerated={d.onImageGenerated}
              onImageGenerationFailed={d.onImageGenerationFailed}
```

(Preserve all other existing props.)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -40
```

Expected: no new TS errors in `AIAssistantNode.tsx` or `CanvasAIPanel.tsx`. If the build already had unrelated errors, ensure your two files are not the source.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/AIAssistantNode.tsx
git commit -m "feat(canvas-ai): relay image-generation callbacks to panel"
```

---

## Task 5: SuperPlanningCanvas — imageOutputCount on AI node

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

- [ ] **Step 1: Add the counter field to `makeAiNode`**

Find [`makeAiNode()` at line 1037](src/pages/SuperPlanningCanvas.tsx#L1037). Add `imageOutputCount: 0` to the returned node's `data` (alongside `canvasContextRef`, `clientInfo`, etc.):

```tsx
      data: {
        canvasContextRef,
        clientInfo: { name: selectedClient.name, target: selectedClient.target },
        clientId: selectedClient.id,
        nodeId: activeSessionIdRef.current || AI_NODE_ID,
        authToken,
        format,
        language,
        aiModel,
        onFormatChange: handleFormatChange,
        onLanguageChange: handleLanguageChange,
        onModelChange: handleModelChange,
        onSaveScript: stableSaveScript,
        imageOutputCount: 0,
      },
```

- [ ] **Step 2: Ensure existing sessions inherit a default**

Search in the same file for where nodes are loaded from session persistence (grep for `loadCanvas` or `setNodes\(.*session`). Old sessions won't have `imageOutputCount`; that's fine because `?? 0` default is applied when we read it in Task 6. No migration required — but confirm by reading the load logic and verifying nothing blows up when the field is missing.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): track imageOutputCount on AI node for grid placement"
```

---

## Task 6: SuperPlanningCanvas — spawn / finalize / remove helpers

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`

- [ ] **Step 1: Import the grid helper**

At the top of `src/pages/SuperPlanningCanvas.tsx`, add the import alongside other `@/lib/` imports:

```tsx
import { computeImageSlot } from "@/lib/canvasGrid";
```

- [ ] **Step 2: Add the three helpers**

Find a stable location near other `useCallback` helpers (e.g. near where `addNode` or the drop handler is defined, around line 1613-1748). Add these three `useCallback` helpers:

```tsx
  const AI_GEN_IMAGE_WIDTH = 280;

  const spawnImagePlaceholder = useCallback((): string | null => {
    const aiNode = nodesRef.current.find(n => n.id === AI_NODE_ID);
    if (!aiNode) return null;
    const index = ((aiNode.data as any).imageOutputCount as number | undefined) ?? 0;
    const slot = computeImageSlot({ position: aiNode.position, width: aiNode.width ?? 680 }, index);
    const placeholderId = `mediaNode_aigen_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    setNodes(ns => ns.map(n =>
      n.id === AI_NODE_ID
        ? { ...n, data: { ...n.data, imageOutputCount: index + 1 } }
        : n
    ).concat([{
      id: placeholderId,
      type: "mediaNode",
      position: slot,
      width: AI_GEN_IMAGE_WIDTH,
      data: {
        authToken,
        clientId: selectedClient.id,
        nodeId: placeholderId,
        sessionId: activeSessionIdRef.current,
        fileType: "image",
        generating: true,
        onUpdate: (updates: any) =>
          setNodes(ns2 => ns2.map(n2 => n2.id === placeholderId ? { ...n2, data: { ...n2.data, ...updates } } : n2)),
        onDelete: () => {
          const nd = nodesRef.current.find(x => x.id === placeholderId);
          const mediaId = (nd?.data as any)?.mediaId;
          const storagePath = (nd?.data as any)?.storagePath;
          if (mediaId && storagePath) {
            canvasMediaService.deleteMedia(mediaId, storagePath).catch(() => {});
          }
          setNodes(ns2 => ns2.filter(x => x.id !== placeholderId));
          setEdges(es => es.filter(e => e.source !== placeholderId && e.target !== placeholderId));
        },
      },
    }]));

    setEdges(es => addEdge({
      id: `edge_aigen_${placeholderId}`,
      source: AI_NODE_ID,
      target: placeholderId,
    }, es));

    return placeholderId;
  }, [authToken, selectedClient.id, activeSessionIdRef, nodesRef, setNodes, setEdges]);

  const finalizeImageNode = useCallback(async (placeholderId: string, imageBase64: string) => {
    if (!activeSessionIdRef.current) {
      toast.error("No active session — image not saved.");
      setNodes(ns => ns.filter(n => n.id !== placeholderId));
      setEdges(es => es.filter(e => e.source !== placeholderId && e.target !== placeholderId));
      return;
    }
    try {
      // Decode base64 → Blob → File
      const byteChars = atob(imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const fileName = `ai-gen-${Date.now()}.png`;
      const file = new File([byteArray], fileName, { type: "image/png" });

      const record = await canvasMediaService.uploadMedia(
        file,
        activeSessionIdRef.current,
        selectedClient.id,
        placeholderId,
        () => { /* no per-upload progress UI for AI-gen */ },
      );

      // Fetch signed URL for immediate display
      const { data: signed } = await supabase.storage
        .from('canvas-media')
        .createSignedUrl(record.storage_path, 60 * 60);

      setNodes(ns => ns.map(n =>
        n.id === placeholderId
          ? {
              ...n,
              data: {
                ...n.data,
                generating: false,
                mediaId: record.id,
                storagePath: record.storage_path,
                fileName: record.file_name,
                fileSizeBytes: record.file_size_bytes,
                signedUrl: signed?.signedUrl,
              },
            }
          : n
      ));
    } catch (err: any) {
      console.error("[AI image] finalize failed:", err);
      toast.error(err?.message || "Failed to save generated image");
      setNodes(ns => ns.filter(n => n.id !== placeholderId));
      setEdges(es => es.filter(e => e.source !== placeholderId && e.target !== placeholderId));
    }
  }, [activeSessionIdRef, selectedClient.id, setNodes, setEdges]);

  const removeImagePlaceholder = useCallback((placeholderId: string) => {
    setNodes(ns => ns.filter(n => n.id !== placeholderId));
    setEdges(es => es.filter(e => e.source !== placeholderId && e.target !== placeholderId));
  }, [setNodes, setEdges]);
```

- [ ] **Step 3: Verify imports exist**

Confirm in `SuperPlanningCanvas.tsx`:
- `toast` is imported (search `from.*sonner`)
- `supabase` is imported (search `from.*supabaseClient`)
- `canvasMediaService` is imported (search `canvasMediaService`)
- `addEdge` is imported (already confirmed at line 12)

Add any missing imports at the top of the file.

- [ ] **Step 4: Wire callbacks into `makeAiNode`**

Back in `makeAiNode()` ([line 1037](src/pages/SuperPlanningCanvas.tsx#L1037)), add the three callbacks to `data`:

```tsx
      data: {
        canvasContextRef,
        clientInfo: { name: selectedClient.name, target: selectedClient.target },
        clientId: selectedClient.id,
        nodeId: activeSessionIdRef.current || AI_NODE_ID,
        authToken,
        format,
        language,
        aiModel,
        onFormatChange: handleFormatChange,
        onLanguageChange: handleLanguageChange,
        onModelChange: handleModelChange,
        onSaveScript: stableSaveScript,
        imageOutputCount: 0,
        onGeneratingImage: spawnImagePlaceholder,
        onImageGenerated: finalizeImageNode,
        onImageGenerationFailed: removeImagePlaceholder,
      },
```

Note: `makeAiNode` is called during initial canvas load. The three helpers are `useCallback`s defined later in the function body. Verify `makeAiNode` is declared with `function makeAiNode()` (hoisted) or reordered so helpers exist first. If `makeAiNode` runs before the helpers are defined (they are `useCallback` so they depend on closure ordering), change `makeAiNode` to a `useCallback` of its own and list the three helpers in its dependency array — OR inline the references as `d.onGeneratingImage ?? (() => null)` etc. **Simplest fix:** since `makeAiNode` is only called inside `useEffect` bodies (confirmed by earlier read), and React closures capture the latest helper references at call time, the function-declaration form works — the helpers will be hoisted via `useCallback` and available.

After the wiring, also update `useEffect` blocks that re-sync AI node data (search for uses of `setNodes` that update the AI node) to include the new callbacks in the merged data. Specifically, any `setNodes(ns => ns.map(n => n.id === AI_NODE_ID ? ... : n))` block that rebuilds data from scratch must also carry these three callbacks forward. Grep for `AI_NODE_ID` and confirm.

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | head -60
```

Expected: no new TS errors. Fix any type mismatches in the new helpers.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): spawn MediaNode from AI image generation"
```

---

## Task 7: End-to-end manual QA

**Files:**
- None (runtime testing only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open the canvas page for any client.

- [ ] **Step 2: Happy path — single generation**

1. Click the image icon in the AI panel (toggles `imageMode`).
2. Type a short prompt ("a red cube on a white background").
3. Send.

Expected:
- Immediately: a new card appears to the right of the AI node showing "Generating image…" with a spinner; an edge draws from AI node's right handle to the new card's left handle.
- Within ~10s: the card swaps to the generated image with download/fullscreen/delete controls, same size/position.
- Chat thread shows: "Image generated successfully" — no image preview, no prompt text.

- [ ] **Step 3: Grid wrap — five generations**

Generate 5 images in a row (same AI node).

Expected layout (roughly):
- images 1-3: row 1 (y aligned with AI node top)
- images 4-5: row 2, below row 1 with ~24px gap

All 5 edges visible, all images draggable afterward.

- [ ] **Step 4: Error path — simulated network failure**

1. Open devtools → Network tab → set throttling to "Offline".
2. Generate an image.

Expected:
- Placeholder spinner node appears briefly.
- Fetch fails → error message in chat ("⚠️ …").
- Placeholder node AND its edge are both removed.

Restore network, continue.

- [ ] **Step 5: Cancel path**

1. Start a generation.
2. Hit the stop/abort button in the AI panel before it returns.

Expected: placeholder + edge disappear, no chat error (AbortError is suppressed per Task 3 code).

- [ ] **Step 6: Persistence path**

1. Generate one image (let it finalize).
2. Refresh the page.

Expected: image node reloads from the session with signed URL intact. Download button works. Edge to AI node persists.

- [ ] **Step 7: Delete cleanup**

1. Click the trash icon on a finalized generated image node.
2. Confirm deletion.

Expected: node removed, edge removed, `canvas_media` row and storage object deleted (existing MediaNode `onDelete` path, already tested by drag-drop usage).

- [ ] **Step 8: Backward compatibility — historical chat images**

1. Load a session that already has an image message persisted in chat (pre-change).

Expected: the old image still renders inline in chat (render branch preserved in Task 3 Step 4).

- [ ] **Step 9: Final commit**

If any small fixes were needed during QA, commit them separately:

```bash
git add -p
git commit -m "fix(canvas-ai): <describe>"
```

If everything works unchanged, no commit needed.

---

## Self-Review Checklist (for plan author)

- Spec coverage: every spec section maps to a task.
  - Chat collapses to success line → Task 3 Step 3.
  - Skeleton node spawns immediately → Task 6 `spawnImagePlaceholder`.
  - 3-col grid math → Task 1 + used in Task 6.
  - Edge auto-creation → Task 6 `spawnImagePlaceholder` (`addEdge`).
  - Storage upload + canvas_media row → Task 6 `finalizeImageNode`.
  - Error path removes placeholder → Task 6 `removeImagePlaceholder`, Task 3 error branches.
  - Historical chat images still render → Task 3 Step 4.
  - `imageOutputCount` on AI node → Task 5.
- Placeholder scan: no TBDs, no "add appropriate handling" — all steps carry code.
- Type consistency: `onGeneratingImage: () => string | null`, `onImageGenerated: (id, b64) => void`, `onImageGenerationFailed: (id) => void` used identically in Tasks 3, 4, 6. `imageOutputCount` key consistent.
