# Canvas Media Uploads + Transcription Plan

## Goal
Allow users to upload images, videos, and voice notes directly into canvas sessions. Files stored in Supabase Storage with a 5GB cap per session. Videos and voice notes can be transcribed (charging credits). All uploaded media integrates with the AI assistant as context.

## Architecture Overview

```
User drops file → MediaUploadNode created on canvas
  → File uploaded to Supabase Storage bucket "canvas-media"
  → DB row in canvas_media tracks file metadata + session association
  → 5GB session cap enforced client-side + server-side
  → User can trigger transcription (audio or visual)
    → Edge function processes → deducts credits → returns result
  → AI assistant reads media context via edges (same pattern as VideoNode)
```

## Cost & Credit Design

| Action | Credits | Justification |
|--------|---------|---------------|
| File upload (any type) | 0 | Storage cost is negligible (~$0.02/GB/mo) |
| Audio transcription (voice note or video audio) | 150 | Same as existing `transcribe-video` — uses Whisper API |
| Visual transcription (video frame analysis) | 100 | Uses Claude Haiku vision on extracted frames |
| Audio + Visual combo | 200 | Bundled discount vs 150+100 separate |

---

## Task 1: Database Migration — Storage Bucket + Tracking Table

**Files to create:**
- `supabase/migrations/20260319_canvas_media.sql`

**SQL:**
```sql
-- 1. Create storage bucket for canvas media
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('canvas-media', 'canvas-media', false, 524288000)  -- 500MB per file max
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their own folder
CREATE POLICY "Users upload own canvas media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own canvas media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own canvas media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'canvas-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admin can read all canvas media
CREATE POLICY "Admin reads all canvas media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'canvas-media' AND public.is_admin());

-- 2. Tracking table for per-session storage accounting
CREATE TABLE public.canvas_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.canvas_states(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,  -- ReactFlow node ID (matches the node on canvas)

  -- File metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'image' | 'video' | 'voice'
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Transcription results (nullable until user triggers)
  audio_transcription TEXT,
  visual_transcription JSONB,  -- Same format as VideoNode videoAnalysis
  transcription_status TEXT DEFAULT 'none',  -- 'none' | 'processing' | 'done' | 'error'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own canvas media"
  ON public.canvas_media FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin manages all canvas media"
  ON public.canvas_media FOR ALL
  USING (public.is_admin());

-- Index for fast session storage sum queries
CREATE INDEX idx_canvas_media_session ON public.canvas_media(session_id);
CREATE INDEX idx_canvas_media_user ON public.canvas_media(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_canvas_media_updated_at
  BEFORE UPDATE ON public.canvas_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Apply via Supabase Management API** (same pattern used for canvas_session_history migration).

---

## Task 2: Canvas Media Upload Service

**File to create:** `src/services/canvasMediaService.ts`

**Responsibilities:**
- Upload file to `canvas-media` bucket at path: `{userId}/{sessionId}/{nodeId}/{sanitizedFilename}`
- Check session storage cap before upload (query `canvas_media` table, SUM `file_size_bytes` WHERE `session_id`)
- Insert tracking row in `canvas_media` table
- Get signed URL for viewing
- Delete file + tracking row

**Key constants:**
```typescript
const BUCKET = 'canvas-media';
const MAX_SESSION_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB single file
const ACCEPTED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  voice: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'],
};
```

**Functions:**
```typescript
// Check remaining space for session
async getSessionUsage(sessionId: string): Promise<{ used: number; limit: number; remaining: number }>

// Upload file (standard for <50MB, TUS resumable for larger)
async uploadMedia(file: File, sessionId: string, clientId: string, nodeId: string, onProgress: (pct: number) => void): Promise<CanvasMediaRecord>

// Get signed URL (1hr expiry)
async getSignedUrl(storagePath: string): Promise<string>

// Delete media file + DB record
async deleteMedia(mediaId: string, storagePath: string): Promise<void>

