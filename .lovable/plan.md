
# Stripe Subscription Integration for Connecta

## Overview
Integrate Stripe to handle real payments for the 3 paid plans (Starter, Growth, Enterprise). When a user selects a plan on `/select-plan`, instead of just writing to the database, they'll be redirected to Stripe Checkout to complete payment. Once paid, their plan data gets saved and they can access the CRM. Users without an active subscription are blocked from CRM pages.

The "Contact our team" plans (Connecta Plan, Connecta Plus) remain as-is since they don't involve Stripe.

## What Changes

### 1. Create Stripe Products and Prices
Create 3 recurring subscription products in Stripe:
- **Starter** -- $30/month
- **Growth** -- $60/month  
- **Enterprise** -- $150/month

### 2. New Edge Function: `create-checkout`
When a user clicks a plan on `/select-plan`:
- Authenticates the user
- Looks up or creates a Stripe customer
- Saves the `stripe_customer_id` on the `clients` table
- Creates a Stripe Checkout session in `subscription` mode with the correct price
- Passes the selected `plan_type` as metadata so we can use it after payment
- Returns the checkout URL for redirect

### 3. New Edge Function: `check-subscription`
Called on app load and after checkout to verify subscription status:
- Checks Stripe for an active subscription for the user
- Updates the `clients` table with the correct `plan_type`, `script_limit`, `lead_tracker_enabled`, etc. based on the active subscription's product
- Returns `{ subscribed: true/false, plan_type, ... }`

### 4. Update `SelectPlan.tsx`
For plans 1-3 (Starter, Growth, Enterprise):
- Instead of directly updating the database, call the `create-checkout` edge function
- Redirect the user to Stripe Checkout in a new tab
- Add a success route that verifies the subscription and redirects to dashboard

For plans 4-5 (Contact plans):
- Keep existing behavior (save to DB, redirect to `/coming-soon`)

### 5. New Page: `/payment-success`
Simple page that:
- Calls `check-subscription` to sync Stripe status to the database
- Shows a success message
- Redirects to `/dashboard`

### 6. CRM Access Guard
Add a subscription check to protected CRM pages (`/scripts`, `/leads`, `/lead-calendar`):
- On load, check the user's `subscription_status` from the `clients` table
- If not `active` or `pending_contact`, redirect to `/select-plan`
- Admin users bypass this check

### 7. Update Dashboard Guard
The existing dashboard guard already redirects users without a `plan_type` to `/select-plan`. We enhance it to also check `subscription_status` -- if it's `inactive`, redirect to `/select-plan`.

## Technical Details

### Stripe Products to Create
| Plan | Product Name | Price | Interval |
|------|-------------|-------|----------|
| Starter | Connecta Starter | $30 | monthly |
| Growth | Connecta Growth | $60 | monthly |
| Enterprise | Connecta Enterprise | $150 | monthly |

### Edge Function: `create-checkout` (new file)
```
supabase/functions/create-checkout/index.ts
```
- Accepts `{ plan_type: string }` in the request body
- Maps plan_type to the corresponding Stripe price ID
- Creates checkout session with `mode: "subscription"`
- Stores `plan_type` in session metadata for later reference
- Success URL: `/payment-success`
- Cancel URL: `/select-plan`

### Edge Function: `check-subscription` (new file)
```
supabase/functions/check-subscription/index.ts
```
- Authenticates user via JWT
- Looks up Stripe customer by email
- Checks for active subscription
- Maps the Stripe product ID back to plan_type
- Updates `clients` table with correct plan data (script_limit, lead_tracker_enabled, etc.)
- Returns subscription status

### Plan-to-Limits Mapping (used in check-subscription)
```text
starter:    script_limit=75,  lead_tracker=false, fb_integration=false
growth:     script_limit=200, lead_tracker=false, fb_integration=false
enterprise: script_limit=500, lead_tracker=true,  fb_integration=true
```

### New Page: `src/pages/PaymentSuccess.tsx`
- Calls `check-subscription` on mount
- Shows loading spinner, then success message
- Auto-redirects to `/dashboard` after 3 seconds

### Route Addition in `App.tsx`
- Add `/payment-success` route

### CRM Guard Component
Create a reusable hook or wrapper that checks `subscription_status` from the `clients` table. Apply it to:
- `Scripts.tsx`
- `LeadTracker.tsx`
- `LeadCalendar.tsx`
- `Dashboard.tsx` (enhance existing guard)

Admin users (checked via `useAuth().isAdmin`) skip this check.

### Config: `supabase/config.toml`
Add JWT verification bypass for the new functions:
```toml
[functions.create-checkout]
verify_jwt = false

[functions.check-subscription]
verify_jwt = false
```

### Files to Create
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/check-subscription/index.ts`
- `src/pages/PaymentSuccess.tsx`

### Files to Modify
- `src/pages/SelectPlan.tsx` -- call create-checkout for paid plans
- `src/App.tsx` -- add PaymentSuccess route
- `src/pages/Dashboard.tsx` -- enhance guard to check subscription_status
- `src/pages/Scripts.tsx` -- add subscription guard
- `src/pages/LeadTracker.tsx` -- add subscription guard
- `src/pages/LeadCalendar.tsx` -- add subscription guard
- `supabase/config.toml` -- add function configs (handled automatically)
