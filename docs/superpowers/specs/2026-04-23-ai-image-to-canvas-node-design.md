# AI-Generated Images Spawn Canvas Nodes

**Date:** 2026-04-23
**Status:** Approved — ready for implementation planning

## Summary

Today, when the canvas AI Assistant node generates an image (imageMode on), the image is rendered inline in the chat thread and the base64 bytes travel through message history. This spec changes that path: each successful image generation spawns a real `MediaNode` on the canvas, connected to the AI node's right handle, while the chat message collapses to a single success line. Users get a persistent, downloadable, fullscreen-capable image node that participates in the rest of the canvas (connect to other nodes, delete with storage cleanup, survive reloads) via the existing MediaNode plumbing.

## Goals

- Every successful AI image generation produces a persistent `MediaNode` with the same capabilities as a drag-and-dropped image.
- The AI chat thread stops duplicating the image and its metadata — only a plain success line remains.
- A visible edge connects the AI node to each generated image node so the lineage is clear on the canvas.
- Placement is predictable for bulk generations without forcing later manual cleanup.
- Users get immediate feedback during generation (a skeleton node) so the canvas feels responsive.

## Non-Goals

- No retro-spawn of nodes for images already present in prior chat threads.
- No "regenerate from node" button on the MediaNode.
- No surfacing of the model's `revised_prompt`.
- No changes to the underlying `ai-assistant` edge function or its image-generation response shape.
- No changes to non-image AI responses (text, scripts, research).

## User Experience

**Before**
- User toggles `imageMode`, types a prompt, sends.
- Chat shows a loader bubble, then an image bubble with the revised prompt and credit cost.
- The image lives only inside the chat. It is not a canvas node; it cannot be connected to anything, and it does not appear if chat is collapsed.

**After**
- User toggles `imageMode`, types a prompt, sends.
- A skeleton `MediaNode` appears immediately at the next grid slot to the right of the AI node, with an edge drawn from the AI node's right handle. A centered spinner indicates generation in progress.
- When generation completes, the skeleton swaps to the real image in place — no node movement, no edge re-draw.
- The chat thread shows a single line: `Image generated successfully`.
- If generation fails, the skeleton node is removed and the error is shown in chat only.

## Architecture

### Data flow

```
CanvasAIPanel (image path)
    │
    │ on send: call onGeneratingImage(placeholderId) — parent spawns skeleton + edge
    │ on success: call onImageGenerated(placeholderId, base64) — parent swaps to real MediaNode
    │ on failure: call onImageGenerationFailed(placeholderId) — parent removes placeholder
    │
    ▼
AIAssistantNode (relays callbacks to parent via node data props)
    │
    ▼
SuperPlanningCanvas
    ├─ spawnImagePlaceholder(aiNodeId) → generates placeholderId, picks grid slot, adds node + edge
    ├─ finalizeImageNode(placeholderId, base64) → uploads to storage, inserts canvas_media row, updates node data
    └─ removeImagePlaceholder(placeholderId) → deletes local-only placeholder node + edge
```

### Components touched

