

## Master Editing Queue

### What it does
A new page at `/editing-queue` that aggregates editing queue items from ALL clients into a single table. Accessible from the dashboard and sidebar for Admin, Videographer, and User roles.

### How it works
1. Open the Master Editing Queue from the dashboard card or sidebar
2. The page fetches all clients that have a Notion mapping configured
3. It calls `fetch-editing-queue` for each client in parallel
4. All items are merged into one table with an extra "Client" column
5. A dropdown filter at the top lets you narrow by specific client

### Technical Details

**1. Update `fetch-editing-queue` edge function**
- Accept an optional `client_ids` array parameter (alongside existing `client_id`)
- When `client_ids` is provided, loop through each, query their Notion databases, and tag each returned item with `clientId` and `clientName`
- Fetch client names from the `clients` table using the service client
- Return a merged array of items plus a unified `notionUsers` list
- Existing single-client behavior remains unchanged (backward compatible)

**2. Create `src/pages/MasterEditingQueue.tsx`**
- Full dashboard layout (sidebar, topbar, AnimatedDots)
- On load, call the edge function with all client IDs (fetched from `client_notion_mapping`)
- Render a table with columns: **Client**, Title, Status, Assignee, Revisions, Video, Script
- Client filter dropdown at the top (default: "All Clients")
- Reuse the same status/assignee/revision update handlers and UI components from the per-client `EditingQueue.tsx`
- Script "View" button navigates to `/clients/{clientId}/scripts?scriptTitle=...`

**3. Add route in `App.tsx`**
- Add `/editing-queue` route pointing to `MasterEditingQueue`

**4. Add sidebar link in `DashboardSidebar.tsx`**
- Add "Editing Queue" with `Clapperboard` icon for admin, videographer, and user nav sections

**5. Add dashboard card in `Dashboard.tsx`**
- Add an "Editing Queue" card for admin/videographer/user tool cards (with Clapperboard icon, rose color)

**6. No database changes needed** -- uses existing `client_notion_mapping` and `clients` tables via the edge function's service role client.

