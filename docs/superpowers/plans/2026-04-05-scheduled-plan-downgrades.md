# Scheduled Plan Downgrades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a subscriber downgrades their plan, the current plan remains fully active (with all credits/limits) until the next billing date, then the new lower plan takes effect automatically.

**Architecture:** Add `pending_plan_type` and `pending_plan_effective_date` columns to the `clients` table. On downgrade, update Stripe's price immediately (so next invoice charges the new amount) but keep the DB plan/credits unchanged and store the pending state. The `invoice.payment_succeeded` webhook handler applies the pending downgrade at the next billing cycle. The frontend shows a "Downgrades to X on [date]" badge and offers a "Cancel downgrade" action.

**Tech Stack:** Supabase (Postgres, Edge Functions/Deno), Stripe API, React/TypeScript frontend

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260405_pending_plan_columns.sql` | Create | Add `pending_plan_type` and `pending_plan_effective_date` to `clients` |
| `supabase/functions/stripe-billing-portal/index.ts` | Modify | `change-plan` downgrade path: save pending, don't change plan_type. New `cancel-downgrade` action. `status` endpoint: return pending fields. |
| `supabase/functions/stripe-webhook/index.ts` | Modify | `syncSubscription`: skip plan_type update when pending downgrade exists. `invoice.payment_succeeded`: apply pending downgrade on renewal. |
| `src/hooks/useCredits.ts` | Modify | Add `pending_plan_type` and `pending_plan_effective_date` to `CreditsData` and SELECT query. |
| `src/pages/Subscription.tsx` | Modify | Show pending downgrade badge, "Cancel downgrade" button, adjust plan card states. |

---

## Task 1: Database Migration — Add Pending Plan Columns

**Files:**
- Create: `supabase/migrations/20260405_pending_plan_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add columns to track scheduled plan downgrades
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_plan_type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_plan_effective_date timestamptz;
```

- [ ] **Step 2: Run the migration against Supabase**

Run in the Supabase Dashboard SQL Editor (or via CLI):
```bash
# Via Supabase Dashboard → SQL Editor → paste and run the SQL above
```

Expected: Two new nullable columns on `clients` table, no existing rows affected.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260405_pending_plan_columns.sql
git commit -m "feat: add pending_plan_type columns for scheduled downgrades"
```

---

## Task 2: Backend — change-plan Downgrade Path Saves Pending State

**Files:**
- Modify: `supabase/functions/stripe-billing-portal/index.ts` (lines 486-561 — the downgrade branch of `change-plan`)

- [ ] **Step 1: Rewrite the downgrade branch in change-plan**

Find the `change-plan` action's `else` branch (line 486, the downgrade path). Replace the entire downgrade block from line 486 (`} else {`) through line 559 (the response). The new logic:

1. Update Stripe price immediately (so next invoice charges new amount) — keep existing call
2. Do NOT update `plan_type`, `credits_balance`, `credits_monthly_cap`, or any limits in the DB
3. Instead, set `pending_plan_type` and `pending_plan_effective_date`
4. Return a message indicating the downgrade is scheduled

Replace lines 486-561 with:

```typescript
      } else {
        // Downgrade: change Stripe price (charges new amount next cycle) but keep current plan active
        await stripe.subscriptions.update(subscription.id, {
          items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
          proration_behavior: "none",
        });

        // Save pending downgrade — current plan stays active until next billing cycle
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
        await supabaseClient.from("clients").update({
          pending_plan_type: newPlan,
          pending_plan_effective_date: periodEnd,
        }).eq("user_id", user.id);

        // Sync subscriptions table (show pending in admin view)
        try {
          await supabaseClient.from("subscriptions").upsert({
            user_id: user.id,
            email: user.email,
            plan_type: config.plan_type, // show target plan in admin
            status: "active",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "email" });
        } catch (_) { /* non-fatal */ }

        const effectiveDate = new Date(subscription.current_period_end * 1000)
          .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

        return new Response(JSON.stringify({
          success: true,
          plan: newPlan,
          is_upgrade: false,
          is_scheduled: true,
          effective_date: periodEnd,
          message: `Downgrade to ${config.plan_type} scheduled for ${effectiveDate}. Your current plan and credits remain active until then.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Upgrade/trial path continues below (fetch credits, update DB) ──
