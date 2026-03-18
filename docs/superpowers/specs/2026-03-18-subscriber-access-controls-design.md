# Subscriber Access Controls & Internal Lead Management

## Summary

Subscribers on starter/growth/enterprise plans need proper access controls and internal data management. Three changes:

1. **Landing Page card** grayed out for non-enterprise subscribers
2. **Lead Tracker** gains manual lead creation + Supabase data source for subscribers
3. **Master Database** accessible to subscribers, scoped to their own data

## Context

### Role taxonomy
- **Admin** (`isAdmin`): Full access to everything, Notion-sourced leads
- **ConnectaPlus** (`isConnectaPlus`): Connecta's managed clients, Notion-sourced leads. Note: `isConnectaPlus` users also satisfy `isClientRole` (the fallback derivation), so they see the same dashboard folder structure as clients.
- **Client** (`isClientRole`): Connecta's clients (e.g. Dr Calvin's Clinic), Notion-sourced leads
- **Subscriber** (`isUser`, role="user"): Independent users on starter/growth/enterprise plans — NO Notion, all data lives in Supabase internally
- **Videographer/Editor**: Staff roles, not relevant to these changes

### Key principle
Subscribers don't have Notion. Their leads and videos live entirely in Supabase tables (`leads`, `video_edits`, `scripts`). The Master Database is their single source of truth.

