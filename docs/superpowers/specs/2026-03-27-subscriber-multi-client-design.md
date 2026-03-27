# Subscriber Multi-Client Management — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Allow subscribers (starter/growth/enterprise) to manage multiple clients

## Summary

Subscribers currently manage a single client (themselves). This feature enables subscribers to manage multiple clients — their own account as permanent client #1, plus additional clients up to their plan limit.

- **Starter:** 5 clients (self + 4)
- **Growth:** 10 clients (self + 9)
- **Enterprise:** 20 clients (self + 19)
- **Connecta / Connecta Plus:** 1 client only (personalized plans)

All clients share the subscriber's credit pool. Credits, subscription status, and billing fields live on the primary client record only.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client model | Subscriber is always client #1 (permanent) + N additional | Simplest mental model for subscribers |
| Credit pool | Shared — one balance across all clients | Avoids credit allocation overhead |
| Client limit | Per-plan (5/10/20) | Scales with plan value |
| Data model | Junction table (`subscriber_clients`) | Clean separation, future-proof for client logins |
| Client selector | Same dropdown pattern as admin | Consistent UX, includes Master view |
| Client creation | Name required, everything else optional | Low friction; onboarding form available later |
| Client logins | Not now, but design for it | Junction table supports future client auth without rewrite |

## Current State & Issues

### Architecture

- `clients.user_id` creates a 1:1 user→client relationship
- `clients.owner_user_id` exists but is only used in `Clients.tsx`
- `showClientSelector = isAdmin || isVideographer` — subscribers excluded
- Dashboard forcibly resets subscriber viewMode to "master"
- All sidebar links hardcoded to `ownClientId`

### Critical Bugs That Must Be Fixed

**1. `.maybeSingle()` bombs (12+ locations)**

Frontend and edge functions query `clients` by `user_id` expecting one result. With 2+ clients per user, these return an arbitrary record or crash.

Affected frontend files:
- `Dashboard.tsx` — `ownClientId` lookup (3 calls)
- `DashboardSidebar.tsx` — `ownClientId` lookup
- `Scripts.tsx` — client name display
- `LeadTracker.tsx` — client + plan check
- `useSubscriptionGuard.ts` — subscription status check
- `useCredits.ts` — credit balance fetch

Affected edge functions:
- `transcribe-video` — credit deduction
- `ai-assistant` — credit deduction
- `batch-generate-scripts` — credit deduction
- `transcribe-canvas-media` — credit deduction
- `check-subscription` — plan sync
- `upgrade-subscription` — uses `.single()` (will ERROR)
- `stripe-webhook` — ambiguous client match

**2. Bulk update corruption**

`check-subscription` and `upgrade-subscription` do `.update().eq("user_id")` which overwrites ALL client records for that user with the same plan/credits.

**3. `user_id` vs `owner_user_id` inconsistency**

`Clients.tsx` creates subscriber clients with `owner_user_id`, but everything else (edge functions, LeadTracker, RLS policies) uses `user_id`. Additional clients created by subscribers are invisible to most of the app.

**4. Stripe webhook ambiguity**

`getClientBySubscription()` looks up by `user_id` with `.maybeSingle()`. With multiple clients per user, it can't determine which client to update.

## Data Model

### New Table: `subscriber_clients`

```sql
CREATE TABLE subscriber_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscriber_user_id, client_id)
);

-- Only one primary per subscriber
CREATE UNIQUE INDEX subscriber_clients_one_primary
  ON subscriber_clients (subscriber_user_id)
  WHERE is_primary = true;

CREATE INDEX subscriber_clients_user_idx ON subscriber_clients (subscriber_user_id);
CREATE INDEX subscriber_clients_client_idx ON subscriber_clients (client_id);
```

### New Column: `subscriptions.client_limit`

```sql
ALTER TABLE subscriptions ADD COLUMN client_limit INTEGER NOT NULL DEFAULT 1;
```

Set by plan:
- starter → 5
- growth → 10
- enterprise → 20
- connecta_dfy → 1
- connecta_plus → 1

