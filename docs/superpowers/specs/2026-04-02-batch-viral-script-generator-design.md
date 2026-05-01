# Batch Viral Script Generator — Design Spec

**Date**: 2026-04-02
**Status**: Approved

## Problem

Creating scripts from viral videos is currently a one-at-a-time process: find a video, drop it in the canvas, tell the AI to replicate it. For 5 videos that's 5 manual cycles. The goal is to select multiple viral videos and generate scripts for all of them in one batch, using existing client context from the canvas.

## Solution Overview

Add multi-select to Viral Today video cards, a batch generation modal with client picker, and background processing via the existing Anthropic Batch API (50% cheaper). Completed scripts appear as compact nodes in the client's most recent Super Planning Canvas session, with a toast notification on completion.

## User Flow

1. Admin browses Viral Today, hovers video cards to reveal checkboxes
2. Selects 2–10 videos (checkbox top-left of each card)
3. Floating action bar slides up from bottom: "5 videos selected · Generate Scripts →"
4. Clicks "Generate Scripts" → BatchScriptModal opens
5. Picks client from dropdown (clients table)
6. Sees thumbnail strip of selected videos + credit estimate
7. Clicks "Generate in Background" → modal closes
8. System fetches canvas context, sends batch to Anthropic
9. Polls every 15s in background until complete
10. Toast notification: "✅ 5 scripts added to [Client] canvas"
11. User opens canvas → 5 compact script nodes with real video thumbnails

## Architecture & Data Flow

```
ViralToday (multi-select)
  → BatchScriptModal (client picker)
    → batch-generate-scripts edge function
      → reads canvas_states for client's most recent session
      → extracts text node content as client context
      → builds prompt per video: video caption + metrics + client context
      → sends to Anthropic Batch API
      → returns batchId
    → frontend polls batch-poll-scripts every 15s
    → on completion:
      → writes ScriptBatchNode entries into canvas_states session
      → frontend shows toast notification
```

### Data passed per script in the batch

- `video_caption`: full caption text from viral_videos
- `video_url`: original Instagram/TikTok URL
- `thumbnail_url`: proxied thumbnail URL
- `views_count`, `outlier_score`, `engagement_rate`: video metrics
- `owner_username`, `platform`: source metadata
- `client_context`: extracted from canvas text nodes (brand voice, niche, goals)
- `client_id`: selected client
- `canvas_session_id`: most recent session for that client

## Frontend Components

### 1. ViralToday changes (`src/pages/ViralToday.tsx`)

- **VideoCard**: Add checkbox element, top-left corner, admin-only, visible on hover
  - Current layout: top-left = platform icon, top-right = trash (admin) or external link (non-admin)
  - With multi-select: checkbox overlays top-left corner (platform icon stays but checkbox sits on top), trash stays top-right
  - Checked state uses cyan highlight border on card
- **New state**: `selectedVideos: Map<string, ViralVideo>` — stores full video objects keyed by ID
- **Floating action bar**: Fixed position bottom of viewport
  - Animates in (slide up) when `selectedVideos.size >= 2`
  - Shows: count badge, "Generate Scripts →" button, "Clear Selection" link
  - Transparent glass background matching app theme

### 2. BatchScriptModal (`src/components/BatchScriptModal.tsx`)

New modal component:
- **Client dropdown**: Fetches from `clients` table, shows client name
- **Thumbnail strip**: Horizontal scrollable row of selected video thumbnails (click × to remove one)
- **Credit estimate**: "This will use ~{N × 25} credits ({N} scripts × 25 credits each)"
- **Generate button**: "Generate in Background" — calls batch-generate-scripts, closes modal
- **Background polling**: After modal closes, polling continues silently. On completion, fires toast and writes to canvas.

### 3. ScriptBatchNode (`src/components/canvas/ScriptBatchNode.tsx`)

New ReactFlow custom node for canvas:
- Fixed width ~260px
- Real video thumbnail (proxied via existing proxy-image endpoint)
- Script title (derived from video or AI-generated)
- Source metadata: @username · Xx outlier · platform icon
- First 2 lines of script as preview text
- "Expand ↗" button → opens script in full editor view (reuses existing AIScriptWizard read/edit mode)
- Cyan left border to indicate batch-generated script
- Draggable, connectable like other canvas nodes

