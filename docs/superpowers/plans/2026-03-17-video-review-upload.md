# Video Upload & Timestamped Review System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct video upload (Supabase Storage + Google Drive Picker) to the editing queue with in-app video review, timestamped revision comments, timeline markers, a public review page for clients, and automated two-stage cleanup.

**Architecture:** Extend the existing `video_edits` table with storage columns. Create a new `revision_comments` table. Build a shared `VideoReviewModal` component used across all queue views. Upload routing uses standard Supabase upload for files ≤ 5GB and TUS resumable for > 5GB. A daily cron Edge Function handles two-stage cleanup (90-day file, 180-day record).

**Tech Stack:** React + TypeScript, Supabase (Storage, Database, Edge Functions, Cron), Google Picker API, HTML5 `<video>` element, TUS upload protocol via `tus-js-client`.

**Spec:** `docs/superpowers/specs/2026-03-17-video-review-upload-design.md`

---

## File Structure

### Files to Create

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260317_video_upload_storage.sql` | Add storage columns to `video_edits` |
| `supabase/migrations/20260317_revision_comments.sql` | Create `revision_comments` table with RLS |
| `src/services/revisionCommentService.ts` | CRUD for timestamped revision comments |
| `src/services/videoUploadService.ts` | Upload routing (standard/TUS), signed URLs, Drive pick handler |
| `src/components/VideoReviewModal.tsx` | Full-screen review modal — video player + comment thread |
| `src/components/UploadButton.tsx` | Role-gated dual upload button (Upload File + Google Drive) |
| `src/pages/PublicVideoReview.tsx` | Public client review page at `/public/review/:videoEditId` |
| `supabase/functions/cleanup-expired-videos/index.ts` | Daily cron — two-stage cleanup (90d file, 180d record) |

### Files to Modify

| File | Changes |
|------|---------|
| `src/services/videoService.ts` | Add storage fields to `VideoEdit`, `CreateVideoInput`, `UpdateVideoInput` interfaces |
| `src/pages/EditingQueue.tsx` | Import `UploadButton`, `VideoReviewModal`; add Reviews badge column; add Review button |
| `src/pages/MasterEditingQueue.tsx` | Same queue table changes as EditingQueue |
| `src/pages/MasterDatabase.tsx` | Same queue table changes (videos tab) |
| `src/App.tsx` | Add route + import for `PublicVideoReview` |
| `supabase/config.toml` | Add `[functions.cleanup-expired-videos]` entry |

---

## Chunk 1: Database & Service Layer

### Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260317_video_upload_storage.sql`
- Create: `supabase/migrations/20260317_revision_comments.sql`

- [ ] **Step 1: Create the video_edits storage columns migration**

Write `supabase/migrations/20260317_video_upload_storage.sql`:

```sql
-- Add storage-related columns to video_edits for direct upload support
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS storage_url TEXT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'gdrive';
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS file_expires_at TIMESTAMPTZ;
ALTER TABLE video_edits ADD COLUMN IF NOT EXISTS record_expires_at TIMESTAMPTZ;
```

- [ ] **Step 2: Create the revision_comments table migration**

Write `supabase/migrations/20260317_revision_comments.sql`:

```sql
CREATE TABLE IF NOT EXISTS revision_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_edit_id UUID REFERENCES video_edits(id) ON DELETE CASCADE,
  timestamp_seconds NUMERIC,
  comment TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'admin',
  author_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revision_comments_video
  ON revision_comments(video_edit_id);

ALTER TABLE revision_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON revision_comments
  FOR SELECT USING (true);
CREATE POLICY "Public insert" ON revision_comments
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update" ON revision_comments
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delete" ON revision_comments
  FOR DELETE USING (auth.role() = 'authenticated');
```

- [ ] **Step 3: Apply migrations to Supabase**

Run against the remote Supabase project:

```bash
# From project root, apply each migration via Supabase Dashboard SQL Editor
# or via CLI:
npx supabase db push
```

Expected: Both migrations apply successfully. Verify in Supabase Dashboard → Table Editor that `video_edits` has the new columns and `revision_comments` table exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260317_video_upload_storage.sql supabase/migrations/20260317_revision_comments.sql
git commit -m "feat: add video upload storage columns and revision_comments table"
```

---

### Task 2: Extend videoService.ts Interfaces

**Files:**
- Modify: `src/services/videoService.ts:3-50`

- [ ] **Step 1: Add new fields to VideoEdit interface**

In `src/services/videoService.ts`, add these fields after `caption` (line 17) inside the `VideoEdit` interface:

```typescript
  storage_path: string | null;
  storage_url: string | null;
  upload_source: string | null;
  file_size_bytes: number | null;
  file_expires_at: string | null;
  record_expires_at: string | null;
```

- [ ] **Step 2: Add new fields to CreateVideoInput interface**

In the `CreateVideoInput` interface, add after `caption` (line 34):

```typescript
  storage_path?: string | null;
  storage_url?: string | null;
  upload_source?: string;
  file_size_bytes?: number | null;
  file_expires_at?: string | null;
  record_expires_at?: string | null;
```

- [ ] **Step 3: Add new fields to UpdateVideoInput interface**

In the `UpdateVideoInput` interface, add after `caption` (line 49):

```typescript
  storage_path?: string | null;
  storage_url?: string | null;
  upload_source?: string;
  file_size_bytes?: number | null;
  file_expires_at?: string | null;
  record_expires_at?: string | null;
```

- [ ] **Step 4: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/videoService.ts
git commit -m "feat: add storage fields to VideoEdit interfaces"
```

---

### Task 3: Create revisionCommentService.ts

**Files:**
- Create: `src/services/revisionCommentService.ts`

- [ ] **Step 1: Write the revision comment service**

Create `src/services/revisionCommentService.ts`:

