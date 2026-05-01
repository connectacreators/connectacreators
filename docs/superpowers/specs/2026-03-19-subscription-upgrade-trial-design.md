# Subscription Upgrade/Downgrade + Trial-to-Paid — Design Spec

## Problem

The Subscription management page (`/subscription`) has a Change Plan section that is hidden from trial users because the visibility condition only checks for `status === "active"`. Trial users (`status === "trialing"`) cannot see upgrade/downgrade options or convert their trial to a paid subscription.

Additionally, the backend `change-plan` action only searches for `status: "active"` subscriptions, so even if the UI were visible, trial users would get "No active subscription found."

## Goal

1. Make the Change Plan section visible for both `"active"` and `"trialing"` users
2. Add trial-specific UI: trial badge, trial end date, "Activate Now" button
3. Add backend `"end-trial"` action to convert trial to paid immediately
4. Fix backend `change-plan` to also find trialing subscriptions

---

## User Flow

### Active Subscriber
- Sees Change Plan section with 3 plan cards
- Current plan highlighted, upgrade/downgrade badges on others
- Upgrade: prorated charge immediately, bonus credits added
- Downgrade: takes effect next billing cycle, no refund

### Trial User
- Sees trial info banner in status card: "Trial ends {date}" with amber styling
- Sees "Activate Now" button to end trial and start billing immediately
- Sees Change Plan section with 3 plan cards (same as active user)
- Can upgrade/downgrade during trial — this ends trial + switches plan + starts billing
- "Activate Now" keeps current plan, just ends trial early

---

## Architecture

### Modified Files

**`src/pages/Subscription.tsx`**
- Line 400: Add `"trialing"` to Change Plan visibility condition
- Lines 332-372: Add `"trialing"` to status badge styling (amber, like cancel-at-period-end)
- Add trial end date display when `stripeStatus.status === "trialing"` and `trial_end` is available
- Add "Activate Now" button for trial users in the status card
- Add `handleActivateNow` function that calls `stripe-billing-portal` with `action: "end-trial"`

**`supabase/functions/stripe-billing-portal/index.ts`**
- Status action (line 234-252): Add `trial_end: sub.trial_end` and `trial_start: sub.trial_start` to response object
- Change-plan action (line 279-281): Change `status: "active"` to `status: "all"` in subscription list, then filter to find active OR trialing subscription. When subscription is trialing, set `trial_end: "now"` alongside the plan change so billing starts immediately.
- New `"end-trial"` action: Finds trialing subscription, calls `stripe.subscriptions.update(subId, { trial_end: "now" })`. Updates DB `subscription_status` to `"active"`. Returns success message.

### Untouched Files
- `supabase/functions/stripe-webhook/index.ts` — Already handles trialing→active transition and post-trial credit grant (implemented in signup wizard feature)
- `supabase/functions/check-subscription/index.ts` — Already preserves trial credits
- `src/pages/Signup.tsx` — Unrelated to this feature

---

## Frontend Changes (`Subscription.tsx`)

### Visibility Condition Fix
Line 400 — change from:
```typescript
{stripeStatus?.status === "active" && !stripeStatus.cancel_at_period_end && credits?.plan_type && (
```
To:
```typescript
{(stripeStatus?.status === "active" || stripeStatus?.status === "trialing") && !stripeStatus.cancel_at_period_end && credits?.plan_type && (
```

### Trial Status Badge
Add `"trialing"` case to the status badge styling (lines 332-344). Use amber color (same as cancel-at-period-end) with "Trial" text.

### Trial End Date
When `stripeStatus.status === "trialing"` and `stripeStatus.trial_end` exists, show:
```
Trial ends {formatted date}
```

### Activate Now Button
In the status card actions area (next to "Manage" button), add an "Activate Now" button visible only for trial users. On click, calls `handleActivateNow`.

### handleActivateNow Function
```typescript
const handleActivateNow = async () => {
  setActivateLoading(true);
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (!session) throw new Error("Session expired");
    const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
      body: { action: "end-trial" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    toast.success(data.message || "Trial activated! Your subscription is now active.");
    await fetchStripeStatus();
    await refetch();
  } catch (err: any) {
    toast.error(err.message || "Failed to activate subscription");
  } finally {
    setActivateLoading(false);
  }
};
```

### State Addition
Add to existing state declarations:
```typescript
const [activateLoading, setActivateLoading] = useState(false);
```

### stripeStatus Type Update
Add to the existing stripeStatus type:
```typescript
trial_end: number | null;
trial_start: number | null;
```

---

## Backend Changes (`stripe-billing-portal/index.ts`)

### Status Action — Add Trial Fields
In the response object (line 234-252), add:
```typescript
trial_end: sub.trial_end,
trial_start: sub.trial_start,
```

### Change-Plan Action — Support Trial Subscriptions
Line 279-281 — change from:
```typescript
const subscriptions = await stripe.subscriptions.list({
  customer: customerId, status: "active", limit: 1,
});
```
To:
```typescript
const subscriptions = await stripe.subscriptions.list({
  customer: customerId, limit: 5,
});
const subscription = subscriptions.data.find(s => s.status === "active" || s.status === "trialing");
if (!subscription) {
  throw new Error("No active or trialing subscription found.");
}
```

When the found subscription has `status === "trialing"`, end the trial alongside the plan change:
```typescript
const updateParams: any = {
  items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
  proration_behavior: isUpgrade ? "always_invoice" : "none",
};
// End trial immediately when changing plan during trial
if (subscription.status === "trialing") {
  updateParams.trial_end = "now";
}
await stripe.subscriptions.update(subscription.id, updateParams);
```

For trial users changing plan: always treat as an upgrade-like scenario (immediate billing starts):
- Set `subscription_status: "active"` in DB (trial is ending)
- Grant full plan credits for the NEW plan
- Log credit transaction with action `"trial_activation"`

### New "end-trial" Action
```typescript
if (action === "end-trial") {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId, limit: 5,
  });
  const subscription = subscriptions.data.find(s => s.status === "trialing");
  if (!subscription) {
    throw new Error("No trial subscription found.");
  }

  await stripe.subscriptions.update(subscription.id, {
    trial_end: "now",
  });

  // Stripe will fire invoice.payment_succeeded webhook which handles:
  // - Setting subscription_status to "active"
  // - Granting full plan credits
  // - Logging credit transaction

  return new Response(JSON.stringify({
    success: true,
    message: "Trial ended. Your subscription is now active and billing has started.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Trial user clicks "Activate Now" | Calls end-trial action, Stripe charges card, webhook grants full credits |
| Trial user changes plan | Ends trial + switches plan in one Stripe API call, webhook grants new plan's credits |
| Trial user downgrades | Still ends trial immediately (can't downgrade to a plan you haven't paid for yet), charges new plan price |
| Active user upgrades | Existing behavior unchanged: prorated charge, bonus credits |
| Active user downgrades | Existing behavior unchanged: next billing cycle, no refund |
| User with canceled subscription | Change Plan section hidden (cancel_at_period_end check) |
| Card decline on trial activation | Stripe handles the error, subscription stays in trialing state |

---

## Verification

1. `npm run build` — no TypeScript errors
2. Trial user sees Change Plan section
3. Trial user sees trial badge with end date in status card
4. Trial user can click "Activate Now" — trial ends, subscription becomes active, full credits granted
5. Trial user can change plan — trial ends, new plan active, full credits for new plan
6. Active user upgrade/downgrade works as before (no regression)
7. Status card shows correct trial_end date from Stripe
