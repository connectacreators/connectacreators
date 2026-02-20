

# Editing Queue - Implementation Plan

## What is it?

A new card in the Client Detail page called **"Editing Queue"** that connects to the same Notion database already used for scripts. Its purpose is to show the **production status** of each video and allow reviewing the final export directly inside the CRM.

## How it works

1. **New card on Client Detail** -- An "Editing Queue" card (with a film/clapperboard icon) is added alongside the existing cards (Script Breakdown, Lead Tracker, etc.)

2. **New page: `/clients/:clientId/editing-queue`** -- When clicked, it shows a list/table of all entries from the client's Notion editing database, displaying:
   - **Title** (from the mapped title property)
   - **Status** (from Notion's Status property -- e.g., "Not started", "In progress", "Done")
   - **File Submission** link (Google Drive link from Notion)
   - **Inline video preview** when a Google Drive link is detected -- we'll extract the file ID and render it using Google Drive's embed preview (`https://drive.google.com/file/d/{ID}/preview`)

3. **New edge function: `fetch-editing-queue`** -- Queries the client's Notion database via API, pulling all pages with their Status, File Submission, and title. Returns them sorted by last edited. This reuses the existing `client_notion_mapping` table to find the correct Notion database ID.

4. **Video review experience** -- Clicking on an entry opens a detail/modal view where:
   - The embedded Google Drive video player is shown prominently
   - The status badge is displayed
   - The script public link is available to cross-reference

## Visual layout of the queue page

```text
+---------------------------------------------+
|  <- Back to [Client Name]                    |
|                                              |
|  Editing Queue                               |
|                                              |
|  +--------+----------+--------+----------+   |
|  | Title  | Status   | Video  | Script   |   |
|  +--------+----------+--------+----------+   |
|  | Reel 1 | Done     | [Play] | [Link]   |   |
|  | Reel 2 | Editing  | --     | [Link]   |   |
|  | Reel 3 | Not started| --   | [Link]   |   |
|  +--------+----------+--------+----------+   |
+---------------------------------------------+
```

Clicking "Play" opens a modal with the embedded Google Drive video.

## Technical Details

### 1. Update `client_notion_mapping` table
Add a new column `file_submission_property` (text, default `'File Submission'`) to map the Notion property name for the video file link. This is done via a database migration.

### 2. New edge function: `fetch-editing-queue`
- Accepts `client_id` in the request body
- Authenticates the user (same pattern as other functions)
- Looks up `client_notion_mapping` to get the Notion database ID and property names
- Queries the Notion database API (`POST /v1/databases/{id}/query`) with a sort by last edited
- Extracts: title, status, file submission URL, and the script URL
- Returns a JSON array of items

### 3. New page component: `src/pages/EditingQueue.tsx`
- Fetches data from the `fetch-editing-queue` edge function
- Renders a clean table/list with status badges (color-coded)
- Google Drive links are detected and converted to embeddable preview URLs
- A modal/dialog shows the video player when clicked
- Follows the same layout pattern as other client sub-pages (sidebar, top bar, back button)

### 4. Route and navigation updates
- **`src/App.tsx`**: Add route `/clients/:clientId/editing-queue`
- **`src/pages/ClientDetail.tsx`**: Add the "Editing Queue" card to `toolCards` array
- **`src/components/DashboardSidebar.tsx`**: No changes needed (it's accessed per-client, not from sidebar)

### 5. Google Drive video embedding
Google Drive share links typically look like:
- `https://drive.google.com/file/d/FILE_ID/view`
- `https://drive.google.com/open?id=FILE_ID`

We'll parse the file ID and render an iframe with `https://drive.google.com/file/d/{FILE_ID}/preview` which gives a native video player for supported formats.

### Files to create
- `supabase/functions/fetch-editing-queue/index.ts`
- `src/pages/EditingQueue.tsx`

### Files to modify
- `src/App.tsx` (add route)
- `src/pages/ClientDetail.tsx` (add card)

### Database migration
- Add `file_submission_property` column to `client_notion_mapping`

