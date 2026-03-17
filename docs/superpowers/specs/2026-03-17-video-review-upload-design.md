# Video Upload & Timestamped Review System — Design Spec

**Date:** 2026-03-17
**Status:** Approved

## Overview

Add direct video upload (Supabase Storage + Google Drive Picker) to the editing queue, with an in-app video review modal featuring timestamped revision comments and timeline markers. Includes a public review page for clients, role-gated upload permissions, and automated two-stage cleanup (90-day file deletion, 180-day record deletion).

## Decisions

| Decision | Choice |
|----------|--------|
| Upload method | Direct Upload to Supabase Storage (admin only) + existing manual Google Drive link pasting |
| Drive video timestamps | Two-tier — Drive gets iframe + manual timestamps; uploads get native player + click-to-timestamp |
| Who reviews | Internal team + Clients via public review link |
| Auto-deletion | Two-stage — file at 90 days, record at 180 days |
| Review UI | Full-screen modal overlay in editing queue |
| Timestamp UX | Timeline markers on progress bar + pause-and-comment |
| Storage access | Admin/internal only for Supabase uploads; subscribers restricted to Google Drive |
| Upload routing | Standard upload for ≤ 5GB, TUS resumable for > 5GB |
| Max file size | 50 GB |

## Data Layer

### New columns on `video_edits`

```sql
ALTER TABLE video_edits ADD COLUMN storage_path TEXT;
ALTER TABLE video_edits ADD COLUMN storage_url TEXT;
ALTER TABLE video_edits ADD COLUMN upload_source TEXT DEFAULT 'gdrive';
  -- 'supabase' | 'gdrive'
ALTER TABLE video_edits ADD COLUMN file_size_bytes BIGINT;
ALTER TABLE video_edits ADD COLUMN file_expires_at TIMESTAMPTZ;
ALTER TABLE video_edits ADD COLUMN record_expires_at TIMESTAMPTZ;
  -- file_expires_at = upload + 90 days
  -- record_expires_at = upload + 180 days
```

### New `revision_comments` table

```sql
CREATE TABLE revision_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_edit_id UUID REFERENCES video_edits(id) ON DELETE CASCADE,
  timestamp_seconds NUMERIC,       -- NULL = general comment (no timestamp)
  comment TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'editor' | 'client'
  author_id UUID,                   -- NULL for anonymous clients
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_revision_comments_video ON revision_comments(video_edit_id);

ALTER TABLE revision_comments ENABLE ROW LEVEL SECURITY;
-- Anyone can read and insert comments (needed for public review page)
CREATE POLICY "Public read" ON revision_comments FOR SELECT USING (true);
CREATE POLICY "Public insert" ON revision_comments FOR INSERT WITH CHECK (true);
-- Only authenticated admin users can update (resolve) or delete comments
CREATE POLICY "Admin update" ON revision_comments FOR UPDATE
  USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delete" ON revision_comments FOR DELETE
  USING (auth.role() = 'authenticated');
```

### Supabase Storage bucket

- **Bucket name:** `video-uploads` (private)
- **Path convention:** `{client_id}/{video_edit_id}/{original_filename}`
- **Max file size:** 50 GB
- **Upload method:** Standard upload for ≤ 5GB, TUS resumable for > 5GB
- **Access:** Signed URLs with 1-hour expiry, regenerated on each view
- **RLS:** Admin-only upload, authenticated read via signed URL

## UI Components

### Upload Button (`UploadButton.tsx`)

Role-gated dual button component placed in the editing queue row where footage/file submission fields currently are.

**Admin / Internal team view:**
- "Upload Video" button — opens native file picker, uploads to Supabase Storage
- Upload progress bar replaces button during upload
- For files > 5GB, shows "Resumable upload — X% (safe to close browser)"
- Google Drive links continue to be pasted manually in the existing inline footage/file_submission fields

**Subscriber view (Starter / Growth / Enterprise):**
- No upload button shown — subscribers paste Google Drive links in the existing inline fields
- Role check via `useAuth().isAdmin` (from AuthContext) — not `useSubscriptionGuard` which is for paywall enforcement

### Video Review Modal (`VideoReviewModal.tsx`)

Full-screen overlay triggered by clicking "Review" on any queue row. Split layout:

**Left side — Video Player:**
- **Supabase videos:** Native HTML5 `<video>` element with custom controls
  - Progress bar with colored dot markers at each comment timestamp
  - Clicking a marker jumps to that timestamp and highlights the comment
  - Pausing captures `currentTime` for the comment input