```typescript
import { supabase } from '@/integrations/supabase/client';

export interface RevisionComment {
  id: string;
  video_edit_id: string;
  timestamp_seconds: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface CreateCommentInput {
  video_edit_id: string;
  timestamp_seconds: number | null;
  comment: string;
  author_name: string;
  author_role: 'admin' | 'editor' | 'client';
  author_id?: string | null;
}

export const revisionCommentService = {
  async getCommentsByVideoEdit(videoEditId: string): Promise<RevisionComment[]> {
    const { data, error } = await supabase
      .from('revision_comments')
      .select('*')
      .eq('video_edit_id', videoEditId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false });

    if (error) throw error;
    return (data || []) as RevisionComment[];
  },

  async createComment(input: CreateCommentInput): Promise<RevisionComment> {
    const { data, error } = await supabase
      .from('revision_comments')
      .insert([input])
      .select()
      .single();

    if (error) throw error;
    return data as RevisionComment;
  },

  async resolveComment(commentId: string, resolved: boolean): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .update({ resolved })
      .eq('id', commentId);

    if (error) throw error;
  },

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await supabase
      .from('revision_comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
  },

  async getUnresolvedCount(videoEditId: string): Promise<number> {
    const { count, error } = await supabase
      .from('revision_comments')
      .select('*', { count: 'exact', head: true })
      .eq('video_edit_id', videoEditId)
      .eq('resolved', false);

    if (error) throw error;
    return count || 0;
  },
};
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds. The `revision_comments` table won't be in the Supabase type definitions yet, but the `.from('revision_comments')` calls will work at runtime because we use `supabase` client directly (not typed queries).

- [ ] **Step 3: Commit**

```bash
git add src/services/revisionCommentService.ts
git commit -m "feat: add revisionCommentService with CRUD for timestamped comments"
```

---

### Task 4: Create videoUploadService.ts

**Files:**
- Create: `src/services/videoUploadService.ts`
- Dependency: `tus-js-client` npm package (for resumable uploads > 5GB)

- [ ] **Step 1: Install tus-js-client**

```bash
npm install tus-js-client
```

- [ ] **Step 2: Write the video upload service**

Create `src/services/videoUploadService.ts`:

```typescript
import { supabase } from '@/integrations/supabase/client';
import * as tus from 'tus-js-client';
import { videoService } from './videoService';

const BUCKET = 'video-uploads';
const FIVE_GB = 5 * 1024 * 1024 * 1024;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;

function buildStoragePath(clientId: string, videoEditId: string, filename: string): string {
  return `${clientId}/${videoEditId}/${filename}`;
}

function buildExpiryDates() {
  const now = new Date();
  return {
    file_expires_at: new Date(now.getTime() + NINETY_DAYS_MS).toISOString(),
    record_expires_at: new Date(now.getTime() + ONE_EIGHTY_DAYS_MS).toISOString(),
  };
}

async function standardUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void
): Promise<string> {
  onProgress(0);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (error) throw error;
  onProgress(100);
  return data.path;
}

async function tusUpload(
  file: File,
  storagePath: string,
  onProgress: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const projectId = 'hxojqrilwhhrvloiwmfo';

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB chunks
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress(pct);
      },
      onSuccess: () => resolve(storagePath),
    });

    // Check for previous uploads to resume
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export const videoUploadService = {
  async uploadVideoFile(
    file: File,
    clientId: string,
    videoEditId: string,
    onProgress: (percent: number) => void
  ): Promise<{ storagePath: string; storageUrl: string }> {
    const storagePath = buildStoragePath(clientId, videoEditId, file.name);

    // Route by file size
    if (file.size <= FIVE_GB) {
      await standardUpload(file, storagePath, onProgress);
    } else {
      await tusUpload(file, storagePath, onProgress);
    }

    // Get signed URL
    const storageUrl = await this.getSignedVideoUrl(storagePath);

    // Update video_edits row
    const expiry = buildExpiryDates();
    await videoService.updateVideo(videoEditId, {
      storage_path: storagePath,
      storage_url: storageUrl,
      upload_source: 'supabase',
      file_size_bytes: file.size,
      file_expires_at: expiry.file_expires_at,
      record_expires_at: expiry.record_expires_at,
    });

    return { storagePath, storageUrl };
  },

  async getSignedVideoUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error) throw error;
    return data.signedUrl;
  },

  async handleDrivePick(
    fileData: { id: string; name: string; url: string },
    videoEditId: string
  ): Promise<void> {
    const driveUrl = `https://drive.google.com/file/d/${fileData.id}/view`;
    await videoService.updateVideo(videoEditId, {
      file_submission: driveUrl,
      upload_source: 'gdrive',
    });
  },
};
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/services/videoUploadService.ts package.json package-lock.json
git commit -m "feat: add videoUploadService with standard + TUS resumable upload support"
```

---

## Chunk 2: UI Components

### Task 5: Create UploadButton Component

**Files:**
- Create: `src/components/UploadButton.tsx`

- [ ] **Step 1: Write the UploadButton component**

Create `src/components/UploadButton.tsx`:

```typescript
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, FolderOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';

