
# Subscription Selection Step in Registration Flow

## Overview
Add a plan selection page that appears after a user signs up and before they access the dashboard. This involves database changes to store plan/subscription data on the `clients` table, a new `/select-plan` page with 5 plan cards, and routing logic to redirect new users to plan selection.

## Database Changes

Add the following columns to the existing `clients` table:
- `plan_type` (text, nullable, default null) -- starter, growth, enterprise, connecta_dfy, connecta_plus
- `script_limit` (integer, nullable, default 75)
- `scripts_used` (integer, default 0)
- `lead_tracker_enabled` (boolean, default false)
- `facebook_integration_enabled` (boolean, default false)
- `subscription_status` (text, default 'inactive') -- active, inactive, pending_contact

RLS: Clients can already read their own record. We need to add an UPDATE policy so clients can update their own plan fields (or use the existing admin policy + a new self-update policy).

## New Page: `/select-plan`

Create `src/pages/SelectPlan.tsx`:
- Protected route (requires auth)
- Displays 5 plan cards in a responsive grid
- Each card shows: plan name, price, description, feature list, and CTA button
- Plans 1-3 (Starter, Growth, Enterprise): on click, update the user's `clients` record with the corresponding plan data and redirect to `/dashboard`
- Plans 4-5 (Connecta Plan, Connecta Plus): on click, update the record with `pending_contact` status and redirect to a "Coming Soon" confirmation view

## New Page: `/coming-soon`

Create `src/pages/ComingSoon.tsx`:
- Simple page with title "Coming Soon" and message "Scheduling will be available soon. Our team will contact you shortly."
- Button to go back to dashboard

## Routing Changes

In `App.tsx`:
- Add `/select-plan` route pointing to `SelectPlan`
- Add `/coming-soon` route pointing to `ComingSoon`

## Post-Signup Redirect Logic

In the `Dashboard` component, after the user is authenticated:
- Query the `clients` table for the current user
- If `plan_type` is null, redirect to `/select-plan`
- Otherwise, show the dashboard normally

This ensures that new users who haven't picked a plan are sent to the selection page.

## Technical Details

### Migration SQL
```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plan_type text,
  ADD COLUMN IF NOT EXISTS script_limit integer DEFAULT 75,
  ADD COLUMN IF NOT EXISTS scripts_used integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_tracker_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS facebook_integration_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';
```

Add RLS policy for clients to update their own subscription fields:
```sql
CREATE POLICY "Client can update own plan"
  ON public.clients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### Plan Card UI
- Cards arranged in a scrollable horizontal layout on mobile, grid on desktop
- Plans 1-3 show dollar prices; Plans 4-5 show "Contact our team"
- Enterprise plan highlighted as "Most Popular" or similar badge
- Each card lists features with checkmark icons

### SelectPlan Page Flow
1. Fetch the user's `clients` record to get their `client_id`
2. On plan selection, update the `clients` row with `plan_type`, `script_limit`, `scripts_used`, `lead_tracker_enabled`, `facebook_integration_enabled`, `subscription_status`
3. For plans 1-3: redirect to `/dashboard`
4. For plans 4-5: redirect to `/coming-soon`

### Dashboard Guard
Add a `useEffect` in `Dashboard.tsx` that checks:
```typescript
const { data } = await supabase
  .from("clients")
  .select("plan_type")
  .eq("user_id", user.id)
  .maybeSingle();

if (data && !data.plan_type) {
  navigate("/select-plan");
}
```