```

**Important:** The existing upgrade/trial code (lines 494-559) must remain ABOVE this new else block. Restructure so the downgrade returns early and the upgrade/trial path falls through. The full structure should be:

```
if (isTrial) { ... stripe update ... }
else if (isUpgrade) { ... stripe update ... }
else { ... stripe update + save pending + RETURN EARLY ... }

// Only upgrade/trial reach here:
const { data: clientRow } = ... // fetch credits
... // calculate newBalance
... // update clients table
... // sync subscriptions
... // return response
```

- [ ] **Step 2: Deploy and test**

```bash
npx supabase functions deploy stripe-billing-portal --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-billing-portal/index.ts
git commit -m "feat: change-plan downgrade saves pending state instead of immediate change"
```

---

## Task 3: Backend — cancel-downgrade Action

**Files:**
- Modify: `supabase/functions/stripe-billing-portal/index.ts` (add new action block before the `change-plan` action)

- [ ] **Step 1: Add the cancel-downgrade action**

Insert this block right before `if (action === "change-plan") {` (around line 429):

```typescript
    // ── Cancel a pending downgrade ──────────────────────────────────────
    if (action === "cancel-downgrade") {
      // Check if there's a pending downgrade
      const { data: pendingClient } = await supabaseClient
        .from("clients")
        .select("pending_plan_type, plan_type")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!pendingClient?.pending_plan_type) {
        throw new Error("No pending downgrade to cancel.");
      }

      // Revert Stripe price back to current plan
      const PLAN_PRICE_MAP: Record<string, string> = {
        starter:    Deno.env.get("STRIPE_PRICE_STARTER")    || "price_1TCX3SCp1qPE081LCBJc8avw",
        growth:     Deno.env.get("STRIPE_PRICE_GROWTH")     || "price_1TCX3SCp1qPE081LSkPmF8FN",
        enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
      };

      const currentPlan = pendingClient.plan_type;
      if (currentPlan && PLAN_PRICE_MAP[currentPlan]) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId, limit: 5,
        });
        const subscription = subscriptions.data.find(s => s.status === "active" || s.status === "trialing");
        if (subscription) {
          const currentItem = subscription.items.data[0];
          await stripe.subscriptions.update(subscription.id, {
            items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[currentPlan] }],
            proration_behavior: "none",
          });
        }
      }

      // Clear pending fields
      await supabaseClient.from("clients").update({
        pending_plan_type: null,
        pending_plan_effective_date: null,
      }).eq("user_id", user.id);

      // Revert subscriptions table
      try {
        await supabaseClient.from("subscriptions")
          .update({ plan_type: currentPlan, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } catch (_) { /* non-fatal */ }

      return new Response(JSON.stringify({
        success: true,
        message: "Downgrade canceled. Your current plan will continue.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy stripe-billing-portal --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-billing-portal/index.ts
git commit -m "feat: add cancel-downgrade action to revert scheduled downgrade"
```

---

## Task 4: Backend — Status Endpoint Returns Pending Fields

**Files:**
- Modify: `supabase/functions/stripe-billing-portal/index.ts` (the `status` action response, around line 407)

- [ ] **Step 1: Fetch and return pending fields from DB**

In the `status` action (line 329), after the existing DB sync logic and before the `return new Response(...)`, fetch the pending fields and include them in the response.

Find the existing response object (starts around line 407 with `return new Response(JSON.stringify({ subscription: {`). Add two fields to the returned `subscription` object:

```typescript
            // ... existing fields (trial_start, etc.) ...
            trial_start: sub.trial_start,
            // Pending downgrade info from DB
            pending_plan_type: pendingData?.pending_plan_type ?? null,
            pending_plan_effective_date: pendingData?.pending_plan_effective_date ?? null,
```

To get `pendingData`, add this query BEFORE the return statement (after the existing DB sync block):

```typescript
      // Fetch pending downgrade info
      const { data: pendingData } = await supabaseClient
        .from("clients")
        .select("pending_plan_type, pending_plan_effective_date")
        .eq("user_id", user.id)
        .maybeSingle();
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy stripe-billing-portal --no-verify-jwt
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-billing-portal/index.ts
git commit -m "feat: status endpoint returns pending downgrade fields"
```

---

## Task 5: Backend — Webhook Handles Pending Downgrades

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

Two changes needed:

### 5A: syncSubscription skips plan_type update when there's a pending downgrade

- [ ] **Step 1: Update syncSubscription's plan-change detection**

In `syncSubscription`, the `else if (currentClient?.plan_type && currentClient.plan_type !== planType)` block (line 183) currently handles both upgrades and downgrades. When a downgrade is pending, the webhook fires because Stripe changed the price — but we should NOT update `plan_type` in the DB. The existing downgrade branch already deletes `credits_monthly_cap` — now also skip `plan_type`.

Replace the downgrade branch (lines 193-197):

```typescript
      } else {
        // Downgrade: don't change plan_type or credits — a pending downgrade was saved.
        // Keep current plan active until invoice.payment_succeeded applies it.
        delete clientUpdate.credits_monthly_cap;
        delete clientUpdate.plan_type;
        delete clientUpdate.script_limit;
        delete clientUpdate.channel_scrapes_limit;
        logStep("Downgrade detected — skipping plan_type update (pending downgrade active)");
      }
```

### 5B: invoice.payment_succeeded applies pending downgrades

- [ ] **Step 2: Add pending downgrade application in invoice.payment_succeeded**

In the `invoice.payment_succeeded` handler, after getting `clientId` (line 367) and before the `isPostTrial` check (line 379), add a check for pending downgrades.

Insert after line 370 (`if (!clientId) { ... break; }`):

```typescript
        // Apply pending downgrade if one exists
        const { data: pendingCheck } = await adminClient
          .from("clients")
          .select("pending_plan_type, pending_plan_effective_date")
          .eq("id", clientId)
          .maybeSingle();

        if (pendingCheck?.pending_plan_type) {
          const pendingPlan = pendingCheck.pending_plan_type;
          const pendingCfg = PLAN_CONFIG[pendingPlan];
          if (pendingCfg) {
            await adminClient.from("clients").update({
              plan_type: pendingPlan,
              credits_balance: pendingCfg.credits_monthly_cap,
              credits_monthly_cap: pendingCfg.credits_monthly_cap,
              credits_used: 0,
              channel_scrapes_used: 0,
              channel_scrapes_limit: pendingCfg.channel_scrapes_limit,
              script_limit: pendingCfg.script_limit,
              subscription_status: "active",
              credits_reset_at: new Date(resetTimestamp * 1000).toISOString(),
              pending_plan_type: null,
              pending_plan_effective_date: null,
            }).eq("id", clientId);

            await adminClient.from("credit_transactions").insert({
              client_id: clientId,
              action: "plan_downgrade_reset",
              credits: pendingCfg.credits_monthly_cap,
              metadata: { plan_type: pendingPlan, previous_plan: planType },
            });
            logStep("Applied pending downgrade", { clientId, pendingPlan, credits: pendingCfg.credits_monthly_cap });
            break; // Skip normal renewal logic — downgrade handled everything
          }
        }
```

**Note:** The `resetTimestamp` variable is defined later (line 383). Move the `resetTimestamp` calculation ABOVE this new block:

```typescript
        const resetTimestamp = Math.max(sub.current_period_end, invoice.period_end);

        // Apply pending downgrade if one exists
        // ... (the block above)
```

- [ ] **Step 3: Also update invoice.payment_succeeded to clear pending fields on normal renewal**

In both the post-trial (line 387) and regular renewal (line 406) update objects, add:

```typescript
            pending_plan_type: null,
            pending_plan_effective_date: null,
```

This ensures stale pending data is cleared if it wasn't consumed (e.g., user canceled the downgrade but the fields weren't cleared).

- [ ] **Step 4: Deploy**

```bash
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat: webhook applies pending downgrades on billing cycle renewal"
```

---

## Task 6: Frontend — useCredits Hook Returns Pending Fields

**Files:**
- Modify: `src/hooks/useCredits.ts`

- [ ] **Step 1: Add pending fields to CreditsData interface**

Add to the `CreditsData` interface (after `trial_ends_at` on line 15):

```typescript
  pending_plan_type: string | null;
  pending_plan_effective_date: string | null;
```

- [ ] **Step 2: Add pending fields to the SELECT query**

In both SELECT strings (lines 53 and 62), append:

```
, pending_plan_type, pending_plan_effective_date
```

So line 53 becomes:
```typescript
          .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at, pending_plan_type, pending_plan_effective_date")
```

Same for line 62.

- [ ] **Step 3: Map pending fields in setCredits**

In the `setCredits` call (line 70), add:

```typescript
          pending_plan_type: clientData.pending_plan_type ?? null,
          pending_plan_effective_date: clientData.pending_plan_effective_date ?? null,
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCredits.ts
git commit -m "feat: useCredits returns pending downgrade fields"
```

---

## Task 7: Frontend — Subscription Page Shows Pending Downgrade

**Files:**
- Modify: `src/pages/Subscription.tsx`

- [ ] **Step 1: Add stripeStatus pending fields to state type**

In the `stripeStatus` state type (line 65), add after `trial_start`:

```typescript
    pending_plan_type: string | null;
    pending_plan_effective_date: string | null;
```

- [ ] **Step 2: Add isPendingDowngrade derived value**

After the `isCanceling` declaration (line 319), add:

```typescript
  const isPendingDowngrade = !!credits.pending_plan_type;
  const pendingPlanLabel = credits.pending_plan_type ? (PLAN_LABELS[credits.pending_plan_type] ?? credits.pending_plan_type) : null;
  const pendingEffectiveDate = credits.pending_plan_effective_date
    ? new Date(credits.pending_plan_effective_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : renewalDate;
```

- [ ] **Step 3: Add pending downgrade to status badge**

Update `showStatusBadge` (line 321) to include pending downgrades:

```typescript
  const showStatusBadge = stripeStatus && (
    stripeStatus.status === "trialing" ||
    isCanceling ||
    stripeStatus.status === "past_due" ||
    isCanceled ||
    isPendingDowngrade
  );
```

Update `statusBadgeText` (line 328) — add the pending downgrade case BEFORE the `isCanceled` check:

```typescript
  const statusBadgeText = isPendingDowngrade
    ? (en ? `Downgrades to ${pendingPlanLabel} on ${pendingEffectiveDate}` : `Cambia a ${pendingPlanLabel} el ${pendingEffectiveDate}`)
    : isCanceled
    ? (en ? "Canceled" : "Cancelada")
    : isCanceling
    ? (en ? "Cancels at period end" : "Se cancela al final del período")
    : stripeStatus?.status === "trialing"
    ? (en ? "Trialing" : "Prueba")
    : stripeStatus?.status === "past_due"
    ? (en ? "Past due" : "Pago pendiente")
    : "";
```

Update `statusBadgeClass` (line 338) to style pending downgrade as amber:

```typescript
  const statusBadgeClass = isCanceled || stripeStatus?.status === "past_due"
    ? "bg-red-500/15 text-red-400"
    : isPendingDowngrade
    ? "bg-amber-500/15 text-amber-400"
    : "bg-amber-500/15 text-amber-400";
```

- [ ] **Step 4: Update the "Upgrade plan" button to show "Change plan" when pending**

Update the button text (line 369):

```typescript
              {showPlans
                ? (en ? "Hide plans" : "Ocultar planes")
                : isCanceled
                ? (en ? "Resubscribe" : "Reactivar plan")
                : isPendingDowngrade
                ? (en ? "Change plan" : "Cambiar plan")
                : (en ? "Upgrade plan" : "Mejorar plan")}
```

- [ ] **Step 5: Add "Cancel downgrade" button below the renewal date**

After the renewal date `<p>` tag (line 385), add:

```tsx
          {isPendingDowngrade && (
            <button
              onClick={handleCancelDowngrade}
              disabled={!!portalLoading}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 mb-3"
            >
              {portalLoading === "cancel-downgrade"
                ? (en ? "Canceling..." : "Cancelando...")
                : (en ? "Cancel downgrade" : "Cancelar degradación")}
            </button>
          )}
```

- [ ] **Step 6: Add handleCancelDowngrade function**

Add this function right after `handleChangePlan` (around line 165):

```typescript
  const handleCancelDowngrade = async () => {
    setPortalLoading("cancel-downgrade");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(
        "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/stripe-billing-portal",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "cancel-downgrade" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel downgrade");
      toast.success(data?.message || (en ? "Downgrade canceled!" : "Degradación cancelada!"));
      fetchStripeStatus();
      window.dispatchEvent(new Event("credits-updated"));
    } catch (err: any) {
      toast.error(err.message || (en ? "Failed to cancel downgrade" : "Error al cancelar"));
    } finally {
      setPortalLoading(false);
    }
  };
```

- [ ] **Step 7: Update plan cards — pending downgrade plan shows "Scheduled" badge**

In the plan cards section (line 480), update the derived booleans:

```typescript
            {PLAN_OPTIONS.map((plan, i) => {
              const isActiveCurrent = !isCanceled && !isPendingDowngrade && planKey === plan.key;
              const isPendingTarget = isPendingDowngrade && plan.key === credits.pending_plan_type;
              const isUpgrade = isCanceled || plan.amount > currentAmount;
              const isDowngrade = !isCanceled && plan.amount < currentAmount && !isPendingTarget;
```

Add the "Scheduled" badge after the existing downgrade badge (line 508):

```tsx
                      {isPendingTarget && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                          {en ? "Scheduled" : "Programado"}
                        </span>
                      )}
```

Update the button for the pending target plan — show "Scheduled" instead of action:

```tsx
                  {isPendingTarget ? (
                    <button
                      disabled
                      className="w-full text-sm font-medium py-2 rounded-lg border border-amber-500/20 text-amber-400/60 cursor-not-allowed"
                      style={{ background: "rgba(245,158,11,.05)" }}
                    >
                      {en ? `Starts ${pendingEffectiveDate}` : `Inicia ${pendingEffectiveDate}`}
                    </button>
                  ) : isActiveCurrent ? (
                    // ... existing "Your Plan" button ...
```

- [ ] **Step 8: Update the downgrade confirm message**

In `handleChangePlan`, update the downgrade confirm message (line 133):

```typescript
      : (en
        ? `Downgrade to ${targetOpt?.name}? Your current plan and credits stay active until the next billing date.`
        : `¿Degradar a ${targetOpt?.name}? Tu plan y créditos actuales se mantienen hasta la próxima fecha de facturación.`);
```

- [ ] **Step 9: Build, deploy, and test**

```bash
npm run build
# Deploy to VPS via tarball
```

Test scenarios:
1. On Growth, click Starter → confirm → page should show "Growth" with amber badge "Downgrades to Starter on Apr 19, 2026"
2. Credits should remain 30,000/30,000
3. Starter card should show "Scheduled" badge with "Starts Apr 19, 2026" button
4. "Cancel downgrade" link should appear under renewal date
5. Click "Cancel downgrade" → badge disappears, plan cards return to normal
6. Upgrading while a downgrade is pending → clears the pending downgrade

- [ ] **Step 10: Commit**

```bash
git add src/pages/Subscription.tsx src/hooks/useCredits.ts
git commit -m "feat: subscription page shows pending downgrade badge and cancel option"
```

---

## Task 8: Backend — Upgrade Clears Any Pending Downgrade

**Files:**
- Modify: `supabase/functions/stripe-billing-portal/index.ts` (upgrade path in `change-plan`)

- [ ] **Step 1: Clear pending fields on upgrade**

In the `change-plan` action's upgrade path (the `clientUpdate` object around line 516), add:

```typescript
        pending_plan_type: null,
        pending_plan_effective_date: null,
```

This ensures that if a user schedules a downgrade and then changes their mind and upgrades, the pending downgrade is cleared.

- [ ] **Step 2: Also clear in webhook syncSubscription upgrade path**

In `syncSubscription`, in the upgrade branch (line 189-192), add to `clientUpdate`:

```typescript
        clientUpdate.pending_plan_type = null;
        clientUpdate.pending_plan_effective_date = null;
```

- [ ] **Step 3: Deploy both functions**

```bash
npx supabase functions deploy stripe-billing-portal --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-billing-portal/index.ts supabase/functions/stripe-webhook/index.ts
git commit -m "feat: upgrade clears any pending downgrade"
```

---

## Task 9: Fix R76 Data — Restore to Growth

**Files:** None (DB operation only)

- [ ] **Step 1: Restore R76 to Growth plan with correct data**

Since R76 has been used for testing and is currently in an inconsistent state (plan_type=starter but still on Growth in Stripe), fix their data:

```sql
UPDATE clients
SET plan_type = 'growth',
    credits_monthly_cap = 30000,
    credits_balance = 30000,
    credits_used = 0,
    channel_scrapes_limit = 15,
    script_limit = 200,
    pending_plan_type = NULL,
    pending_plan_effective_date = NULL
WHERE user_id = (
  SELECT user_id FROM subscriptions WHERE email ILIKE '%r76%' LIMIT 1
);
```

Run via Supabase REST API or SQL Editor. Verify R76's Stripe subscription is on Growth — if it's on Starter in Stripe, also update Stripe back to Growth price.