interface UploadButtonProps {
  videoEditId: string;
  clientId: string;
  onUploadComplete: () => void;
  currentSource?: string | null;
  currentFileSize?: number | null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
const FIVE_GB = 5 * 1024 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function UploadButton({
  videoEditId,
  clientId,
  onUploadComplete,
  currentSource,
  currentFileSize,
}: UploadButtonProps) {
  const { isAdmin, isEditor, isVideographer } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isResumable, setIsResumable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInternalUser = isAdmin || isEditor || isVideographer;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is 50 GB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setIsResumable(file.size > FIVE_GB);

    try {
      await videoUploadService.uploadVideoFile(
        file,
        clientId,
        videoEditId,
        (pct) => setProgress(pct)
      );
      toast.success('Video uploaded successfully');
      onUploadComplete();
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setProgress(0);
      setIsResumable(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrivePick = () => {
    // Google Picker API integration
    // Requires VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY env vars
    const clientIdGoogle = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;

    if (!clientIdGoogle || !apiKey) {
      toast.error('Google Drive integration not configured');
      return;
    }

    // Guard: only load the script once
    const loadAndOpenPicker = () => {
      window.gapi.load('picker', () => {
        window.gapi.load('client:auth2', () => {
          window.gapi.auth2
            .init({ client_id: clientIdGoogle, scope: 'https://www.googleapis.com/auth/drive.readonly' })
            .then((authInstance: any) => {
              if (!authInstance.isSignedIn.get()) {
                authInstance.signIn().then(() => openPicker(apiKey));
              } else {
                openPicker(apiKey);
              }
            });
        });
      });
    };

    if (window.gapi) {
      // Script already loaded — open picker directly
      loadAndOpenPicker();
    } else {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = loadAndOpenPicker;
      document.head.appendChild(script);
    }
  };

  const openPicker = (apiKey: string) => {
    const token = window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
    const picker = new window.google.picker.PickerBuilder()
      .addView(new window.google.picker.DocsView().setMimeTypes('video/*'))
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setCallback(async (data: any) => {
        if (data.action === 'picked' && data.docs?.[0]) {
          const doc = data.docs[0];
          try {
            await videoUploadService.handleDrivePick(
              { id: doc.id, name: doc.name, url: doc.url },
              videoEditId
            );
            toast.success('Google Drive video linked');
            onUploadComplete();
          } catch (err: any) {
            toast.error(`Failed to link: ${err.message}`);
          }
        }
      })
      .build();
    picker.setVisible(true);
  };

  if (uploading) {
    return (
      <div className="flex flex-col gap-1 min-w-[150px]">
        <Progress value={progress} className="h-2" />
        <span className="text-xs text-muted-foreground">
          {isResumable ? `Resumable upload — ${progress}% (safe to close browser)` : `Uploading... ${progress}%`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 items-center">
      {isInternalUser && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            Upload
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={handleDrivePick}
      >
        <FolderOpen className="h-3 w-3" />
        Drive
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds. Note: `window.gapi` and `window.google.picker` will show TS warnings — this is expected since Google Picker types aren't installed. These work at runtime when the Google API script loads.

- [ ] **Step 3: Commit**

```bash
git add src/components/UploadButton.tsx
git commit -m "feat: add role-gated UploadButton with direct upload + Google Drive Picker"
```

---

### Task 6: Create VideoReviewModal Component

**Files:**
- Create: `src/components/VideoReviewModal.tsx`

This is the largest component. It contains:
- Native HTML5 video player (for Supabase uploads) or Google Drive iframe (for Drive videos)
- Custom progress bar with timeline markers
- Comment thread panel with sort, resolve, and jump-to-timestamp
- Comment input bar with auto-captured timestamp

- [ ] **Step 1: Write the VideoReviewModal component**

Create `src/components/VideoReviewModal.tsx`:

```typescript
import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { revisionCommentService, type RevisionComment } from '@/services/revisionCommentService';
import { videoUploadService } from '@/services/videoUploadService';
import { toast } from 'sonner';
import { MessageSquare, Check, Clock, Play, Pause, Send, X } from 'lucide-react';

interface VideoReviewModalProps {
  open: boolean;
  onClose: () => void;
  videoEditId: string;
  title: string;
  uploadSource: string | null; // 'supabase' | 'gdrive' | null
  storagePath: string | null;
  fileSubmissionUrl: string | null;
  onCommentsChanged?: () => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimestamp(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
  }
  if (parts.length === 1) {
    const secs = parseInt(parts[0], 10);
    if (!isNaN(secs)) return secs;
  }
  return null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#3b82f6',
  editor: '#8b5cf6',
  client: '#f59e0b',
};

export default function VideoReviewModal({
  open,
  onClose,
  videoEditId,
  title,
  uploadSource,
  storagePath,
  fileSubmissionUrl,
  onCommentsChanged,
}: VideoReviewModalProps) {
  const { user, isAdmin } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseVideo = uploadSource === 'supabase' && storagePath;
  const isDriveVideo = uploadSource === 'gdrive' && fileSubmissionUrl;
  const driveFileId = isDriveVideo ? extractGoogleDriveFileId(fileSubmissionUrl!) : null;

  // Load comments
  useEffect(() => {
    if (!open || !videoEditId) return;
    setLoading(true);
    revisionCommentService.getCommentsByVideoEdit(videoEditId)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [open, videoEditId]);

  // Load signed video URL for Supabase videos
  useEffect(() => {
    if (!open || !isSupabaseVideo || !storagePath) return;
    videoUploadService.getSignedVideoUrl(storagePath)
      .then(setVideoUrl)
      .catch(() => toast.error('Failed to load video'));
  }, [open, isSupabaseVideo, storagePath]);

  // Track video time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * duration);
  };

  // Sorted comments: timestamped first (ascending), then general (null timestamp) at end
  const sortedComments = useMemo(() => {
    const timestamped = comments
      .filter(c => c.timestamp_seconds !== null)
      .sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
    const general = comments.filter(c => c.timestamp_seconds === null);
    return [...timestamped, ...general];
  }, [comments]);

  const unresolvedCount = comments.filter(c => !c.resolved).length;
  const resolvedCount = comments.filter(c => c.resolved).length;

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    let timestampSeconds: number | null = null;

    if (isSupabaseVideo) {
      // Auto-capture from paused player
      timestampSeconds = isPaused ? Math.floor(currentTime) : null;
    } else if (isDriveVideo && manualTimestamp.trim()) {
      // Manual timestamp for Drive videos
      timestampSeconds = parseTimestamp(manualTimestamp);
    }

    const authorName = user?.user_metadata?.full_name || user?.email || 'Admin';

    try {
      const created = await revisionCommentService.createComment({
        video_edit_id: videoEditId,
        timestamp_seconds: timestampSeconds,
        comment: newComment.trim(),
        author_name: authorName,
        author_role: 'admin',
        author_id: user?.id || null,
      });
      setComments(prev => [...prev, created]);
      setNewComment('');
      setManualTimestamp('');
      onCommentsChanged?.();
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      await revisionCommentService.resolveComment(commentId, resolved);
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved } : c));
      onCommentsChanged?.();
    } catch {
      toast.error('Failed to update comment');
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold truncate">{title || 'Video Review'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body: Player + Comments */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Video Player */}
          <div className="flex-[3] flex flex-col p-4 border-r">
            {/* Video area */}
            <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {isSupabaseVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-w-full max-h-full"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  controls={false}
                  onClick={handlePlayPause}
                />
              ) : isDriveVideo && driveFileId ? (
                <iframe
                  src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                  className="w-full h-full"
                  allow="autoplay"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="text-muted-foreground text-sm">No video available</div>
              )}
            </div>

            {/* Custom controls for Supabase videos */}
            {isSupabaseVideo && videoUrl && (
              <>
                {/* Progress bar with markers */}
                <div className="mt-3 relative cursor-pointer" onClick={handleProgressClick}>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    />
                  </div>
                  {/* Timeline markers */}
                  {duration > 0 && sortedComments
                    .filter(c => c.timestamp_seconds !== null)
                    .map(c => (
                      <div
                        key={c.id}
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background cursor-pointer hover:scale-125 transition-transform"
                        style={{
                          left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                          backgroundColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                        }}
                        title={`${formatTimestamp(c.timestamp_seconds!)} — ${c.comment.slice(0, 40)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          seekTo(c.timestamp_seconds!);
                        }}
                      />
                    ))}
                </div>
                {/* Time + Play/Pause */}
                <div className="flex items-center justify-between mt-2">
                  <Button variant="ghost" size="sm" onClick={handlePlayPause}>
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                  </span>
                </div>
              </>
            )}

            {/* Comment input */}
            <div className="mt-3 flex gap-2 items-center">
              {isSupabaseVideo && isPaused && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono whitespace-nowrap">
                  ⏸ {formatTimestamp(currentTime)}
                </span>
              )}
              {isDriveVideo && (
                <Input
                  placeholder="0:00"
                  value={manualTimestamp}
                  onChange={(e) => setManualTimestamp(e.target.value)}
                  className="w-16 h-8 text-xs font-mono"
                />
              )}
              <Input
                placeholder={
                  isSupabaseVideo && isPaused
                    ? `Add note at ${formatTimestamp(currentTime)}...`
                    : isDriveVideo
                    ? 'Add revision note...'
                    : 'Add general note...'
                }
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddComment} disabled={!newComment.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* Right: Comment Thread */}
          <div className="flex-[2] flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-muted-foreground">
                REVISION NOTES ({comments.length})
              </span>
              {resolvedCount > 0 && (
                <span className="text-xs text-green-500">{resolvedCount} resolved</span>
              )}
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading comments...</div>
            ) : sortedComments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No revision notes yet. Pause the video and add one.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedComments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 border-l-[3px] ${
                      c.resolved
                        ? 'opacity-50 border-l-green-500 bg-muted/30'
                        : 'bg-muted/50'
                    }`}
                    style={{
                      borderLeftColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                    }}
                  >
                    <div className="flex items-center justify-between">
                      {c.timestamp_seconds !== null ? (
                        <button
                          className="text-xs font-semibold font-mono hover:underline"
                          style={{ color: ROLE_COLORS[c.author_role] || '#888' }}
                          onClick={() => isSupabaseVideo && seekTo(c.timestamp_seconds!)}
                        >
                          ⏱ {formatTimestamp(c.timestamp_seconds)} {isSupabaseVideo ? '— Jump' : ''}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">💬 General note</span>
                      )}
                      {c.resolved ? (
                        <span className="text-xs text-green-500 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Resolved
                        </span>
                      ) : isAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] px-2"
                          onClick={() => handleResolve(c.id, true)}
                        >
                          Mark Resolved
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-sm mt-1">{c.comment}</p>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {c.author_name} ({c.author_role}) · {timeAgo(c.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoReviewModal.tsx
git commit -m "feat: add VideoReviewModal with native player, timeline markers, and comment thread"
```

