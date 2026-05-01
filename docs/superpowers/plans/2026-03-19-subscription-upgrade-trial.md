# Subscription Upgrade/Downgrade + Trial-to-Paid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Change Plan section visible for trial users, add trial-specific UI with "Activate Now" button, and add backend support for ending trials early and changing plans during trial.

**Architecture:** Minimal changes to existing `Subscription.tsx` (fix visibility condition, add trial UI) and `stripe-billing-portal/index.ts` (add trial fields to status response, support trialing subscriptions in change-plan, add end-trial action). No webhook changes needed — existing code handles trialing→active transitions.

**Tech Stack:** React, TypeScript, Stripe API, Supabase Edge Functions (Deno), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-subscription-upgrade-trial-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Modify** | `supabase/functions/stripe-billing-portal/index.ts` | Add trial fields to status, fix change-plan for trialing, add end-trial action |
| **Modify** | `src/pages/Subscription.tsx` | Fix visibility, add trial UI, add activate button |

---

### Task 1: Update stripe-billing-portal — Add Trial Support

**Files:**
- Modify: `supabase/functions/stripe-billing-portal/index.ts`

- [ ] **Step 1: Add trial fields to status response**

In the status action response object (around line 234-252), add `trial_end` and `trial_start` fields. Find the response JSON object inside the `if (action === "status")` block and add after the `created: sub.created` line:

```typescript
trial_end: sub.trial_end,
trial_start: sub.trial_start,
```

- [ ] **Step 2: Fix change-plan to find trialing subscriptions**

In the change-plan action (around line 279-284), replace:
```typescript
const subscriptions = await stripe.subscriptions.list({
  customer: customerId, status: "active", limit: 1,
});
if (subscriptions.data.length === 0) {
  throw new Error("No active subscription found. Please subscribe first.");
}

const subscription = subscriptions.data[0];
```

With:
```typescript
const subscriptions = await stripe.subscriptions.list({
  customer: customerId, limit: 5,
});
const subscription = subscriptions.data.find(s => s.status === "active" || s.status === "trialing");
if (!subscription) {
  throw new Error("No active or trialing subscription found. Please subscribe first.");
}
```

- [ ] **Step 3: End trial when changing plan during trial**

In the change-plan action, after `const isUpgrade = newAmount > currentAmount;` (around line 297), replace the existing upgrade/downgrade blocks with trial-aware logic:

```typescript
const isTrial = subscription.status === "trialing";

if (isTrial) {
  // Trial user changing plan: end trial + switch plan + start billing
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
    trial_end: "now",
    proration_behavior: "none",
  });
} else if (isUpgrade) {
  // Active user upgrade: charge prorated difference immediately
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
    proration_behavior: "always_invoice",
  });
} else {
  // Active user downgrade: no refund, change at next billing cycle
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
    proration_behavior: "none",
  });
}
```

Then update the DB update block: for trial users, set `subscription_status: "active"` and grant full new plan credits (not bonus). Replace the credit calculation block (around lines 314-338):

```typescript
const { data: clientRow } = await supabaseClient
  .from("clients")
  .select("credits_balance, credits_monthly_cap")
  .eq("user_id", user.id)
  .maybeSingle();

const currentCap = clientRow?.credits_monthly_cap ?? 0;
const currentBalance = clientRow?.credits_balance ?? 0;

// Trial: grant full new plan credits. Upgrade: add bonus credits. Downgrade: keep current balance.
let newBalance: number;
if (isTrial) {
  newBalance = config.credits_monthly_cap; // Full credits for new plan
} else if (isUpgrade) {
  newBalance = currentBalance + Math.max(0, config.credits_monthly_cap - currentCap);
} else {
  newBalance = currentBalance;
}

await supabaseClient.from("clients").update({
  plan_type: config.plan_type,
  script_limit: config.script_limit,
  lead_tracker_enabled: config.lead_tracker_enabled,
  facebook_integration_enabled: config.facebook_integration_enabled,
  subscription_status: "active",
  credits_monthly_cap: config.credits_monthly_cap,
  channel_scrapes_limit: config.channel_scrapes_limit,
  credits_balance: newBalance,
  credits_used: isTrial ? 0 : undefined,
  trial_ends_at: isTrial ? null : undefined,
}).eq("user_id", user.id);
```