1. **[CanvasAIPanel.tsx](src/components/canvas/CanvasAIPanel.tsx)** — The image-generation branch ([lines 1730-1772](src/components/canvas/CanvasAIPanel.tsx#L1730-L1772)) stops constructing an inline image message. Instead it:
   - Generates a `placeholderId` (client-side uuid) before the fetch.
   - Calls `props.onGeneratingImage?.(placeholderId)` before the fetch.
   - On success: calls `props.onImageGenerated?.(placeholderId, data.image_b64)` and appends `{ role: "assistant", content: "Image generated successfully", credits_used: data.credits_used }` to messages. No `type: "image"`, no `_blobUrl`, no `revised_prompt` stored.
   - On failure: calls `props.onImageGenerationFailed?.(placeholderId)` and appends the existing error line.
   - Type `Message`'s `type` union no longer needs the `"image"` variant going forward, but we keep it for backward-compatible rendering of already-persisted chat history. The render branch for `type === "image"` remains as-is so historical threads continue to show their images.

2. **[AIAssistantNode.tsx](src/components/canvas/AIAssistantNode.tsx)** — Receives three callbacks through its `data` prop and passes them down to `CanvasAIPanel`. Also exposes `aiNodeId` so the parent knows which AI node spawned the image.

3. **[SuperPlanningCanvas.tsx](src/pages/SuperPlanningCanvas.tsx)** — New helpers:
   - `spawnImagePlaceholder(aiNodeId: string): string` — allocates placeholder id, computes grid slot (see Placement), inserts a `mediaNode` with `data: { generating: true, fileType: "image" }` and an edge `aiNodeId → placeholderId` (target handle left, source handle right).
   - `finalizeImageNode(placeholderId: string, base64: string): Promise<void>` — decodes base64 → Blob, calls `canvasMediaService.uploadMedia(...)` to create storage object + `canvas_media` row, then `setNodes` to merge the returned `mediaId`, `storagePath`, `signedUrl`, `fileName` into the placeholder node data and clear `generating`.
   - `removeImagePlaceholder(placeholderId: string): void` — removes the placeholder node + its edge; no storage cleanup needed because nothing was uploaded.
   - Wires these three callbacks into every AI node's `data` at construction in the existing `addNode('aiAssistantNode')` path.

4. **[MediaNode.tsx](src/components/canvas/MediaNode.tsx)** — Adds a lightweight "generating" branch: if `data.generating === true`, render a 280×180 card with the same border/background as the image variant, centered spinner, subtitle "Generating…". No image tag, no download/fullscreen buttons, no handles changes. All existing rendering paths untouched.

5. **[canvasMediaService.ts](src/services/canvasMediaService.ts)** — Reuses the existing `uploadMedia` method ([line 214](src/services/canvasMediaService.ts#L214)). `finalizeImageNode` constructs a `File` from the decoded base64 PNG (name like `ai-gen-<timestamp>.png`, type `image/png`) and passes it through the same path drag-drop uses.

### Placement — 3-column grid per AI node

- The AI node's data gets a new field: `imageOutputCount: number` (default 0).
- Constants: `GAP = 24`, `COL_W = 280`, `ROW_H = 200`, `OFFSET_X = 80` (distance from AI node right edge to first image column).
- For generation index `i` (0-based):
  - `col = i % 3`
  - `row = Math.floor(i / 3)`
  - `x = aiNode.position.x + (aiNode.width ?? 360) + OFFSET_X + col * (COL_W + GAP)`
  - `y = aiNode.position.y + row * (ROW_H + GAP)`
- `imageOutputCount` is incremented whether generation succeeds or fails (failed generations still consume a slot to prevent later placements from colliding with the failed-then-deleted spot's neighbors — simpler than reclaiming slots).
- After placement, the MediaNode is a normal draggable node. The grid applies only at spawn time; manual rearrangement is preserved.

### Edge creation

- A single `EditableEdge` (or whatever is default in this project — follow existing pattern used by `addEdge`) is added with:
  - `source: aiNodeId`, `sourceHandle: undefined` (AI node's right source handle at [AIAssistantNode.tsx:584](src/components/canvas/AIAssistantNode.tsx#L584) is unnamed)
  - `target: placeholderId`, `targetHandle: undefined` (MediaNode left target handle at [MediaNode.tsx:911](src/components/canvas/MediaNode.tsx#L911))
- The edge uses the existing default type (`EditableEdge`, configured in [SuperPlanningCanvas.tsx:139-140](src/pages/SuperPlanningCanvas.tsx#L139-L140)) so it picks up project styling for free.
- Edge is user-deletable; no special cleanup beyond React Flow's default.

### Persistence

- **Placeholder node** — local only. Not written to session storage until it becomes a real MediaNode.
- **Finalized node** — uses existing MediaNode persistence via session save. The `canvas_media` row is created during `finalizeImageNode`; the node payload stored in the session contains the ids/paths just like any drag-dropped image.
- **Edges** — saved with the session as normal. If the session saves while the placeholder is still generating, the placeholder's edge gets persisted with a target id that will exist once finalize runs (same tick or immediately after).
- **Edge case — unload during generation** — if the user closes the tab mid-generation, the placeholder is lost on reload (no storage row, no signed URL). This is acceptable; the chat message wasn't appended yet either.

### Error handling

- **Image gen API returns error** — `CanvasAIPanel` appends the existing error line to chat and calls `onImageGenerationFailed(placeholderId)`. Parent removes placeholder + edge.
- **Storage upload fails after success** — surface toast error, then call `removeImagePlaceholder` to clear the skeleton. Append a chat line: `⚠️ Image generated but failed to save to canvas. See console.` (re-using existing toast pattern).
- **AbortController fires (user cancelled)** — same path as generation-failed: placeholder removed, existing cancel-toast shown in chat.

### Testing

- Manual: generate one image → verify skeleton appears, swaps to image, chat shows success line, edge is present, node is draggable, download and fullscreen work.
- Manual: generate five images → verify 3-column grid wraps to second row, all edges draw cleanly.
- Manual: fail a generation (disconnect network mid-request) → placeholder disappears, error in chat, no orphan edge.
- Manual: reload the page mid-generation → skeleton is gone, no orphan, no DB row leak.
- Manual: delete a finalized image node → storage object and canvas_media row cleaned up via existing MediaNode `onDelete`.
- Manual: historical chat with a pre-change image message still renders that image inline (backward compatibility).

## Open Questions

None. All design decisions captured above are confirmed.

## Out-of-Scope Follow-Ups

- Surface the `revised_prompt` as a tooltip or caption on the MediaNode.
- Add a "regenerate" button on the image node that re-sends the original prompt to the connected AI node.
- Allow the user to pick target aspect ratio before generation (currently fixed by the edge function).