---

### Task 7: Create PublicVideoReview Page

**Files:**
- Create: `src/pages/PublicVideoReview.tsx`
- Modify: `src/App.tsx:88-89` (add route)

- [ ] **Step 1: Write the PublicVideoReview page**

Create `src/pages/PublicVideoReview.tsx`:

```typescript
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { revisionCommentService, type RevisionComment } from '@/services/revisionCommentService';
import { videoUploadService } from '@/services/videoUploadService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Play, Pause, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimestamp(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (!isNaN(mins) && !isNaN(secs)) return mins * 60 + secs;
  }
  return null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#3b82f6',
  editor: '#8b5cf6',
  client: '#f59e0b',
};

export default function PublicVideoReview() {
  const { videoEditId } = useParams<{ videoEditId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<any>(null);
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [clientName, setClientName] = useState(() => localStorage.getItem('review_client_name') || '');
  const [nameSubmitted, setNameSubmitted] = useState(() => !!localStorage.getItem('review_client_name'));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseVideo = video?.upload_source === 'supabase' && video?.storage_path;
  const isDriveVideo = video?.upload_source === 'gdrive' && video?.file_submission;
  const driveFileId = isDriveVideo ? extractGoogleDriveFileId(video.file_submission) : null;

  // Load video data
  useEffect(() => {
    if (!videoEditId) return;
    supabase
      .from('video_edits')
      .select('*')
      .eq('id', videoEditId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('Video not found');
          return;
        }
        setVideo(data);
      });
  }, [videoEditId]);

  // Load comments
  useEffect(() => {
    if (!videoEditId) return;
    setLoading(true);
    revisionCommentService.getCommentsByVideoEdit(videoEditId)
      .then(setComments)
      .catch(() => toast.error('Failed to load comments'))
      .finally(() => setLoading(false));
  }, [videoEditId]);

  // Load signed URL for Supabase videos
  useEffect(() => {
    if (!isSupabaseVideo || !video?.storage_path) return;
    videoUploadService.getSignedVideoUrl(video.storage_path)
      .then(setVideoUrl)
      .catch(() => toast.error('Failed to load video'));
  }, [isSupabaseVideo, video?.storage_path]);

  const sortedComments = useMemo(() => {
    const ts = comments.filter(c => c.timestamp_seconds !== null)
      .sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
    const gen = comments.filter(c => c.timestamp_seconds === null);
    return [...ts, ...gen];
  }, [comments]);

  const handleSubmitName = () => {
    if (!clientName.trim()) return;
    localStorage.setItem('review_client_name', clientName.trim());
    setNameSubmitted(true);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !videoEditId) return;

    let timestampSeconds: number | null = null;
    if (isSupabaseVideo && isPaused) {
      timestampSeconds = Math.floor(currentTime);
    } else if (isDriveVideo && manualTimestamp.trim()) {
      timestampSeconds = parseTimestamp(manualTimestamp);
    }

    try {
      const created = await revisionCommentService.createComment({
        video_edit_id: videoEditId,
        timestamp_seconds: timestampSeconds,
        comment: newComment.trim(),
        author_name: clientName,
        author_role: 'client',
      });
      setComments(prev => [...prev, created]);
      setNewComment('');
      setManualTimestamp('');
    } catch {
      toast.error('Failed to add comment');
    }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // Name entry gate
  if (!nameSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Sonner />
        <div className="bg-card rounded-xl p-8 shadow-lg max-w-sm w-full">
          <h2 className="text-xl font-semibold mb-2">Video Review</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter your name to leave revision notes.</p>
          <Input
            placeholder="Your name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitName()}
            className="mb-3"
          />
          <Button className="w-full" onClick={handleSubmitName} disabled={!clientName.trim()}>
            Continue to Review
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      <div className="max-w-6xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">{video?.reel_title || 'Video Review'}</h1>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Video Player */}
          <div className="flex-[3] flex flex-col">
            <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
              {isSupabaseVideo && videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="max-w-full max-h-full"
                  onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                  onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                  onPlay={() => setIsPaused(false)}
                  onPause={() => setIsPaused(true)}
                  onClick={() => {
                    if (!videoRef.current) return;
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }}
                />
              ) : isDriveVideo && driveFileId ? (
                <iframe
                  src={`https://drive.google.com/file/d/${driveFileId}/preview`}
                  className="w-full h-full"
                  allow="autoplay"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="text-muted-foreground">No video available</div>
              )}
            </div>

            {/* Progress bar with markers (Supabase only) */}
            {isSupabaseVideo && videoUrl && (
              <>
                <div className="mt-3 relative cursor-pointer" onClick={handleProgressClick}>
                  <div className="w-full h-1.5 bg-muted rounded-full">
                    <div className="h-full bg-primary rounded-full" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
                  </div>
                  {duration > 0 && sortedComments.filter(c => c.timestamp_seconds !== null).map(c => (
                    <div
                      key={c.id}
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background cursor-pointer hover:scale-125 transition-transform"
                      style={{
                        left: `${((c.timestamp_seconds ?? 0) / duration) * 100}%`,
                        backgroundColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888'),
                      }}
                      onClick={(e) => { e.stopPropagation(); seekTo(c.timestamp_seconds!); }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (!videoRef.current) return;
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }}>
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                  </span>
                </div>
              </>
            )}

            {/* Comment input */}
            <div className="mt-3 flex gap-2 items-center">
              {isSupabaseVideo && isPaused && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded font-mono">
                  ⏸ {formatTimestamp(currentTime)}
                </span>
              )}
              {isDriveVideo && (
                <Input placeholder="0:00" value={manualTimestamp} onChange={(e) => setManualTimestamp(e.target.value)} className="w-16 h-8 text-xs font-mono" />
              )}
              <Input
                placeholder="Add your revision note..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                className="flex-1 h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddComment} disabled={!newComment.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> Send
              </Button>
            </div>
          </div>

          {/* Comment Thread */}
          <div className="flex-[2] flex flex-col">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              REVISION NOTES ({comments.length})
            </h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : sortedComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet. Pause the video and add one.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedComments.map(c => (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 border-l-[3px] ${c.resolved ? 'opacity-50 bg-muted/30' : 'bg-muted/50'}`}
                    style={{ borderLeftColor: c.resolved ? '#10b981' : (ROLE_COLORS[c.author_role] || '#888') }}
                  >
                    {c.timestamp_seconds !== null ? (
                      <button
                        className="text-xs font-semibold font-mono hover:underline"
                        style={{ color: ROLE_COLORS[c.author_role] || '#888' }}
                        onClick={() => isSupabaseVideo && seekTo(c.timestamp_seconds!)}
                      >
                        ⏱ {formatTimestamp(c.timestamp_seconds)} {isSupabaseVideo ? '— Jump' : ''}
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">General note</span>
                    )}
                    {c.resolved && (
                      <span className="text-xs text-green-500 float-right flex items-center gap-1">
                        <Check className="h-3 w-3" /> Resolved
                      </span>
                    )}
                    <p className="text-sm mt-1">{c.comment}</p>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {c.author_name} ({c.author_role}) · {timeAgo(c.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: `PublicVideoReview` reads from `video_edits` using the anon key. The existing RLS policy from `20260312_video_edits_public.sql` already grants `USING (true)` for SELECT, so this works without additional migration.

- [ ] **Step 2: Add route in App.tsx**

In `src/App.tsx`, add the import at the top with the other imports (after line 51):

```typescript
import PublicVideoReview from "./pages/PublicVideoReview";
```

Add the route after the existing public routes (after line 89, the `/public/edit-queue/:clientId` route):

```typescript
            <Route path="/public/review/:videoEditId" element={<PublicVideoReview />} />
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicVideoReview.tsx src/App.tsx
git commit -m "feat: add PublicVideoReview page with client name gate and comment support"
```

---

## Chunk 3: Queue Integration & Backend

### Task 8: Integrate into EditingQueue.tsx

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

This task adds the `UploadButton`, `VideoReviewModal`, and Reviews badge to the editing queue table.

- [ ] **Step 1: Add imports**

At the top of `src/pages/EditingQueue.tsx`, add these imports (after line 22):

```typescript
import UploadButton from '@/components/UploadButton';
import VideoReviewModal from '@/components/VideoReviewModal';
import { revisionCommentService } from '@/services/revisionCommentService';
```

- [ ] **Step 2: Add state for review modal and comment counts**

Inside the `EditingQueue` component function, add state declarations (near the existing state variables):

```typescript
const [reviewModalOpen, setReviewModalOpen] = useState(false);
const [reviewItem, setReviewItem] = useState<EditingQueueItem | null>(null);
const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});
```

- [ ] **Step 3: Add upload_source to EditingQueueItem interface**

In the `EditingQueueItem` interface (around line 24), add these fields:

```typescript
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
```

- [ ] **Step 4: Map new fields in the data fetch**

In the data fetching logic where `video_edits` rows are mapped to `EditingQueueItem` objects, add:

```typescript
uploadSource: item.upload_source,
storagePath: item.storage_path,
storageUrl: item.storage_url,
```

- [ ] **Step 5: Load unresolved comment counts**

After the video data is loaded, add an effect to fetch unresolved counts:

```typescript
useEffect(() => {
  if (!items.length) return;
  const loadCounts = async () => {
    const counts: Record<string, number> = {};
    await Promise.all(
      items.map(async (item) => {
        try {
          counts[item.id] = await revisionCommentService.getUnresolvedCount(item.id);
        } catch { counts[item.id] = 0; }
      })
    );
    setUnresolvedCounts(counts);
  };
  loadCounts();
}, [items]);
```

- [ ] **Step 6: Add Reviews badge column to the table**

In the table header, add a new `<TableHead>` after the existing Revisions column:

```typescript
<TableHead className="text-xs">Reviews</TableHead>
```

In the table body row, add the corresponding `<TableCell>`:

```typescript
<TableCell>
  <div className="flex items-center gap-2">
    {unresolvedCounts[item.id] > 0 ? (
      <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
        {unresolvedCounts[item.id]} open
      </span>
    ) : unresolvedCounts[item.id] === 0 && Object.keys(unresolvedCounts).length > 0 ? (
      <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
        All resolved
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )}
    <Button
      variant="ghost"
      size="sm"
      className="h-6 text-xs px-2"
      onClick={() => { setReviewItem(item); setReviewModalOpen(true); }}
    >
      Review ▶
    </Button>
  </div>
</TableCell>
```

- [ ] **Step 7: Replace footage field with UploadButton**

In the footage/file_submission column area, replace the inline edit with the `UploadButton` component when no footage exists:

```typescript
{!item.footageUrl && !item.fileSubmissionUrl ? (
  <UploadButton
    videoEditId={item.id}
    clientId={clientId}
    onUploadComplete={() => loadData()}
    currentSource={item.uploadSource}
  />
) : (
  // Keep existing footage display logic
  <span className="text-xs">
    {item.uploadSource === 'supabase' ? '⬆ Uploaded' : '📁 Google Drive'}
  </span>
)}
```

- [ ] **Step 8: Add VideoReviewModal at the end of the component**

Before the closing `</div>` of the component return, add:

```typescript
{reviewItem && (
  <VideoReviewModal
    open={reviewModalOpen}
    onClose={() => { setReviewModalOpen(false); setReviewItem(null); }}
    videoEditId={reviewItem.id}
    title={reviewItem.title}
    uploadSource={reviewItem.uploadSource || null}
    storagePath={reviewItem.storagePath || null}
    fileSubmissionUrl={reviewItem.fileSubmissionUrl}
    onCommentsChanged={() => {
      revisionCommentService.getUnresolvedCount(reviewItem.id)
        .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewItem.id]: count })));
    }}
  />
)}
```

- [ ] **Step 9: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat: integrate UploadButton, VideoReviewModal, and Reviews badge into EditingQueue"
```

