

# Fix Payment Verification + Subscription Management Overhaul

## Problem
After completing a Stripe payment, the `/payment-success` page shows "Something went wrong" because the `check-subscription` edge function crashes with an `"Invalid time value"` error. The Stripe API version `2025-08-27.basil` returns `current_period_end` in a format that fails when multiplied by 1000 and passed to `new Date()`. This means subscriptions are never verified and users get stuck.

Additionally, the Subscription management page lacks cancel and upgrade functionality, and there is no cancellation questionnaire flow.

## What Will Be Fixed/Built

### 1. Fix the `check-subscription` edge function (root cause)
- Add defensive handling for `current_period_end` -- check if it's already a Date/string or a Unix timestamp before converting
- Add more logging around the subscription data to catch future issues
- Add a retry with longer delays in `PaymentSuccess.tsx` (up to 3 retries with exponential backoff) since Stripe can take a few seconds to finalize

### 2. Fix `PaymentSuccess.tsx` retry logic
- Implement proper retry with multiple attempts (3 retries, 3s/5s/8s delays)
- Show a "Retry" button on error state instead of just "Go to Dashboard"
- If all retries fail, still redirect to dashboard (the subscription guard will handle redirecting if needed)

### 3. Add Cancel Subscription flow in Subscription page
- Add a small "Cancel Subscription" text link at the bottom of the current plan card
- Clicking it opens a modal dialog with:
  - Header: "We're sad to see you go"
  - Multiple-choice questionnaire asking the reason for canceling:
    - "Too expensive"
    - "Not using it enough"
    - "Found a better alternative"
    - "Missing features I need"
    - "Other"
  - Optional text field for additional feedback
  - "Next" button (disabled until a reason is selected)
- After clicking Next, the subscription is canceled via a new `cancel-subscription` edge function
- Show confirmation message and update the UI

### 4. Create `cancel-subscription` edge function
- Authenticates the user
- Looks up their `stripe_customer_id` from the `clients` table
- Cancels the subscription at period end (`cancel_at_period_end: true`) so they keep access until the billing cycle ends
- Updates `clients.subscription_status` to "canceling"
- Returns success/failure

### 5. Add Upgrade Plan option
- Add an "Upgrade Plan" button that navigates to `/select-plan` where they can pick a different tier
- The existing checkout flow will handle creating a new subscription

### 6. Invoice download (already working)
- The current Subscription page already has invoice download buttons via the `get-subscription` edge function. This is confirmed working -- each invoice row has a download icon that opens the Stripe PDF.

## Technical Details

### Files to modify:
- `supabase/functions/check-subscription/index.ts` -- fix date handling
- `src/pages/PaymentSuccess.tsx` -- better retry logic
- `src/pages/Subscription.tsx` -- add cancel flow with questionnaire modal, upgrade button

### Files to create:
- `supabase/functions/cancel-subscription/index.ts` -- new edge function

### Edge function: cancel-subscription
- Accepts POST with `{ reason: string, feedback?: string }`
- Uses service role key to update client record
- Calls `stripe.subscriptions.update(subId, { cancel_at_period_end: true })` to cancel gracefully
- Logs the cancellation reason for business analytics

### Cancel Questionnaire UI
- Radix Dialog modal triggered by a small muted text link "Cancel subscription"
- Step 1: Radio buttons with reasons, "Next" button
- Step 2: Confirmation screen showing "Your subscription will remain active until [end date]"
- After confirmation, the subscription page refreshes to show updated status with a "Cancels at end of period" badge (already exists in the UI)