// Fetch all media for a session (for AI context building)
async getSessionMedia(sessionId: string): Promise<CanvasMediaRecord[]>
```

**Upload flow:**
1. Validate file type against `ACCEPTED_TYPES`
2. Validate file size <= 500MB
3. Query session usage, check `used + file.size <= MAX_SESSION_BYTES`
4. If over limit → throw with `{ overLimit: true, used, limit, fileSize }` (UI shows friendly error)
5. Upload to storage (standard upload for files ≤50MB, TUS for larger — reuse pattern from `videoUploadService.ts`)
6. Insert row in `canvas_media`
7. Return record with signed URL

---

## Task 3: MediaNode Component

**File to create:** `src/components/canvas/MediaNode.tsx`

**This is a new canvas node type** that displays uploaded media (image, video, or voice note) with transcription controls.

**Node data interface:**
```typescript
interface MediaNodeData {
  mediaId?: string;           // canvas_media.id (set after upload)
  fileName?: string;
  fileType?: 'image' | 'video' | 'voice';
  mimeType?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  signedUrl?: string;         // Refreshed on load

  // Transcription
  audioTranscription?: string;
  visualTranscription?: any;  // Same shape as VideoNode's videoAnalysis
  transcriptionStatus?: 'none' | 'processing' | 'done' | 'error';