---

### Task 9: Integrate into MasterEditingQueue.tsx

**Files:**
- Modify: `src/pages/MasterEditingQueue.tsx`

MasterEditingQueue has the same `EditingQueueItem` interface as EditingQueue but adds `clientId: string` and `clientName: string` fields.

- [ ] **Step 1: Add imports to MasterEditingQueue.tsx**

At the top of the file, after line 24 (`import { toast } from "sonner";`), add:

```typescript
import UploadButton from '@/components/UploadButton';
import VideoReviewModal from '@/components/VideoReviewModal';
import { revisionCommentService } from '@/services/revisionCommentService';
```

- [ ] **Step 2: Add storage fields to the EditingQueueItem interface**

In MasterEditingQueue's `EditingQueueItem` interface (lines 26-47), add after `postStatus` (line 46):

```typescript
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
```

- [ ] **Step 3: Add review state variables**

Inside the component function, add with the existing state declarations:

```typescript
const [reviewModalOpen, setReviewModalOpen] = useState(false);
const [reviewItem, setReviewItem] = useState<EditingQueueItem | null>(null);
const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});
```

- [ ] **Step 4: Map new fields in the data fetch**

In the data mapping where `video_edits` rows become `EditingQueueItem` objects, add:

```typescript
uploadSource: item.upload_source,
storagePath: item.storage_path,
storageUrl: item.storage_url,
```