### New RLS Helper Functions

```sql
-- Does the current user own this client via subscriber_clients?
CREATE FUNCTION is_subscriber_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE subscriber_user_id = auth.uid()
    AND client_id = _client_id
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- Get the primary client_id for the current user
CREATE FUNCTION get_primary_client_id() RETURNS UUID AS $$
  SELECT client_id FROM subscriber_clients
  WHERE subscriber_user_id = auth.uid()
  AND is_primary = true
$$ LANGUAGE sql SECURITY DEFINER;
```

### Updated RLS Policies

Applied to `clients`, `scripts`, `video_edits`, `leads`, `content_calendar`, and all other client-linked tables:

```
SELECT: is_admin() OR user_id = auth.uid() OR is_subscriber_client(id) OR is_assigned_client(id)
UPDATE: is_admin() OR user_id = auth.uid() OR is_subscriber_client(id)
INSERT: is_admin() OR is_subscriber_client(NEW.client_id)  -- for child tables
DELETE: is_admin() OR (is_subscriber_client(id) AND NOT is_primary_client(id))
```

Additional helper for delete protection:
```sql
CREATE FUNCTION is_primary_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE client_id = _client_id
    AND is_primary = true
  )
$$ LANGUAGE sql SECURITY DEFINER;
```

`subscriber_clients` table policies:
```
SELECT: is_admin() OR subscriber_user_id = auth.uid()
INSERT: is_admin() OR subscriber_user_id = auth.uid()
DELETE: is_admin() OR (subscriber_user_id = auth.uid() AND NOT is_primary)
```

### Migration Strategy

Zero-downtime migration for existing subscribers:

1. Create `subscriber_clients` table + indexes + RLS + helper functions
2. Add `client_limit` column to `subscriptions`
3. Backfill from `clients.user_id`:
   ```sql
   INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
   SELECT user_id, id, true FROM clients WHERE user_id IS NOT NULL
   ON CONFLICT DO NOTHING;
   ```
4. Backfill from `clients.owner_user_id` (existing multi-client attempts):
   ```sql
   INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
   SELECT owner_user_id, id, false FROM clients
   WHERE owner_user_id IS NOT NULL
   AND (user_id IS NULL OR owner_user_id != user_id)
   ON CONFLICT DO NOTHING;
   ```
5. Set `client_limit` based on existing plan_type:
   ```sql
   UPDATE subscriptions SET client_limit = CASE
     WHEN plan_type = 'starter' THEN 5
     WHEN plan_type = 'growth' THEN 10
     WHEN plan_type = 'enterprise' THEN 20
     ELSE 1
   END;
   ```
6. Keep `user_id` and `owner_user_id` columns temporarily — new code reads from junction table, old code still works during rollout.

## Shared Credit Pool

The primary client record is the single source of truth for billing:

**Primary client holds:**
- `credits_balance`, `credits_used`, `credits_monthly_cap`
- `scripts_used`, `script_limit`
- `channel_scrapes_used`, `channel_scrapes_limit`
- `plan_type`, `subscription_status`
- `stripe_customer_id`, `trial_ends_at`, `credits_reset_at`

**Additional clients:** No billing fields used. All credit deductions happen against the primary client record.

**Edge function pattern (all credit-consuming functions):**
1. Frontend sends `client_id` in request body (the client being worked on)
2. Edge function verifies subscriber owns this client via `subscriber_clients`
3. Edge function looks up primary client: `subscriber_clients WHERE subscriber_user_id = userId AND is_primary = true`
4. Deducts credits from primary client record: `.update().eq("id", primaryClientId)`

## Edge Function Fixes

### All credit-consuming functions

**transcribe-video, ai-assistant, batch-generate-scripts, transcribe-canvas-media, suggest-hooks:**

Replace:
```typescript
.from("clients").select("credits_balance").eq("user_id", userId).maybeSingle()
```

