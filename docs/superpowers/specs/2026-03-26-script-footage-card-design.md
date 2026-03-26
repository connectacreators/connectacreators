# Script Footage Card — Design Spec
**Date:** 2026-03-26
**Scope:** Footage and File Submission sections at the bottom of the script view in `Scripts.tsx`

---

## Goal

Replace the current plain-URL / "No footage linked" display with a visual card that shows uploaded footage clearly and allows playback, download, and delete — all without leaving the script view.

---

## Current State (problems)

- "No footage linked" / "No file submitted" text is redundant — absence of a card already communicates this
- After uploading, footage is shown as a raw URL text link with a trash icon — no way to play or preview
- The `FootageViewerModal` component (which handles gallery, playback, download, delete) exists but is not wired into the Scripts page

---

## Approved Design: Thumbnail Card Row

Each uploaded file or link renders as a horizontal card. The section is otherwise empty when nothing is attached (no placeholder text).

### Card anatomy

```
┌─────────────────────────────────────────────────────────────┐
│  [THUMB]  filename.mp4              [VIDEO]  124 MB   👁 ⬇ 🗑 │
└─────────────────────────────────────────────────────────────┘
```

**Thumbnail area (80×52px, left side):**
- Uploaded video file → dark background + play triangle icon (▶)
- Google Drive / external link → dark blue background + link icon (🔗)
- Clicking anywhere on the card opens `FootageViewerModal` for full playback

**Filename (middle, truncated with ellipsis):**
- Uploaded file: actual filename from `storage_path` (basename)
- Google Drive link: truncated URL (e.g. `drive.google.com/file/d/1BxiMV…`)

**Type badge (below filename):**
- Uploaded file → green `VIDEO` badge
- Google Drive / external link → cyan `LINK` badge
- No "Supabase" or "Google Drive" labels

**File size (next to badge):**
- Shown for uploaded files (`file_size_bytes` field)
- Omitted for link-type entries

**Action buttons (right side):**
- Uploaded video: **View** (opens FootageViewerModal) · **Download** · **Delete**
- Link: **Open** (opens URL in new tab) · **Remove** (clears DB field)

**Add button:**
- Always shown below any existing cards: `+ Add Footage` / `+ Add File`
- When no video_edit record exists yet, clicking creates the record first then opens `FootageUploadDialog`
- When record exists, opens `FootageUploadDialog` directly

### Empty state
- No card → section heading + `+ Add Footage` button only
- No "No footage linked" or "No file submitted" text

---

## Component Changes

### `Scripts.tsx` — Footage & File Submission sections
- Remove `"No footage linked"` and `"No file submitted"` text
- Replace URL text link display with the thumbnail card component (inline JSX or extracted small component)
- Wire the card's click/view action to open `FootageViewerModal` (already exists, just needs to be imported and triggered from Scripts.tsx)
- Pass correct props to `FootageViewerModal`: `videoEditId`, `clientId`, `footageUrl`, `uploadSource`, `storagePath`, `storageUrl`

### Source of truth for display
Determine card type from `linkedVideoEdit.upload_source`:
- `'supabase'` → VIDEO card, use `storage_path` basename as filename, `file_size_bytes` for size
- `'gdrive'` or null → LINK card, truncate URL for display

### `FootageViewerModal` integration
- Import `FootageViewerModal` in `Scripts.tsx` (already used in `EditingQueue.tsx` — same pattern)
- Add `footageViewerOpen` / `setFootageViewerOpen` state boolean
- Add `footageViewerTarget` state: `'footage' | 'submission'` to know which section triggered it
- Pass the right URL/path depending on which card was clicked

---

## What is NOT changing
- `FootageUploadDialog` component — unchanged, already works
- `FootageViewerModal` component — unchanged, already handles gallery, playback, download, delete
- The video_edit record creation flow — already implemented, unchanged
- The "Footage" and "File Submission" section headings and colors

---

## Edge Cases
- `linkedVideoEdit` is null → show only `+ Add Footage` / `+ Add File` button (creates record on click)
- `upload_source` is null (old records) → treat as LINK type, show URL truncated
- Both footage and file_submission can exist independently — each section manages its own card
- File size may be null for older records → omit size text if null