- [ ] **Step 5: Add unresolved count loading effect**

After the data fetch, add an effect (use the existing items state variable name — check if it's `items`, `allItems`, etc.):

```typescript
useEffect(() => {
  if (!items.length) return;
  const loadCounts = async () => {
    const counts: Record<string, number> = {};
    await Promise.all(
      items.map(async (item) => {
        try {
          counts[item.id] = await revisionCommentService.getUnresolvedCount(item.id);
        } catch { counts[item.id] = 0; }
      })
    );
    setUnresolvedCounts(counts);
  };
  loadCounts();
}, [items]);
```

- [ ] **Step 6: Add Reviews column header and cell**

In the table header, add after the existing Revisions column:

```typescript
<TableHead className="text-xs">Reviews</TableHead>
```

In the table body row, add the corresponding cell:

```typescript
<TableCell>
  <div className="flex items-center gap-2">
    {unresolvedCounts[item.id] > 0 ? (
      <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
        {unresolvedCounts[item.id]} open
      </span>
    ) : unresolvedCounts[item.id] === 0 && Object.keys(unresolvedCounts).length > 0 ? (
      <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
        All resolved
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )}
    <Button
      variant="ghost"
      size="sm"
      className="h-6 text-xs px-2"
      onClick={() => { setReviewItem(item); setReviewModalOpen(true); }}
    >
      Review ▶
    </Button>
  </div>
</TableCell>
```

- [ ] **Step 7: Add UploadButton in footage column**

Replace the footage inline edit with the upload button when empty:

```typescript
{!item.footageUrl && !item.fileSubmissionUrl ? (
  <UploadButton
    videoEditId={item.id}
    clientId={item.clientId}
    onUploadComplete={() => loadData()}
    currentSource={item.uploadSource}
  />
) : (
  <span className="text-xs">
    {item.uploadSource === 'supabase' ? '⬆ Uploaded' : '📁 Google Drive'}
  </span>
)}
```

Note: `clientId` comes from `item.clientId` (MasterEditingQueue includes this per-row).

- [ ] **Step 8: Add VideoReviewModal before closing div**

```typescript
{reviewItem && (
  <VideoReviewModal
    open={reviewModalOpen}
    onClose={() => { setReviewModalOpen(false); setReviewItem(null); }}
    videoEditId={reviewItem.id}
    title={reviewItem.title}
    uploadSource={reviewItem.uploadSource || null}
    storagePath={reviewItem.storagePath || null}
    fileSubmissionUrl={reviewItem.fileSubmissionUrl}
    onCommentsChanged={() => {
      revisionCommentService.getUnresolvedCount(reviewItem.id)
        .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewItem.id]: count })));
    }}
  />
)}
```

- [ ] **Step 9: Verify build compiles**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/pages/MasterEditingQueue.tsx
git commit -m "feat: add video review and upload to MasterEditingQueue"
```

---

### Task 10: Integrate into MasterDatabase.tsx (Videos Tab)

**Files:**
- Modify: `src/pages/MasterDatabase.tsx`

MasterDatabase uses a tab layout (`Tabs` / `TabsContent`) with a Leads tab and a Videos tab. The videos tab uses the `VideoEdit` type from `videoService.ts` (augmented with `client_name` and `script_title`). The `clientId` comes from each video's `client_id` field, not a route param.

- [ ] **Step 1: Add imports to MasterDatabase.tsx**

At the top of the file, after the existing imports (line 21), add:

```typescript
import UploadButton from '@/components/UploadButton';
import VideoReviewModal from '@/components/VideoReviewModal';
import { revisionCommentService } from '@/services/revisionCommentService';
```

- [ ] **Step 2: Add review state variables**

Inside the `MasterDatabase` component function, add with the existing state declarations:

```typescript
const [reviewModalOpen, setReviewModalOpen] = useState(false);
const [reviewVideo, setReviewVideo] = useState<(VideoEdit & { client_name?: string }) | null>(null);
const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});
```

- [ ] **Step 3: Add unresolved count loading effect**

After the video data loads (using the `allVideos` state variable), add:

```typescript
useEffect(() => {
  if (!allVideos.length) return;
  const loadCounts = async () => {
    const counts: Record<string, number> = {};
    await Promise.all(
      allVideos.map(async (v) => {
        try {
          counts[v.id] = await revisionCommentService.getUnresolvedCount(v.id);
        } catch { counts[v.id] = 0; }
      })
    );
    setUnresolvedCounts(counts);
  };
  loadCounts();
}, [allVideos]);
```

- [ ] **Step 4: Add Reviews column to the videos table**

In the videos tab table header, add:

```typescript
<TableHead className="text-xs">Reviews</TableHead>
```

In the videos tab table body, add the corresponding cell for each video row `v`:

```typescript
<TableCell>
  <div className="flex items-center gap-2">
    {unresolvedCounts[v.id] > 0 ? (
      <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
        {unresolvedCounts[v.id]} open
      </span>
    ) : unresolvedCounts[v.id] === 0 && Object.keys(unresolvedCounts).length > 0 ? (
      <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
        All resolved
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )}
    <Button
      variant="ghost"
      size="sm"
      className="h-6 text-xs px-2"
      onClick={() => { setReviewVideo(v); setReviewModalOpen(true); }}
    >
      Review ▶
    </Button>
  </div>