With:
```typescript
// 1. Look up primary client for credit check
const { data: primaryLink } = await adminClient
  .from("subscriber_clients")
  .select("client_id")
  .eq("subscriber_user_id", userId)
  .eq("is_primary", true)
  .single();

// 2. Fetch credit balance from primary
const { data: client } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("id", primaryLink.client_id)
  .single();

// 3. Deduct from primary
await adminClient.from("clients")
  .update({ credits_balance: client.credits_balance - cost })
  .eq("id", primaryLink.client_id);
```

### check-subscription

Replace `.eq("user_id", user.id)` bulk update with:
```typescript
// SELECT primary client
const primaryClientId = await getPrimaryClientId(adminClient, user.id);
// UPDATE only primary
await supabaseClient.from("clients").update(clientUpdate).eq("id", primaryClientId);
```

### upgrade-subscription

Replace `.eq("user_id", user.id).single()` (which crashes with 2+ clients) with:
```typescript
const primaryClientId = await getPrimaryClientId(supabaseClient, user.id);
const { data: clientData } = await supabaseClient
  .from("clients")
  .select("stripe_customer_id, plan_type")
  .eq("id", primaryClientId)
  .single();
// Update only primary
await supabaseClient.from("clients").update(planUpdate).eq("id", primaryClientId);
```

### stripe-webhook

Replace ambiguous `getClientBySubscription()` lookup with:
```typescript
// Primary: metadata.supabase_user_id → subscriber_clients → primary client
const userId = sub.metadata?.supabase_user_id;
if (userId) {
  const { data: link } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .single();
  if (link) return link.client_id;
}
// Fallback: stripe_customer_id on clients table (unchanged)
```

### create-subscriber-user

After creating the auth user and client record, also create the junction table entry:
```typescript
await adminClient.from("subscriber_clients").insert({
  subscriber_user_id: userId,
  client_id: clientRecord.id,
  is_primary: true,
});
```

### stripe-webhook (subscription.created)

When a new subscription is created and the client record is initialized, also create the junction entry:
```typescript
await adminClient.from("subscriber_clients").upsert({
  subscriber_user_id: userId,
  client_id: clientId,
  is_primary: true,
}, { onConflict: "subscriber_user_id, client_id" });
```

Also set `client_limit` on the subscriptions record based on plan.

## Scope Boundaries

**Admin behavior is unchanged.** Admin continues to see all clients via existing RLS `is_admin()` policies, uses the same client selector, and is not routed through `subscriber_clients`. The junction table only applies to the `user` role (subscribers).

**Connecta / Connecta Plus plans** remain single-client (`client_limit = 1`). The client selector will not appear for these roles since they use the `connecta_plus` or `client` role, not `user`.

## Frontend Changes

### New Hook: `usePrimaryClient()`

Replaces all `.from("clients").eq("user_id").maybeSingle()` calls:

```typescript
function usePrimaryClient() {
  // Returns { primaryClientId, primaryClient, loading }
  // Queries: subscriber_clients WHERE subscriber_user_id = user.id AND is_primary = true
  // Joins: clients(id, name, plan_type, credits_balance, subscription_status, ...)
}
```

Used by: `Dashboard.tsx`, `DashboardSidebar.tsx`, `Scripts.tsx`, `LeadTracker.tsx`, `useSubscriptionGuard.ts`, `useCredits.ts`

This hook replaces all `ownClientId` lookups (the "who am I" query). It is NOT the same as `selectedClientId` — that comes from viewMode/localStorage and represents which client the user is currently viewing in the dropdown.

### Client Selector Dropdown

**Change:** `showClientSelector = isAdmin || isVideographer || isUser`

Subscriber-specific additions to existing dropdown:
- Client count badge: `3/5` (used / limit)
- "PRIMARY" label on self entry
- "+ Add Client" button at bottom with remaining slots count
- Inline name input on click → creates client + junction row → auto-selects new client
- After creation, prompt: "Open Onboarding?" / "Later"

### Sidebar Navigation (DashboardSidebar.tsx)

For `isUser` role:
- Add client selector at top (same as admin/videographer)
- Add "My Clients" nav item (links to `/clients`)
- Replace all `ownClientId` references with `selectedClientId` from viewMode
- Add Lead Tracker to subscriber nav items