- **Google Drive videos:** Google Drive iframe embed (`/file/d/{id}/preview`)
  - Manual timestamp input field (user types "1:23")
  - No timeline markers (iframe doesn't expose playback position)
- Below player: comment input bar showing current timestamp badge + text input + "Add Note" button

**Right side — Comment Thread:**
- Header showing total comment count and resolved count
- Comments sorted by `timestamp_seconds` (ascending), general notes at bottom
- Each comment card shows:
  - Timestamp label (clickable — jumps player to that point for Supabase videos)
  - Comment text
  - Author name, role badge, relative time
  - "Mark Resolved" button (admin only)
- Resolved comments appear dimmed with checkmark, border color changes to green
- Color coding: blue (admin), amber (client unresolved), red (urgent), green (resolved), gray (general note)

### Public Review Page (`PublicVideoReview.tsx`)

**Route:** `/public/review/{videoEditId}`

- Same layout as the review modal but as a standalone page (no sidebar, no auth required)
- Client enters their name on first visit (stored in `localStorage`)
- Comments tagged with `author_role: 'client'`
- Can view all comments (admin + client) and add new ones
- Cannot mark comments as resolved (admin-only)
- Share link format: `connectacreators.com/public/review/{id}`

### Queue Table Integration

Changes applied to all three queue views: `EditingQueue.tsx`, `MasterEditingQueue.tsx`, `MasterDatabase.tsx` (videos tab).

**Modified columns:**
- **Footage column:** Shows upload source icon + file size for Supabase uploads, or "Google Drive" link for Drive videos, or "No footage yet" with upload button
- **Reviews column (NEW):** Badge showing unresolved comment count (red for open, green for all resolved, dash for no comments)

**New action:**
- "Review" button on each row opens the `VideoReviewModal`

## Backend Services

### Frontend Service: `revisionCommentService.ts`

```typescript
getCommentsByVideoEdit(videoEditId: string): Promise<RevisionComment[]>
  // Sorted by timestamp_seconds ascending, nulls last

createComment(data: {
  video_edit_id: string,
  timestamp_seconds: number | null,
  comment: string,
  author_name: string,
  author_role: 'admin' | 'editor' | 'client',
  author_id?: string
}): Promise<RevisionComment>

resolveComment(commentId: string, resolved: boolean): Promise<void>

deleteComment(commentId: string): Promise<void>

getUnresolvedCount(videoEditId: string): Promise<number>
```

### Frontend Service: `videoUploadService.ts`

```typescript
uploadVideoFile(
  file: File,
  clientId: string,
  videoEditId: string,
  onProgress: (percent: number) => void
): Promise<{ storagePath: string, storageUrl: string }>
  // Routes by file.size: ≤ 5GB standard, > 5GB TUS resumable
  // Updates video_edits row with storage fields + expiry dates

getSignedVideoUrl(storagePath: string): Promise<string>
  // Returns signed URL with 1hr expiry
```

Google Drive links are pasted manually by users in the existing inline-editable fields — no `handleDrivePick` function needed.

### Extended `videoService.ts`

Add new fields to the existing `VideoEdit` interface:

```typescript
interface VideoEdit {
  // ... existing fields ...
  storage_path: string | null
  storage_url: string | null
  upload_source: 'supabase' | 'gdrive' | null
  file_size_bytes: number | null
  file_expires_at: string | null
  record_expires_at: string | null
}
```

No changes needed to `getVideosByClient()` or `getAllVideos()` — they already return all columns via `SELECT *`.

### Edge Function: `cleanup-expired-videos`

Supabase Edge Function triggered daily by cron at 3 AM UTC.

**Stage 1 — Delete expired files (90 days):**
```sql
SELECT id, storage_path FROM video_edits
WHERE upload_source = 'supabase'
  AND file_expires_at < now()
  AND storage_path IS NOT NULL;
```
For each result: delete file from Supabase Storage, then set `storage_path = NULL`, `storage_url = NULL` on the row.

**Stage 2 — Delete expired records (180 days):**
```sql
DELETE FROM video_edits
WHERE upload_source = 'supabase'
  AND record_expires_at < now();
```
`ON DELETE CASCADE` on `revision_comments` handles comment cleanup automatically.

**Cron setup** (SQL in Supabase Dashboard, same pattern as `auto-scrape-channels`):
```sql
SELECT cron.schedule('daily-video-cleanup', '0 3 * * *', $$
  SELECT net.http_post(
    url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/cleanup-expired-videos',
    headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Returns: `{ files_deleted: N, records_deleted: M }`

**Google Drive links are never expired or deleted** — they remain until the user removes them manually.

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_video_upload_storage.sql` | Add storage columns to video_edits |
| `supabase/migrations/YYYYMMDD_revision_comments.sql` | Create revision_comments table |
| `src/services/revisionCommentService.ts` | CRUD for timestamped comments |
| `src/services/videoUploadService.ts` | Upload routing (standard/TUS) + signed URL generation |
| `src/components/VideoReviewModal.tsx` | Review modal with player + comments |
| `src/components/UploadButton.tsx` | Role-gated dual upload button |
| `src/pages/PublicVideoReview.tsx` | Public client review page |
| `supabase/functions/cleanup-expired-videos/index.ts` | Daily cron for two-stage cleanup |

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/videoService.ts` | Add new fields to VideoEdit interface |
| `src/pages/EditingQueue.tsx` | Add UploadButton, Reviews badge, Review button, VideoReviewModal |
| `src/pages/MasterEditingQueue.tsx` | Same queue table changes |
| `src/pages/MasterDatabase.tsx` | Same queue table changes (videos tab) |
| `src/App.tsx` | Add route for `/public/review/:videoEditId` |
| `supabase/config.toml` | Add cleanup-expired-videos function entry |

## Sync Across Views

All three queue views (`EditingQueue`, `MasterEditingQueue`, `MasterDatabase`) query the same `video_edits` table. Because the new storage fields and upload_source are columns on `video_edits`, all views automatically reflect uploaded footage and source type without additional sync logic.

The `revision_comments` table is joined by `video_edit_id` — the unresolved count badge queries this table per video. The `VideoReviewModal` is a shared component imported by all three views.

## Constraints

- **Storage access is admin-only.** Subscribers (Starter, Growth, Enterprise) can only use Google Drive links. The upload button component checks user role before showing the "Upload File" option.
- **Timestamped markers on timeline only work for Supabase-hosted videos.** Google Drive iframe embeds do not expose playback position. Drive videos fall back to manual timestamp entry.
- **50 GB max file size.** Files ≤ 5GB use standard Supabase upload. Files > 5GB use TUS resumable upload protocol.
- **Two-stage cleanup.** Video files deleted at 90 days, database records + comments deleted at 180 days. Google Drive links are never auto-deleted.