</TableCell>
```

- [ ] **Step 5: Add UploadButton in the videos tab footage area**

For each video row, replace or augment the footage display:

```typescript
{!v.footage && !v.file_submission ? (
  <UploadButton
    videoEditId={v.id}
    clientId={v.client_id}
    onUploadComplete={() => loadData()}
    currentSource={v.upload_source}
  />
) : (
  <span className="text-xs">
    {v.upload_source === 'supabase' ? '⬆ Uploaded' : '📁 Google Drive'}
  </span>
)}
```

Note: `clientId` is `v.client_id` from the `VideoEdit` row directly.

- [ ] **Step 6: Add VideoReviewModal before closing of the videos TabsContent**

```typescript
{reviewVideo && (
  <VideoReviewModal
    open={reviewModalOpen}
    onClose={() => { setReviewModalOpen(false); setReviewVideo(null); }}
    videoEditId={reviewVideo.id}
    title={reviewVideo.reel_title || 'Video'}
    uploadSource={reviewVideo.upload_source || null}
    storagePath={reviewVideo.storage_path || null}
    fileSubmissionUrl={reviewVideo.file_submission}
    onCommentsChanged={() => {
      revisionCommentService.getUnresolvedCount(reviewVideo.id)
        .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewVideo.id]: count })));
    }}
  />
)}
```

Note: MasterDatabase accesses fields directly from `VideoEdit` type (`reel_title`, `upload_source`, `storage_path`, `file_submission`) rather than the camelCase `EditingQueueItem` mapping used in EditingQueue/MasterEditingQueue.

- [ ] **Step 7: Verify build compiles**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/MasterDatabase.tsx
git commit -m "feat: add video review and upload to MasterDatabase videos tab"
```