```typescript
if (isUser) {
  return [
    { label: "Home", icon: Home, path: "/dashboard" },
    { label: "My Clients", icon: Users, path: "/clients" },
    { label: "Connecta AI", icon: Bot, path: selectedClientId ? `/clients/${selectedClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
    { label: "Scripts", icon: FileText, path: selectedClientId ? `/clients/${selectedClientId}/scripts` : "/scripts" },
    { label: "Editing Queue", icon: Clapperboard, path: selectedClientId ? `/clients/${selectedClientId}/editing-queue` : "/editing-queue" },
    { label: "Content Calendar", icon: Calendar, path: selectedClientId ? `/clients/${selectedClientId}/content-calendar` : "/content-calendar" },
    { label: "Booking", icon: Clock, path: selectedClientId ? `/clients/${selectedClientId}/booking-settings` : "/dashboard" },
    { label: "Lead Tracker", icon: Target, path: selectedClientId ? `/clients/${selectedClientId}/leads` : "/leads" },
    { label: "Viral Today", icon: Flame, path: "/viral-today" },
    { label: "Subscription", icon: CreditCard, path: "/subscription" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ];
}
```

### Dashboard.tsx

- Remove the subscriber viewMode reset block (lines 104-111)
- Enable client list fetch for subscribers (`showClientSelector` now includes `isUser`)
- `ownClientId` fetch changes to use `usePrimaryClient()` hook
- ViewMode system works identically to admin: master / me / specific-client-UUID

### Client List Fetch (for subscriber dropdown)

```typescript
// For subscribers: fetch via junction table
const { data } = await supabase
  .from("subscriber_clients")
  .select("client_id, is_primary, clients(id, name)")
  .eq("subscriber_user_id", user.id)
  .order("is_primary", { ascending: false })
  .order("created_at");
```

Admin/videographer fetch remains unchanged (RLS-filtered `clients` table directly).

### "My Clients" Page

Modify the existing `Clients.tsx` (not a new component). When `isUser`, render card-based layout. When `isAdmin`, keep current list layout unchanged. Specifics for subscriber view:
- Card-based grid layout
- Each card shows: name, date added, activity summary (script/video/lead counts)
- Primary client: cyan border, "PRIMARY · Your Account" label, no delete button
- Other clients: settings gear (→ onboarding), delete button (with confirmation)
- Empty slots: dashed border, shows remaining capacity
- Header: "My Clients" title, `3 of 5 client slots used · Starter Plan`, "+ Add Client" button
- Plan limit enforced: "Add Client" disabled when at capacity, shows upgrade prompt

### Existing Pages (No Changes Needed)

These pages already use `clientId` from URL params and will work with multi-client once the selector updates the URL:
- `ContentCalendar.tsx`
- `EditingQueue.tsx`
- `LeadCalendar.tsx`
- `BookingSettings.tsx`
- `Vault.tsx`
- `PublicOnboarding.tsx`

## Testing Plan

### Database
- Junction table backfill produces correct primary/non-primary entries
- RLS policies: subscriber can only see/modify their own clients
- RLS policies: subscriber can't delete primary client
- Client limit enforcement: can't exceed plan limit
- `is_subscriber_client()` and `get_primary_client_id()` return correct results

### Edge Functions
- Credit deduction always targets primary client regardless of which client the action is for
- `check-subscription` updates only primary, not all clients
- `upgrade-subscription` works with 2+ clients (no `.single()` crash)
- `stripe-webhook` finds primary client deterministically
- `create-subscriber-user` creates junction entry with `is_primary = true`

### Frontend
- Subscriber sees client selector in sidebar
- Can switch between Master / Me / specific client
- Sidebar links update to selected client context
- "My Clients" page shows all clients with correct counts
- Can add client (name only) → junction row created → selector updated
- Can delete non-primary client → junction row + client record removed
- Can't delete primary client (no delete button shown)
- `usePrimaryClient()` returns consistent primary across all components
- Credit display always shows primary client balance regardless of selected client
