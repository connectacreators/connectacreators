
# Plan: Lead Status Update + Lead Detail Modal

## What will change

### 1. New Edge Function: `update-lead-status`
A new backend function that receives a lead's Notion page ID and a new status, then updates it via the Notion API. It will:
- Authenticate the user (same pattern as `fetch-leads`)
- Verify the user has permission (admin, videographer with assigned client, or client owning the lead)
- Call the Notion API to update the "Lead Status" select property on the page
- Return success/error

### 2. Fix `fetch-leads` auth (same bug as categorize-script)
The `fetch-leads` edge function still uses the broken `getClaims` method. It needs to be updated to use `supabase.auth.getUser()` like the recently fixed `categorize-script`.

### 3. Lead Detail Modal (LeadTracker.tsx)
When clicking on a lead card, a dialog will open showing:
- Full Name, Email, Phone (clickable), Lead Status, Lead Source
- Client name, Campaign Name, Notes, Created Date, Last Contacted
- A status dropdown limited to 3 options: **Meta Ad (Not Booked)**, **Appointment Booked**, **Cancelled**
- A "Save" button to update the status via the new edge function
- Admin-only: link to open in Notion

### 4. "Cancelled" status color
Add a color entry for "Cancelled" in the `STATUS_COLORS` map (red theme).

### 5. Translations
Add new i18n keys for the modal labels (Full Name, Email, Phone, Status, Source, Campaign, Notes, Date, Save, etc.).

---

## Technical Details

### Edge Function: `supabase/functions/update-lead-status/index.ts`
- Method: POST
- Body: `{ leadId: string, newStatus: string }`
- Allowed statuses: `["Meta Ad (Not Booked)", "Appointment Booked", "Cancelled"]`
- Auth: validates user via `supabase.auth.getUser()`, checks role (admin/videographer/client) and verifies they have access to the lead's client
- Notion API call: `PATCH https://api.notion.com/v1/pages/{leadId}` with `properties: { "Lead Status": { select: { name: newStatus } } }`

### Fix `fetch-leads/index.ts`
- Replace `getClaims(token)` with `supabase.auth.getUser()`
- Use `user.id` instead of `claimsData.claims.sub`
- Also add videographer support: check `videographer_clients` table so videographers can see their assigned clients' leads

### LeadTracker.tsx changes
- Add state for selected lead and modal open/close
- Make each lead card clickable (open modal)
- Dialog shows all lead info + status dropdown (3 options only)
- On save, call `update-lead-status` edge function, then refresh leads
- Add "Cancelled" to `STATUS_COLORS` with red styling

### Translations (`src/i18n/translations.ts`)
- Add keys: `leadDetail`, `status`, `source`, `campaign`, `notes`, `date`, `lastContacted`, `save`, `saving`, `statusUpdated`, `close`, `changeStatus`