Update the success message to handle trial activation:
```typescript
return new Response(JSON.stringify({
  success: true,
  plan: newPlan,
  is_upgrade: isUpgrade,
  message: isTrial
    ? `Activated ${config.plan_type} plan! Your trial has ended and billing has started.`
    : isUpgrade
    ? `Upgraded to ${config.plan_type}! The prorated amount has been charged and your credits have been topped up.`
    : `Downgrade to ${config.plan_type} scheduled. Your current plan remains active until the next billing cycle. No refund is issued.`,
}), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
```

- [ ] **Step 4: Add end-trial action**

Add before the `throw new Error("Unknown action: ${action}")` line (around line 364):

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

  // Get plan config to grant full credits
  const priceId = subscription.items.data[0]?.price?.id;
  const PLAN_PRICE_MAP: Record<string, string> = {
    starter:    Deno.env.get("STRIPE_PRICE_STARTER")    || "price_1TCX3SCp1qPE081LCBJc8avw",
    growth:     Deno.env.get("STRIPE_PRICE_GROWTH")     || "price_1TCX3SCp1qPE081LSkPmF8FN",
    enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
  };
  const PLAN_CREDITS: Record<string, number> = {
    starter: 10000, growth: 30000, enterprise: 75000,
  };

  const planKey = Object.entries(PLAN_PRICE_MAP).find(([_, v]) => v === priceId)?.[0];
  if (planKey) {
    await supabaseClient.from("clients").update({
      subscription_status: "active",
      credits_balance: PLAN_CREDITS[planKey],
      credits_monthly_cap: PLAN_CREDITS[planKey],
      credits_used: 0,
      trial_ends_at: null,
    }).eq("user_id", user.id);
  }

  return new Response(JSON.stringify({
    success: true,
    message: "Trial ended. Your subscription is now active and billing has started.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stripe-billing-portal/index.ts
git commit -m "feat: add trial support to billing portal (end-trial, change-plan for trialing users)"
```

---

### Task 2: Update Subscription Page — Trial UI + Change Plan Visibility

**Files:**
- Modify: `src/pages/Subscription.tsx`

- [ ] **Step 1: Add activateLoading state and trial_end/trial_start to stripeStatus type**

After `const [statusLoading, setStatusLoading] = useState(false);` (line 82), add:
```typescript
const [activateLoading, setActivateLoading] = useState(false);
```

Update the stripeStatus type (lines 67-81) — add `trial_end` and `trial_start`:
```typescript
trial_end: number | null;
trial_start: number | null;
```

- [ ] **Step 2: Add handleActivateNow function**

After the `handleChangePlan` function (after line 176), add:

```typescript
const handleActivateNow = async () => {
  setActivateLoading(true);
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (!session) throw new Error("Session expired. Please sign in again.");

    const { data, error } = await supabase.functions.invoke("stripe-billing-portal", {
      body: { action: "end-trial" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let msg = "Failed to activate subscription.";
      try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch {}
      throw new Error(msg);
    }

    toast.success(data.message || "Subscription activated!");
    await fetchStripeStatus();
    await refetch();
  } catch (err: any) {
    toast.error(err.message || "Failed to activate subscription");
  } finally {
    setActivateLoading(false);
  }
};
```

- [ ] **Step 3: Add trial styling to status badge**

In the status badge section (lines 332-344), add trialing case. Change the badge className to include trialing:

Replace the badge className logic:
```typescript
<Badge className={`text-xs ${
  stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
    ? "bg-green-500/15 text-green-400 border-green-500/30"
    : stripeStatus.status === "active" && stripeStatus.cancel_at_period_end
    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : stripeStatus.status === "trialing"
    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : stripeStatus.status === "canceled"
    ? "bg-red-500/15 text-red-400 border-red-500/30"
    : "bg-muted/50 text-muted-foreground"
}`}>
```

Also update the status card border color (lines 300-307) to include trialing:
```typescript
<Card className={`glass-card ${
  stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
    ? "glass-card-cyan border-green-500/30"
    : stripeStatus.status === "active" && stripeStatus.cancel_at_period_end
    ? "border-amber-500/30"
    : stripeStatus.status === "trialing"
    ? "border-amber-500/30"
    : stripeStatus.status === "canceled"
    ? "border-red-500/30"
    : "border-border/30"
}`}>
```

And the icon circle background (lines 312-317):
```typescript
<div className={`w-10 h-10 rounded-full flex items-center justify-center ${
  stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
    ? "bg-green-500/10"
    : stripeStatus.status === "trialing"
    ? "bg-amber-500/10"
    : stripeStatus.cancel_at_period_end
    ? "bg-amber-500/10"
    : "bg-red-500/10"
}`}>
```

And the icon color (lines 319-325):
```typescript
<Settings className={`w-5 h-5 ${
  stripeStatus.status === "active" && !stripeStatus.cancel_at_period_end
    ? "text-green-400"
    : stripeStatus.status === "trialing"
    ? "text-amber-400"
    : stripeStatus.cancel_at_period_end
    ? "text-amber-400"
    : "text-red-400"
}`} />
```

- [ ] **Step 4: Add trial end date and "Activate Now" button**

After the canceled status block (after line 372, before `</div>` closing the info div), add:

```tsx
{stripeStatus.status === "trialing" && (
  <p className="text-xs text-amber-400 mt-0.5">
    {language === "en" ? "Trial ends" : "Prueba termina"}{" "}
    {stripeStatus.trial_end
      ? new Date(stripeStatus.trial_end * 1000).toLocaleDateString(undefined, {
          month: "long", day: "numeric", year: "numeric",
        })
      : ""}
  </p>
)}
```

Next to the "Manage" button (around line 375-387), add the "Activate Now" button for trial users. Wrap the existing Manage button and new Activate button in a flex container:

```tsx
<div className="flex items-center gap-2">
  {stripeStatus.status === "trialing" && (
    <Button
      onClick={handleActivateNow}
      disabled={activateLoading}
      size="sm"
      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
    >
      {activateLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Zap className="w-4 h-4" />
      )}
      {language === "en" ? "Activate Now" : "Activar Ahora"}
    </Button>
  )}
  <Button
    onClick={handleManageSubscription}
    disabled={portalLoading}
    size="sm"
    className="gap-2 btn-primary-glass"
  >
    {portalLoading ? (
      <Loader2 className="w-4 h-4 animate-spin" />
    ) : (
      <ExternalLink className="w-4 h-4" />
    )}
    {language === "en" ? "Manage" : "Gestionar"}
  </Button>
</div>
```

- [ ] **Step 5: Fix Change Plan visibility condition**

Line 400 — change from:
```typescript
{stripeStatus?.status === "active" && !stripeStatus.cancel_at_period_end && credits?.plan_type && (
```
To:
```typescript
{(stripeStatus?.status === "active" || stripeStatus?.status === "trialing") && !stripeStatus.cancel_at_period_end && credits?.plan_type && (
```

- [ ] **Step 6: Update Change Plan note for trial users**

In the warning note at the bottom of the Change Plan section (lines 492-498), add trial-specific messaging:

```tsx
<div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400/70" />
  <span>
    {stripeStatus?.status === "trialing"
      ? (language === "en"
        ? "Changing your plan will end your trial immediately and start billing for the new plan."
        : "Cambiar tu plan terminará tu prueba inmediatamente y comenzará la facturación del nuevo plan.")
      : (language === "en"
        ? "Upgrades are charged immediately (prorated). Downgrades take effect at the next billing cycle — no refunds."
        : "Las mejoras se cobran de inmediato (prorateado). Las degradaciones aplican en el próximo ciclo — sin reembolso.")}
  </span>
</div>
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/Subscription.tsx
git commit -m "feat: add trial UI, activate button, and fix Change Plan visibility for trial users"
```

---

### Task 3: Build, Deploy, and Verify

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: No TypeScript errors, clean build

- [ ] **Step 2: Deploy frontend to VPS**

```bash
scp -r dist/* root@72.62.200.145:/var/www/connectacreators/dist/
# Then on VPS:
cp /var/www/connectacreators/dist/index.html /var/www/connectacreators/index.html
cp -r /var/www/connectacreators/dist/assets/* /var/www/connectacreators/assets/
nginx -s reload
```

- [ ] **Step 3: Deploy edge function**

```bash
npx supabase functions deploy stripe-billing-portal
```

- [ ] **Step 4: Verify**

1. Trial user sees Change Plan section
2. Trial user sees amber trial badge with end date
3. "Activate Now" button works — trial ends, subscription active
4. Trial user can change plan — trial ends, new plan active
5. Active user upgrade/downgrade unchanged