  // Standard callbacks
  onUpdate?: (updates: Partial<MediaNodeData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
  clientId?: string | null;
  nodeId?: string;
  sessionId?: string;
}
```

**UI Layout (3 states):**

### State 1: Empty (no file yet)
```
┌─────────────────────────────────┐
│  📁 Drop file here              │
│  or click to browse             │
│                                 │
│  Images · Videos · Voice Notes  │
│  ─────────────────────────────  │
│  Session: 1.2 GB / 5 GB used   │
└─────────────────────────────────┘
```
- Drag & drop zone with `onDrop` handler
- Hidden `<input type="file" accept="image/*,video/*,audio/*">`
- Show session usage bar (query on mount)

### State 2: Uploading
```
┌─────────────────────────────────┐
│  📤 Uploading video.mp4...      │
│  ████████████░░░░░░░  62%       │
│  124 MB / 200 MB                │
└─────────────────────────────────┘
```
- Progress bar (reuse `<Progress>` component from `src/components/ui/progress.tsx`)
- Cancel button

### State 3: Uploaded (varies by type)

**Image:**
```
┌─────────────────────────────────┐
│  ┌─────────────────────────┐    │
│  │     [image preview]     │    │
│  └─────────────────────────┘    │
│  photo.jpg · 2.4 MB             │
│  [🗑️ Delete]                    │
└─────────────────────────────────┘
```

**Video:**
```
┌─────────────────────────────────┐
│  ┌─────────────────────────┐    │
│  │     [video player]      │    │
│  │        ▶ Play           │    │
│  └─────────────────────────┘    │
│  clip.mp4 · 48 MB               │
│                                 │
│  ── Transcribe ──────────────   │
│  [🎙️ Audio (150)] [👁️ Visual (100)] [🎬 Both (200)] │
│                                 │
│  {transcription text here...}   │
│  [🗑️ Delete]                    │
└─────────────────────────────────┘
```

**Voice note:**
```
┌─────────────────────────────────┐
│  🎤 recording.m4a · 1.2 MB     │
│  [▶ Play] ████████░░ 0:42       │
│                                 │
│  [🎙️ Transcribe (150 credits)]  │
│                                 │
│  {transcription text here...}   │
│  [🗑️ Delete]                    │
└─────────────────────────────────┘
```

**Behavior:**
- On mount: if `storagePath` exists but no `signedUrl`, refresh signed URL via `canvasMediaService.getSignedUrl()`
- Signed URLs expire after 1hr — refresh on play/view attempt if stale
- Delete: confirm dialog → `canvasMediaService.deleteMedia()` → call `onDelete()` to remove node
- Transcription buttons disabled during `processing` state, show spinner
- After transcription completes → `onUpdate({ audioTranscription, visualTranscription, transcriptionStatus: 'done' })`
- Node width: 280px (consistent with other nodes)

---

## Task 4: Transcription Edge Function

**File to create:** `supabase/functions/transcribe-canvas-media/index.ts`

**Why a new function instead of reusing `transcribe-video`?**
The existing function expects a public URL (YouTube/Instagram). Canvas media is in private Supabase Storage — we need to download it server-side via service role key, then process.

**Input:**
```typescript
{
  media_id: string;       // canvas_media.id
  mode: 'audio' | 'visual' | 'both';
}
```

**Credit costs:**
```typescript
const COSTS = { audio: 150, visual: 100, both: 200 };
```

**Flow:**
1. Auth: verify bearer token, get userId
2. Fetch `canvas_media` row by `media_id`, verify `user_id` matches
3. Deduct credits (same `deductCredits` pattern from `ai-build-script`)
4. Update `canvas_media.transcription_status = 'processing'`
5. Download file from storage using service role: `adminClient.storage.from('canvas-media').download(storagePath)`

**For audio transcription (voice notes + video audio):**
6. If video → extract audio via VPS: POST `http://72.62.200.145:3099/extract-audio` with file blob
   If voice → use file directly
7. Send to OpenAI Whisper: `POST https://api.openai.com/v1/audio/transcriptions` (same as `transcribe-video`)
8. Save result: `UPDATE canvas_media SET audio_transcription = '...', transcription_status = 'done'`

**For visual transcription (video only):**
6. Extract frames via VPS: POST `http://72.62.200.145:3099/analyze-video` (same as `analyze-video-multimodal`)
   - Need to first get a temporary signed URL for the VPS to download from
   - OR download the video in the edge function and forward the blob to VPS
7. Claude Haiku vision analysis on frames (same prompt as `analyze-video-multimodal`)
8. Save result: `UPDATE canvas_media SET visual_transcription = '{...}', transcription_status = 'done'`

**For both:**
- Run audio + visual in parallel (`Promise.all`)
- Save both results in single update

**Output:**
```json
{
  "success": true,
  "audio_transcription": "...",
  "visual_transcription": { "visual_segments": [...], "audio": {...} },
  "credits_charged": 200
}
```

**Error handling:**
- 402 insufficient credits (before processing)
- 404 media not found or not owned by user
- 400 invalid mode or file type mismatch (can't visual-transcribe a voice note)
- 500 processing failure → set `transcription_status = 'error'`

---

## Task 5: Register MediaNode in Canvas

**Files to modify:**
- `src/pages/SuperPlanningCanvas.tsx`
- `src/components/canvas/CanvasToolbar.tsx`

### SuperPlanningCanvas.tsx changes:

**1. Import MediaNode:**
```typescript
import MediaNode from "@/components/canvas/MediaNode";
```

**2. Add to nodeTypes map** (around line 60-70 where other nodeTypes are registered):
```typescript
const nodeTypes = useMemo(() => ({
  videoNode: VideoNode,
  textNoteNode: TextNoteNode,
  // ... existing types ...
  mediaNode: MediaNode,  // ADD
}), []);
```

**3. Add to `makeMediaNode` factory** (alongside existing `makeVideoNode`, `makeTextNode`, etc.):
```typescript
const makeMediaNode = (position?: { x: number; y: number }) => {
  const id = `media-${Date.now()}`;
  return {
    id,
    type: "mediaNode",
    position: position ?? { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
    data: {
      nodeId: id,
      sessionId: activeSessionIdRef.current,
      clientId,
      authToken: token,
      onUpdate: (updates: any) => updateNodeData(id, updates),
      onDelete: () => deleteNode(id),
    },
    deletable: true,
  };
};
```

**4. Handle in `onAddNode`:**
```typescript
case "mediaNode":
  newNode = makeMediaNode();
  break;
```

**5. `attachCallbacks` — add mediaNode case:**
Same pattern as other nodes — re-attach `onUpdate`, `onDelete`, `authToken`, `clientId`, `sessionId`.

### CanvasToolbar.tsx changes:

**Add media upload button** to the toolbar:
```typescript
// In the node type buttons section, add:
<ToolbarButton
  icon={<Paperclip className="w-4 h-4" />}  // or Upload icon
  label="Media"
  onClick={() => onAddNode("mediaNode")}
/>
```

Update the `onAddNode` type signature to include `"mediaNode"`.

---

## Task 6: AI Assistant Context Integration

**Files to modify:**
- `src/pages/SuperPlanningCanvas.tsx` (context builder)
- `src/components/canvas/CanvasAIPanel.tsx` (CanvasContext interface)

### Add to CanvasContext interface:
```typescript
export interface CanvasContext {
  // ... existing fields ...

  media_files?: Array<{
    file_name: string;
    file_type: 'image' | 'video' | 'voice';
    audio_transcription?: string | null;
    visual_transcription?: any | null;
    signed_url?: string | null;  // For image context (Claude vision)
  }>;
}
```

### Context builder in SuperPlanningCanvas.tsx:
In the section where context is built from connected nodes (~lines 627-723), add a case for `mediaNode`:

```typescript
// Inside the connected nodes loop:
if (node.type === "mediaNode" && node.data) {
  const d = node.data;
  // Add to connected_nodes inventory
  connectedDescriptions.push(
    `MediaNode(${d.fileName || 'unnamed'}, type=${d.fileType}, transcription=${d.transcriptionStatus === 'done' ? 'yes' : 'no'})`
  );

  // Collect media context
  mediaFiles.push({
    file_name: d.fileName,
    file_type: d.fileType,
    audio_transcription: d.audioTranscription || null,
    visual_transcription: d.visualTranscription || null,
    signed_url: d.fileType === 'image' ? d.signedUrl : null,
  });

  // Add transcriptions to the main transcriptions array (for AI prompt)
  if (d.audioTranscription) {
    transcriptions.push(`[${d.fileName}]: ${d.audioTranscription}`);
  }
}
```

### AI Panel context summary:
In `CanvasAIPanel.tsx`, where context is formatted into a text prompt for Claude, add media section:

```typescript
if (ctx.media_files?.length) {
  parts.push("## Uploaded Media");
  for (const m of ctx.media_files) {
    parts.push(`- ${m.file_name} (${m.file_type})`);
    if (m.audio_transcription) {
      parts.push(`  Audio transcript: ${m.audio_transcription}`);
    }
    if (m.visual_transcription?.visual_segments?.length) {
      parts.push(`  Visual breakdown: ${m.visual_transcription.visual_segments.map((s: any) => s.description).join(' → ')}`);
    }
  }
}
```

**Image context for Claude vision:** If the AI model supports vision and an image node is connected, the signed URL can be included as an image content block in the API call. This is optional/advanced — text transcription descriptions are sufficient for v1.

---

## Task 7: Session Cleanup on Delete

**File to modify:** `src/pages/SuperPlanningCanvas.tsx`

When a canvas session is deleted (`deleteSession` handler), all associated storage files should be cleaned up.

**In `deleteSession`:**
```typescript
// Before deleting the canvas_states row:
// 1. Fetch all canvas_media for this session
const { data: mediaFiles } = await supabase
  .from("canvas_media")
  .select("storage_path")
  .eq("session_id", sessionId);

// 2. Delete storage files in batch
if (mediaFiles?.length) {
  const paths = mediaFiles.map(m => m.storage_path);
  await supabase.storage.from("canvas-media").remove(paths);
}

// 3. canvas_media rows auto-deleted via ON DELETE CASCADE
// 4. Then delete the canvas_states row (existing code)
```

---

## Task 8: Storage Usage Display in Toolbar

**File to modify:** `src/components/canvas/CanvasToolbar.tsx`

Add a small storage indicator near the media button showing session usage:

```
[📎 Media] 1.2 GB / 5 GB
```

**Implementation:**
- `SuperPlanningCanvas.tsx` queries session usage on load and after each upload
- Pass `sessionStorageUsed` and `sessionStorageLimit` as props to `CanvasToolbar`
- Display as compact progress bar or text next to the Media button
- Update in real-time after each upload/delete

---

## Execution Order

```
Task 1 (DB migration)           — No dependencies, do first
Task 2 (Upload service)         — Depends on Task 1 (bucket exists)
Task 3 (MediaNode component)    — Depends on Task 2 (service API)
Task 4 (Transcription function) — Depends on Task 1 (canvas_media table)
Task 5 (Register in canvas)     — Depends on Task 3
Task 6 (AI integration)         — Depends on Task 5 (node exists on canvas)
Task 7 (Session cleanup)        — Depends on Task 1
Task 8 (Storage display)        — Depends on Task 2 + Task 5
```

**Parallelizable:** Tasks 2+4 can run in parallel after Task 1. Tasks 7+8 can run in parallel after their deps.

---

## Reference Files

| File | Purpose |
|------|---------|
| `src/pages/SuperPlanningCanvas.tsx` | Canvas main — node registration, context builder, session management |
| `src/components/canvas/CanvasToolbar.tsx` | Toolbar — add media button + storage indicator |
| `src/components/canvas/CanvasAIPanel.tsx` | AI panel — CanvasContext interface, context formatting |
| `src/components/canvas/VideoNode.tsx` | Reference for video player UI + transcription UX pattern |
| `src/services/videoUploadService.ts` | Reference for TUS resumable upload pattern |
| `src/services/canvasMediaService.ts` | NEW — upload/delete/usage service |
| `src/components/canvas/MediaNode.tsx` | NEW — the node component |
| `supabase/functions/transcribe-video/index.ts` | Reference for Whisper transcription + credit deduction |
| `supabase/functions/analyze-video-multimodal/index.ts` | Reference for Claude vision frame analysis |
| `supabase/functions/ai-build-script/index.ts` | Reference for credit cost pattern + deductCredits() |
| `supabase/migrations/20260319_canvas_media.sql` | NEW — bucket + tracking table |
| `supabase/functions/transcribe-canvas-media/index.ts` | NEW — transcription edge function |

## Key Patterns to Follow

1. **Credit deduction**: Always deduct BEFORE processing. Use the `deductCredits()` pattern from `ai-build-script/index.ts`.
2. **Node callbacks**: Strip `onUpdate`, `onDelete`, `authToken` etc. before serializing to DB (see `serializeNodes` in SuperPlanningCanvas).
3. **Re-attach on load**: `attachCallbacks` in SuperPlanningCanvas must handle `mediaNode` type.
4. **Signed URLs expire**: Refresh on mount and before any playback/view attempt.
5. **TUS upload**: Files >50MB use TUS resumable upload (see `videoUploadService.ts` lines 54-97).
6. **File sanitization**: Reuse `sanitizeFilename()` pattern from `videoUploadService.ts`.
7. **Glass card styling**: Use `glass-card` CSS class consistent with other nodes.
8. **Admin bypass**: Admin users are not charged credits (checked in edge function via `user_roles`).

## VPS Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `http://72.62.200.145:3099/extract-audio` | Extract audio track from video file |
| `http://72.62.200.145:3099/analyze-video` | Extract frames for visual analysis |

Both require header: `x-api-key: ytdlp_connecta_2026_secret`

## Supabase Secrets Needed

No new secrets — reuses existing:
- `OPENAI_API_KEY` (for Whisper)
- `ANTHROPIC_API_KEY` (for Claude Haiku vision)
- `SUPABASE_SERVICE_ROLE_KEY` (for storage download in edge function)
