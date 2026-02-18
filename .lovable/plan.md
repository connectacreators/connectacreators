

# Subscription Cancellation Access + Upgrade with Proration

## What Will Change

### 1. "Available until" text after cancellation
When a user cancels their subscription, the Subscription page will show an "Available until [date]" message next to their plan badge. The date will be the last day of their current billing period (the day before their next payment would have been). This makes it clear they still have full access until that date.

### 2. Keep access during "canceling" status
The subscription guard (`useSubscriptionGuard`) currently only allows `active` and `pending_contact` statuses. It will be updated to also allow `canceling` status, so users who canceled but are still within their billing period retain full dashboard access.

### 3. Upgrade Plan flow
The "Upgrade Plan" button will navigate to `/select-plan` but the page will be updated to:
- Detect the user's current plan and hide it (or mark it as "Current Plan")
- Show the remaining plans as selectable options
- When a plan is selected, instead of creating a brand new subscription, call a new `upgrade-subscription` edge function

### 4. New `upgrade-subscription` edge function
This function will:
- Find the user's active Stripe subscription
- Swap the subscription item (price) to the new plan using `stripe.subscriptions.update()`
- Set `proration_behavior: "always_invoice"` so Stripe automatically charges the prorated difference (new plan cost minus what they already paid for the current period)
- Update the `clients` table with the new plan type and limits
- The user does NOT need to re-enter their card details since their payment method is already on file

### 5. Subscription page improvements
- Show "Available until [date]" when `cancel_at_period_end` is true
- Change the "Next Payment" label to "Access ends" when subscription is canceling

## Technical Details

### Files to modify:
- `src/hooks/useSubscriptionGuard.ts` -- add "canceling" to allowed statuses
- `src/pages/Subscription.tsx` -- show "Available until" date for canceled subscriptions
- `src/pages/SelectPlan.tsx` -- detect current plan, hide it or mark as current, handle upgrade flow
- `supabase/config.toml` -- register new edge function

### Files to create:
- `supabase/functions/upgrade-subscription/index.ts` -- new edge function for plan upgrades with Stripe proration

### Upgrade subscription edge function logic:
1. Authenticate the user
2. Get their `stripe_customer_id` from the `clients` table
3. List active subscriptions for that customer
4. Get the current subscription item ID
5. Call `stripe.subscriptions.update()` with:
   - Delete the old subscription item
   - Add the new price
   - `proration_behavior: "always_invoice"` (charges the difference immediately)
6. Update the `clients` table with the new `plan_type`, `script_limit`, and feature flags
7. Return success

### Proration example:
If a user is on Starter ($30/month) and upgrades to Growth ($60/month) halfway through their billing cycle:
- They've used $15 worth of Starter
- They owe $30 for the remaining half of Growth
- Stripe charges them $30 - $15 = $15 prorated difference immediately
- Next month they pay the full $60

### SelectPlan.tsx changes:
- Accept an optional `?upgrade=true` query param
- If upgrading, fetch the user's current `plan_type` from the `clients` table
- Filter out or disable the current plan card
- When a plan is selected during upgrade, call `upgrade-subscription` instead of navigating to `/checkout`
- Show a confirmation toast on success and redirect to `/subscription`

### Subscription guard update:
Allow `canceling` status so users keep access:
```
subscription_status === "active" ||
subscription_status === "pending_contact" ||
subscription_status === "canceling"
```