## Backend Changes

### 1. `batch-generate-scripts` edge function (modify existing)

Current: accepts `topics[]` (string array)
New: accepts `videos[]` (object array) OR `topics[]` (backwards compatible)

When `videos[]` is provided:
- Accepts: `{ videos: ViralVideo[], clientId: string, language: string, format: string }`
- Fetches most recent `canvas_states` row for `clientId` (ordered by `updated_at desc`, limit 1)
- Parses canvas state JSON, extracts content from text/note nodes connected to AI assistant
- Builds per-video prompt:
  ```
  You are creating a short-form video script inspired by this viral video.

  VIRAL VIDEO CONTEXT:
  - Caption: {video.caption}
  - Platform: {video.platform}
  - Views: {video.views_count} | Outlier: {video.outlier_score}x | Engagement: {video.engagement_rate}%
  - Account: @{video.owner_username}

  CLIENT CONTEXT:
  {extracted_text_node_content}

  Create a script that replicates the style, structure, and hook pattern of this viral video
  but adapted for the client's brand, niche, and audience. Include: HOOK, SHIFT, BODY, CTA sections.
  ```
- Sends batch to Anthropic Batch API (same as existing flow)
- Returns `{ batchId, videoMap }` (maps custom_id → video data for correlation)

### 2. `batch-poll-scripts` edge function (modify existing)

Current: returns results to frontend for saving
New: additionally writes ScriptBatchNode data into canvas_states

On batch completion:
- Parses results, correlates to videos via custom_id
- Fetches the canvas session (same one used for context)
- Reads current canvas state JSON
- Appends N new nodes of type `scriptBatch` to the nodes array
  - Positions: stacked vertically with offset (y + 120 per node) from base position (rightmost existing node x + 400, y = 100)
  - Each node data: `{ script, videoThumbnail, videoUrl, videoCaption, ownerUsername, outlierScore, platform }`
- Saves updated canvas state back to canvas_states table
- Returns results to frontend (for toast notification)

### 3. Canvas context extraction (new helper)

Shared utility used by batch-generate-scripts:
- Input: `clientId`
- Fetches most recent canvas_states row where nodes contain client context
- Parses the ReactFlow JSON state
- Finds text/note nodes (type === "textNote" or "researchNote")
- Extracts their text content
- Returns concatenated context string (max 4000 chars to fit in prompt)

## Cost Model

- Uses existing Anthropic Batch API: 50% discount vs real-time
- Cost per script: 25 credits (vs 50 for individual generation)
- Max 10 videos per batch (existing limit)
- Credits deducted upfront before batch starts
- Balance check in BatchScriptModal before allowing generation

## Notification

- Toast via `sonner` (already used in app): "✅ 5 scripts added to [Client Name] canvas"
- Toast includes "Open Canvas →" link that navigates to the canvas page

## Edge Cases

- **No canvas session for client**: Show warning in modal — "No canvas session found for this client. Create one first."
- **Insufficient credits**: Disable Generate button, show "Not enough credits (need X, have Y)"
- **Batch partially fails**: Toast shows partial result — "✅ 3/5 scripts generated. 2 failed." Failed ones can be retried individually.
- **Client has no text nodes in canvas**: Still generates scripts but without client-specific context — uses video data only. Show info message.
- **Video removed during batch processing**: Script still generates from cached data sent at batch time.

## Files to Create/Modify

### Create
- `src/components/BatchScriptModal.tsx` — batch generation modal
- `src/components/canvas/ScriptBatchNode.tsx` — canvas node for batch scripts

### Modify
- `src/pages/ViralToday.tsx` — checkboxes, selectedVideos state, floating action bar
- `src/pages/SuperPlanningCanvas.tsx` — register ScriptBatchNode type, handle expand action
- `supabase/functions/batch-generate-scripts/index.ts` — accept videos[], read canvas context
- `supabase/functions/batch-poll-scripts/index.ts` — write results to canvas_states
