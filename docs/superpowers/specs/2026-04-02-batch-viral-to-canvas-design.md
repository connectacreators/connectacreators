# Batch Viral Videos → Canvas AI Flow — Design Spec

**Date**: 2026-04-02
**Status**: Approved
**Replaces**: batch-viral-script-generator-design.md (silent background generation approach)

## Problem

The original batch script generator silently generated scripts in the background and dropped them into the canvas as static nodes. This bypasses the AI assistant conversation, which is where the real value is — discussing direction, tone, and format before generating scripts.

## Solution Overview

Selecting viral videos in Viral Today now sends them to the canvas as real VideoNodes inside a group, triggers the AI assistant to start a conversation about script direction, and later generates all scripts at once via batch API when the user agrees on direction.

## User Flow

1. Admin selects 2–10 videos in Viral Today (checkboxes on hover)
2. Floating action bar: "{N} videos selected · Generate Scripts →"
3. Clicks → BatchScriptModal opens (simplified: client picker + thumbnail strip only)
4. Clicks "Add to Canvas" → modal closes → navigates to `/canvas` with client + videos in navigation state
5. Canvas loads → creates GroupNode ("Viral Batch · 3 videos") + N VideoNodes inside it
6. VideoNodes auto-trigger transcription/analysis in background (existing behavior)
7. AI assistant sends message in current chat: "I added 3 viral videos to your canvas: @user1, @user2, @user3. Analyze them and ask me what direction I want for the scripts."
8. User has back-and-forth conversation about angle, tone, format
9. User says "generate" → AI fires batch API → all script previews appear in chat at once
10. User reviews, refines, saves individual scripts they like

## Architecture

```
ViralToday (multi-select)
  → BatchScriptModal (client picker only)
    → navigate('/canvas', { state: { incomingVideos, clientId } })
      → SuperPlanningCanvas detects incomingVideos
        → creates GroupNode + N VideoNodes
        → VideoNodes auto-trigger transcription
        → AI auto-message injected into current chat
          → conversation about direction
          → user agrees → AI calls batch-generate-scripts
          → all script previews rendered in chat
          → user saves scripts they like
```

## Frontend Changes

### 1. BatchScriptModal — Simplify (`src/components/BatchScriptModal.tsx`)

Remove:
- Credit estimate / balance check
- "Generate in Background" button + polling logic
- `useAuth` import (no longer needed for credit bypass)
- `pollRef`, polling interval, batch completion toast

Keep:
- Client dropdown
- Thumbnail strip with remove (×) buttons

Add:
- "Add to Canvas" button — stores videos + clientId in React Router navigation state, navigates to `/canvas?client={clientId}`

### 2. SuperPlanningCanvas — Incoming video injection (`src/pages/SuperPlanningCanvas.tsx`)

On mount / navigation state change:
- Read `location.state?.incomingVideos` and `location.state?.clientId`
- If clientId differs from current canvas client, switch to that client
- Create GroupNode at rightmost existing node x + 400, y = 100
  - Label: "Viral Batch · {N} videos"
  - Style: standard group node
- Create N VideoNodes inside the group:
  - Each with `parentId` set to group node ID
  - Stacked vertically with ~280px y-offset
  - Data: `{ url, platform, thumbnailUrl, caption, ownerUsername, outlierScore, viewsCount }`
- Clear navigation state after consuming (prevent re-injection on refresh)
- After 1.5s delay, trigger AI auto-message

### 3. CanvasAIPanel — Auto-message support (`src/components/canvas/CanvasAIPanel.tsx`)

New capability:
- Expose a method (via window global or ref) to inject a programmatic message
- Message content: "I just added {N} viral videos to the canvas: @user1, @user2, @user3. Analyze them and ask me what direction I want for the scripts."
- This triggers the AI to respond naturally, asking about tone/format/angle
- Message is a real user message in the chat history (not a system message)

### 4. Batch script preview in chat

When AI calls batch-generate-scripts and gets results:
- Render all script previews in a single chat message
- Reuse existing ScriptOutputPanel pattern, stacked vertically
- Each preview shows: script title, HOOK/SHIFT/BODY/CTA sections, source video reference
- Each has a "Save to Canvas" action (creates a standalone text note or script node)

## What Gets Removed

- `src/components/canvas/ScriptBatchNode.tsx` — delete entirely
- `scriptBatchNode` from nodeTypes in SuperPlanningCanvas
- Canvas write-back logic from `batch-poll-scripts` edge function
- Background polling from BatchScriptModal
- Credit check/estimate UI from BatchScriptModal

## Edge Cases

- **No canvas session for client**: Create a fresh canvas session on navigation
- **Canvas already has nodes**: Group is placed to the right of existing content
- **Transcription still loading when user wants to generate**: AI can work with captions + metrics while transcription loads, or ask user to wait
- **User refreshes after videos injected**: Videos persist in canvas state (already saved). Navigation state is cleared so they won't be re-injected.
- **User closes chat mid-conversation**: Chat persists in canvas_ai_chats, can be resumed

## Files to Create/Modify

### Modify
- `src/components/BatchScriptModal.tsx` — simplify to client picker + "Add to Canvas"
- `src/pages/SuperPlanningCanvas.tsx` — detect incoming videos, create group + video nodes, trigger AI auto-message
- `src/components/canvas/CanvasAIPanel.tsx` — accept auto-message trigger

### Delete
- `src/components/canvas/ScriptBatchNode.tsx`