### Current broken behavior
Subscribers currently hit the `fetch-leads` Notion edge function (the `else` branch in LeadTracker's `useEffect`) and get empty/error results since they have no Notion databases. This design fixes that by routing them to Supabase instead.

## Design

### 1. Dashboard — Landing Page Card Disabled

**File:** `src/pages/Dashboard.tsx`

**What changes:**
- Fetch the subscriber's `plan_type` from the `clients` table and store in `userPlanType` state (the subscription check effect already queries this data — just retain the value)
- In the `setup` sub-cards within `getClientSubCards()`, add a `disabled` property to the Landing Page card
- Disabled when: `isUser && userPlanType !== "enterprise"` (starter/growth plans)
- Enabled when: `isAdmin`, `isConnectaPlus`, `isClientRole`, or `isUser` with enterprise plan

**Disabled card behavior:**
- `opacity-40 cursor-not-allowed` styling
- Click handler returns early (no navigation)
- Small text below description: "Enterprise plan only" / "Solo plan Enterprise" (language-aware)

**Also in the `setup` folder description line:** No change needed — "Landing Page" stays in the description text since it's still listed, just grayed out.

### 2. Dashboard — Add Lead Tracker + Master Database Cards for Subscribers

**File:** `src/pages/Dashboard.tsx`

**What changes:**
- The `isUser` section (lines 291-327) currently shows 4 cards in a `lg:grid-cols-4` grid
- Add 2 new cards:
  - **Lead Tracker**: icon `Target`, color `text-emerald-400`, path `ownClientId ? /clients/${ownClientId}/leads : /leads`
  - **Master Database**: icon `Database`, color `text-cyan-400`, path `/master-database`
- Update grid to `sm:grid-cols-2 lg:grid-cols-3` for 6 cards (2 rows of 3)

**Note:** Master Database path is `/master-database` (the `MasterDatabase.tsx` component), NOT `/clients/:clientId/database` (which routes to the separate `ClientDatabase.tsx` component).

### 3. LeadTracker — Dual Data Source

**File:** `src/pages/LeadTracker.tsx`

**Data fetching:**
- Add `isUser` to the destructured auth values
- Fetch `ownClientId` for subscribers: query `clients` table by `user_id` (same pattern used in Dashboard)
- When `isUser` is true:
  - Fetch leads from Supabase `leads` table directly via `leadService.getLeadsByClient(ownClientId)` (note: the function is `getLeadsByClient`, not `getLeadsByClientId`)
  - Normalize Supabase lead fields to match the existing `Lead` type the UI expects:
    - `name` → `fullName`
    - `status` → `leadStatus`
    - `source` → `leadSource`
    - `created_at` → `createdDate`
    - `email` → `email`
    - `phone` → `phone`
    - `notes` → `notes`
    - `booked` → `booked`
    - `booking_time` → `bookingTime`
    - `id` → `id` (Supabase UUID, not Notion page ID)
    - `client_id` → `client` (mapped to client name if needed)
    - `stopped` → not mapped (LeadTracker Lead type doesn't use it in UI display, but available for Add Lead form)
    - `replied` → not mapped (same as stopped)
    - Other fields: `campaignName` = "", `lastContacted` = `last_contacted_at`, `appointmentDate` = `booking_date`, `notionUrl` = ""
- When `isUser` is false (admin/staff/client): Keep existing `fetch-leads` edge function behavior unchanged

**Add Lead button + dialog:**
- A `+ Add Lead` button in the header/toolbar area
- Visible to: `isUser` (always) and `isAdmin` (always)
- Dialog matches MasterDatabase's lead form fields:
  - Name (required), Email, Phone, Source, Status (select from `ALLOWED_STATUSES`)
  - Follow-up step, Last contacted (date), Next follow-up (date)
  - Checkboxes: Booked, Replied, Stopped
- For `isUser`: `client_id` auto-set to `ownClientId`, no client picker shown
- For `isAdmin`: Client picker shown (fetch clients list)
- On save: `leadService.createLead()` → refresh lead list
- On edit: `leadService.updateLead()` → refresh lead list

**Delete lead (subscriber path):**
- For `isUser`, delete via `leadService.deleteLead(leadId)` or direct Supabase: `supabase.from('leads').delete().eq('id', leadId)`
- For non-subscribers, keep existing Notion `delete-lead` edge function call (note: this edge function may not exist on disk — the existing code calls it but the function directory is unverified; this is a pre-existing issue, not introduced by this design)

**Status update (subscriber path):**
- For `isUser`, update status directly: `leadService.updateLead(id, { status: newStatus })`
- For non-subscribers, keep existing `update-lead-status` edge function

**Notes update (subscriber path):**
- For `isUser`, update notes directly: `leadService.updateLead(id, { notes })`
- For non-subscribers, keep existing `update-lead-notes` edge function

### 4. MasterDatabase — Subscriber Access

**File:** `src/pages/MasterDatabase.tsx`

**What changes:**
- Add `isUser` to the destructured auth values from `useAuth()`
- **Two guards must be updated:**
  1. **Access guard** (line 137-141): Change `if (!loading && user && !isAdmin)` to `if (!loading && user && !isAdmin && !isUser)` — otherwise subscribers get redirected to dashboard
  2. **Data loading condition** (line 144-145): Change `if (!isAdmin || !user) return` to `if ((!isAdmin && !isUser) || !user) return` — otherwise data never loads for subscribers
- For `isUser` subscribers:
  - Fetch `ownClientId` via `clients` table query on `user_id`
  - Auto-filter all data queries (leads, videos) by `client_id === ownClientId`
  - Hide the client filter dropdown (subscriber only sees their own data)
  - In the "Add Lead" dialog, auto-set `client_id` to `ownClientId` and hide the client picker
  - In the "Add Video" dialog, same auto-set behavior
- Route: Already exists at `/master-database`. No new routes needed.

### 5. Subscription Plan Detection

**File:** `src/pages/Dashboard.tsx`

**How:**
- The existing subscription check effect (lines 95-137) already queries `clients.plan_type` but discards it
- Store the result in `userPlanType` state: `const [userPlanType, setUserPlanType] = useState<string | null>(null)`
- In the `checkSubscription` async function, after fetching `data`, set `setUserPlanType(data?.plan_type ?? null)`
- Also set it from the `refreshed` re-query path

### 6. RLS Policy Consideration

The `leads` table is accessed directly from the frontend by subscribers using `supabase.from('leads')`. The existing `leadService.ts` already performs direct Supabase queries (used by MasterDatabase for admins), so RLS policies must already allow authenticated access. However, during implementation, verify that:
- Subscribers can SELECT/INSERT/UPDATE/DELETE rows where `client_id` matches their own client record
- If RLS blocks subscriber queries, add a policy: `USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))`

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Gray out Landing Page card, add Lead Tracker + Master Database cards for subscribers, store `userPlanType` |
| `src/pages/LeadTracker.tsx` | Dual data source (Supabase for subscribers, Notion for others), Add Lead dialog, subscriber-specific CRUD paths |
| `src/pages/MasterDatabase.tsx` | Allow `isUser` access (update both access guard AND data loading condition), auto-scope to own `client_id`, hide client picker for subscribers |

## Not Changed

- `useSubscriptionGuard.ts` — no changes needed
- `leadService.ts` — already has `createLead()`, `updateLead()`, `getLeadsByClient()`
- Edge functions (`fetch-leads`, `update-lead-status`, etc.) — unchanged, still used by admin/client/connectaPlus roles
- Notion integration — completely untouched, still serves connecta_plus and client roles

## Error Handling

- If subscriber has no `client_id` (no record in `clients` table), Lead Tracker and Master Database show an empty state with a message like "No account found. Please complete onboarding first."
- Lead creation validates required fields (name) before submission
- Network errors show toast notifications (existing pattern)

## Testing Checklist

- [ ] Subscriber on starter plan: Landing Page card is grayed out with "Enterprise plan only" label
- [ ] Subscriber on growth plan: Landing Page card is grayed out with "Enterprise plan only" label
- [ ] Subscriber on enterprise plan: Landing Page card is clickable
- [ ] Admin: Landing Page card always clickable
- [ ] Subscriber dashboard shows 6 cards (including Lead Tracker + Master Database)
- [ ] Subscriber Lead Tracker fetches from Supabase `leads` table (not Notion)
- [ ] Subscriber can add a lead via the Add Lead dialog
- [ ] Subscriber can edit lead status/notes directly (via Supabase, not Notion edge functions)
- [ ] Subscriber can delete a lead (via Supabase)
- [ ] Admin Lead Tracker still fetches from Notion (unchanged)
- [ ] Admin can also use Add Lead button (with client picker)
- [ ] Subscriber Master Database shows only their own leads/videos
- [ ] Subscriber Master Database access guard allows entry (not redirected to dashboard)
- [ ] Admin Master Database unchanged (shows all clients)
- [ ] ConnectaPlus/Client roles unchanged (Notion-sourced, no Add Lead button)
- [ ] Subscriber with no client record sees empty state message (not a crash)
- [ ] RLS policies allow subscriber direct Supabase lead queries
