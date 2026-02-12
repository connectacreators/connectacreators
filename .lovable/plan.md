
# Notion Editing Queue Sync

## What This Does
Every time a script is created or updated in the app, a row will automatically be created or updated in the correct client's Notion database inside the Editing Queue. The script title becomes the "Reel title", the Google Drive link maps to "Footage", and the script's raw content link maps to "Script".

## How It Works

1. **New Edge Function: `sync-notion-script`**
   - Receives: `script_id`, `client_id`, `title`, `google_drive_link`, and `action` ("create" or "update")
   - Looks up a mapping table to find the correct Notion database (data source) ID for the given client
   - On **create**: Creates a new page in the client's Notion database with:
     - `Reel title` = script title (idea_ganadora)
     - `Status` = "Not started"
     - `Footage` = google_drive_link (if provided)
     - `Script` = link back to the script in the app
   - On **update**: Finds the existing Notion page by `notion_page_id` (stored in our DB) and updates the same fields
   - Uses the `NOTION_API_KEY` secret (already configured)

2. **New Database Table: `notion_script_sync`**
   - Maps each script to its Notion page ID so updates can target the right row
   - Columns: `id`, `script_id` (FK), `notion_page_id`, `notion_database_id`, `created_at`

3. **New Database Table: `client_notion_mapping`**
   - Maps each client to their Notion database (data source) ID
   - Columns: `id`, `client_id` (FK), `notion_database_id` (text), `created_at`
   - Pre-populated with:
     - Dr Calvin Clinic's -> `29ad6442-e09c-8111-b103-000b6066c231`
     - Connecta Creators -> `1f3d6442-e09c-8004-a317-000b6aa4ad7e`
     - Saratoga Chiropractic -> `2e8d6442-e09c-8131-a2f1-000bf04916a4`
     - The Pack -> `2ebd6442-e09c-81dd-8123-000bd424f130`

4. **Hook Changes (`useScripts.ts`)**
   - After `categorizeAndSave` successfully saves a script, call the `sync-notion-script` edge function with action "create"
   - After `updateScript` succeeds, call it with action "update"
   - After `updateGoogleDriveLink` succeeds, also trigger an update sync

## Technical Details

### Edge Function: `sync-notion-script`

```
POST /sync-notion-script
Body: { script_id, client_id, title, google_drive_link, action }
```

- Uses the Notion API directly (`https://api.notion.com/v1/pages`) with the existing `NOTION_API_KEY` secret
- On create: `POST /v1/pages` with parent = client's database ID
- On update: `PATCH /v1/pages/{notion_page_id}` with updated properties
- Stores/reads the `notion_page_id` mapping via Supabase service role client

### Database Migrations

**Table 1: `client_notion_mapping`**
- `client_id` UUID references clients(id)
- `notion_database_id` TEXT (the Notion data source / collection ID)
- Unique constraint on client_id
- RLS: admin-only access

**Table 2: `notion_script_sync`**
- `script_id` UUID references scripts(id) ON DELETE CASCADE
- `notion_page_id` TEXT
- `notion_database_id` TEXT
- Unique constraint on script_id
- RLS: admin-only access

### Property Mapping

| App Field | Notion Property | Type |
|-----------|----------------|------|
| idea_ganadora (title) | Reel title | title |
| google_drive_link | Footage | url |
| (app script URL) | Script | url |
| "Not started" (default) | Status | status |

### Files to Create/Modify

- **Create**: `supabase/functions/sync-notion-script/index.ts`
- **Modify**: `supabase/config.toml` (add function config)
- **Modify**: `src/hooks/useScripts.ts` (add sync calls after create/update)
- **Create**: 1 database migration (both tables + seed data)
