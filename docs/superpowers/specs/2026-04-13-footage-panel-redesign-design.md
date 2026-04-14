# Footage Panel Redesign — Design Spec

**Date:** 2026-04-13
**Status:** Approved for implementation

---

## Goal

Replace `FootageViewerModal` and `FootageUploadDialog` (where used as a full viewer) with a single `FootagePanel` component that has a Google Drive-style UX: one-click play, multi-file upload with inline progress, drag-and-drop, unified file list, and video thumbnails. `FootageUploadDialog` is kept as-is for its compact table-row usage in EditingQueue, MasterEditingQueue, and MasterDatabase.

---

## What Changes

| File | Change |
|---|---|
| `src/components/FootagePanel.tsx` | **New** — unified component |
| `src/components/FootageViewerModal.tsx` | **Deleted** after migration |
| `src/components/FootageUploadDialog.tsx` | **Kept** — used in table rows, untouched |
| `src/pages/Scripts.tsx` | Swap `FootageViewerModal` → `FootagePanel` (1 usage) |
| `src/pages/EditingQueue.tsx` | Swap `FootageViewerModal` → `FootagePanel` (1 usage) |
| `src/pages/MasterEditingQueue.tsx` | Swap `FootageViewerModal` → `FootagePanel` (1 usage) |

---

## Props Interface

`FootagePanel` accepts the same props as `FootageViewerModal` today — no call-site changes beyond the import/component name swap:

```typescript
interface FootagePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  videoEditId: string;
  clientId: string;
  footageUrl: string | null;
  fileSubmissionUrl: string | null;
  uploadSource?: string | null;
  storagePath?: string | null;
  storageUrl?: string | null;
  onComplete: () => void;
  subfolder?: string;
  scriptId?: string | null;
}
```

---

## Layout

`Dialog` at `sm:max-w-xl` (up from `sm:max-w-lg`). Max height `90vh`, scrollable body.

```
┌─────────────────────────────────────┐
│ Header: "Footage — {title}"    [✕]  │
├─────────────────────────────────────┤
│ Drop zone (compact when files exist)│
├─────────────────────────────────────┤
│ File list (unified — files + links) │
│  ├ [uploading rows]                 │
│  ├ [uploaded file rows]             │
│  │    └ [inline player if active]   │
│  └ [link rows]                      │
├─────────────────────────────────────┤
│ Add link input + button             │
└─────────────────────────────────────┘
```

---

## Drop Zone

- Always visible at the top of the modal
- When no files exist: full-height centered prompt ("Drop videos here or click to browse")
- When files exist: compact single-line bar ("↑ Drop more files")
- Accepts drag-and-drop anywhere on the modal (not just the zone element) via `onDragOver`/`onDrop` on the `DialogContent` wrapper
- Clicking opens a hidden `<input type="file" accept="video/*" multiple />`
- Validates each file: must be `video/*`, max 50 GB each
- Files over the limit show an error toast and are skipped; valid files proceed

---

## Multi-File Upload

For each valid file dropped or selected, `startUpload(file)` is called:

```typescript
function startUpload(file: File) {
  const uploadId = `${videoEditId}-${Date.now()}`;
  uploadStore.add(uploadId, file.name);
  videoUploadService.uploadVideoFile(file, clientId, videoEditId,
    (pct) => uploadStore.update(uploadId, pct),
    subfolder
  ).then(() => {
    uploadStore.complete(uploadId);
    toast.success(`${file.name} uploaded`);
    onComplete();
    loadFiles(); // refresh list
  }).catch((err) => {
    uploadStore.fail(uploadId, err.message || 'Upload failed');
  });
}
```

Multiple files upload concurrently. The modal stays open throughout — uploads are background.

---

## File List — Unified Flat List

Order within the list:
1. **In-progress uploads** — sourced from `uploadStore.getAll()` filtered to entries whose `id` starts with `${videoEditId}-`
2. **Uploaded storage files** — sourced from `loadFiles()` (signed URLs, 3600s expiry)
3. **GDrive / external links** — sourced from `parseFootageLinks()` filtered to `https://` URLs

