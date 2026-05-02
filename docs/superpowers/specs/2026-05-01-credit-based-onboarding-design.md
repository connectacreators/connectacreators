# Credit-Based Onboarding — Design Spec
**Date:** 2026-05-01
**Approach:** A (Surgical Removal) — plan B (formal free plan type) deferred to a future migration

---

## Problem

The current signup flow requires users to select a plan and enter credit card details before they can access the app. This creates friction for cold traffic who aren't ready to pay. The 7-day time-based trial adds urgency without adding value.

---

## Goal

Let users sign up with just email + password, explore the entire app freely, and only hit a paywall when they try to perform a credit-costing action. The paywall is a modal — not a redirect — and is dismissible.

---

## Signup Flow

**Before:** 3 steps — account creation → plan selection → Stripe checkout → dashboard

**After:** 1 step — account creation → dashboard (immediate)

On account creation, the `clients` row is inserted with:
- `credits_balance: 1000`
- `credits_monthly_cap: 1000`
- `subscription_status: null`
- `plan_type: null`

No Stripe interaction at signup. No credit card required.

---

## App Navigation

All calls to `useSubscriptionGuard()` are removed from user-facing pages. Users with a free-trial credit balance navigate the full app without any redirects. The hook file is kept (not deleted) for potential future use on admin-only routes.

---

## "Out of Credits" Modal

A new modal that appears whenever a user attempts a credit-costing action and `deduct_credits_atomic()` returns an insufficient-balance error.

**Visual design:**
- Dark header (`#0f172a → #1e293b` gradient) with bold title "You're out of credits!" and a subtitle line
- Dismissible via ✕ button (top right) or "Maybe later — dismiss" link at bottom
- Three plan cards: Starter ($39), Growth ($79 — highlighted in blue `#3b82f6` as "MOST POPULAR"), Enterprise ($139)
- Each card shows credits, scripts, and scrapes limits
- No emojis anywhere in the modal

**Behavior:**
- Opens on any insufficient-credits error
- Dismissible — user returns to exactly where they were
- Re-opens on the next credit action attempt (no cooldown)
- Clicking a plan triggers the existing Stripe checkout flow (same as the upgrade flow today)
- After subscribing, the user's plan credits are provisioned and the original action can be retried

---

## Technical Architecture

### New: OutOfCreditsContext

A React context wrapping the entire app in `App.tsx`. Exposes:

```ts
const { showOutOfCreditsModal } = useOutOfCredits()
```

The `OutOfCreditsModal` component renders once at the app root — not per-page. State (open/closed) lives in the context.

### New: OutOfCreditsModal component

Located at `src/components/OutOfCreditsModal.tsx`. Renders the modal UI described above. On plan selection, calls the existing `create-checkout` edge function with the chosen plan, same as the current upgrade flow in `Subscription.tsx`.

### Credit failure interception

Every feature that calls `deduct_credits_atomic()` already handles the error response. The current behavior (error toast) is replaced with `showOutOfCreditsModal()`. The six affected callers are all edge functions whose responses are handled on the frontend:

- `transcribe-video`
- `ai-build-script`
- `deep-research`
- `batch-generate-scripts`
- `transcribe-canvas-media`
- `ai-assistant`

### Signup.tsx

Steps 2 (plan selection) and 3 (Stripe checkout) are removed. The `clients` insert that already happens in step 1 gains `credits_balance: 1000` and `credits_monthly_cap: 1000`. After successful account creation, redirect to `/dashboard`.

### Subscription page (free trial state)

When `subscription_status === null` and `credits_balance > 0`, the subscription page renders a "Free Trial" badge and displays the remaining credit balance. Upgrade buttons remain fully functional and trigger the Stripe checkout as normal.

### check-subscription edge function (guard)

The `check-subscription` function syncs Stripe state to the DB. It must not touch records where `stripe_customer_id` is null — free-trial users have no Stripe record and calling this function for them would reset their credits or corrupt their status. Add an early-return guard: if the client has no `stripe_customer_id`, exit immediately without modifying any DB fields.

### SelectPlan page

`/select-plan` (`SelectPlan.tsx`) is not removed. It remains accessible for returning users who previously had a subscription and need to resubscribe. It is no longer part of the new signup flow.

### Post-subscribe retry

After a user subscribes via the modal, the modal closes and the user is returned to where they were. They manually retry the action that triggered the modal. There is no automatic retry.

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Signup.tsx` | Remove steps 2 & 3; seed 1,000 credits on client insert; redirect to `/dashboard` |
| `src/hooks/useSubscriptionGuard.ts` | Keep file, remove all calls from user-facing pages (grep for all usages) |
| All pages calling `useSubscriptionGuard()` | Remove the hook call (identified via grep during implementation) |
| `supabase/functions/check-subscription/index.ts` | Add early-return guard when `stripe_customer_id` is null |
| `src/contexts/OutOfCreditsContext.tsx` | **New** — context + provider exposing `showOutOfCreditsModal()` |
| `src/components/OutOfCreditsModal.tsx` | **New** — modal component with plan cards and Stripe wiring |
| `src/App.tsx` | Wrap app with `OutOfCreditsProvider`; render `OutOfCreditsModal` at root |
| `src/pages/Subscription.tsx` | Handle `subscription_status: null` as "Free Trial" state |
| Feature hooks/pages calling `deduct_credits_atomic()` | Replace insufficient-credits error toast with `showOutOfCreditsModal()` |

---

## Out of Scope

- Removing the `useSubscriptionGuard` hook file itself (kept for future admin routes)
- Any changes to the Stripe checkout, billing portal, or webhook logic
- Changing credit costs per action
- Topup credits flow

---

## Future: Plan B Migration

When ready, a single DB migration sets `plan_type: 'free'` on all users with `subscription_status: null`. No logic changes needed — the context, modal, and subscription page already handle this state correctly.
