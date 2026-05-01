# Post-Payment Redirect Fix — Design Spec

**Date:** 2026-03-17

## Problem

When a brand-new user completes signup → selects a plan → pays via Stripe, they are redirected to `/dashboard` by `PaymentSuccess`. The Dashboard immediately fires a subscription check against the `clients` table. Due to a race condition (the Stripe webhook or `check-subscription` update may not have fully propagated), the `clients` row either doesn't exist yet or has no `plan_type`/`subscription_status`, so the check evaluates to "no active subscription" and bounces the user back to `/select-plan`.

## Root Cause

`Dashboard.tsx` subscription check `useEffect` (identified by comment "Subscription check (for non-admin/videographer/editor/connectaPlus client roles)") queries `clients` directly with no awareness that the user just completed a successful payment moments ago.

## Solution

Use a `useRef` flag set by the welcome modal effect as an early-exit signal in the subscription check effect.

`PaymentSuccess` already sets `connecta_just_paid` in localStorage before navigating:
```ts
localStorage.setItem("connecta_just_paid", data.plan_type ?? "starter");
setTimeout(() => navigate("/dashboard"), 3000);
```

**Why not read localStorage directly in the subscription check?**
The welcome modal `useEffect` (declared first, `deps: []`) removes the flag via `localStorage.removeItem("connecta_just_paid")`. React runs `useEffect` hooks in declaration order in the same post-render flush. By the time the subscription check effect runs, the flag is already gone. A raw `localStorage.getItem` guard would always read `undefined` and never exit early.

**Correct approach — `useRef`:**
A ref is set synchronously within the welcome modal effect before any async work. The subscription check effect (declared later in the same flush) reads the ref and exits early if it's set.

### Changes to `Dashboard.tsx`

1. Add ref declaration near the top of the component:
```ts
const justPaidRef = useRef(false);
```

2. In the welcome modal `useEffect`, set the ref before removing the localStorage item:
```ts
useEffect(() => {
  const paid = localStorage.getItem("connecta_just_paid");
  if (paid) {
    justPaidRef.current = true;   // ← add this line
    setWelcomePlan(paid);
    setShowWelcome(true);
    localStorage.removeItem("connecta_just_paid");
  }
}, []);
```

3. In the subscription check `useEffect`, add an early return as the first guard:
```ts
useEffect(() => {
  if (justPaidRef.current) return;   // ← add this line
  if (loading || !user) return;
  // ... rest unchanged
}, [user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, role, navigate]);
```

## Scope

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add `useRef`, set it in welcome modal effect, read it in subscription check effect |

No backend changes. No changes to `PaymentSuccess`, the welcome modal component, or any other file.

## Security Note

The subscription gate is UX routing, not a security boundary. A user bypassing this check via localStorage would reach the Dashboard UI, but all credit and feature checks are enforced server-side and will still block unauthorized access to paid features.

## Known Intentional Exclusion

The `"Go to Dashboard"` escape hatch in `PaymentSuccess` (error state) navigates to `/dashboard` without setting `connecta_just_paid`. This is intentional — the subscription was not confirmed, so the bounce to `/select-plan` is correct behavior.

## Acceptance Criteria

1. New user completes payment → lands on `/dashboard` → stays on `/dashboard` (no bounce to `/select-plan`)
2. Existing user with no active subscription visits `/dashboard` → still redirected to `/select-plan` (`justPaidRef` is `false`)
3. After the welcome modal is dismissed and the page is refreshed → stays on dashboard (subscription is now confirmed in DB by webhook, ref is gone on fresh mount)
4. User in `PaymentSuccess` error state clicks "Go to Dashboard" → bounced to `/select-plan` (flag was never set, correct behavior)