### Uploading file row
- Spinner thumbnail
- Filename + animated progress bar + percentage
- No actions (can't delete mid-upload)

### Uploaded file row
- 52×34px thumbnail via `<video src={signedUrl} preload="metadata" muted />` hidden element; aspect ratio captured via `onLoadedMetadata`
- Filename + file size
- Hover actions: Copy signed link (⧉), Download (⬇), Delete (🗑)
- Clicking the row toggles the inline player (only one open at a time)

### Inline player
- Expands directly below the active file row
- Uses `ThemedVideoPlayer` with `src={signedUrl}`
- No `autoPlay` — user clicks to play
- `onLoadedMetadata={(_, w, h) => setAspect(w/h)}` — no duplicate video element
- Controls row includes Copy link + Download buttons

### Link row
- Drive folder icon thumbnail
- Truncated URL (60 chars max via `displayUrl`)
- Hover actions: Open in new tab (↗), Delete (🗑)
- Clicking opens URL in new tab (not the inline player)

---

## Function Transfer Map

| Function | Source | FootagePanel |
|---|---|---|
| `parseFootageLinks` | FootageViewerModal | Kept unchanged |
| `displayUrl` | FootageViewerModal | Kept unchanged |
| `loadFiles` | FootageViewerModal | Kept unchanged |
| `persistLinks` | FootageViewerModal | Kept unchanged — writes footage/file_submission, syncs `scripts.google_drive_link` |
| `handleAddLink` | FootageViewerModal | Kept unchanged |
| `handleRemoveLink` | FootageViewerModal | Kept unchanged |
| `handleDeleteFile` | FootageViewerModal | Kept unchanged — deletes from storage, clears `storage_path`/`storage_url`/`upload_source` if last file |
| `handleDragOver/Leave/Drop` | FootageUploadDialog | Adapted — now loops over `e.dataTransfer.files` (multiple) |
| `handleFileSelect` | FootageUploadDialog | Adapted — input has `multiple`, loops over `e.target.files` |
| `handleUpload` | FootageUploadDialog | Replaced by `startUpload(file)` called per file |
| `handleSaveDriveUrl` | FootageUploadDialog | **Merged into `handleAddLink`** — no longer a separate function |
| `formatFileSize` | FootageUploadDialog | Kept unchanged |
| `previewFile` state | FootageViewerModal | Renamed `activeFile` |
| `previewAspect` state | FootageViewerModal | Kept — controls player width for portrait videos |

---

## State

```typescript
const [files, setFiles] = useState<StorageFile[]>([]);       // storage files
const [links, setLinks] = useState<string[]>([]);             // GDrive/external links
const [loading, setLoading] = useState(false);                // initial load spinner
const [deleting, setDeleting] = useState<string | null>(null);// filename being deleted
const [activeFile, setActiveFile] = useState<StorageFile | null>(null); // inline player
const [aspect, setAspect] = useState<number | null>(null);    // active file aspect ratio
const [newLink, setNewLink] = useState('');                   // link input value
const [savingLink, setSavingLink] = useState(false);          // link save in progress
const [uploads, setUploads] = useState<UploadEntry[]>([]);    // from uploadStore subscription
const [isDragging, setIsDragging] = useState(false);          // drop zone highlight
```

`uploads` is populated via `uploadStore.subscribe()` in a `useEffect`, filtered to entries whose `id` starts with `${videoEditId}-`.

---

## Delete Behavior (unchanged from FootageViewerModal)

1. `supabase.storage.from('footage').remove([path])` — deletes from storage
2. If last file: nulls `storage_path`, `storage_url`, `upload_source` on `video_edits`
3. `onComplete()` called — caller refreshes its state
4. If no files AND no links remain: also calls `onClose()`
5. `footage` and `file_submission` columns are never touched by delete — only cleared by explicit link removal

---

## Migration Steps (call sites)

All three swaps are identical:
```diff
- import FootageViewerModal from '@/components/FootageViewerModal';
+ import FootagePanel from '@/components/FootagePanel';

- <FootageViewerModal
+ <FootagePanel
```

No prop changes at any call site.

After migration: delete `FootageViewerModal.tsx`.

**Scripts.tsx additional change:** The two small `FootageUploadDialog` trigger buttons in the script sidebar (the `+ Footage` and `+ Add File` buttons) are removed. Since `FootagePanel` now has a built-in drop zone and upload flow, a single "View / Add" button that opens the panel is sufficient. The panel already handles both footage and submission contexts via the `subfolder` prop. The `FootageUploadDialog` import is removed from `Scripts.tsx` entirely.

**EditingQueue, MasterEditingQueue, MasterDatabase:** The `FootageUploadDialog` buttons in table rows are kept exactly as-is — they remain the compact upload trigger for those pages.

---

## Out of Scope

Features explicitly removed from consideration:
- Hover preview (browser compatibility concerns)
- Duration display in file list
- Bulk select / sort / rename
- Storage usage bar
- Cancel in-progress upload
- Retry failed upload
- Slide-in drawer layout
