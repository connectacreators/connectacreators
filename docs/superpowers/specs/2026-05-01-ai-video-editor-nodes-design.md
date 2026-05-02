# AI Video Editor — Canvas Nodes Design

**Date:** 2026-05-01  
**Status:** Approved  
**Scope:** Two new canvas nodes for the Super Planning Canvas — Footage Node and Video Editor Node

---

## Overview

One-button AI video editing inside the Super Planning Canvas. The user uploads raw clips to a Footage Node, connects it to a Video Editor Node spawned from the AI Assistant chat, and hits "Generate Edit." Claude reads the full canvas context (script, platform, brand, inspiration videos) and produces a Creatomate JSON timeline. Creatomate renders a finished MP4 server-side in ~2 minutes. No manual timeline dragging — the app edits for the user.

---

## The Two Nodes

### 1. Footage Node (`FootageNode.tsx`)

A canvas node for managing raw client footage. Eventual precursor to a dedicated Footage Page in the app.

**Appearance:**
- Amber/yellow accent (`rgba(251,191,36,…)`) to visually distinguish from other nodes
- Drag-and-drop upload zone at the top
- 3-column thumbnail grid (9:16 aspect ratio per card) with duration badge
- Footer showing total clip count and duration
- Supabase `footage` bucket (already exists) scoped by `clientId` + `canvasSessionId`

**Behavior:**
- Multi-file upload with progress (reuses `videoUploadService` pattern from existing `FootageUploadDialog`)
- Each clip stored at `footage/{clientId}/{sessionId}/{filename}`
- Signed URL generated per clip (1hr TTL, auto-refreshed)
- Click a clip to preview inline (plays in a small overlay)
- Handle on left (input) and right (output — connects to Video Editor Node)
- Node data persisted to canvas session JSON like all other nodes

**Data shape:**
```ts
interface FootageNodeData {
  clips: FootageClip[];
  clientId: string;
  sessionId: string;
  onUpdate: (updates: Partial<FootageNodeData>) => void;
  onDelete: () => void;
}

interface FootageClip {
  id: string;
  fileName: string;
  storagePath: string;
  signedUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
  uploadedAt: string;
}
```

---

### 2. Video Editor Node (`VideoEditorNode.tsx`)

A canvas node that orchestrates AI-driven video assembly. Spawned from the AI Assistant Node chat via an "Open Video Editor →" button that appears after a script is generated.

**Appearance:**
- Cyan accent (`rgba(34,211,238,…)`) matching the AI Assistant palette
- Context chips row: Script ✓ / 9:16 Reel ✓ / Brand ✓ / AI Assistant ✓
- Inspiration strip: shows thumbnails of VideoNodes on the canvas being referenced, with a short note on what style cues were extracted (cut rhythm, caption size, transitions)
- Clip sequence display: horizontal strip showing `clip_02 → clip_01 → clip_03` with colored section bars (Hook/Body/CTA), timestamps, and total duration
- Caption/music summary row below the sequence
- "Generate Edit" button

**Three states:**

**Idle** — Shows the AI-generated clip plan and "Generate Edit" button. User can see exactly which clips map to which section before committing to a render.

**Rendering** — Progress steps animate: "Script + context read → Inspiration analyzed → Timeline sent to Creatomate → Rendering… → Saving result." A progress bar pulses. Estimated time shown.

**Done** — Inline 9:16 video preview. Three action buttons: ⬇ Download · → Queue (sends to Editing Queue) · ↺ Re-generate.

---

## Architecture

### How the Node Gets Spawned

The AI Assistant Node chat gains a new output: after generating a script, a badge appears — "🎬 Open Video Editor →". Clicking it:
1. Creates a `videoEditorNode` on the canvas positioned to the right of the AI Assistant Node
2. Pre-populates it with the script sections, platform format, and brand info from the canvas context
3. Creates a canvas edge connecting AI Assistant → Video Editor

The user then connects the Footage Node to the Video Editor Node via a handle edge (drag-to-connect, same as all other nodes).

### Data Flow

```
FootageNode (clips in Supabase)
        ↓ signed URLs
VideoEditorNode
        ↓ "Generate Edit" click
Edge Function: ai-video-editor
        ├── reads canvas context (script sections, platform, brand, client)
        ├── reads VideoNode references on canvas (inspiration style cues)
        ├── calls Claude → generates Creatomate JSON timeline
        └── POSTs to Creatomate API → polls for completion
                ↓
        Returns rendered MP4 URL
                ↓
VideoEditorNode shows preview + actions
```

### New Edge Function: `ai-video-editor`

**Input:**
```ts
{
  clips: FootageClip[];           // from Footage Node
  script: ScriptSection[];        // hook/body/cta from AI Assistant
  platform: "9:16" | "16:9";
  brandColors: { primary: string; secondary: string };
  logoUrl: string | null;
  inspirationVideos: VideoNodeRef[]; // style cues extracted from VideoNodes
  clientId: string;
}
```

**Steps:**
1. Claude prompt: given the script sections, available clips, and inspiration style, produce a Creatomate composition JSON (clip order, trim points, caption text, music volume, transitions, logo position, output format)
2. POST to `https://api.creatomate.com/v1/renders` with the composition
3. Poll render status every 5 seconds (Creatomate webhooks as future improvement)
4. On completion: store rendered video URL in Supabase, return to client

**Creatomate composition covers:**
- Video track: clips in AI-determined order with trim start/end per section
- Text track: captions derived from script, positioned at 85% vertical, large bold font
- Audio track: background music at 30% volume, fade out last 2 seconds
- Image track: client logo top-right corner, 15% width
- Output: 1080×1920 (9:16) or 1920×1080 (16:9) MP4

---

## What Claude Reads for Inspiration

When VideoNodes exist on the canvas, the edge function extracts their `videoAnalysis` data (already stored per node):
- `audio.bpm_estimate` → informs cut rhythm / clip pacing
- `visual_segments` → informs average clip duration per section
- `audio.has_music` → whether background music is appropriate
- `detected_format` → caption style (large/small, position)

This is passed to the Claude prompt as style constraints: "Match the cut rhythm of the reference video (~2s per segment in the hook)."

---

## Future Path: Footage Page

The Footage Node is designed to be extracted into a standalone `/footage` page in the app. The `FootageClip` data shape and Supabase storage path structure (`footage/{clientId}/…`) are intentionally client-scoped (not session-scoped) so footage persists across canvas sessions and can be surfaced on a dedicated page later.

---

## Components to Build

| Component | Type | Notes |
|---|---|---|
| `FootageNode.tsx` | Canvas node | New component in `src/components/canvas/` |
| `VideoEditorNode.tsx` | Canvas node | New component in `src/components/canvas/` |
| `ai-video-editor` | Edge function | New Supabase edge function |
| Register both in `SuperPlanningCanvas.tsx` | Config | Add to `nodeTypes` + `addNode` union |
| Add both to `CanvasToolbar.tsx` | UI | New toolbar buttons |
| "Open Video Editor →" badge in `AIAssistantNode.tsx` | UI | Appears post-script-generation |

---

## Out of Scope (v1)

- Manual timeline scrubbing / clip reordering by user
- Real-time preview before render (approximate only)
- Multiple audio tracks / voiceover
- Filters and color grading
- Creatomate webhook (polling is fine for v1)
- Footage Page (canvas node only in v1)