---

### Task 11: Create cleanup-expired-videos Edge Function

**Files:**
- Create: `supabase/functions/cleanup-expired-videos/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/cleanup-expired-videos/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";
const SUPABASE_URL = "https://hxojqrilwhhrvloiwmfo.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let filesDeleted = 0;
  let recordsDeleted = 0;
  const errors: string[] = [];

  // Stage 1: Delete expired video FILES (90 days)
  try {
    const { data: expiredFiles, error: fetchErr } = await supabase
      .from("video_edits")
      .select("id, storage_path")
      .eq("upload_source", "supabase")
      .lt("file_expires_at", new Date().toISOString())
      .not("storage_path", "is", null);

    if (fetchErr) throw fetchErr;

    for (const row of expiredFiles || []) {
      try {
        // Delete file from storage
        const { error: storageErr } = await supabase.storage
          .from("video-uploads")
          .remove([row.storage_path]);

        if (storageErr) {
          errors.push(`Storage delete failed for ${row.id}: ${storageErr.message}`);
          continue;
        }

        // Clear storage columns on the row
        const { error: updateErr } = await supabase
          .from("video_edits")
          .update({ storage_path: null, storage_url: null })
          .eq("id", row.id);

        if (updateErr) {
          errors.push(`DB update failed for ${row.id}: ${updateErr.message}`);
          continue;
        }

        filesDeleted++;
      } catch (e: any) {
        errors.push(`File cleanup error for ${row.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Stage 1 query error: ${e.message}`);
  }

  // Stage 2: Delete expired RECORDS (180 days)
  try {
    const { data: expiredRecords, error: fetchErr } = await supabase
      .from("video_edits")
      .select("id")
      .eq("upload_source", "supabase")
      .lt("record_expires_at", new Date().toISOString());

    if (fetchErr) throw fetchErr;

    for (const row of expiredRecords || []) {
      try {
        const { error: deleteErr } = await supabase
          .from("video_edits")
          .delete()
          .eq("id", row.id);

        if (deleteErr) {
          errors.push(`Record delete failed for ${row.id}: ${deleteErr.message}`);
          continue;
        }

        recordsDeleted++;
      } catch (e: any) {
        errors.push(`Record cleanup error for ${row.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Stage 2 query error: ${e.message}`);
  }

  const result = {
    files_deleted: filesDeleted,
    records_deleted: recordsDeleted,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log("Cleanup result:", JSON.stringify(result));

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Add function entry to config.toml**

Append to `supabase/config.toml`:

```toml
[functions.cleanup-expired-videos]
verify_jwt = false
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/cleanup-expired-videos/index.ts supabase/config.toml
git commit -m "feat: add cleanup-expired-videos Edge Function for two-stage video cleanup"
```

---

### Task 12: Create Supabase Storage Bucket

This is a manual setup step in Supabase Dashboard.

- [ ] **Step 1: Create the video-uploads bucket**

In Supabase Dashboard → Storage → Create Bucket:
- Name: `video-uploads`
- Public: No (private)
- File size limit: 50 GB (53687091200 bytes)
- Allowed MIME types: `video/*`

- [ ] **Step 2: Add storage RLS policies**

In Supabase Dashboard → Storage → Policies for `video-uploads`:

**Upload policy (admin only):**
```sql
CREATE POLICY "Admin upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'video-uploads'
    AND auth.role() = 'authenticated'
  );
```

**Read policy (authenticated):**
```sql
CREATE POLICY "Authenticated read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-uploads'
    AND auth.role() = 'authenticated'
  );
```

**Delete policy (service role via Edge Function):**
```sql
CREATE POLICY "Service delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'video-uploads'
  );
```

---

### Task 13: Deploy & Set Up Cron

- [ ] **Step 1: Deploy the Edge Function to Supabase**

```bash
npx supabase functions deploy cleanup-expired-videos
```

Or SCP to VPS and deploy from there (per project workflow).

- [ ] **Step 2: Set up the daily cron job**

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
SELECT cron.schedule('daily-video-cleanup', '0 3 * * *', $$
  SELECT net.http_post(
    url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/cleanup-expired-videos',
    headers := '{"Content-Type":"application/json","x-cron-secret":"connectacreators-cron-2026"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Expected: Cron job scheduled. Verify with:

```sql
SELECT * FROM cron.job WHERE jobname = 'daily-video-cleanup';
```

- [ ] **Step 3: Build and deploy frontend to VPS**

```bash
npm run build
# SCP dist/ to VPS, reload nginx
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete video upload & timestamped review system integration"
```

---

## Google Drive Picker Setup (Prerequisite — Manual)

Before the Google Drive button works, these one-time steps must be done in Google Cloud Console:

1. Go to https://console.cloud.google.com/
2. Create or select a project
3. Enable **Google Picker API** and **Google Drive API**
4. Create **OAuth 2.0 Client ID** (Web application type)
   - Authorized JavaScript origins: `https://connectacreators.com` and `http://localhost:5173`
5. Create **API Key** (restrict to Picker API)
6. Add to `.env` on VPS:
   ```
   VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=AIzaXxx...
   ```
7. Rebuild the app so Vite injects the env vars
